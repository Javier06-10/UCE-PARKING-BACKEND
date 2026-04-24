import supabase from "../../config/supabase.js";

const ESTADO_ACTIVA    = 1;
const ESTADO_EN_ESPERA = 5;

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

// ─── Crear reserva de zona (horas o dias) ─────────────────────────────────────
export async function crearReservaZona({ zonaId, userId, fechaInicio, fechaFin, placaVehiculo, descripcion }) {
  const inicio = new Date(fechaInicio);
  const fin    = new Date(fechaFin);

  // 1. Traer config de la zona
  const { data: config } = await supabase
    .from("config_reserva_zona")
    .select("*")
    .eq("id_zona", zonaId)
    .single();

  if (!config) throw new Error("Esta zona no tiene configuracion de reservas");

  // 2. Determinar si es por horas o dias
  const diffMs   = fin - inicio;
  const diffHrs  = diffMs / 3_600_000;
  const diffDias = diffMs / 86_400_000;
  const esDia    = diffHrs >= 12;

  if (esDia && !config.permite_dias)
    throw new Error("Esta zona no permite reservas de dias completos");
  if (!esDia && !config.permite_horas)
    throw new Error("Esta zona no permite reservas por horas");
  if (!esDia && diffHrs > config.max_horas)
    throw new Error(`Maximo ${config.max_horas} horas por reserva en esta zona`);
  if (esDia && Math.ceil(diffDias) > config.max_dias)
    throw new Error(`Maximo ${config.max_dias} dias por reserva en esta zona`);

  // 3. Validar horario permitido (solo para reservas por horas)
  if (!esDia) {
    const horaInicio = inicio.toTimeString().slice(0, 5);
    const horaFin    = fin.toTimeString().slice(0, 5);
    if (horaInicio < config.hora_inicio_permitida || horaFin > config.hora_fin_permitida)
      throw new Error(`Solo se puede reservar entre ${config.hora_inicio_permitida} y ${config.hora_fin_permitida}`);
  }

  // 4. Verificar que la zona existe y esta activa
  const { data: zonaRow, error: zonaErr } = await supabase
    .from("zona")
    .select("id_zona, id_estado")
    .eq("id_zona", zonaId)
    .maybeSingle();

  if (zonaErr || !zonaRow) throw new Error("Zona no encontrada.");
  if (zonaRow.id_estado !== 1) throw new Error("Esta zona no esta activa y no acepta reservas.");

  // 5. Verificar disponibilidad
  const plazasLibres = await verificarDisponibilidad(zonaId, fechaInicio, fechaFin);
  if (plazasLibres === 0) throw new Error("No hay plazas disponibles en esta zona para ese horario");

  // 5. Resolver persona
  const { data: usuario } = await supabase
    .from("usuario")
    .select("id_persona, organizacion_id")
    .eq("id", userId)
    .maybeSingle();
  if (!usuario) throw new Error("Usuario no encontrado");

  // --- NUEVA VALIDACION: tipo_persona.puede_reservar ---
  const { data: personaData } = await supabase
    .from("persona")
    .select("tipo_persona(puede_reservar)")
    .eq("id_persona", usuario.id_persona)
    .maybeSingle();

  if (personaData?.tipo_persona?.puede_reservar === false) {
    throw new Error("Tu tipo de usuario no tiene permitido realizar reservas");
  }

  // --- NUEVA VALIDACION: nivel_privilegio ---
  const { data: empData } = await supabase
    .from("empleado")
    .select("id_cargo, cargo(nivel_privilegio)")
    .eq("id_persona", usuario.id_persona)
    .maybeSingle();

  const nivelUsuario = empData?.cargo?.nivel_privilegio ?? 1;

  if (nivelUsuario < config.nivel_minimo_privilegio) {
    throw new Error(
      `No tienes el nivel de acceso requerido para reservar en esta zona`
    );
  }
  // ------------------------------------------

  // 6. Insertar reserva_zona
  const estadoInicial = config.requiere_aprobacion ? ESTADO_EN_ESPERA : ESTADO_ACTIVA;

  const { data, error } = await supabase
    .from("reserva_zona")
    .insert({
      id_zona:           zonaId,
      id_persona:        usuario.id_persona,
      id_tipo:           esDia ? 2 : 1,
      id_estado:         estadoInicial,
      fecha_hora_inicio: inicio.toISOString(),
      fecha_hora_fin:    fin.toISOString(),
      descripcion:       descripcion || null,
      organizacion_id:   usuario.organizacion_id
    })
    .select()
    .single();

  if (error) throw error;
  return { reserva: data, requiere_aprobacion: config.requiere_aprobacion };
}

// ─── Aprobar reserva (admin) ──────────────────────────────────────────────────
export async function aprobarReservaZona(reservaZonaId, empleadoId, notasAdmin) {
  const { data, error } = await supabase
    .from("reserva_zona")
    .update({
      id_estado:             ESTADO_ACTIVA,
      id_empleado_aprobador: empleadoId,
      descripcion:           notasAdmin || null
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
      id_estado:             6,
      id_empleado_aprobador: empleadoId,
      descripcion:           motivo || null
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
    .update({ id_estado: 5 })
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
      descripcion, id_estado, created_at,
      estado_reserva ( nombre ),
      zona ( id_zona, nombre, descripcion ),
      plaza:id_plaza_asignada ( numero_plaza )
    `)
    .eq("id_persona", usuario.id_persona)
    .order("fecha_hora_inicio", { ascending: false });

  if (error) throw error;
  return data;
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
    .update({ id_estado: 2 })
    .eq("id_reserva_zona", reservaZonaId)
    .eq("id_persona", usuario.id_persona)
    .in("id_estado", [ESTADO_ACTIVA, ESTADO_EN_ESPERA])
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("Reserva no encontrada o no se puede cancelar");
  return data;
}
