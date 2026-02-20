import supabase from "../../config/supabase.js";
import { getReservaActiva } from "../reserva/reserva.service.js";
import { getAsignacionActiva } from "../asignacion/asignacion.service.js";

const ESTADO_LIBRE = 1;
const ESTADO_OCUPADA = 2;

async function updatePlazas(plazas) {
  for (const plaza of plazas) {
    const nuevoEstado = plaza.occupied ? ESTADO_OCUPADA : ESTADO_LIBRE;

    const { data: plazaActual } = await supabase
      .from("plazas")
      .select("id_estado")
      .eq("Id_Plaza", plaza.id)
      .single();

    if (!plazaActual || plazaActual.id_estado === nuevoEstado) continue;

    // Actualizar estado plaza
    await supabase
      .from("plazas")
      .update({ id_estado: nuevoEstado })
      .eq("Id_Plaza", plaza.id);

    if (plaza.occupied) {
      await asignarPlaza(plaza);
    } else {
      await cerrarRegistroPlaza(plaza);
    }
  }
}

async function asignarPlaza(plaza) {
  const { data: accesoAbierto } = await supabase
    .from("registros_acceso")
    .select("*")
    .is("salida_at", null)
    .is("Id_Plaza", null)
    .order("entrada_at", { ascending: false })
    .limit(1)
    .single();

  if (!accesoAbierto) return;

  const asignacion = await getAsignacionActiva(plaza.id);
  const reserva = await getReservaActiva(plaza.id);

  const { data: vehiculo } = await supabase
    .from("vehiculos")
    .select("persona_id")
    .eq("id", accesoAbierto.vehiculo_id)
    .single();

  const personaVehiculo = vehiculo?.persona_id;

  // Prioridad 1: Asignación permanente
  if (asignacion) {
    return await manejarAsignacion(
      asignacion,
      accesoAbierto,
      plaza,
      personaVehiculo,
    );
  }

  // Prioridad 2: Reserva
  if (reserva) {
    return await manejarReserva(reserva, accesoAbierto, plaza, personaVehiculo);
  }

  // Prioridad 3: Plaza libre
  await asignarPlazaLibre(accesoAbierto, plaza);
}

async function manejarAsignacion(
  asignacion,
  accesoAbierto,
  plaza,
  personaVehiculo,
) {
  if (asignacion.Id_Vehiculo_Asignado === accesoAbierto.vehiculo_id) {
    await supabase
      .from("registros_acceso")
      .update({ Id_Plaza: plaza.id })
      .eq("id", accesoAbierto.id);

    console.log("🏢 Plaza asignada por asignación permanente");
  } else {
    await registrarConflicto(
      "CONFLICTO_ASIGNACION",
      `Intento de ocupar plaza asignada ${plaza.id}`,
      plaza.id,
      personaVehiculo,
    );
    console.log("⚠ Conflicto de asignación permanente");
  }
}

async function manejarReserva(reserva, accesoAbierto, plaza, personaVehiculo) {
  if (personaVehiculo === reserva.id_persona) {
    await supabase
      .from("registros_acceso")
      .update({ Id_Plaza: plaza.id })
      .eq("id", accesoAbierto.id);

    console.log("📅 Plaza asignada por reserva");
  } else {
    await registrarConflicto(
      "CONFLICTO_RESERVA",
      `Intento de ocupar plaza reservada ${plaza.id}`,
      plaza.id,
      personaVehiculo,
    );
    console.log("⚠ Conflicto de reserva");
  }
}

async function asignarPlazaLibre(accesoAbierto, plaza) {
  await supabase
    .from("registros_acceso")
    .update({ Id_Plaza: plaza.id })
    .eq("id", accesoAbierto.id);

  console.log("🚗 Plaza asignada libremente");
}

async function registrarConflicto(tipoEvento, descripcion, idPlaza, idPersona) {
  await supabase.from("eventos").insert({
    Fecha_Hora: new Date(),
    Tipo_Evento: tipoEvento,
    Descripcion: descripcion,
    Id_Plaza: idPlaza,
    id_persona: idPersona,
    origen_evento: "SISTEMA",
  });
}

async function cerrarRegistroPlaza(plaza) {
  const { data: acceso } = await supabase
    .from("registros_acceso")
    .select("*")
    .eq("Id_Plaza", plaza.id)
    .is("salida_at", null)
    .single();

  if (acceso) {
    await supabase
      .from("registros_acceso")
      .update({
        salida_at: new Date(),
        tipo_evento: "SALIDA",
      })
      .eq("id", acceso.id);

    console.log(`🚙 Registro ${acceso.id} cerrado`);
  }
}

export { updatePlazas };
