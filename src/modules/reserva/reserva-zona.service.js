// src/modules/reserva/reserva-zona.service.js
//
// REGLA DE NEGOCIO:
//   Reservas por ZONA → solo empleados con cargo registrado y nivel_privilegio >= nivel_minimo_privilegio
//   Estudiantes, Visitantes, Egresados → solo reservas por plaza individual
//   Si config_reserva_zona.requiere_empleado = true → el usuario DEBE existir en tabla empleado
//
// Roles que pueden reservar zona:
//   Administrativo (nivel 3+), Docente Titular (5), Jefe (6), Director (7), etc.
// Roles que NO pueden:
//   Estudiante (nivel efectivo 1, sin cargo en empleado), Visitante (id_tipo_persona=5)

import supabase from "../../config/supabase.js";

const ESTADO_ACTIVA    = 1;
const ESTADO_EN_ESPERA = 5;

// ─── Helper: contexto completo del usuario ────────────────────────────────────
// Devuelve: { personaId, orgId, idTipoPersona, nivel, esEmpleado, puedeReservar }
async function getContextoUsuario(userId) {
  const { data: usuario, error } = await supabase
    .from("usuario")
    .select(`
      id_persona, organizacion_id,
      persona (
        id_tipo_persona,
        tipo_persona ( nombre, puede_reservar )
      )
    `)
    .eq("id", userId)
    .maybeSingle();

  if (error || !usuario) throw new Error("Usuario no encontrado");

  const personaId      = usuario.id_persona;
  const orgId          = usuario.organizacion_id;
  const idTipoPersona  = usuario.persona?.id_tipo_persona ?? null;
  const puedeReservar  = usuario.persona?.tipo_persona?.puede_reservar ?? true;

  // Verificar si existe en tabla empleado y obtener nivel de cargo
  const { data: empData } = await supabase
    .from("empleado")
    .select("id_empleado, id_estado, cargo ( id_cargo, nombre, nivel_privilegio )")
    .eq("id_persona", personaId)
    .eq("id_estado", 1) // Solo empleados activos
    .maybeSingle();

  const esEmpleado = empData != null;
  const nivel      = empData?.cargo?.nivel_privilegio ?? 1;

  return { personaId, orgId, idTipoPersona, nivel, esEmpleado, puedeReservar };
}

// ─── Validar que el usuario puede reservar una zona específica ────────────────
// Lanza Error si no tiene permiso — descriptivo para mostrar en la app
async function validarAccesoZona(ctx, config, zona) {
  // 1. El tipo de persona debe poder reservar
  if (ctx.puedeReservar === false) {
    throw new Error("Tu tipo de usuario no tiene habilitadas las reservas");
  }

  // 2. Si la zona requiere ser empleado activo → validar
  if (config.requiere_empleado && !ctx.esEmpleado) {
    const tipoNombre = await _resolveTipoPersona(ctx.idTipoPersona);
    throw new Error(
      `Las reservas de zona están disponibles solo para empleados activos de la institución. ` +
      `Tu perfil es: ${tipoNombre}. Para reservar en esta zona, debes tener un cargo asignado.`
    );
  }

  // 3. Nivel mínimo de privilegio
  if (ctx.nivel < config.nivel_minimo_privilegio) {
    throw new Error(
      `Tu nivel de acceso (${ctx.nivel}) no es suficiente para reservar en esta zona. ` +
      `Se requiere nivel ${config.nivel_minimo_privilegio} o superior.`
    );
  }

  // 4. Tipo de zona VIP (id_tipo=3) → nivel >= 7 (Director+)
  if (zona.id_tipo === 3 && ctx.nivel < 7) {
    throw new Error("Esta zona es de acceso VIP. Se requiere cargo de Director o superior.");
  }
}

async function _resolveTipoPersona(idTipo) {
  if (!idTipo) return "Sin tipo asignado";
  const { data } = await supabase
    .from("tipo_persona")
    .select("nombre")
    .eq("id_tipo_persona", idTipo)
    .maybeSingle();
  return data?.nombre ?? "Sin tipo asignado";
}

