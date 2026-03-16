import supabase from "../../config/supabase.js";
import { sendCommand } from "../../config/serial.js";

async function registrarEntrada({ placa, dispositivoEntradaId }) {

  if (!placa) throw new Error("Placa requerida");

  // 1️⃣ Buscar vehículo
  const { data: vehiculo, error: vehiculoError } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('placa', placa)
    .maybeSingle();

  if (vehiculoError) throw vehiculoError;

  let finalVehiculo = vehiculo;

  // 2️⃣ Crear si no existe
  if (!vehiculo) {
    const { data: nuevoVehiculo, error } = await supabase
      .from('vehiculos')
      .insert({ placa })
      .select()
      .single();

    if (error) throw error;
    finalVehiculo = nuevoVehiculo;
  }

  // 3️⃣ Verificar que no tenga entrada activa
  const { data: accesoActivo } = await supabase
    .from('registros_acceso')
    .select('*')
    .eq('vehiculo_id', finalVehiculo.id)
    .is('salida_at', null)
    .maybeSingle();

  if (accesoActivo) {
    throw new Error("Vehículo ya está dentro del parqueadero");
  }

  // 4️⃣ Registrar entrada
  const { data: registro, error: accesoError } = await supabase
    .from('registros_acceso')
    .insert({
      entrada_at: new Date(),
      vehiculo_id: finalVehiculo.id,
      tipo_evento: 'ENTRADA',
      id_dispositivo_entrada: dispositivoEntradaId
    })
    .select()
    .single();
    
    if (global.io) {
      global.io.emit("access-event", {
        type: "ENTRADA",
        placa: finalVehiculo.placa,
        timestamp: registro.entrada_at
      });
    }
    
  if (accesoError) throw accesoError;

  // 5️⃣ Abrir barrera física
  sendCommand('open_main');

  return registro;
}

async function registrarEntradaVisitante({
  nombre,
  placa,
  dispositivoEntradaId,
  adminPersonaId,
  motivo,
  ticketId,
  plazaId
}) {
  console.log(`[access] registrarEntradaVisitante → placa=${placa} ticketId=${ticketId} plazaId=${plazaId}`);

  let vehiculo = null;

  if (!placa) throw new Error("Placa requerida para registrar entrada de visitante");

  // 1️⃣ Buscar o crear vehículo
  const { data: vehiculoExistente, error: vErr } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('placa', placa)
    .maybeSingle();

  if (vErr) {
    console.error('[access] Error buscando vehículo:', vErr);
    throw vErr;
  }

  if (!vehiculoExistente) {
    console.log(`[access] Vehículo no encontrado, creando: ${placa}`);
    const { data: nuevoVehiculo, error: createErr } = await supabase
      .from('vehiculos')
      .insert({ placa, Marca: 'VISITANTE', Color: 'N/A' })
      .select()
      .single();

    if (createErr) {
      console.error('[access] Error creando vehículo:', createErr);
      throw createErr;
    }
    vehiculo = nuevoVehiculo;
  } else {
    vehiculo = vehiculoExistente;
  }

  console.log(`[access] Vehículo listo: id=${vehiculo.id} placa=${vehiculo.placa}`);

  // 2️⃣ Si ya existe un registro activo para este vehículo, cerrarlo primero
  const { data: accesoActivo } = await supabase
    .from('registros_acceso')
    .select('id')
    .eq('vehiculo_id', vehiculo.id)
    .is('salida_at', null)
    .maybeSingle();

  if (accesoActivo) {
    console.warn(`[access] Ya hay registro activo para vehiculo_id=${vehiculo.id}, cerrando antes de crear nuevo.`);
    await supabase
      .from('registros_acceso')
      .update({ salida_at: new Date(), tipo_evento: 'SALIDA_AUTO' })
      .eq('id', accesoActivo.id);
  }

  // 3️⃣ Insertar nuevo registro de acceso
  const insertData = {
    entrada_at: new Date(),
    vehiculo_id: vehiculo.id,
    tipo_evento: 'ENTRADA_VISITANTE',
    id_dispositivo_entrada: dispositivoEntradaId || null,
    ticket_id: ticketId ? Number(ticketId) : null,
    Id_Plaza: plazaId ? Number(plazaId) : null
  };
  console.log('[access] Insertando registros_acceso:', insertData);

  const { data: registro, error: insertErr } = await supabase
    .from('registros_acceso')
    .insert(insertData)
    .select()
    .single();

  if (insertErr) {
    console.error('[access] Error insertando registro_acceso:', insertErr);
    throw insertErr;
  }

  console.log(`[access] ✅ Registro creado: id=${registro.id}`);

  // 4️⃣ Log de evento
  if (adminPersonaId) {
    await supabase.from('eventos').insert({
      Fecha_Hora: new Date(),
      Tipo_Evento: 'ENTRADA_VISITANTE',
      Descripcion: `Visitante${nombre ? ` ${nombre}` : ''} autorizado | Placa: ${placa} | Motivo: ${motivo || 'No especificado'}`,
      id_persona: adminPersonaId,
      origen_evento: 'ADMIN_PANEL'
    });
  }

  // 5️⃣ Abrir barrera
  sendCommand('open_main');

  return registro;
}



