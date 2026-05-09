// src/modules/reserva/reserva-zona.service.js
//
// CAMBIOS v2:
//   - Eliminado campo placa_vehiculo (eliminado de reserva_zona en BD)
//   - codigo_reserva se genera automáticamente por trigger en BD
//   - Agregado: guardar participantes en reserva_zona_participantes
//   - Agregado: notificación al aprobar (al solicitante + participantes)
//   - listarReservasZonaUser retorna codigo_reserva
//   - Agregado: verificarPlacaParticipante para AccesoManual

import supabase from "../../config/supabase.js";

const ESTADO_ACTIVA    = 1;
const ESTADO_EN_ESPERA = 5;

// ─── Helper: contexto completo del usuario ────────────────────────────────────
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

  const personaId     = usuario.id_persona;
  const orgId         = usuario.organizacion_id;
  const idTipoPersona = usuario.persona?.id_tipo_persona ?? null;
  const puedeReservar = usuario.persona?.tipo_persona?.puede_reservar ?? true;

  const { data: empData } = await supabase
    .from("empleado")
    .select("id_empleado, id_estado, cargo ( id_cargo, nombre, nivel_privilegio )")
    .eq("id_persona", personaId)
    .eq("id_estado", 1)
    .maybeSingle();

  const esEmpleado = empData != null;
  const nivel      = empData?.cargo?.nivel_privilegio ?? 1;

  return { personaId, orgId, idTipoPersona, nivel, esEmpleado, puedeReservar };
}

// ─── Validar que el usuario puede reservar una zona específica ────────────────
async function validarAccesoZona(ctx, config, zona) {
  if (ctx.puedeReservar === false)
    throw new Error("Tu tipo de usuario no tiene habilitadas las reservas");

  if (config.requiere_empleado && !ctx.esEmpleado) {
    const tipoNombre = await _resolveTipoPersona(ctx.idTipoPersona);
    throw new Error(
      `Las reservas de zona están disponibles solo para empleados activos. ` +
      `Tu perfil es: ${tipoNombre}.`
    );
  }

  if (ctx.nivel < config.nivel_minimo_privilegio)
    throw new Error(
      `Tu nivel (${ctx.nivel}) no es suficiente. Se requiere nivel ${config.nivel_minimo_privilegio}.`
    );

  if (zona.id_tipo === 3 && ctx.nivel < 7)
    throw new Error("Esta zona es VIP. Se requiere cargo de Director o superior.");
}

async function _resolveTipoPersona(idTipo) {
  if (!idTipo) return "Sin tipo asignado";
  const { data } = await supabase
    .from("tipo_persona").select("nombre").eq("id_tipo_persona", idTipo).maybeSingle();
  return data?.nombre ?? "Sin tipo asignado";
}

// ─── Verificar disponibilidad ────────────────────────────────────────────────
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
// CAMBIO: eliminado placaVehiculo (campo eliminado de reserva_zona)
// CAMBIO: codigo_reserva se genera automáticamente por trigger
// NUEVO:  participantes guardados en reserva_zona_participantes
export async function crearReservaZona({ zonaId, userId, fechaInicio, fechaFin, descripcion, participantes = [] }) {
  const inicio = new Date(fechaInicio);
  const fin    = new Date(fechaFin);

  const ctx = await getContextoUsuario(userId);

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
  if (zona.id_estado !== 1) throw new Error("Esta zona no está activa");

  const config = zona.config_reserva_zona?.[0];
  if (!config) throw new Error("Esta zona no tiene configuración de reservas");

  await validarAccesoZona(ctx, config, zona);

  const diffMs  = fin - inicio;
  const diffHrs = diffMs / 3_600_000;
  const diffDias = diffMs / 86_400_000;
  const esDia   = diffHrs >= 12;

  if (esDia && !config.permite_dias)
    throw new Error("Esta zona no permite reservas de días completos");
  if (!esDia && !config.permite_horas)
    throw new Error("Esta zona no permite reservas por horas");
  if (!esDia && diffHrs > config.max_horas)
    throw new Error(`Máximo ${config.max_horas} horas por reserva`);
  if (esDia && Math.ceil(diffDias) > config.max_dias)
    throw new Error(`Máximo ${config.max_dias} días por reserva`);

  if (!esDia && config.hora_inicio_permitida && config.hora_fin_permitida) {
    const horaInicio = inicio.toTimeString().slice(0, 5);
    const horaFin    = fin.toTimeString().slice(0, 5);
    if (horaInicio < config.hora_inicio_permitida || horaFin > config.hora_fin_permitida)
      throw new Error(`Solo se puede reservar entre ${config.hora_inicio_permitida} y ${config.hora_fin_permitida}`);
  }

  const plazasLibres = await verificarDisponibilidad(zonaId, fechaInicio, fechaFin);
  if (plazasLibres === 0)
    throw new Error("No hay plazas disponibles en esta zona para ese horario");

  const estadoInicial = config.requiere_aprobacion ? ESTADO_EN_ESPERA : ESTADO_ACTIVA;

  // INSERT — sin placa_vehiculo, codigo_reserva lo genera el trigger
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
      organizacion_id:   ctx.orgId
    })
    .select()
    .single();

  if (error) throw new Error("Error al crear la reserva: " + error.message);

  // Guardar participantes registrados
  if (participantes.length > 0) {
    const rows = participantes.map(p => ({
      id_reserva_zona: data.id_reserva_zona,
      id_persona:      p.id_persona,
      placa_vehiculo:  p.placa_vehiculo || null
    }));

    const { error: partErr } = await supabase
      .from("reserva_zona_participantes")
      .insert(rows);

    if (partErr) {
      console.error("[reserva-zona] Error guardando participantes:", partErr.message);
    }
  }

  return {
    reserva: data,
    requiere_aprobacion: config.requiere_aprobacion,
    codigo_reserva: data.codigo_reserva  // devuelto por el trigger
  };
}

