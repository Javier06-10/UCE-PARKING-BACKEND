import supabase from "../../config/supabase.js";

// ─── Resolver id_persona desde auth uid ───────────────────────────────────────
// El middleware verifyToken inyecta req.user = { id: auth_uid, ... }
// Este helper convierte ese id al id_persona de public.usuario
async function resolvePersonaId(userId) {
  const { data, error } = await supabase
    .from("usuario")          // tabla normalizada (singular)
    .select("id_persona")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("id_persona es requerido");
  }

  return data.id_persona;
}

// ─── Listar notificaciones del usuario ────────────────────────────────────────
// Devuelve las notificaciones del usuario (id_persona) + las generales (id_persona IS NULL)
// Query params: page, limit, soloNoLeidas
export async function listNotifications({ userId, page = 1, limit = 20, soloNoLeidas = false }) {
  const personaId = await resolvePersonaId(userId);

  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from("notificacion")
    .select(
      `id_notificacion, contenido, leida, created_at, id_persona, id_tipo, organizacion_id,
       tipo:id_tipo ( id_tipo, nombre )`,
      { count: "exact" }
    )
    .or(`id_persona.eq.${personaId},id_persona.is.null`)  // personales + generales
    .order("created_at", { ascending: false })
    .range(from, to);

  if (soloNoLeidas) {
    query = query.eq("leida", false);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { data: data || [], total: count || 0, page, limit };
}

// ─── Contar no leídas ─────────────────────────────────────────────────────────
export async function countUnread(userId) {
  const personaId = await resolvePersonaId(userId);

  const { count, error } = await supabase
    .from("notificacion")
    .select("id_notificacion", { count: "exact", head: true })
    .or(`id_persona.eq.${personaId},id_persona.is.null`)
    .eq("leida", false);

  if (error) throw error;
  return count || 0;
}

// ─── Marcar una como leída ────────────────────────────────────────────────────
export async function markOneAsRead(notifId, userId) {
  const personaId = await resolvePersonaId(userId);

  // Verificar que pertenece al usuario o es general
  const { data: notif, error: fetchError } = await supabase
    .from("notificacion")
    .select("id_notificacion, id_persona")
    .eq("id_notificacion", notifId)
    .maybeSingle();

  if (fetchError || !notif) throw new Error("Notificación no encontrada");

  if (notif.id_persona !== null && notif.id_persona !== personaId) {
    throw new Error("No tienes permiso para marcar esta notificación");
  }

  const { data, error } = await supabase
    .from("notificacion")
    .update({ leida: true })
    .eq("id_notificacion", notifId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Marcar todas como leídas ─────────────────────────────────────────────────
export async function markAllAsRead(userId) {
  const personaId = await resolvePersonaId(userId);

  const { error } = await supabase
    .from("notificacion")
    .update({ leida: true })
    .or(`id_persona.eq.${personaId},id_persona.is.null`)
    .eq("leida", false);

  if (error) throw error;
  return { ok: true };
}

// ─── Crear notificación (uso interno/admin) ───────────────────────────────────
export async function createNotification({ contenido, id_persona, id_tipo, organizacion_id }) {
  if (!contenido) throw new Error("contenido es requerido");

  const { data, error } = await supabase
    .from("notificacion")
    .insert({
      contenido,
      id_persona:      id_persona      || null,
      id_tipo:         id_tipo         || null,
      organizacion_id: organizacion_id || null,
      leida: false
    })
    .select()
    .single();

  if (error) throw error;

  // Emitir por Socket.IO en tiempo real
  if (global.io) {
    if (id_persona) {
      // Notificación personal → sala del usuario
      global.io.to(`user:${id_persona}`).emit("notificacion", data);
    } else {
      // Notificación general → todos
      global.io.emit("notificacion:general", data);
    }
  }

  return data;
}

// ─── Eliminar notificación ────────────────────────────────────────────────────
export async function deleteNotification(notifId, userId) {
  const personaId = await resolvePersonaId(userId);

  // Verificar propiedad
  const { data: notif, error: fetchError } = await supabase
    .from("notificacion")
    .select("id_notificacion, id_persona")
    .eq("id_notificacion", notifId)
    .maybeSingle();

  if (fetchError || !notif) throw new Error("Notificación no encontrada");

  if (notif.id_persona !== null && notif.id_persona !== personaId) {
    throw new Error("No tienes permiso para eliminar esta notificación");
  }

  const { error } = await supabase
    .from("notificacion")
    .delete()
    .eq("id_notificacion", notifId);

  if (error) throw error;
  return { deleted: true, id: notifId };
}