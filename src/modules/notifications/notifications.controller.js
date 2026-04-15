import {
  listNotifications,
  countUnread,
  markOneAsRead,
  markAllAsRead,
  createNotification,
  deleteNotification
} from "./notifications.service.js";

// GET /api/notifications?page=1&limit=20&soloNoLeidas=true
export async function listHandler(req, res) {
  try {
    const { page = 1, limit = 20, soloNoLeidas } = req.query;
    const userId = req.user.id;

    const result = await listNotifications({
      userId,
      page:         Number(page),
      limit:        Number(limit),
      soloNoLeidas: soloNoLeidas === "true"
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[notifications] listNotifications:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// GET /api/notifications/unread-count
export async function unreadCountHandler(req, res) {
  try {
    const count = await countUnread(req.user.id);
    res.json({ ok: true, count });
  } catch (error) {
    console.error("[notifications] unreadCount:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// PATCH /api/notifications/:id/read
export async function markOneReadHandler(req, res) {
  try {
    const data = await markOneAsRead(Number(req.params.id), req.user.id);
    res.json({ ok: true, data });
  } catch (error) {
    console.error("[notifications] markOneRead:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// PATCH /api/notifications/read-all
export async function markAllReadHandler(req, res) {
  try {
    await markAllAsRead(req.user.id);
    res.json({ ok: true, message: "Todas las notificaciones marcadas como leídas" });
  } catch (error) {
    console.error("[notifications] markAllRead:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// POST /api/notifications
export async function createHandler(req, res) {
  try {
    const { contenido, id_persona, id_tipo, organizacion_id } = req.body;
    const data = await createNotification({ contenido, id_persona, id_tipo, organizacion_id });
    res.status(201).json({ ok: true, data });
  } catch (error) {
    console.error("[notifications] create:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// DELETE /api/notifications/:id
export async function deleteHandler(req, res) {
  try {
    const result = await deleteNotification(Number(req.params.id), req.user.id);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[notifications] delete:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}