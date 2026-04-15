import supabase from "../../config/supabase.js";

// ─── Helper: id de estado para reservas (tabla global con contexto) ───────────
async function getEstadoReservaId(nombre) {
  const { data } = await supabase
    .from("estado_reserva")
    .select("id_estado")
    .ilike("nombre", nombre)
    .maybeSingle();
  if (!data) throw new Error(`Estado de reserva '${nombre}' no encontrado en el catálogo`);
  return data.id_estado;
}

// ─── Helper: reserva activa en una plaza ──────────────────────────────────────
export async function getReservaActiva(plazaId) {
  const ID_ACTIVA = await getEstadoReservaId("Activa");

  const { data, error } = await supabase
    .from("reserva")
    .select("*")
    .eq("id_plaza", plazaId)
    .eq("id_estado", ID_ACTIVA)
    .lte("fecha_hora_inicio", new Date().toISOString())
    .gte("fecha_hora_fin", new Date().toISOString())
    .maybeSingle();

  if (error) return null;
  return data;
}

// ─── Crear reserva ────────────────────────────────────────────────────────────
export async function crearReserva(plazaId, userId, start, end, organizacion_id) {
  if (!organizacion_id) throw new Error("organizacion_id es requerido para crear una reserva");

  const { data: usuarioRow, error: userError } = await supabase
    .from("usuario")
    .select("id_persona")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !usuarioRow) {
    throw new Error("No se encontró el perfil del usuario autenticado.");
  }
  const personaId = usuarioRow.id_persona;

  const ID_ACTIVA = await getEstadoReservaId("Activa");

  const { data: overlapping, error: checkError } = await supabase
    .from("reserva")
    .select("id_reserva")
    .eq("id_plaza", plazaId)
    .eq("id_estado", ID_ACTIVA)
    .lt("fecha_hora_inicio", end.toISOString())
    .gt("fecha_hora_fin", start.toISOString());

  if (checkError) {
    throw new Error("Error verificando disponibilidad de la plaza: " + checkError.message);
  }
  if (overlapping && overlapping.length > 0) {
    throw new Error("La plaza ya está reservada en ese horario.");
  }

  const { data, error } = await supabase
    .from("reserva")
    .insert({
      id_plaza:          plazaId,
      id_persona:        personaId,
      fecha_hora_inicio: start.toISOString(),
      fecha_hora_fin:    end.toISOString(),
      id_estado:         ID_ACTIVA,
      organizacion_id,
    })
    .select()
    .single();

  if (error) throw new Error("Error al crear la reserva: " + error.message);
  return data;
}

// ─── Listar reservas del usuario ──────────────────────────────────────────────
export async function listarReservasUser(userId) {
  const { data: usuarioRow, error: userError } = await supabase
    .from("usuario")
    .select("id_persona")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !usuarioRow) {
    throw new Error("No se encontró el perfil del usuario.");
  }

  const { data, error } = await supabase
    .from("reserva")
    .select(`
      id_reserva,
      fecha_hora_inicio,
      fecha_hora_fin,
      id_estado,
      created_at,
      id_plaza,
      estado:id_estado ( id_estado, nombre ),
      plaza (
        id_plaza,
        numero_plaza,
        zona ( id_zona, nombre )
      )
    `)
    .eq("id_persona", usuarioRow.id_persona)
    .order("fecha_hora_inicio", { ascending: false });

  if (error) throw new Error("Error al listar reservas: " + error.message);
  return data || [];
}

// ─── Cancelar reserva ─────────────────────────────────────────────────────────
export async function cancelarReserva(reservaId, userId) {
  const { data: usuarioRow, error: userError } = await supabase
    .from("usuario")
    .select("id_persona")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !usuarioRow) {
    throw new Error("No se encontró el perfil del usuario.");
  }

  const ID_ACTIVA    = await getEstadoReservaId("Activa");
  const ID_CANCELADA = await getEstadoReservaId("Cancelada");

  const { data, error } = await supabase
    .from("reserva")
    .update({ id_estado: ID_CANCELADA })
    .eq("id_reserva", reservaId)
    .eq("id_persona", usuarioRow.id_persona)
    .eq("id_estado", ID_ACTIVA)
    .select()
    .single();

  if (error) throw new Error("Error al cancelar la reserva: " + error.message);
  if (!data)  throw new Error("Reserva no encontrada, ya cancelada o no pertenece al usuario.");
  return data;
}