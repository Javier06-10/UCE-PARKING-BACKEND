import supabase from "../../config/supabase.js";

// ─── Listar notificaciones de una persona ─────────────────────────────────────
export async function getNotificaciones({ idPersona, page = 1, limit = 20, soloNoLeidas = false }) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from("notificacion")
    .select(
      `id_notificacion, contenido, leida, created_at, id_tipo,
       tipo:id_tipo ( nombre )`,
      { count: "exact" }
    )
    .eq("id_persona", idPersona)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (soloNoLeidas) query = query.eq("leida", false);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data ?? [], total: count ?? 0, page, limit };
}

// ─── Conteo de no leídas ──────────────────────────────────────────────────────
export async function getUnreadCount(idPersona) {
  const { count, error } = await supabase
    .from("notificacion")
    .select("id_notificacion", { count: "exact", head: true })
    .eq("id_persona", idPersona)
    .eq("leida", false);

  if (error) throw error;
  return count ?? 0;
}

// ─── Marcar una como leída ────────────────────────────────────────────────────
export async function marcarLeida(idNotificacion, idPersona) {
  const { data, error } = await supabase
    .from("notificacion")
    .update({ leida: true })
    .eq("id_notificacion", idNotificacion)
    .eq("id_persona", idPersona)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Notificacion no encontrada o no pertenece al usuario");
  return data;
}

// ─── Marcar todas como leídas ─────────────────────────────────────────────────
export async function marcarTodasLeidas(idPersona) {
  const { error } = await supabase
    .from("notificacion")
    .update({ leida: true })
    .eq("id_persona", idPersona)
    .eq("leida", false);

  if (error) throw error;
}

// ─── Eliminar una notificación ────────────────────────────────────────────────
export async function eliminarNotificacion(idNotificacion, idPersona) {
  const { error } = await supabase
    .from("notificacion")
    .delete()
    .eq("id_notificacion", idNotificacion)
    .eq("id_persona", idPersona);

  if (error) throw error;
}

// ─── Crear notificación (uso interno / cron) ──────────────────────────────────
export async function crearNotificacion({ idPersona, contenido, idTipo = 3, organizacionId }) {
  const { error } = await supabase
    .from("notificacion")
    .insert({
      id_persona:      idPersona,
      contenido,
      id_tipo:         idTipo,
      leida:           false,
      organizacion_id: organizacionId ?? null
    });

  if (error) throw error;
}