// ─── Registrar salida manual ───────────────────────────────────────────────────
async function registrarSalida({ placa, dispositivoSalidaId, ticketId }) {

  let acceso = null;
  let placaFinal = placa;

  // 🎯 Búsqueda primaria: por ticket_id (más confiable)
  if (ticketId) {
    const { data, error } = await supabase
      .from('registros_acceso')
      .select('*, vehiculos(id, placa)')
      .eq('ticket_id', ticketId)
      .is('salida_at', null)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      acceso = data;
      placaFinal = data.vehiculos?.placa || placa;
    }
  }

  // 🔁 Fallback: buscar por placa si no se encontró por ticket_id
  if (!acceso) {
    if (!placa) throw new Error("Placa requerida para registrar salida");

    const { data: vehiculo, error: vehiculoError } = await supabase
      .from('vehiculos')
      .select('id, placa')
      .eq('placa', placa)
      .maybeSingle();

    if (vehiculoError) throw vehiculoError;
    if (!vehiculo) throw new Error("Vehículo no encontrado");

    placaFinal = vehiculo.placa;

    const { data: accesoFallback, error: accesoError } = await supabase
      .from('registros_acceso')
      .select('*')
      .eq('vehiculo_id', vehiculo.id)
      .is('salida_at', null)
      .order('entrada_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accesoError) throw accesoError;
    if (!accesoFallback) throw new Error("No hay entrada activa para este vehículo");
    acceso = accesoFallback;
  }

  const salidaAt = new Date();

  // Registrar salida
  const { data: registro, error: updateError } = await supabase
    .from('registros_acceso')
    .update({
      salida_at: salidaAt,
      tipo_evento: 'SALIDA',
      id_dispositivo_salida: dispositivoSalidaId || null
    })
    .eq('id', acceso.id)
    .select()
    .single();

  if (updateError) throw updateError;

  // Abrir barrera de salida
  sendCommand('open_main');

  // Emitir evento en tiempo real
  if (global.io) {
    global.io.emit("access-event", {
      type: "SALIDA",
      placa: placaFinal,
      timestamp: salidaAt
    });
  }

  return registro;
}

// ─── Historial de accesos con duración de permanencia ──────────────────────────
async function getHistorialAccesos({ page = 1, limit = 20, search, fechaDesde, fechaHasta } = {}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('registros_acceso')
    .select(
      `id, entrada_at, salida_at, tipo_evento, Id_Plaza,
       vehiculos ( id, placa, Marca, Color ),
       dispositivos_entrada:id_dispositivo_entrada ( id_dispositivo, ubicacion ),
       dispositivos_salida:id_dispositivo_salida ( id_dispositivo, ubicacion )`,
      { count: "exact" }
    )
    .order('entrada_at', { ascending: false })
    .range(from, to);

  if (fechaDesde) query = query.gte('entrada_at', fechaDesde);
  if (fechaHasta) query = query.lte('entrada_at', fechaHasta);

  const { data, error, count } = await query;
  if (error) throw error;

  // Calcular duración en minutos
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