// ─── Verificar disponibilidad usando la RPC de BD ─────────────────────────────
export async function verificarDisponibilidad(zonaId, fechaInicio, fechaFin) {
  const { data, error } = await supabase.rpc("get_plazas_disponibles_zona", {
    p_zona_id:      zonaId,
    p_fecha_inicio: fechaInicio,
    p_fecha_fin:    fechaFin
  });
  if (error) throw error;
  return data;
}

// ─── Crear reserva de zona ────────────────────────────────────────────────────
export async function crearReservaZona({ zonaId, userId, fechaInicio, fechaFin, placaVehiculo, descripcion }) {
  const inicio = new Date(fechaInicio);
  const fin    = new Date(fechaFin);

  // 1. Obtener contexto completo del usuario
  const ctx = await getContextoUsuario(userId);

  // 2. Traer zona con su config
  const { data: zona, error: zonaErr } = await supabase
    .from("zona")
    .select(`
      id_zona, nombre, id_estado, id_tipo,
      config_reserva_zona (
        id_config, permite_horas, permite_dias, max_horas, max_dias,
        requiere_aprobacion, hora_inicio_permitida, hora_fin_permitida,
        nivel_minimo_privilegio, requiere_empleado
      )
    `)
    .eq("id_zona", zonaId)
    .maybeSingle();

  if (zonaErr || !zona) throw new Error("Zona no encontrada");
  if (zona.id_estado !== 1) throw new Error("Esta zona no está activa y no acepta reservas");

  const config = zona.config_reserva_zona?.[0];
  if (!config) throw new Error("Esta zona no tiene configuración de reservas");

  // 3. Validar acceso del usuario a esta zona
  await validarAccesoZona(ctx, config, zona);

  // 4. Determinar si es por horas o días
  const diffMs   = fin - inicio;
  const diffHrs  = diffMs / 3_600_000;
  const diffDias = diffMs / 86_400_000;
  const esDia    = diffHrs >= 12;

  if (esDia && !config.permite_dias)
    throw new Error("Esta zona no permite reservas de días completos");
  if (!esDia && !config.permite_horas)
    throw new Error("Esta zona no permite reservas por horas");
  if (!esDia && diffHrs > config.max_horas)
    throw new Error(`Máximo ${config.max_horas} horas por reserva en esta zona`);
  if (esDia && Math.ceil(diffDias) > config.max_dias)
    throw new Error(`Máximo ${config.max_dias} días por reserva en esta zona`);

  // 5. Validar horario permitido (solo para reservas por horas)
  if (!esDia && config.hora_inicio_permitida && config.hora_fin_permitida) {
    const horaInicio = inicio.toTimeString().slice(0, 5);
    const horaFin    = fin.toTimeString().slice(0, 5);
    if (horaInicio < config.hora_inicio_permitida || horaFin > config.hora_fin_permitida)
      throw new Error(`Solo se puede reservar entre ${config.hora_inicio_permitida} y ${config.hora_fin_permitida}`);
  }

  // 6. Verificar disponibilidad de plazas
  const plazasLibres = await verificarDisponibilidad(zonaId, fechaInicio, fechaFin);
  if (plazasLibres === 0)
    throw new Error("No hay plazas disponibles en esta zona para ese horario");

  // 7. Insertar reserva_zona
  const estadoInicial = config.requiere_aprobacion ? ESTADO_EN_ESPERA : ESTADO_ACTIVA;

  const { data, error } = await supabase
    .from("reserva_zona")
    .insert({
      id_zona:           zonaId,
      id_persona:        ctx.personaId,
      id_tipo:           esDia ? 2 : 1,
      id_estado:         estadoInicial,
      fecha_hora_inicio: inicio.toISOString(),
      fecha_hora_fin:    fin.toISOString(),
      descripcion:       descripcion || null,
      placa_vehiculo:    placaVehiculo || null,
      organizacion_id:   ctx.orgId
    })
    .select()
    .single();

  if (error) throw new Error("Error al crear la reserva: " + error.message);
  return { reserva: data, requiere_aprobacion: config.requiere_aprobacion };
}

