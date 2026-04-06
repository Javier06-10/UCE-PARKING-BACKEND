import supabase from "../../config/supabase.js";

// ─── Tipos de distribución ────────────────────────────────────────────────────
// General  → id_persona IS NULL  → se emite al canal "general" (todos los clientes)
// Personal → id_persona = UUID   → se emite al room "user:<id_persona>"

/**
 * Crea una notificación en BD y la emite por Socket.IO.
 *
 * @param {object} opts
 * @param {string}      opts.contenido       - Texto de la notificación.
 * @param {string|null} opts.id_persona      - UUID del destinatario o null para general.
 * @param {number|null} opts.id_tipo         - FK a tipo_notificacion (opcional).
 * @param {number|null} opts.organizacion_id - FK org (requerido por RLS con service_role).
 * @returns {Promise<object>} Notificación persistida.
 */
export async function createNotification({ contenido, id_persona = null, id_tipo = null, organizacion_id = null }) {
  if (!contenido) throw new Error("El campo 'contenido' es requerido");

  // 1. Persistir en BD
  // Nota: la tabla notificaciones NO tiene columna 'Tipo' — sólo usa id_tipo FK
  const { data, error } = await supabase
    .from("notificaciones")
    .insert({ Contenido: contenido, Leida: false, id_persona, id_tipo, organizacion_id })
    .select()
    .single();

  if (error) throw error;

  // 2. Distribuir en tiempo real vía Socket.IO
  if (global.io) {
    const payload = {
      id:         data.ID_Notificacion,
      contenido:  data.Contenido,
      leida:      data.Leida,
      created_at: data.created_at,
      id_persona: data.id_persona,
    };

    if (id_persona) {
      global.io.to(`user:${id_persona}`).emit("notificacion", payload);
    } else {
      global.io.emit("notificacion:general", payload);
    }
  }

  return data;
}

// ─── Listar notificaciones para un usuario ────────────────────────────────────
export async function getNotificationsForUser({
  id_persona,
  page  = 1,
  limit = 20,
  soloNoLeidas = false,
} = {}) {
  if (!id_persona) throw new Error("id_persona es requerido");

  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from("notificaciones")
    .select(
      `ID_Notificacion, created_at, Contenido, Leida, id_persona, id_tipo,
       tipo_notificacion:id_tipo ( id_tipo, nombre_tipo )`,
      { count: "exact" }
    )
    .or(`id_persona.eq.${id_persona},id_persona.is.null`)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (soloNoLeidas) query = query.eq("Leida", false);

  const { data, error, count } = await query;
  if (error) throw error;

  return { data, total: count, page, limit };
}

// ─── Contar no leídas (badge) ─────────────────────────────────────────────────
export async function getUnreadCount(id_persona) {
  if (!id_persona) throw new Error("id_persona es requerido");

  const { count, error } = await supabase
    .from("notificaciones")
    .select("*", { count: "exact", head: true })
    .or(`id_persona.eq.${id_persona},id_persona.is.null`)
    .eq("Leida", false);

  if (error) throw error;
  return count ?? 0;
}

// ─── Marcar una notificación como leída ───────────────────────────────────────
export async function markAsRead(id, id_persona) {
  const { data: notif, error: fetchErr } = await supabase
    .from("notificaciones")
    .select("ID_Notificacion, id_persona")
    .eq("ID_Notificacion", id)
    .single();

  if (fetchErr) throw fetchErr;
  if (!notif)   throw new Error("Notificación no encontrada");

  if (notif.id_persona !== null && notif.id_persona !== id_persona) {
    throw new Error("No tienes permiso para marcar esta notificación");
  }

  const { data, error } = await supabase
    .from("notificaciones")
    .update({ Leida: true })
    .eq("ID_Notificacion", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Marcar todas como leídas ─────────────────────────────────────────────────
export async function markAllAsRead(id_persona) {
  if (!id_persona) throw new Error("id_persona es requerido");

  const { error } = await supabase
    .from("notificaciones")
    .update({ Leida: true })
    .or(`id_persona.eq.${id_persona},id_persona.is.null`)
    .eq("Leida", false);

  if (error) throw error;
  return { ok: true };
}

// ─── Eliminar una notificación ────────────────────────────────────────────────
export async function deleteNotification(id, id_persona) {
  const { data: notif, error: fetchErr } = await supabase
    .from("notificaciones")
    .select("ID_Notificacion, id_persona")
    .eq("ID_Notificacion", id)
    .single();

  if (fetchErr) throw fetchErr;
  if (!notif)   throw new Error("Notificación no encontrada");

  if (notif.id_persona !== null && notif.id_persona !== id_persona) {
    throw new Error("No tienes permiso para eliminar esta notificación");
  }

  const { error } = await supabase
    .from("notificaciones")
    .delete()
    .eq("ID_Notificacion", id);

  if (error) throw error;
  return { deleted: true, id };
}
