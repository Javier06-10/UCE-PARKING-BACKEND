import supabase from "../../config/supabase.js";
import { sendCommand } from "../../config/serial.js";

// ─── Helper: FK de tipo_evento ─────────────────────────────────────────────────
async function getTipoEventoId(nombre) {
  const { data } = await supabase
    .from("tipo_evento")
    .select("id_tipo")
    .ilike("nombre_tipo", nombre)
    .maybeSingle();
  return data?.id_tipo ?? null;
}

// ─── Helper: FK de origen_evento ──────────────────────────────────────────────
async function getOrigenEventoId(nombre) {
  const { data } = await supabase
    .from("origen_evento")
    .select("id_origen")
    .ilike("nombre", nombre)
    .maybeSingle();
  return data?.id_origen ?? null;
}

// ─── Registrar entrada ────────────────────────────────────────────────────────
// org_id requerido: registros_acceso.organizacion_id debe estar presente (bypass RLS = service_role)
async function registrarEntrada({ placa, dispositivoEntradaId, org_id }) {
  if (!placa)   throw new Error("Placa requerida");
  if (!org_id)  throw new Error("org_id requerido para registrar entrada");

  // 1. Buscar vehículo (id_vehiculo es el PK correcto)
  const { data: vehiculo, error: vehiculoError } = await supabase
    .from("vehiculos")
    .select("id_vehiculo, placa")
    .eq("placa", placa)
    .maybeSingle();

  if (vehiculoError) throw vehiculoError;

  let finalVehiculo = vehiculo;

  // 2. Crear si no existe — sin Marca/Color (columnas eliminadas del schema)
  if (!vehiculo) {
    const { data: nuevoVehiculo, error } = await supabase
      .from("vehiculos")
      .insert({ placa })
      .select("id_vehiculo, placa")
      .single();

    if (error) throw error;
    finalVehiculo = nuevoVehiculo;
  }

  // 3. Verificar que no tenga entrada activa
  const { data: accesoActivo } = await supabase
    .from("registros_acceso")
    .select("id_registro")
    .eq("id_vehiculo", finalVehiculo.id_vehiculo)   // FK correcto
    .is("salida_at", null)
    .maybeSingle();

  if (accesoActivo) {
    throw new Error("Vehículo ya está dentro del parqueadero");
  }

  // 4. Registrar entrada
  const id_tipo_evento = await getTipoEventoId("ENTRADA");

  const { data: registro, error: accesoError } = await supabase
    .from("registros_acceso")
    .insert({
      entrada_at:            new Date(),
      id_vehiculo:           finalVehiculo.id_vehiculo,
      id_tipo_evento,
      id_dispositivo_entrada: dispositivoEntradaId ?? null,
      organizacion_id:       org_id,
    })
    .select()
    .single();

  if (accesoError) throw accesoError;

  if (global.io) {
    global.io.emit("access-event", {
      type:      "ENTRADA",
      placa:     finalVehiculo.placa,
      timestamp: registro.entrada_at,
    });
  }

  // 5. Abrir barrera física
  sendCommand("open_main");

  return registro;
}

// ─── Registrar entrada de visitante ───────────────────────────────────────────
async function registrarEntradaVisitante({
  nombre,
  placa,
  dispositivoEntradaId,
  adminPersonaId,
  motivo,
  ticketId,
  plazaId,
  org_id,
}) {
  console.log(`[access] registrarEntradaVisitante → placa=${placa} ticketId=${ticketId} plazaId=${plazaId}`);

  if (!placa)   throw new Error("Placa requerida para registrar entrada de visitante");
  if (!org_id)  throw new Error("org_id requerido para registrar entrada de visitante");

  // 1. Buscar o crear vehículo — sin campos Marca/Color (no existen en el schema)
  const { data: vehiculoExistente, error: vErr } = await supabase
    .from("vehiculos")
    .select("id_vehiculo, placa")
    .eq("placa", placa)
    .maybeSingle();

  if (vErr) {
    console.error("[access] Error buscando vehículo:", vErr);
    throw vErr;
  }

  let vehiculo;
  if (!vehiculoExistente) {
    console.log(`[access] Vehículo no encontrado, creando: ${placa}`);
    const { data: nuevoVehiculo, error: createErr } = await supabase
      .from("vehiculos")
      .insert({ placa })
      .select("id_vehiculo, placa")
      .single();

    if (createErr) {
      console.error("[access] Error creando vehículo:", createErr);
      throw createErr;
    }
    vehiculo = nuevoVehiculo;
  } else {
    vehiculo = vehiculoExistente;
  }

  console.log(`[access] Vehículo listo: id=${vehiculo.id_vehiculo} placa=${vehiculo.placa}`);

  // 2. Si ya hay registro activo para este vehículo, cerrarlo primero
  const { data: accesoActivo } = await supabase
    .from("registros_acceso")
    .select("id_registro")
    .eq("id_vehiculo", vehiculo.id_vehiculo)
    .is("salida_at", null)
    .maybeSingle();

  if (accesoActivo) {
    console.warn(`[access] Ya hay registro activo para id_vehiculo=${vehiculo.id_vehiculo}, cerrando antes de crear nuevo.`);
    const id_tipo_salida_auto = await getTipoEventoId("SALIDA_AUTO");
    await supabase
      .from("registros_acceso")
      .update({ salida_at: new Date(), id_tipo_evento: id_tipo_salida_auto })
      .eq("id_registro", accesoActivo.id_registro);
  }

  // 3. Insertar nuevo registro de acceso
  const id_tipo_entrada_visitante = await getTipoEventoId("ENTRADA_VISITANTE");

  const insertData = {
    entrada_at:            new Date(),
    id_vehiculo:           vehiculo.id_vehiculo,
    id_tipo_evento:        id_tipo_entrada_visitante,
    id_dispositivo_entrada: dispositivoEntradaId ?? null,
    ticket_id:             ticketId ? Number(ticketId) : null,
    Id_Plaza:              plazaId  ? Number(plazaId)  : null,
    organizacion_id:       org_id,
  };
  console.log("[access] Insertando registros_acceso:", insertData);

  const { data: registro, error: insertErr } = await supabase
    .from("registros_acceso")
    .insert(insertData)
    .select()
    .single();

  if (insertErr) {
    console.error("[access] Error insertando registro_acceso:", insertErr);
    throw insertErr;
  }

  console.log(`[access] ✅ Registro creado: id=${registro.id_registro}`);

  // 4. Log de evento (eventos requiere id_persona NOT NULL)
  if (adminPersonaId) {
    const id_tipo_evento    = await getTipoEventoId("ENTRADA_VISITANTE");
    const id_origen_evento  = await getOrigenEventoId("ADMIN_PANEL");

    await supabase.from("eventos").insert({
      Fecha_Hora:      new Date(),
      Descripcion:     `Visitante${nombre ? ` ${nombre}` : ""} autorizado | Placa: ${placa} | Motivo: ${motivo || "No especificado"}`,
      id_persona:      adminPersonaId,
      id_tipo_evento,
      id_origen_evento,
      organizacion_id: org_id,
    });
  }

  // 5. Abrir barrera
  sendCommand("open_main");

  return registro;
}

