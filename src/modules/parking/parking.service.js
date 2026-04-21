import supabase from "../../config/supabase.js";
import { getReservaActiva } from "../reserva/reserva.service.js";
import { getAsignacionActiva } from "../asignacion/asignacion.service.js";

const ESTADO_LIBRE = 1;
const ESTADO_OCUPADA = 2;

async function updatePlazas(plazas) {
  for (const plaza of plazas) {
    const nuevoEstado = plaza.occupied ? ESTADO_OCUPADA : ESTADO_LIBRE;

    const { data: plazaActual } = await supabase
      .from("plaza")
      .select("id_estado")
      .eq("id_plaza", plaza.id)
      .single();

    if (!plazaActual || plazaActual.id_estado === nuevoEstado) continue;

    await supabase
      .from("plaza")
      .update({ id_estado: nuevoEstado })
      .eq("id_plaza", plaza.id);

    if (plaza.occupied) {
      await asignarPlaza(plaza);
    } else {
      await cerrarRegistroPlaza(plaza);
    }
  }
}

async function asignarPlaza(plaza) {
  const { data: accesoAbierto } = await supabase
    .from("acceso")
    .select("id_registro, id_vehiculo")
    .is("salida_at", null)
    .is("id_plaza", null)
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
