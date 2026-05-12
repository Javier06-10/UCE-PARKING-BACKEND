// src/modules/pantalla/pantalla.routes.js
import express from "express";
import supabase from "../../config/supabase.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();
router.use(verifyToken);

// ─── Helper: contexto de organización del usuario ────────────────────────────
async function getOrgId(userId) {
  const { data } = await supabase
    .from("usuario")
    .select("organizacion_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.organizacion_id ?? null;
}

// ─── SELECT reutilizable ──────────────────────────────────────────────────────
const PANTALLA_SELECT = `
  id_pantalla,
  capacidad_total,
  organizacion_id,
  id_zona,
  id_plaza,
  zona ( id_zona, nombre ),
  plaza ( id_plaza, numero_plaza, id_zona )
`;

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pantalla
// Lista todas las pantallas de la organización
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const orgId = await getOrgId(req.user.id);
    if (!orgId) return res.status(403).json({ ok: false, error: "Organización no encontrada" });

    const { data, error } = await supabase
      .from("pantalla")
      .select(PANTALLA_SELECT)
      .eq("organizacion_id", orgId)
      .order("id_pantalla");

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[pantalla] GET /:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pantalla/:id
// Obtener una pantalla por ID
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const orgId = await getOrgId(req.user.id);
    if (!orgId) return res.status(403).json({ ok: false, error: "Organización no encontrada" });

    const { data, error } = await supabase
      .from("pantalla")
      .select(PANTALLA_SELECT)
      .eq("id_pantalla", req.params.id)
      .eq("organizacion_id", orgId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ ok: false, error: "Pantalla no encontrada" });

    res.json({ ok: true, data });
  } catch (err) {
    console.error("[pantalla] GET /:id:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pantalla
// Crear pantalla — requiere capacidad_total y AL MENOS id_plaza O id_zona
// Body: { capacidad_total, id_plaza?, id_zona? }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const orgId = await getOrgId(req.user.id);
    if (!orgId) return res.status(403).json({ ok: false, error: "Organización no encontrada" });

    const { capacidad_total, id_plaza, id_zona } = req.body;

    if (!capacidad_total || Number(capacidad_total) <= 0) {
      return res.status(400).json({ ok: false, error: "capacidad_total es requerido y debe ser mayor a 0" });
    }
    if (!id_plaza && !id_zona) {
      return res.status(400).json({ ok: false, error: "Debes indicar al menos una plaza (id_plaza) o una zona (id_zona)" });
    }

    const insertPayload = {
      capacidad_total: Number(capacidad_total),
      organizacion_id: orgId,
      id_plaza: null,
      id_zona:  null
    };

    // ── Modo Plaza ──────────────────────────────────────────────────────────
    if (id_plaza) {
      const { data: plaza, error: plazaErr } = await supabase
        .from("plaza")
        .select("id_plaza, id_zona")
        .eq("id_plaza", id_plaza)
        .eq("organizacion_id", orgId)
        .maybeSingle();

      if (plazaErr) throw plazaErr;
      if (!plaza) return res.status(404).json({ ok: false, error: "Plaza no encontrada en esta organización" });

      insertPayload.id_plaza = plaza.id_plaza;
      // La zona se hereda de la plaza si no viene explícita
      insertPayload.id_zona = id_zona ? Number(id_zona) : (plaza.id_zona ?? null);
    }

    // ── Modo Zona (sin plaza específica) ────────────────────────────────────
    if (!id_plaza && id_zona) {
      const { data: zona, error: zonaErr } = await supabase
        .from("zona")
        .select("id_zona")
        .eq("id_zona", id_zona)
        .eq("organizacion_id", orgId)
        .maybeSingle();

      if (zonaErr) throw zonaErr;
      if (!zona) return res.status(404).json({ ok: false, error: "Zona no encontrada en esta organización" });

      insertPayload.id_zona = zona.id_zona;
      // id_plaza queda null
    }

    const { data, error } = await supabase
      .from("pantalla")
      .insert(insertPayload)
      .select(PANTALLA_SELECT)
      .single();

    if (error) throw error;
    res.status(201).json({ ok: true, data });
  } catch (err) {
    console.error("[pantalla] POST /:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/pantalla/:id
// Actualizar — permite cambiar asignación a plaza, zona, o ambas
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const orgId = await getOrgId(req.user.id);
    if (!orgId) return res.status(403).json({ ok: false, error: "Organización no encontrada" });

    const { data: existing } = await supabase
      .from("pantalla")
      .select("id_pantalla")
      .eq("id_pantalla", req.params.id)
      .eq("organizacion_id", orgId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ ok: false, error: "Pantalla no encontrada" });

    const { capacidad_total, id_plaza, id_zona } = req.body;
    const updates = {};

    if (capacidad_total !== undefined) {
      if (Number(capacidad_total) <= 0) {
        return res.status(400).json({ ok: false, error: "capacidad_total debe ser mayor a 0" });
      }
      updates.capacidad_total = Number(capacidad_total);
    }

    // ── Cambio a Plaza ──────────────────────────────────────────────────────
    if (id_plaza !== undefined) {
      if (id_plaza === null || id_plaza === "") {
        // Limpiar plaza — solo válido si se envía id_zona
        updates.id_plaza = null;
      } else {
        const { data: plaza } = await supabase
          .from("plaza")
          .select("id_plaza, id_zona")
          .eq("id_plaza", id_plaza)
          .eq("organizacion_id", orgId)
          .maybeSingle();
        if (!plaza) return res.status(404).json({ ok: false, error: "Plaza no encontrada en esta organización" });
        updates.id_plaza = plaza.id_plaza;
        // Zona se hereda de la plaza si no se especifica explícitamente
        if (id_zona === undefined) updates.id_zona = plaza.id_zona;
      }
    }

    // ── Cambio a Zona ───────────────────────────────────────────────────────
    if (id_zona !== undefined) {
      if (id_zona === null || id_zona === "") {
        updates.id_zona = null;
      } else {
        const { data: zona } = await supabase
          .from("zona")
          .select("id_zona")
          .eq("id_zona", id_zona)
          .eq("organizacion_id", orgId)
          .maybeSingle();
        if (!zona) return res.status(404).json({ ok: false, error: "Zona no encontrada en esta organización" });
        updates.id_zona = zona.id_zona;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: "No se enviaron campos para actualizar" });
    }

    const { data, error } = await supabase
      .from("pantalla")
      .update(updates)
      .eq("id_pantalla", req.params.id)
      .eq("organizacion_id", orgId)
      .select(PANTALLA_SELECT)
      .single();

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[pantalla] PUT /:id:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/pantalla/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const orgId = await getOrgId(req.user.id);
    if (!orgId) return res.status(403).json({ ok: false, error: "Organización no encontrada" });

    const { data: existing } = await supabase
      .from("pantalla")
      .select("id_pantalla")
      .eq("id_pantalla", req.params.id)
      .eq("organizacion_id", orgId)
      .maybeSingle();

    if (!existing) return res.status(404).json({ ok: false, error: "Pantalla no encontrada" });

    const { error } = await supabase
      .from("pantalla")
      .delete()
      .eq("id_pantalla", req.params.id)
      .eq("organizacion_id", orgId);

    if (error) throw error;
    res.json({ ok: true, message: "Pantalla eliminada correctamente" });
  } catch (err) {
    console.error("[pantalla] DELETE /:id:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
