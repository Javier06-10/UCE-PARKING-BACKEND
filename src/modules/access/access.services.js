import supabase from "../../config/supabase.js";
import { sendCommand } from "../serial/serial.service.js";

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
      vehiculo_id: vehiculo?.id || 1,
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



export { registrarEntrada, registrarEntradaVisitante };
