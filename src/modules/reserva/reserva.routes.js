// src/modules/reserva/reserva.routes.js — versión completa para app móvil
import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { crearReserva, listarReservasUser, cancelarReserva } from "./reserva.service.js";
import {
  crearReservaZona, listarReservasZonaUser, cancelarReservaZona,
  aprobarReservaZona, rechazarReservaZona, verificarDisponibilidad
} from "./reserva-zona.service.js";
import supabase from "../../config/supabase.js";

const router = express.Router();
router.use(verifyToken);

// ══════════════════════════════════════════════════════════════
// RESERVAS POR PLAZA ESPECÍFICA
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// POST /api/reserva
// Crear reserva de plaza específica
// Body: { plazaId, fechaInicio, fechaFin }
// ─────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { plazaId, fechaInicio, fechaFin } = req.body;

    if (!plazaId || !fechaInicio || !fechaFin)
      return res.status(400).json({ ok: false, error: "plazaId, fechaInicio y fechaFin son requeridos" });

    const start = new Date(fechaInicio);
    const end   = new Date(fechaFin);

    if (start < new Date())
      return res.status(400).json({ ok: false, error: "La fecha de inicio no puede estar en el pasado" });
    if (start >= end)
      return res.status(400).json({ ok: false, error: "La fecha de inicio debe ser anterior a la fecha de fin" });
    if ((end - start) / 3_600_000 > 2)
      return res.status(400).json({ ok: false, error: "Las reservas de plaza no pueden durar más de 2 horas" });

    // Verificar tipo de persona puede reservar
    await validarPuedeReservar(req.user.id);

    const reserva = await crearReserva(plazaId, req.user.id, start, end);
    res.status(201).json({ ok: true, reserva });
  } catch (err) {
    console.error("[reserva] create:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reserva/mis-reservas
// Historial de reservas de plaza del usuario
// ─────────────────────────────────────────────────────────────
router.get("/mis-reservas", async (req, res) => {
  try {
    const { page = 1, limit = 20, estado } = req.query;
    const reservas = await listarReservasUser(req.user.id, {
      page: Number(page), limit: Number(limit),
      estado: estado ? Number(estado) : undefined
    });
    res.json({ ok: true, ...reservas });
  } catch (err) {
    console.error("[reserva] list:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/reserva/:id/cancelar
// Cancelar reserva de plaza activa
// ─────────────────────────────────────────────────────────────
router.put("/:id/cancelar", async (req, res) => {
  try {
    const data = await cancelarReserva(req.params.id, req.user.id);
    res.json({ ok: true, reserva: data });
  } catch (err) {
    console.error("[reserva] cancel:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// RESERVAS POR ZONA
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// GET /api/reserva/zona/disponibilidad
// Query: zonaId, inicio (ISO), fin (ISO)
// ─────────────────────────────────────────────────────────────
router.get("/zona/disponibilidad", async (req, res) => {
  try {
    const { zonaId, inicio, fin } = req.query;
    if (!zonaId || !inicio || !fin)
      return res.status(400).json({ ok: false, error: "zonaId, inicio y fin son requeridos" });

    const plazas = await verificarDisponibilidad(Number(zonaId), inicio, fin);

    // También devolver info de la zona y su config
    const { data: zona } = await supabase
      .from("zona")
      .select(`
        id_zona, nombre, capacidad_total,
        config_reserva_zona (
          permite_horas, permite_dias, max_horas, max_dias,
          requiere_aprobacion, hora_inicio_permitida, hora_fin_permitida,
          nivel_minimo_privilegio
        )
      `)
      .eq("id_zona", zonaId)
      .single();

    res.json({
      ok: true,
      plazas_disponibles: plazas,
      disponible: plazas > 0,
      zona
    });
  } catch (err) {
    console.error("[reserva] zona disponibilidad:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/reserva/zona
// Crear reserva de zona (horas o días)
// Body: { zonaId, fechaInicio, fechaFin, placaVehiculo?, descripcion? }
// ─────────────────────────────────────────────────────────────
router.post("/zona", async (req, res) => {
  try {
    const { zonaId, fechaInicio, fechaFin, placaVehiculo, descripcion } = req.body;

    if (!zonaId || !fechaInicio || !fechaFin)
      return res.status(400).json({ ok: false, error: "zonaId, fechaInicio y fechaFin son requeridos" });

    await validarPuedeReservar(req.user.id);

    const result = await crearReservaZona({
      zonaId, userId: req.user.id,
      fechaInicio, fechaFin,
      placaVehiculo, descripcion
    });

    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    console.error("[reserva] zona create:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reserva/zona/mis-reservas
// Historial de reservas de zona del usuario
// ─────────────────────────────────────────────────────────────
router.get("/zona/mis-reservas", async (req, res) => {
  try {
    const data = await listarReservasZonaUser(req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[reserva] zona list:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/reserva/zona/:id/cancelar
// Cancelar reserva de zona activa
// ─────────────────────────────────────────────────────────────
router.put("/zona/:id/cancelar", async (req, res) => {
  try {
    const data = await cancelarReservaZona(req.params.id, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[reserva] zona cancel:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/reserva/zona/:id/aprobar  (admin)
// ─────────────────────────────────────────────────────────────
router.put("/zona/:id/aprobar", async (req, res) => {
  try {
    const { empleadoId, notas } = req.body;
    const data = await aprobarReservaZona(req.params.id, empleadoId, notas);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/reserva/zona/:id/rechazar  (admin)
// ─────────────────────────────────────────────────────────────
router.put("/zona/:id/rechazar", async (req, res) => {
  try {
    const { empleadoId, motivo } = req.body;
    const data = await rechazarReservaZona(req.params.id, empleadoId, motivo);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// HELPER — validar que el tipo de persona puede reservar
// ══════════════════════════════════════════════════════════════
async function validarPuedeReservar(userId) {
  const { data: usuario } = await supabase
    .from("usuario")
    .select("id_persona, persona(id_tipo_persona, tipo_persona(puede_reservar))")
    .eq("id", userId)
    .maybeSingle();

  const puedeReservar = usuario?.persona?.tipo_persona?.puede_reservar;
  if (puedeReservar === false)
    throw new Error("Tu tipo de usuario no tiene habilitadas las reservas");
}

export default router;