// ─── Verificar acceso a reservas de zona ──────────────────────────────────────
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
            ? "Tu cargo no tiene el nivel mínimo requerido"
            : "Las reservas de zona están disponibles solo para personal empleado"
    };
  } catch {
    return { puede_reservar_zona: false, es_empleado: false, nivel: 1, mensaje: "No se pudo verificar" };
  }
}

// ─── Aprobar reserva — notifica al solicitante y participantes ────────────────
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
    .select("*, zona ( nombre )")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Reserva no encontrada o ya procesada");

  const nombreZona      = data.zona?.nombre ?? "la zona reservada";
  const codigoReserva   = data.codigo_reserva;
  const orgId           = data.organizacion_id;

  // Notificación al solicitante
  await supabase.from("notificacion").insert({
    id_persona:      data.id_persona,
    organizacion_id: orgId,
    titulo:          `Reserva Aprobada — Código: ${codigoReserva}`,
    mensaje:         `Tu reserva para "${nombreZona}" fue aprobada. Comparte el código ${codigoReserva} con quienes no estén registrados.`,
    leida:           false,
    created_at:      new Date().toISOString()
  });

  // Notificaciones a participantes registrados
  const { data: participantes } = await supabase
    .from("reserva_zona_participantes")
    .select("id_persona, placa_vehiculo")
    .eq("id_reserva_zona", reservaZonaId);

  for (const p of participantes ?? []) {
    await supabase.from("notificacion").insert({
      id_persona:      p.id_persona,
      organizacion_id: orgId,
      titulo:          `Eres parte de una reserva de zona`,
      mensaje:         `Fuiste añadido a la reserva de "${nombreZona}". Tu acceso será automático por tu placa registrada. Código por si lo necesitas: ${codigoReserva}`,
      leida:           false,
      created_at:      new Date().toISOString()
    });
  }

  return data;
}

// ─── Rechazar reserva ─────────────────────────────────────────────────────────
export async function rechazarReservaZona(reservaZonaId, empleadoId, motivo) {
  const { data, error } = await supabase
    .from("reserva_zona")
    .update({
      id_estado:             6,
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
    .from("reserva_zona").select("id_zona")
    .eq("id_reserva_zona", reservaZonaId).single();

  const { data: plaza } = await supabase
    .from("plaza").select("id_plaza")
    .eq("id_zona", reserva.id_zona).eq("id_estado", 1).limit(1).single();

  if (!plaza) throw new Error("No hay plazas libres en este momento");

  await supabase.from("reserva_zona")
    .update({ id_plaza_asignada: plaza.id_plaza })
    .eq("id_reserva_zona", reservaZonaId);

  await supabase.from("plaza")
    .update({ id_estado: 5 }).eq("id_plaza", plaza.id_plaza);

  return plaza;
}

// ─── Listar reservas de zona del usuario ──────────────────────────────────────
// CAMBIO: quitado placa_vehiculo del select, agregado codigo_reserva
export async function listarReservasZonaUser(userId) {
  const { data: usuario } = await supabase
    .from("usuario").select("id_persona").eq("id", userId).maybeSingle();

  if (!usuario) throw new Error("Usuario no encontrado");

  const { data, error } = await supabase
    .from("reserva_zona")
    .select(`
      id_reserva_zona, fecha_hora_inicio, fecha_hora_fin,
      descripcion, codigo_reserva, notas_admin, motivo_rechazo,
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
    .from("usuario").select("id_persona").eq("id", userId).maybeSingle();

  if (!usuario) throw new Error("Usuario no encontrado");

  const { data, error } = await supabase
    .from("reserva_zona")
    .update({ id_estado: 2 })
    .eq("id_reserva_zona", reservaZonaId)
    .eq("id_persona", usuario.id_persona)
    .in("id_estado", [ESTADO_ACTIVA, ESTADO_EN_ESPERA])
    .select().single();

  if (error) throw error;
  if (!data) throw new Error("Reserva no encontrada o no se puede cancelar");
  return data;
}

// ─── NUEVO: Verificar si una placa es participante de reserva activa ──────────
// Usado por AccesoManual para detectar acceso automático por placa
export async function verificarPlacaParticipante(placa, orgId) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("reserva_zona_participantes")
    .select(`
      id, placa_vehiculo, id_persona,
      reserva_zona (
        id_reserva_zona, codigo_reserva, fecha_hora_inicio, fecha_hora_fin,
        id_estado, organizacion_id,
        zona ( nombre )
      )
    `)
    .eq("placa_vehiculo", placa.toUpperCase().trim())
    .maybeSingle();

  if (error || !data) return null;

  const rz = data.reserva_zona;
  if (!rz) return null;
  if (rz.id_estado !== ESTADO_ACTIVA) return null;
  if (rz.organizacion_id !== orgId) return null;
  if (now < rz.fecha_hora_inicio || now > rz.fecha_hora_fin) return null;

  return {
    es_participante:  true,
    id_reserva_zona:  rz.id_reserva_zona,
    codigo_reserva:   rz.codigo_reserva,
    nombre_zona:      rz.zona?.nombre,
    fecha_inicio:     rz.fecha_hora_inicio,
    fecha_fin:        rz.fecha_hora_fin
  };
}