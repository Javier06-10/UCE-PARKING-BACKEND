import supabase from "../../config/supabase.js";
import { getReservaActiva } from "../reserva/reserva.service.js";
import { getAsignacionActiva } from "../asignacion/asignacion.service.js";

const ESTADO_LIBRE = 1;
const ESTADO_OCUPADA = 2;

async function updatePlazas(plazas) {
  // ─── Mapeo de Sensores (Arduino 1-15) ───────────────────────────────────────
  // 1-10: Parqueo General (id_tipo = 1)
  // 11-15: Administrativo (id_tipo = 3)

  // Traer plazas reales de la BD para asegurar que usamos los IDs correctos
  const { data: general } = await supabase
    .from("plaza")
    .select("id_plaza, numero_plaza")
    .eq("id_tipo", 1)
    .order("numero_plaza", { ascending: true });

  const { data: admin } = await supabase
    .from("plaza")
    .select("id_plaza, numero_plaza")
    .eq("id_tipo", 3)
    .order("numero_plaza", { ascending: true });

  // Crear array de mapeo (índice 0-9 = General, 10-14 = Admin)
  const mappedIds = [
    ...(general || []).slice(0, 10),
    ...(admin || []).slice(0, 5)
  ].map(p => p.id_plaza);

  for (let i = 0; i < plazas.length; i++) {
    const sensorData = plazas[i];
    const dbId = mappedIds[i];

    if (!dbId) continue; // Si no hay plaza configurada para este sensor, ignorar

    const nuevoEstado = sensorData.occupied ? ESTADO_OCUPADA : ESTADO_LIBRE;

    const { data: plazaActual } = await supabase
      .from("plaza")
      .select("id_estado")
      .eq("id_plaza", dbId)
      .single();

    if (!plazaActual || plazaActual.id_estado === nuevoEstado) continue;

    // Actualizar estado en BD
    await supabase
      .from("plaza")
      .update({ id_estado: nuevoEstado })
      .eq("id_plaza", dbId);

    // Preparar objeto para funciones de asignación
    const plazaObj = { id: dbId, occupied: sensorData.occupied };

    if (sensorData.occupied) {
      await asignarPlaza(plazaObj);
    } else {
      await cerrarRegistroPlaza(plazaObj);
    }
  }
}

async function asignarPlaza(plaza) {
  // Limitar a accesos de los últimos 5 minutos para evitar asignar al vehículo incorrecto
  // cuando varios vehículos entran en secuencia rápida
  const cincoMinAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: accesoAbierto } = await supabase
    .from("acceso")
    .select("id_registro, id_vehiculo")
    .is("salida_at", null)
    .is("id_plaza", null)
    .gte("entrada_at", cincoMinAtras)
    .order("entrada_at", { ascending: false })
    .limit(1)
    .single();

  if (!accesoAbierto) return;

  const asignacion = await getAsignacionActiva(plaza.id);
  const reserva = await getReservaActiva(plaza.id);

  const { data: vehiculo } = await supabase
    .from("vehiculo")
    .select("id_persona")
    .eq("id_vehiculo", accesoAbierto.id_vehiculo)
    .single();

  const personaVehiculo = vehiculo?.id_persona;

  if (asignacion) {
    return await manejarAsignacion(asignacion, accesoAbierto, plaza, personaVehiculo);
  }

  if (reserva) {
    return await manejarReserva(reserva, accesoAbierto, plaza, personaVehiculo);
  }

  await asignarPlazaLibre(accesoAbierto, plaza);
}

async function manejarAsignacion(asignacion, accesoAbierto, plaza, personaVehiculo) {
  // La asignacion ahora es a empleado, se verifica si el vehiculo pertenece al empleado
  const { data: empleado } = await supabase
    .from("empleado")
    .select("id_persona")
    .eq("id_empleado", asignacion.id_empleado)
    .single();

  if (empleado?.id_persona === personaVehiculo) {
    await supabase
      .from("acceso")
      .update({ id_plaza: plaza.id })
      .eq("id_registro", accesoAbierto.id_registro);

    console.log("Plaza asignada por asignacion permanente");
  } else {
    await registrarConflicto(
      "CONFLICTO_ASIGNACION",
      `Intento de ocupar plaza asignada ${plaza.id}`,
      plaza.id,
      personaVehiculo
    );
    console.log("Conflicto de asignacion permanente");
  }
}

async function manejarReserva(reserva, accesoAbierto, plaza, personaVehiculo) {
  if (personaVehiculo === reserva.id_persona) {
    await supabase
      .from("acceso")
      .update({ id_plaza: plaza.id })
      .eq("id_registro", accesoAbierto.id_registro);

    console.log("Plaza asignada por reserva");
  } else {
    await registrarConflicto(
      "CONFLICTO_RESERVA",
      `Intento de ocupar plaza reservada ${plaza.id}`,
      plaza.id,
      personaVehiculo
    );
    console.log("Conflicto de reserva");
  }
}

async function asignarPlazaLibre(accesoAbierto, plaza) {
  await supabase
    .from("acceso")
    .update({ id_plaza: plaza.id })
    .eq("id_registro", accesoAbierto.id_registro);

  console.log("Plaza asignada libremente");
}

async function registrarConflicto(tipoDescripcion, descripcion, idPlaza, idPersona) {
  const { data: tipoEvento } = await supabase
    .from("tipo_evento")
    .select("id_tipo")
    .eq("nombre", tipoDescripcion)
    .maybeSingle();

  await supabase.from("evento").insert({
    fecha_hora: new Date(),
    descripcion,
    id_plaza: idPlaza,
    id_persona: idPersona,
    organizacion_id: 1,
    id_tipo: tipoEvento?.id_tipo || null
  });
}

async function cerrarRegistroPlaza(plaza) {
  const { data: acceso } = await supabase
    .from("acceso")
    .select("id_registro")
    .eq("id_plaza", plaza.id)
    .is("salida_at", null)
    .single();

  if (acceso) {
    await supabase
      .from("acceso")
      .update({ salida_at: new Date() })
      .eq("id_registro", acceso.id_registro);

    console.log(`Registro ${acceso.id_registro} cerrado`);
  }
}

export { updatePlazas };