// ─── Registrar salida manual ───────────────────────────────────────────────────
async function registrarSalida({ placa, dispositivoSalidaId, ticketId, org_id }) {
  let acceso    = null;
  let placaFinal = placa;

  // Búsqueda primaria: por ticket_id
  if (ticketId) {
    const { data, error } = await supabase
      .from("registros_acceso")
      .select("id_registro, id_vehiculo, vehiculos(id_vehiculo, placa)")
      .eq("ticket_id", ticketId)
      .is("salida_at", null)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      acceso     = data;
      placaFinal = data.vehiculos?.placa || placa;
    }
  }

  // Fallback: buscar por placa
  if (!acceso) {
    if (!placa) throw new Error("Placa requerida para registrar salida");

    const { data: vehiculo, error: vehiculoError } = await supabase
      .from("vehiculos")
      .select("id_vehiculo, placa")
      .eq("placa", placa)
      .maybeSingle();

    if (vehiculoError) throw vehiculoError;
    if (!vehiculo) throw new Error("Vehículo no encontrado");

    placaFinal = vehiculo.placa;

    const { data: accesoFallback, error: accesoError } = await supabase
      .from("registros_acceso")
      .select("id_registro")
      .eq("id_vehiculo", vehiculo.id_vehiculo)
      .is("salida_at", null)
      .order("entrada_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accesoError) throw accesoError;
    if (!accesoFallback) throw new Error("No hay entrada activa para este vehículo");
    acceso = accesoFallback;
  }

  const salidaAt = new Date();
  const id_tipo_salida = await getTipoEventoId("SALIDA");

  const { data: registro, error: updateError } = await supabase
    .from("registros_acceso")
    .update({
      salida_at:             salidaAt,
      id_tipo_evento:        id_tipo_salida,
      id_dispositivo_salida: dispositivoSalidaId ?? null,
    })
    .eq("id_registro", acceso.id_registro)
    .select()
    .single();

  if (updateError) throw updateError;

  sendCommand("open_main");

  if (global.io) {
    global.io.emit("access-event", {
      type:      "SALIDA",
      placa:     placaFinal,
      timestamp: salidaAt,
    });
  }

  return registro;
}

// ─── Historial de accesos con duración ────────────────────────────────────────
async function getHistorialAccesos({ page = 1, limit = 20, search, fechaDesde, fechaHasta } = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from("registros_acceso")
    .select(
      `id_registro, entrada_at, salida_at, Id_Plaza,
       id_tipo_evento,
       tipo_evento:id_tipo_evento ( id_tipo, nombre_tipo ),
       vehiculos (
         id_vehiculo, placa,
         marcas_vehiculo ( id_marca, nombre ),
         colores_vehiculo ( id_color, nombre ),
         modelos_vehiculo ( id_modelo, nombre )
       ),
       dispositivos_entrada:id_dispositivo_entrada ( id_dispositivo, ubicacion ),
       dispositivos_salida:id_dispositivo_salida   ( id_dispositivo, ubicacion )`,
      { count: "exact" }
    )
    .order("entrada_at", { ascending: false })
    .range(from, to);

  if (fechaDesde) query = query.gte("entrada_at", fechaDesde);
  if (fechaHasta) query = query.lte("entrada_at", fechaHasta);

  const { data, error, count } = await query;
  if (error) throw error;

  const registros = data.map(r => {
    let duracion_minutos = null;
    if (r.entrada_at && r.salida_at) {
      duracion_minutos = Math.round(
        (new Date(r.salida_at) - new Date(r.entrada_at)) / 60000
      );
    }
    return { ...r, duracion_minutos };
  });

  return { data: registros, total: count, page, limit };
}

export { registrarEntrada, registrarEntradaVisitante, registrarSalida, getHistorialAccesos };
