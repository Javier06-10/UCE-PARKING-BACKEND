// src/modules/vehicles/vehicles.routes.js — versión actualizada para app móvil
import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import supabase from "../../config/supabase.js";
import {
  getAllVehicles, getVehicleById, getVehicleByPlaca,
  createVehicle, updateVehicle, deleteVehicle, getVehicleAccessHistory
} from "./vehicles.services.js";

const router = express.Router();
router.use(verifyToken);

// ─────────────────────────────────────────────────────────────
// GET /api/vehicles
// Lista vehículos del usuario autenticado con join completo
// ─────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;

    // Resolver id_persona desde usuario
    const { data: usuario } = await supabase
      .from("usuario").select("id_persona, organizacion_id").eq("id", req.user.id).maybeSingle();

    if (!usuario) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    const from = (page - 1) * limit;
    const to   = from + Number(limit) - 1;

    let query = supabase
      .from("vehiculo")
      .select(`
        id_vehiculo, placa, created_at, id_estado, id_tipo,
        modelo ( id_modelo, nombre, marca ( id_marca, nombre ) ),
        color ( id_color, nombre ),
        estado_vehiculo ( nombre )
      `, { count: "exact" })
      .eq("id_persona", usuario.id_persona)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) query = query.ilike("placa", `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ ok: true, data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[vehicles] list:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/vehicles
// Registrar nuevo vehículo asociado al usuario
// Body: { placa, id_modelo, id_color, id_tipo? }
// ─────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { placa, id_modelo, id_color, id_tipo } = req.body;

    if (!placa) return res.status(400).json({ ok: false, error: "La placa es requerida" });

    const { data: usuario } = await supabase
      .from("usuario").select("id_persona, organizacion_id").eq("id", req.user.id).maybeSingle();

    if (!usuario) return res.status(404).json({ ok: false, error: "Usuario no encontrado" });

    // Verificar placa duplicada
    const { data: existe } = await supabase
      .from("vehiculo").select("id_vehiculo").eq("placa", placa).maybeSingle();
    if (existe) return res.status(409).json({ ok: false, error: `La placa ${placa} ya está registrada` });

    const { data, error } = await supabase
      .from("vehiculo")
      .insert({
        placa: placa.toUpperCase().trim(),
        id_modelo: id_modelo || null,
        id_color:  id_color  || null,
        id_tipo:   id_tipo   || null,
        id_persona: usuario.id_persona,
        organizacion_id: usuario.organizacion_id,
        id_estado: 1
      })
      .select(`
        id_vehiculo, placa, created_at,
        modelo ( id_modelo, nombre, marca ( id_marca, nombre ) ),
        color ( id_color, nombre )
      `)
      .single();

    if (error) throw error;
    res.status(201).json({ ok: true, data });
  } catch (err) {
    console.error("[vehicles] create:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/vehicles/placa/:placa
// Buscar vehículo por placa
// ─────────────────────────────────────────────────────────────
router.get("/placa/:placa", async (req, res) => {
  try {
    const data = await getVehicleByPlaca(req.params.placa);
    if (!data) return res.status(404).json({ ok: false, error: "Vehículo no encontrado" });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/vehicles/:id
// Detalle de un vehículo
// ─────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const data = await getVehicleById(req.params.id);
    if (!data) return res.status(404).json({ ok: false, error: "Vehículo no encontrado" });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/vehicles/:id
// Actualizar vehículo (solo el propietario)
// ─────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const { placa, id_modelo, id_color, id_tipo } = req.body;

    // Verificar propiedad
    const { data: usuario } = await supabase
      .from("usuario").select("id_persona").eq("id", req.user.id).maybeSingle();

    const { data: vehiculo } = await supabase
      .from("vehiculo").select("id_vehiculo, id_persona")
      .eq("id_vehiculo", req.params.id).maybeSingle();

    if (!vehiculo) return res.status(404).json({ ok: false, error: "Vehículo no encontrado" });
    if (vehiculo.id_persona !== usuario.id_persona)
      return res.status(403).json({ ok: false, error: "No tienes permiso para editar este vehículo" });

    const campos = {};
    if (placa    !== undefined) campos.placa     = placa.toUpperCase().trim();
    if (id_modelo !== undefined) campos.id_modelo = id_modelo;
    if (id_color  !== undefined) campos.id_color  = id_color;
    if (id_tipo   !== undefined) campos.id_tipo   = id_tipo;

    const { data, error } = await supabase
      .from("vehiculo")
      .update(campos)
      .eq("id_vehiculo", req.params.id)
      .select(`
        id_vehiculo, placa,
        modelo ( nombre, marca ( nombre ) ),
        color ( nombre )
      `)
      .single();

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[vehicles] update:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/vehicles/:id
// Eliminar vehículo (solo el propietario)
// ─────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const { data: usuario } = await supabase
      .from("usuario").select("id_persona").eq("id", req.user.id).maybeSingle();

    const { data: vehiculo } = await supabase
      .from("vehiculo").select("id_vehiculo, id_persona")
      .eq("id_vehiculo", req.params.id).maybeSingle();

    if (!vehiculo) return res.status(404).json({ ok: false, error: "Vehículo no encontrado" });
    if (vehiculo.id_persona !== usuario.id_persona)
      return res.status(403).json({ ok: false, error: "No tienes permiso para eliminar este vehículo" });

    const { error } = await supabase
      .from("vehiculo").delete().eq("id_vehiculo", req.params.id);

    if (error) throw error;
    res.json({ ok: true, message: "Vehículo eliminado correctamente" });
  } catch (err) {
    console.error("[vehicles] delete:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/vehicles/:id/history
// Historial de accesos del vehículo con duración calculada
// ─────────────────────────────────────────────────────────────
router.get("/:id/history", async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const from = (page - 1) * limit;
    const to   = from + Number(limit) - 1;

    const { data, error, count } = await supabase
      .from("acceso")
      .select(`
        id_registro, entrada_at, salida_at, acceso_autorizado,
        plaza ( numero_plaza, zona ( nombre ) )
      `, { count: "exact" })
      .eq("id_vehiculo", req.params.id)
      .order("entrada_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const registros = data.map(r => ({
      ...r,
      duracion_minutos: r.entrada_at && r.salida_at
        ? Math.round((new Date(r.salida_at) - new Date(r.entrada_at)) / 60000)
        : null
    }));

    res.json({ ok: true, data: registros, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[vehicles] history:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;