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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pantalla
// Lista todas las pantallas de la organización con detalle de plaza y zona
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const orgId = await getOrgId(req.user.id);
    if (!orgId) return res.status(403).json({ ok: false, error: "Organización no encontrada" });

    const { data, error } = await supabase
      .from("pantalla")
      .select(`
        id_pantalla,
        capacidad_total,
        organizacion_id,
        id_zona,
        id_plaza,
        zona ( id_zona, nombre ),
        plaza ( id_plaza, numero_plaza, id_zona )
      `)
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
// Obtener una pantalla por ID (debe pertenecer a la org)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const orgId = await getOrgId(req.user.id);
    if (!orgId) return res.status(403).json({ ok: false, error: "Organización no encontrada" });

    const { data, error } = await supabase
      .from("pantalla")
      .select(`
        id_pantalla,
        capacidad_total,
        organizacion_id,
        id_zona,
        id_plaza,
        zona ( id_zona, nombre ),
        plaza ( id_plaza, numero_plaza, id_zona )
      `)
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
// Crear una nueva pantalla — id_plaza REQUERIDO
// Body: { capacidad_total, id_plaza, id_zona? }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const orgId = await getOrgId(req.user.id);
    if (!orgId) return res.status(403).json({ ok: false, error: "Organización no encontrada" });

    const { capacidad_total, id_plaza, id_zona } = req.body;

    if (!capacidad_total || capacidad_total <= 0) {
      return res.status(400).json({ ok: false, error: "capacidad_total es requerido y debe ser mayor a 0" });
    }
    if (!id_plaza) {
      return res.status(400).json({ ok: false, error: "id_plaza es requerido" });
    }

    // Validar que la plaza pertenece a la organización
    const { data: plaza, error: plazaErr } = await supabase
      .from("plaza")
      .select("id_plaza, id_zona")
      .eq("id_plaza", id_plaza)
      .eq("organizacion_id", orgId)
      .maybeSingle();

    if (plazaErr) throw plazaErr;
    if (!plaza) return res.status(404).json({ ok: false, error: "Plaza no encontrada en esta organización" });

    const { data, error } = await supabase
      .from("pantalla")
      .insert({
        capacidad_total,
        id_plaza,
        id_zona: id_zona ?? plaza.id_zona ?? null,
        organizacion_id: orgId
      })
      .select()
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
// Actualizar pantalla — puede cambiar capacidad_total, id_plaza, id_zona
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const orgId = await getOrgId(req.user.id);
    if (!orgId) return res.status(403).json({ ok: false, error: "Organización no encontrada" });

    // Verificar existencia
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
      if (capacidad_total <= 0) return res.status(400).json({ ok: false, error: "capacidad_total debe ser mayor a 0" });
      updates.capacidad_total = capacidad_total;
    }

    if (id_plaza !== undefined) {
      // Validar plaza
      const { data: plaza } = await supabase
        .from("plaza")
        .select("id_plaza, id_zona")
        .eq("id_plaza", id_plaza)
        .eq("organizacion_id", orgId)
        .maybeSingle();
      if (!plaza) return res.status(404).json({ ok: false, error: "Plaza no encontrada en esta organización" });
      updates.id_plaza = id_plaza;
      // Actualizar zona de la plaza si no se especificó
      if (id_zona === undefined) updates.id_zona = plaza.id_zona;
    }

    if (id_zona !== undefined) updates.id_zona = id_zona;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ ok: false, error: "No se enviaron campos para actualizar" });
    }

    const { data, error } = await supabase
      .from("pantalla")
      .update(updates)
      .eq("id_pantalla", req.params.id)
      .eq("organizacion_id", orgId)
      .select()
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
// Eliminar una pantalla
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
