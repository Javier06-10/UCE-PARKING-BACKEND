import supabase from "../../config/supabase.js";
import { getReservaActiva } from "../reserva/reserva.service.js";
import { getAsignacionActiva } from "../asignacion/asignacion.service.js";

const ESTADO_LIBRE_DEFAULT   = 1;
const ESTADO_OCUPADA_DEFAULT = 2;

/**
 * Actualizar estados de plazas según señal de sensores.
 * @param {Array}  plazas            - [{ id, occupied }]
 * @param {number} estadoOcupadaId
 * @param {number} estadoLibreId
 * @param {number} org_id
 */
async function updatePlazas(
  plazas,
  estadoOcupadaId = ESTADO_OCUPADA_DEFAULT,
  estadoLibreId   = ESTADO_LIBRE_DEFAULT,
  org_id          = null
) {
  for (const plaza of plazas) {
    const nuevoEstado = plaza.occupied ? estadoOcupadaId : estadoLibreId;

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
      await asignarPlaza(plaza, org_id);
    } else {
      await cerrarRegistroPlaza(plaza);
    }
  }
}

async function asignarPlaza(plaza, org_id) {
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
  const reserva    = await getReservaActiva(plaza.id);

  const { data: vehiculo } = await supabase
    .from("vehiculo")
    .select("id_persona")
    .eq("id_vehiculo", accesoAbierto.id_vehiculo)
    .single();

  const personaVehiculo = vehiculo?.id_persona;

  if (asignacion) {
    return await manejarAsignacion(asignacion, accesoAbierto, plaza, personaVehiculo, org_id);
  }

  if (reserva) {
    return await manejarReserva(reserva, accesoAbierto, plaza, personaVehiculo, org_id);
  }

  await asignarPlazaLibre(accesoAbierto, plaza);
}

async function manejarAsignacion(asignacion, accesoAbierto, plaza, personaVehiculo, org_id) {
  if (asignacion.id_vehiculo === accesoAbierto.id_vehiculo) {
    await supabase
      .from("acceso")
      .update({ id_plaza: plaza.id })
      .eq("id_registro", accesoAbierto.id_registro);

    console.log("🏢 Plaza asignada por asignación permanente");
  } else {
    await registrarConflicto(
      "CONFLICTO_ASIGNACION",
      `Intento de ocupar plaza asignada ${plaza.id}`,
      plaza.id,
      personaVehiculo,
      org_id
    );
    console.log("⚠ Conflicto de asignación permanente");
  }
}

async function manejarReserva(reserva, accesoAbierto, plaza, personaVehiculo, org_id) {
  if (personaVehiculo === reserva.id_persona) {
    await supabase
      .from("acceso")
      .update({ id_plaza: plaza.id })
      .eq("id_registro", accesoAbierto.id_registro);

    console.log("📅 Plaza asignada por reserva");
  } else {
    await registrarConflicto(
      "CONFLICTO_RESERVA",
      `Intento de ocupar plaza reservada ${plaza.id}`,
      plaza.id,
      personaVehiculo,
      org_id
    );
    console.log("⚠ Conflicto de reserva");
  }
}

async function asignarPlazaLibre(accesoAbierto, plaza) {
  await supabase
    .from("acceso")
    .update({ id_plaza: plaza.id })
    .eq("id_registro", accesoAbierto.id_registro);

  console.log("🚗 Plaza asignada libremente");
}

/**
 * Registrar conflicto en la tabla evento.
 * tipo e id_origen_evento usan FKs de las tablas tipo y origen_evento.
 */
async function registrarConflicto(tipoNombre, descripcion, idPlaza, idPersona, org_id) {
  if (!idPersona) {
    console.warn("[parking] registrarConflicto: id_persona es null, omitiendo evento.");
    return;
  }

  const { data: tipoEvento } = await supabase
    .from("tipo_evento")
    .select("id_tipo")
    .ilike("nombre", tipoNombre)
    .maybeSingle();

  const { data: origenEvento } = await supabase
    .from("origen_evento")
    .select("id_origen")
    .ilike("nombre", "SISTEMA")
    .maybeSingle();

  await supabase.from("evento").insert({
    fecha_hora:       new Date(),
    descripcion,
    id_plaza:         idPlaza,
    id_persona:       idPersona,
    id_tipo:          tipoEvento?.id_tipo   || null,
    id_origen_evento: origenEvento?.id_origen || null,
    organizacion_id:  org_id,
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

    console.log(`🚙 Registro ${acceso.id_registro} cerrado`);
  }
}

export { updatePlazas };
