import supabase from "../../config/supabase.js";

// ─── Tipos de distribución ────────────────────────────────────────────────────
// General  → persona_id IS NULL  → se emite al canal "general" (todos los clientes)
// Personal → persona_id = UUID   → se emite al room "user:<persona_id>"

// ─── Crear y distribuir una notificación ─────────────────────────────────────
/**
 * Crea una notificación en BD y la emite por Socket.IO.
 *
 * @param {object} opts
 * @param {string}      opts.tipo       - Ej: "RESERVA_EXPIRADA", "MANTENIMIENTO", etc.
 * @param {string}      opts.contenido  - Texto de la notificación.
 * @param {string|null} opts.persona_id - UUID del destinatario o null para general.
 * @param {number|null} opts.id_tipo    - FK a tipo_notificacion (opcional).
 * @returns {Promise<object>} Notificación persistida.
 */
export async function createNotification({ tipo, contenido, persona_id = null, id_tipo = null }) {
  if (!tipo)     throw new Error("El campo 'tipo' es requerido");
  if (!contenido) throw new Error("El campo 'contenido' es requerido");

  // 1. Persistir en Base de Datos
  const { data, error } = await supabase
    .from("notificaciones")
    .insert({ Tipo: tipo, Contenido: contenido, Leida: false, persona_id, id_tipo })
    .select()
    .single();

  if (error) throw error;

  // 2. Distribuir en tiempo real vía Socket.IO
  if (global.io) {
    const payload = {
      id:         data.ID_Notificacion,
      tipo:       data.Tipo,
      contenido:  data.Contenido,
      leida:      data.Leida,
      created_at: data.created_at,
      persona_id: data.persona_id,
    };

    if (persona_id) {
      // ── Notificación PERSONAL ────────────────────────────────────────────
      // Se emite al room "user:<persona_id>". El cliente debe haber hecho:
      //   socket.emit("join", persona_id)
      global.io.to(`user:${persona_id}`).emit("notificacion", payload);
    } else {
      // ── Notificación GENERAL (broadcast) ────────────────────────────────
      global.io.emit("notificacion:general", payload);
    }
  }

  return data;
}

// ─── Listar notificaciones para un usuario ────────────────────────────────────
/**
 * Devuelve las notificaciones personales del usuario MÁS las generales.
 */
export async function getNotificationsForUser({
  persona_id,
  page  = 1,
  limit = 20,
  soloNoLeidas = false,
} = {}) {
  if (!persona_id) throw new Error("persona_id es requerido");

  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  // persona_id = UUID del usuario  OU  persona_id IS NULL (generales)
  let query = supabase
    .from("notificaciones")
    .select(
      `ID_Notificacion, created_at, Tipo, Contenido, Leida, persona_id, id_tipo,
       tipo_notificacion:id_tipo ( id_tipo, nombre_tipo )`,
      { count: "exact" }
    )
    .or(`persona_id.eq.${persona_id},persona_id.is.null`)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (soloNoLeidas) {
    query = query.eq("Leida", false);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { data, total: count, page, limit };
}

// ─── Contar no leídas (badge) ─────────────────────────────────────────────────
export async function getUnreadCount(persona_id) {
  if (!persona_id) throw new Error("persona_id es requerido");

  const { count, error } = await supabase
    .from("notificaciones")
    .select("*", { count: "exact", head: true })
    .or(`persona_id.eq.${persona_id},persona_id.is.null`)
    .eq("Leida", false);

  if (error) throw error;
  return count ?? 0;
}

// ─── Marcar una notificación como leída ───────────────────────────────────────
export async function markAsRead(id, persona_id) {
  // Verificar que la notificación pertenece al usuario o es general
  const { data: notif, error: fetchErr } = await supabase
    .from("notificaciones")
    .select("ID_Notificacion, persona_id")
    .eq("ID_Notificacion", id)
    .single();

  if (fetchErr) throw fetchErr;
  if (!notif)   throw new Error("Notificación no encontrada");

  // Validar pertenencia: o es general (null) o es del usuario
  if (notif.persona_id !== null && notif.persona_id !== persona_id) {
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
export async function markAllAsRead(persona_id) {
  if (!persona_id) throw new Error("persona_id es requerido");

  const { error } = await supabase
    .from("notificaciones")
    .update({ Leida: true })
    .or(`persona_id.eq.${persona_id},persona_id.is.null`)
    .eq("Leida", false);

  if (error) throw error;
  return { ok: true };
}

// ─── Eliminar una notificación ────────────────────────────────────────────────
export async function deleteNotification(id, persona_id) {
  const { data: notif, error: fetchErr } = await supabase
    .from("notificaciones")
    .select("ID_Notificacion, persona_id")
    .eq("ID_Notificacion", id)
    .single();

  if (fetchErr) throw fetchErr;
  if (!notif)   throw new Error("Notificación no encontrada");

  if (notif.persona_id !== null && notif.persona_id !== persona_id) {
    throw new Error("No tienes permiso para eliminar esta notificación");
  }

  const { error } = await supabase
    .from("notificaciones")
    .delete()
    .eq("ID_Notificacion", id);

  if (error) throw error;
  return { deleted: true, id };
}
