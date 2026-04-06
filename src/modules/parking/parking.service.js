import supabase from "../../config/supabase.js";
import { getReservaActiva } from "../reserva/reserva.service.js";
import { getAsignacionActiva } from "../asignacion/asignacion.service.js";

const ESTADO_LIBRE_DEFAULT    = 1;
const ESTADO_OCUPADA_DEFAULT  = 2;

/**
 * Actualizar estados de plazas según señal de sensores.
 * @param {Array}  plazas            - [{ id, occupied }]
 * @param {number} estadoOcupadaId
 * @param {number} estadoLibreId
 * @param {number} org_id            - organizacion_id (requerido por RLS en inserts)
 */
async function updatePlazas(
  plazas,
  estadoOcupadaId = ESTADO_OCUPADA_DEFAULT,
  estadoLibreId   = ESTADO_LIBRE_DEFAULT,
  org_id          = null
) {
  for (const plaza of plazas) {
    const nuevoEstado = plaza.occupied ? estadoOcupadaId : estadoLibreId;

    // Verificar estado actual (Id_Plaza es el PK correcto)
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
      await asignarPlaza(plaza, org_id);
    } else {
      await cerrarRegistroPlaza(plaza);
    }
  }
}

async function asignarPlaza(plaza, org_id) {
  // Buscar el registro de acceso más reciente sin plaza asignada
  // registros_acceso usa: id_registro (PK), id_vehiculo (FK), Id_Plaza
  const { data: accesoAbierto } = await supabase
    .from("registros_acceso")
    .select("id_registro, id_vehiculo")
    .is("salida_at", null)
    .is("Id_Plaza", null)
    .order("entrada_at", { ascending: false })
    .limit(1)
    .single();

  if (!accesoAbierto) return;

  const asignacion = await getAsignacionActiva(plaza.id);
  const reserva    = await getReservaActiva(plaza.id);

  // vehiculos.id_persona (UUID) — campo correcto según el schema
  const { data: vehiculo } = await supabase
    .from("vehiculos")
    .select("id_persona")
    .eq("id_vehiculo", accesoAbierto.id_vehiculo)
    .single();

  const personaVehiculo = vehiculo?.id_persona;

  // Prioridad 1: Asignación permanente
  if (asignacion) {
    return await manejarAsignacion(asignacion, accesoAbierto, plaza, personaVehiculo, org_id);
  }

  // Prioridad 2: Reserva
  if (reserva) {
    return await manejarReserva(reserva, accesoAbierto, plaza, personaVehiculo, org_id);
  }

  // Prioridad 3: Plaza libre
  await asignarPlazaLibre(accesoAbierto, plaza);
}

async function manejarAsignacion(asignacion, accesoAbierto, plaza, personaVehiculo, org_id) {
  // asignaciones_parqueo usa id_vehiculo (no Id_Vehiculo_Asignado)
  if (asignacion.id_vehiculo === accesoAbierto.id_vehiculo) {
    await supabase
      .from("registros_acceso")
      .update({ Id_Plaza: plaza.id })
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
      .from("registros_acceso")
      .update({ Id_Plaza: plaza.id })
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
    .from("registros_acceso")
    .update({ Id_Plaza: plaza.id })
    .eq("id_registro", accesoAbierto.id_registro);

  console.log("🚗 Plaza asignada libremente");
}

/**
 * Registrar conflicto en la tabla eventos.
 * eventos usa: id_tipo_evento (FK), id_origen_evento (FK) — no texto libre.
 * id_persona es NOT NULL en eventos, por lo que usamos el personaVehiculo o un fallback.
 */
async function registrarConflicto(tipoNombre, descripcion, idPlaza, idPersona, org_id) {
  if (!idPersona) {
    console.warn("[parking] registrarConflicto: id_persona es null, omitiendo evento.");
    return;
  }

  // Resolver FK de tipo_evento
  const { data: tipoEvento } = await supabase
    .from("tipo_evento")
    .select("id_tipo")
    .ilike("nombre_tipo", tipoNombre)
    .maybeSingle();

  // Resolver FK de origen_evento (SISTEMA)
  const { data: origenEvento } = await supabase
    .from("origen_evento")
    .select("id_origen")
    .ilike("nombre", "SISTEMA")
    .maybeSingle();

  await supabase.from("eventos").insert({
    Fecha_Hora:      new Date(),
    Descripcion:     descripcion,
    Id_Plaza:        idPlaza,
    id_persona:      idPersona,
    id_tipo_evento:  tipoEvento?.id_tipo   || null,
    id_origen_evento: origenEvento?.id_origen || null,
    organizacion_id: org_id,
  });
}

async function cerrarRegistroPlaza(plaza) {
  const { data: acceso } = await supabase
    .from("registros_acceso")
    .select("id_registro")
    .eq("Id_Plaza", plaza.id)
    .is("salida_at", null)
    .single();

  if (acceso) {
    await supabase
      .from("registros_acceso")
      .update({ salida_at: new Date() })     // id_tipo_evento se omite (requiere FK de catálogo)
      .eq("id_registro", acceso.id_registro);

    console.log(`🚙 Registro ${acceso.id_registro} cerrado`);
  }
}

export { updatePlazas };
