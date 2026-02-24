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
  motivo
}) {

  let vehiculo = null;

  if (placa) {
    const { data } = await supabase
      .from('vehiculos')
      .select('*')
      .eq('placa', placa)
      .maybeSingle();

    if (!data) {
      const { data: nuevoVehiculo, error } = await supabase
        .from('vehiculos')
        .insert({
          placa,
          Marca: 'VISITANTE',
          Color: 'N/A'
        })
        .select()
        .single();

      if (error) throw error;
      vehiculo = nuevoVehiculo;

    } else {
      vehiculo = data;
    }
  }

  const { data: registro, error } = await supabase
    .from('registros_acceso')
    .insert({
      entrada_at: new Date(),
      vehiculo_id: vehiculo?.id ?? (() => { throw new Error("Placa requerida para registrar entrada de visitante"); })(),
      tipo_evento: 'ENTRADA_VISITANTE',
      id_dispositivo_entrada: dispositivoEntradaId
    })
    .select()
    .single();

  if (error) throw error;

  await supabase.from('eventos').insert({
    Fecha_Hora: new Date(),
    Tipo_Evento: 'APERTURA_MANUAL',
    Descripcion: `Visitante autorizado. Motivo: ${motivo || 'No especificado'}`,
    id_persona: adminPersonaId,
    origen_evento: 'ADMIN_PANEL'
  });

  // 🔥 Abrir puerta también
  sendCommand('open_main');

  return registro;
}



// ─── Registrar salida manual ───────────────────────────────────────────────────
async function registrarSalida({ placa, dispositivoSalidaId }) {
  if (!placa) throw new Error("Placa requerida");

  // Buscar vehículo
  const { data: vehiculo, error: vehiculoError } = await supabase
    .from('vehiculos')
    .select('id, placa')
    .eq('placa', placa)
    .maybeSingle();

  if (vehiculoError) throw vehiculoError;
  if (!vehiculo) throw new Error("Vehículo no encontrado");

  // Buscar entrada activa (sin salida)
  const { data: acceso, error: accesoError } = await supabase
    .from('registros_acceso')
    .select('*')
    .eq('vehiculo_id', vehiculo.id)
    .is('salida_at', null)
    .maybeSingle();

  if (accesoError) throw accesoError;
  if (!acceso) throw new Error("No hay entrada activa para este vehículo");

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

  // Liberar plaza si tenía una asignada
  if (acceso.Id_Plaza) {
    await supabase
      .from('plazas')
      .update({ id_estado: 1 }) // LIBRE
      .eq('Id_Plaza', acceso.Id_Plaza);
  }

  // Abrir barrera de salida
  sendCommand('open_main');

  // Emitir evento
  if (global.io) {
    global.io.emit("access-event", {
      type: "SALIDA",
      placa: vehiculo.placa,
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
