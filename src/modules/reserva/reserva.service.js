import supabase from "../../config/supabase.js";

// IDs de estado_reserva (deben coincidir con los registros en la BD)
const ESTADO_ACTIVA = 1;
const ESTADO_CANCELADA = 2;
const ESTADO_EXPIRADA = 3;

// ─── Helper: reserva activa en una plaza ──────────────────────────────────────
export async function getReservaActiva(plazaId) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("reserva")
    .select("id_reserva, id_plaza, id_persona, fecha_hora_inicio, fecha_hora_fin")
    .eq("id_plaza", plazaId)
    .eq("id_estado", ESTADO_ACTIVA)
    .lte("fecha_hora_inicio", now)
    .gte("fecha_hora_fin", now)
    .maybeSingle();

  if (error) return null;
  return data;
}

// ─── Crear reserva ────────────────────────────────────────────────────────────
export async function crearReserva(plazaId, userId, start, end) {

  // 1. Resolver id_persona desde usuario.id (auth UUID)
  const { data: usuarioRow, error: userError } = await supabase
    .from("usuario")
    .select("id_persona, organizacion_id")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !usuarioRow) {
    throw new Error("No se encontro el perfil del usuario autenticado.");
  }
  const { id_persona: personaId, organizacion_id } = usuarioRow;

  // 2. Verificar solapamiento (NuevoInicio < FinExistente AND NuevoFin > InicioExistente)
  const { data: overlapping, error: checkError } = await supabase
    .from("reserva")
    .select("id_reserva")
    .eq("id_plaza", plazaId)
    .eq("id_estado", ESTADO_ACTIVA)
    .lt("fecha_hora_inicio", end.toISOString())
    .gt("fecha_hora_fin", start.toISOString());

  if (checkError) {
    throw new Error("Error verificando disponibilidad: " + checkError.message);
  }
  if (overlapping && overlapping.length > 0) {
    throw new Error("La plaza ya esta reservada en ese horario.");
  }

  // 3. Insertar reserva
  const { data, error } = await supabase
    .from("reserva")
    .insert({
      id_plaza: plazaId,
      id_persona: personaId,
      fecha_hora_inicio: start.toISOString(),
      fecha_hora_fin: end.toISOString(),
      id_estado: ESTADO_ACTIVA,
      organizacion_id: organizacion_id || 1
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
    throw new Error("No se encontro el perfil del usuario.");
  }

  const { data, error } = await supabase
    .from("reserva")
    .select(`
      id_reserva, fecha_hora_inicio, fecha_hora_fin, id_estado, created_at, id_plaza,
      estado_reserva ( id_estado, nombre ),
      plaza (
        id_plaza, numero_plaza,
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
    throw new Error("No se encontro el perfil del usuario.");
  }

  const { data, error } = await supabase
    .from("reserva")
    .update({ id_estado: ESTADO_CANCELADA })
    .eq("id_reserva", reservaId)
    .eq("id_persona", usuarioRow.id_persona)
    .eq("id_estado", ESTADO_ACTIVA)
    .select()
    .single();

  if (error) throw new Error("Error al cancelar la reserva: " + error.message);
  if (!data) throw new Error("Reserva no encontrada, ya cancelada o no pertenece al usuario.");
  return data;
}