// ─── Verificar si el usuario PUEDE ver/usar reservas de zona ──────────────────
// Usado por el frontend para ocultar la opción si no tiene acceso
export async function verificarAccesoReservaZona(userId) {
  try {
    const ctx = await getContextoUsuario(userId);
    return {
      puede_reservar_zona: ctx.esEmpleado && ctx.nivel >= 3,
      es_empleado:         ctx.esEmpleado,
      nivel:               ctx.nivel,
      mensaje: ctx.esEmpleado && ctx.nivel >= 3
        ? null
        : ctx.esEmpleado
            ? "Tu cargo no tiene el nivel mínimo requerido para reservas de zona"
            : "Las reservas de zona están disponibles solo para personal empleado de la institución"
    };
  } catch {
    return { puede_reservar_zona: false, es_empleado: false, nivel: 1, mensaje: "No se pudo verificar el acceso" };
  }
}

// ─── Aprobar reserva (admin) ──────────────────────────────────────────────────
export async function aprobarReservaZona(reservaZonaId, empleadoId, notasAdmin) {
  const { data, error } = await supabase
    .from("reserva_zona")
    .update({
      id_estado:             ESTADO_ACTIVA,
      id_empleado_aprobador: empleadoId,
      notas_admin:           notasAdmin || null
    })
    .eq("id_reserva_zona", reservaZonaId)
    .eq("id_estado", ESTADO_EN_ESPERA)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("Reserva no encontrada o ya procesada");
  return data;
}

// ─── Rechazar reserva (admin) ─────────────────────────────────────────────────
export async function rechazarReservaZona(reservaZonaId, empleadoId, motivo) {
  const { data, error } = await supabase
    .from("reserva_zona")
    .update({
      id_estado:             6, // Rechazada
      id_empleado_aprobador: empleadoId,
      motivo_rechazo:        motivo || null
    })
    .eq("id_reserva_zona", reservaZonaId)
    .eq("id_estado", ESTADO_EN_ESPERA)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("Reserva no encontrada o ya procesada");
  return data;
}

// ─── Asignar plaza al llegar ──────────────────────────────────────────────────
export async function asignarPlazaEnLlegada(reservaZonaId) {
  const { data: reserva } = await supabase
    .from("reserva_zona")
    .select("id_zona")
    .eq("id_reserva_zona", reservaZonaId)
    .single();

  const { data: plaza } = await supabase
    .from("plaza")
    .select("id_plaza")
    .eq("id_zona", reserva.id_zona)
    .eq("id_estado", 1)
    .limit(1)
    .single();

  if (!plaza) throw new Error("No hay plazas libres en este momento");

  await supabase
    .from("reserva_zona")
    .update({ id_plaza_asignada: plaza.id_plaza })
    .eq("id_reserva_zona", reservaZonaId);

  await supabase
    .from("plaza")
    .update({ id_estado: 5 }) // Asignada
    .eq("id_plaza", plaza.id_plaza);

  return plaza;
}

// ─── Listar reservas de zona del usuario ─────────────────────────────────────
export async function listarReservasZonaUser(userId) {
  const { data: usuario } = await supabase
    .from("usuario")
    .select("id_persona")
    .eq("id", userId)
    .maybeSingle();

  if (!usuario) throw new Error("Usuario no encontrado");

  const { data, error } = await supabase
    .from("reserva_zona")
    .select(`
      id_reserva_zona, fecha_hora_inicio, fecha_hora_fin,
      descripcion, placa_vehiculo, notas_admin, motivo_rechazo,
      es_dia_completo, cantidad_dias,
      id_estado, created_at,
      estado_reserva ( nombre ),
      zona ( id_zona, nombre, descripcion, direccion ),
      plaza:id_plaza_asignada ( numero_plaza )
    `)
    .eq("id_persona", usuario.id_persona)
    .order("fecha_hora_inicio", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ─── Cancelar reserva de zona ─────────────────────────────────────────────────
export async function cancelarReservaZona(reservaZonaId, userId) {
  const { data: usuario } = await supabase
    .from("usuario")
    .select("id_persona")
    .eq("id", userId)
    .maybeSingle();

  if (!usuario) throw new Error("Usuario no encontrado");

  const { data, error } = await supabase
    .from("reserva_zona")
    .update({ id_estado: 2 }) // Cancelada
    .eq("id_reserva_zona", reservaZonaId)
    .eq("id_persona", usuario.id_persona)
    .in("id_estado", [ESTADO_ACTIVA, ESTADO_EN_ESPERA])
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("Reserva no encontrada o no se puede cancelar");
  return data;
}