// src/modules/catalogos/catalogos.routes.js
import express from "express";
import supabase from "../../config/supabase.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();
router.use(verifyToken);

// ─── Helper: nivel de privilegio del usuario ──────────────────────────────────
async function getUserContext(userId) {
  const { data: usuario } = await supabase
    .from("usuario")
    .select("organizacion_id, id_persona")
    .eq("id", userId)
    .maybeSingle();

  if (!usuario) return { nivel: 1, orgId: null };

  const { data: empleado } = await supabase
    .from("empleado")
    .select("cargo(nivel_privilegio)")
    .eq("id_persona", usuario.id_persona)
    .maybeSingle();

  return {
    nivel: empleado?.cargo?.nivel_privilegio ?? 1,
    orgId: usuario.organizacion_id
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/catalogos/zonas
// Zonas filtradas: solo Activas y accesibles según nivel del usuario
// ─────────────────────────────────────────────────────────────────────────────
router.get("/zonas", async (req, res) => {
  try {
    const { nivel, orgId } = await getUserContext(req.user.id);

    const { data: zonas, error } = await supabase
      .from("zona")
      .select(`
        id_zona, nombre, capacidad_total, descripcion,
        id_tipo, id_estado, latitud, longitud, direccion, nivel_piso,
        tipo_zona ( id_tipo, nombre ),
        estado_zona ( id_estado, nombre ),
        config_reserva_zona (
          permite_horas, permite_dias, max_horas, max_dias,
          requiere_aprobacion, hora_inicio_permitida, hora_fin_permitida,
          nivel_minimo_privilegio
        )
      `)
      .eq("organizacion_id", orgId)
      .eq("id_estado", 1) // Solo Activas
      .order("nombre");

    if (error) throw error;

    // Filtrar por tipo y nivel_minimo_privilegio
    const accesibles = (zonas || []).filter(z => {
      // VIP → solo nivel >= 7
      if (z.id_tipo === 2 && nivel < 7) return false;
      // Administrativo → solo nivel >= 3
      if (z.id_tipo === 3 && nivel < 3) return false;
      // nivel_minimo de la config
      const nivelMin = z.config_reserva_zona?.[0]?.nivel_minimo_privilegio ?? 1;
      if (nivel < nivelMin) return false;
      return true;
    });

    res.json({ ok: true, data: accesibles });
  } catch (err) {
    console.error("[catalogos] zonas:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/catalogos/facultades
// ─────────────────────────────────────────────────────────────────────────────
router.get("/facultades", async (req, res) => {
  try {
    const { orgId } = await getUserContext(req.user.id);
    const { data, error } = await supabase
      .from("facultad")
      .select("id_facultad, nombre, codigo, descripcion")
      .eq("organizacion_id", orgId)
      .eq("activa", true)
      .order("nombre");
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/catalogos/facultades/:id/carreras
// ─────────────────────────────────────────────────────────────────────────────
router.get("/facultades/:id/carreras", async (req, res) => {
  try {
    const { orgId } = await getUserContext(req.user.id);
    const { data, error } = await supabase
      .from("carrera")
      .select("id_carrera, nombre, codigo, duracion_años")
      .eq("id_facultad", req.params.id)
      .eq("organizacion_id", orgId)
      .eq("activa", true)
      .order("nombre");
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/catalogos/tipos-persona
// ─────────────────────────────────────────────────────────────────────────────
router.get("/tipos-persona", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("tipo_persona")
      .select("id_tipo_persona, nombre, puede_reservar, requiere_carnet, descripcion")
      .order("id_tipo_persona");
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/catalogos/cargos
// ─────────────────────────────────────────────────────────────────────────────
router.get("/cargos", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("cargo")
      .select("id_cargo, nombre, nivel_privilegio, descripcion")
      .order("nivel_privilegio", { ascending: false });
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/catalogos/marcas
// ─────────────────────────────────────────────────────────────────────────────
router.get("/marcas", async (req, res) => {
  try {
    const { data, error } = await supabase.from("marca").select("id_marca, nombre").order("nombre");
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/catalogos/modelos/:marcaId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/modelos/:marcaId", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("modelo")
      .select("id_modelo, nombre")
      .eq("id_marca", req.params.marcaId)
      .order("nombre");
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/catalogos/colores
// ─────────────────────────────────────────────────────────────────────────────
router.get("/colores", async (req, res) => {
  try {
    const { data, error } = await supabase.from("color").select("id_color, nombre").order("nombre");
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
