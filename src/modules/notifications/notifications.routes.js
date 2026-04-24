// src/modules/notifications/notifications.routes.js
import express from "express";
import supabase from "../../config/supabase.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();
router.use(verifyToken);

// Helper: resolver id_persona desde auth uid
async function getPersonaId(userId) {
  const { data } = await supabase
    .from("usuario")
    .select("id_persona")
    .eq("id", userId)
    .maybeSingle();
  return data?.id_persona ?? null;
}

// ─────────────────────────────────────────────────────────────
// GET /api/notifications
// Lista notificaciones del usuario con paginación
// ─────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, solo_no_leidas } = req.query;
    const from = (page - 1) * limit;
    const to   = from + Number(limit) - 1;

    const personaId = await getPersonaId(req.user.id);
    if (!personaId) return res.status(404).json({ ok: false, error: "Perfil no encontrado" });

    let query = supabase
      .from("notificacion")
      .select(`
        id_notificacion, contenido, leida, created_at,
        tipo_notificacion ( nombre )
      `, { count: "exact" })
      .eq("id_persona", personaId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (solo_no_leidas === "true") query = query.eq("leida", false);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ ok: true, data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[notifications] list:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/notifications/unread-count
// Número de notificaciones sin leer
// ─────────────────────────────────────────────────────────────
router.get("/unread-count", async (req, res) => {
  try {
    const personaId = await getPersonaId(req.user.id);
    if (!personaId) return res.status(404).json({ ok: false, error: "Perfil no encontrado" });

    const { count, error } = await supabase
      .from("notificacion")
      .select("id_notificacion", { count: "exact", head: true })
      .eq("id_persona", personaId)
      .eq("leida", false);

    if (error) throw error;
    res.json({ ok: true, unread: count ?? 0 });
  } catch (err) {
    console.error("[notifications] unread-count:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/notifications/:id/read
// Marcar una notificación como leída
// ─────────────────────────────────────────────────────────────
router.patch("/:id/read", async (req, res) => {
  try {
    const personaId = await getPersonaId(req.user.id);
    if (!personaId) return res.status(404).json({ ok: false, error: "Perfil no encontrado" });

    const { data, error } = await supabase
      .from("notificacion")
      .update({ leida: true })
      .eq("id_notificacion", req.params.id)
      .eq("id_persona", personaId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, error: "Notificación no encontrada" });

    res.json({ ok: true, data });
  } catch (err) {
    console.error("[notifications] mark-read:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/notifications/read-all
// Marcar todas las notificaciones como leídas
// ─────────────────────────────────────────────────────────────
router.patch("/read-all", async (req, res) => {
  try {
    const personaId = await getPersonaId(req.user.id);
    if (!personaId) return res.status(404).json({ ok: false, error: "Perfil no encontrado" });

    const { error } = await supabase
      .from("notificacion")
      .update({ leida: true })
      .eq("id_persona", personaId)
      .eq("leida", false);

    if (error) throw error;
    res.json({ ok: true, message: "Todas las notificaciones marcadas como leídas" });
  } catch (err) {
    console.error("[notifications] read-all:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/notifications/:id
// Eliminar una notificación
// ─────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const personaId = await getPersonaId(req.user.id);
    if (!personaId) return res.status(404).json({ ok: false, error: "Perfil no encontrado" });

    const { error } = await supabase
      .from("notificacion")
      .delete()
      .eq("id_notificacion", req.params.id)
      .eq("id_persona", personaId);

    if (error) throw error;
    res.json({ ok: true, message: "Notificación eliminada" });
  } catch (err) {
    console.error("[notifications] delete:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;