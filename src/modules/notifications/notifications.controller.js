import {
  createNotification,
  getNotificationsForUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "./notifications.service.js";

// ─── GET /api/notifications ───────────────────────────────────────────────────
export async function listNotifications(req, res) {
  try {
    const persona_id = req.user?.id;
    if (!persona_id) return res.status(401).json({ ok: false, error: "No autenticado" });

    const { page = 1, limit = 20, soloNoLeidas } = req.query;

    const result = await getNotificationsForUser({
      persona_id,
      page:         Number(page),
      limit:        Number(limit),
      soloNoLeidas: soloNoLeidas === "true",
    });

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[notifications] listNotifications:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── GET /api/notifications/unread-count ─────────────────────────────────────
export async function unreadCount(req, res) {
  try {
    const persona_id = req.user?.id;
    if (!persona_id) return res.status(401).json({ ok: false, error: "No autenticado" });

    const count = await getUnreadCount(persona_id);
    res.json({ ok: true, count });
  } catch (err) {
    console.error("[notifications] unreadCount:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── PATCH /api/notifications/read-all ───────────────────────────────────────
export async function readAll(req, res) {
  try {
    const persona_id = req.user?.id;
    if (!persona_id) return res.status(401).json({ ok: false, error: "No autenticado" });

    await markAllAsRead(persona_id);
    res.json({ ok: true, message: "Todas las notificaciones marcadas como leídas" });
  } catch (err) {
    console.error("[notifications] readAll:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── PATCH /api/notifications/:id/read ───────────────────────────────────────
export async function readOne(req, res) {
  try {
    const persona_id = req.user?.id;
    if (!persona_id) return res.status(401).json({ ok: false, error: "No autenticado" });

    const data = await markAsRead(req.params.id, persona_id);
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[notifications] readOne:", err.message);
    const status = err.message.includes("permiso") ? 403 : 500;
    res.status(status).json({ ok: false, error: err.message });
  }
}

// ─── POST /api/notifications (crear notificación manual — admin) ──────────────
export async function create(req, res) {
  try {
    const { tipo, contenido, persona_id, id_tipo } = req.body;
    const data = await createNotification({ tipo, contenido, persona_id, id_tipo });
    res.status(201).json({ ok: true, data });
  } catch (err) {
    console.error("[notifications] create:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
}

// ─── DELETE /api/notifications/:id ───────────────────────────────────────────
export async function remove(req, res) {
  try {
    const persona_id = req.user?.id;
    if (!persona_id) return res.status(401).json({ ok: false, error: "No autenticado" });

    const result = await deleteNotification(req.params.id, persona_id);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[notifications] remove:", err.message);
    const status = err.message.includes("permiso") ? 403 : 500;
    res.status(status).json({ ok: false, error: err.message });
  }
}
