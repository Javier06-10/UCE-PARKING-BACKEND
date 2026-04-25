// src/modules/reserva/reserva.routes.js
import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { crearReserva, listarReservasUser, cancelarReserva } from "./reserva.service.js";
import {
  crearReservaZona, listarReservasZonaUser, cancelarReservaZona,
  aprobarReservaZona, rechazarReservaZona, verificarDisponibilidad,
  verificarAccesoReservaZona
} from "./reserva-zona.service.js";
import supabase from "../../config/supabase.js";

const router = express.Router();
router.use(verifyToken);

// ══════════════════════════════════════════════════════════════
// HELPER — validar que tipo_persona.puede_reservar = true
// ══════════════════════════════════════════════════════════════
async function validarPuedeReservar(userId) {
  const { data: usuario } = await supabase
    .from("usuario")
    .select(`
      id_persona,
      persona ( id_tipo_persona, tipo_persona ( puede_reservar ) )
    `)
    .eq("id", userId)
    .maybeSingle();

  const puedeReservar = usuario?.persona?.tipo_persona?.puede_reservar;
  if (puedeReservar === false) {
    throw new Error("Tu tipo de usuario no tiene habilitadas las reservas");
  }
}

// ══════════════════════════════════════════════════════════════
// RESERVAS POR PLAZA ESPECÍFICA
// ══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// GET /api/reserva/puede-reservar-zona
// ✅ NUEVO: Verifica si el usuario autenticado puede reservar por zona
// Usado por Flutter para mostrar/ocultar el tab "Por Zona"
// ─────────────────────────────────────────────────────────────
router.get("/puede-reservar-zona", async (req, res) => {
  try {
    const resultado = await verificarAccesoReservaZona(req.user.id);
    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("[reserva] puede-reservar-zona:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

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

    if (isNaN(start) || isNaN(end))
      return res.status(400).json({ ok: false, error: "Fechas inválidas" });
    if (start < new Date())
      return res.status(400).json({ ok: false, error: "La fecha de inicio no puede estar en el pasado" });
    if (start >= end)
      return res.status(400).json({ ok: false, error: "La fecha de inicio debe ser anterior a la fecha de fin" });
    if ((end - start) / 3_600_000 > 2)
      return res.status(400).json({ ok: false, error: "Las reservas de plaza no pueden durar más de 2 horas" });

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
// Historial de reservas de plaza del usuario con join completo
// ─────────────────────────────────────────────────────────────
router.get("/mis-reservas", async (req, res) => {
  try {
    const { page = 1, limit = 20, estado } = req.query;
    const data = await listarReservasUser(req.user.id, {
      page: Number(page), limit: Number(limit),
      estado: estado ? Number(estado) : undefined
    });
    res.json({ ok: true, reservas: data });
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

    const { data: zona } = await supabase
      .from("zona")
      .select(`
        id_zona, nombre, capacidad_total,
        config_reserva_zona (
          permite_horas, permite_dias, max_horas, max_dias,
          requiere_aprobacion, hora_inicio_permitida, hora_fin_permitida,
          nivel_minimo_privilegio, requiere_empleado
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
// ✅ Validación completa: empleado activo + nivel suficiente
// Body: { zonaId, fechaInicio, fechaFin, placaVehiculo?, descripcion? }
// ─────────────────────────────────────────────────────────────
router.post("/zona", async (req, res) => {
  try {
    const { zonaId, fechaInicio, fechaFin, placaVehiculo, descripcion } = req.body;

    if (!zonaId || !fechaInicio || !fechaFin)
      return res.status(400).json({ ok: false, error: "zonaId, fechaInicio y fechaFin son requeridos" });

    const result = await crearReservaZona({
      zonaId, userId: req.user.id,
      fechaInicio, fechaFin,
      placaVehiculo, descripcion
    });

    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    console.error("[reserva] zona create:", err.message);
    // Devolver 403 si el error es de permisos, 400 si es de datos
    const code = err.message.includes("nivel") ||
                 err.message.includes("empleado") ||
                 err.message.includes("habilitadas") ? 403 : 400;
    res.status(code).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reserva/zona/mis-reservas
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

export default router;