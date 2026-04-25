// src/modules/notifications/notifications.routes.js
import express from "express";
import supabase from "../../config/supabase.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();
router.use(verifyToken);

// ─── Helper: resolver id_persona y organizacion_id desde auth uid ─────────────
async function getUserInfo(userId) {
  const { data } = await supabase
    .from("usuario")
    .select("id_persona, organizacion_id")
    .eq("id", userId)
    .maybeSingle();
  return {
    personaId:  data?.id_persona     ?? null,
    orgId:      data?.organizacion_id ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications
// Lista notificaciones del usuario:
//   • Personales:  id_persona = personaId
//   • Generales:   id_persona IS NULL AND organizacion_id = orgId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, solo_no_leidas } = req.query;
    const from = (Number(page) - 1) * Number(limit);
    const to   = from + Number(limit) - 1;

    const { personaId, orgId } = await getUserInfo(req.user.id);
    if (!personaId) {
      return res.status(404).json({ ok: false, error: "Perfil no encontrado" });
    }

    // ✅ FIX: OR para incluir notificaciones generales (id_persona IS NULL)
    let query = supabase
      .from("notificacion")
      .select(`
        id_notificacion, contenido, leida, created_at,
        id_persona, organizacion_id, id_tipo,
        tipo_notificacion ( nombre )
      `, { count: "exact" })
      .or(`id_persona.eq.${personaId},and(id_persona.is.null,organizacion_id.eq.${orgId})`)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (solo_no_leidas === "true") {
      query = query.eq("leida", false);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    // Normalizar: añadir campo 'tipo_resuelto' para la app
    const normalized = (data || []).map(n => ({
      ...n,
      tipo_resuelto: n.tipo_notificacion?.nombre ?? _resolveTipoById(n.id_tipo),
    }));

    res.json({
      ok: true,
      data:  normalized,
      total: count ?? 0,
      page:  Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error("[notifications] list:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/notifications/unread-count
// Cuenta notificaciones no leídas (personales + generales de la org)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/unread-count", async (req, res) => {
  try {
    const { personaId, orgId } = await getUserInfo(req.user.id);
    if (!personaId) {
      return res.status(404).json({ ok: false, error: "Perfil no encontrado" });
    }

    // ✅ FIX: contar también las generales no leídas
    const { count, error } = await supabase
      .from("notificacion")
      .select("id_notificacion", { count: "exact", head: true })
      .or(`id_persona.eq.${personaId},and(id_persona.is.null,organizacion_id.eq.${orgId})`)
      .eq("leida", false);

    if (error) throw error;
    res.json({ ok: true, unread: count ?? 0 });
  } catch (err) {
    console.error("[notifications] unread-count:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/notifications/:id/read
// Marcar una notificación como leída
// Funciona tanto para personales como generales (la RLS lo controla)
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/read", async (req, res) => {
  try {
    const { personaId, orgId } = await getUserInfo(req.user.id);
    if (!personaId) {
      return res.status(404).json({ ok: false, error: "Perfil no encontrado" });
    }

    // Intentar marcar la notificación usando service_role
    // (la RLS del UPDATE ya controla que solo vea las suyas)
    const { data, error } = await supabase
      .from("notificacion")
      .update({ leida: true })
      .eq("id_notificacion", req.params.id)
      // ✅ Permite marcar leída tanto personales como generales de la org
      .or(`id_persona.eq.${personaId},and(id_persona.is.null,organizacion_id.eq.${orgId})`)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ ok: false, error: "Notificación no encontrada" });
    }
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[notifications] mark-read:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/notifications/read-all
// Marcar TODAS las notificaciones como leídas (personales + generales)
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/read-all", async (req, res) => {
  try {
    const { personaId, orgId } = await getUserInfo(req.user.id);
    if (!personaId) {
      return res.status(404).json({ ok: false, error: "Perfil no encontrado" });
    }

    // ✅ Marcar leídas tanto personales como generales de la org
    const { error } = await supabase
      .from("notificacion")
      .update({ leida: true })
      .or(`id_persona.eq.${personaId},and(id_persona.is.null,organizacion_id.eq.${orgId})`)
      .eq("leida", false);

    if (error) throw error;
    res.json({ ok: true, message: "Todas las notificaciones marcadas como leídas" });
  } catch (err) {
    console.error("[notifications] read-all:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/notifications/:id
// Eliminar una notificación personal (las generales no se eliminan)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const { personaId } = await getUserInfo(req.user.id);
    if (!personaId) {
      return res.status(404).json({ ok: false, error: "Perfil no encontrado" });
    }

    // Solo eliminar notificaciones personales (no las generales)
    const { error } = await supabase
      .from("notificacion")
      .delete()
      .eq("id_notificacion", req.params.id)
      .eq("id_persona", personaId);  // solo las suyas

    if (error) throw error;
    res.json({ ok: true, message: "Notificación eliminada" });
  } catch (err) {
    console.error("[notifications] delete:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Mapa local de tipos (fallback si el join falla) ─────────────────────────
function _resolveTipoById(idTipo) {
  const mapa = {
    1: "Alerta", 2: "Recordatorio", 3: "Confirmacion",
    4: "Sistema", 5: "Error",       6: "Advertencia",
  };
  return mapa[idTipo] ?? "Aviso";
}

export default router;