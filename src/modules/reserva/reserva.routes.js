// src/modules/reserva/reserva.routes.js
import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { crearReserva, listarReservasUser, cancelarReserva } from "./reserva.service.js";
import {
  crearReservaZona, listarReservasZonaUser, cancelarReservaZona,
  aprobarReservaZona, rechazarReservaZona, verificarDisponibilidad,
  verificarAccesoReservaZona, verificarPlacaParticipante
} from "./reserva-zona.service.js";
import supabase from "../../config/supabase.js";

const router = express.Router();
router.use(verifyToken);

// ─── Helper ───────────────────────────────────────────────────────────────────
async function validarPuedeReservar(userId) {
  const { data: usuario } = await supabase
    .from("usuario")
    .select(`id_persona, persona ( id_tipo_persona, tipo_persona ( puede_reservar ) )`)
    .eq("id", userId).maybeSingle();

  if (usuario?.persona?.tipo_persona?.puede_reservar === false)
    throw new Error("Tu tipo de usuario no tiene habilitadas las reservas");
}

async function getOrgId(userId) {
  const { data } = await supabase
    .from("usuario").select("organizacion_id").eq("id", userId).maybeSingle();
  return data?.organizacion_id ?? null;
}

// ══════════════════════════════════════════════════════════════
// RESERVAS POR PLAZA ESPECÍFICA
// ══════════════════════════════════════════════════════════════

router.get("/puede-reservar-zona", async (req, res) => {
  try {
    const resultado = await verificarAccesoReservaZona(req.user.id);
    res.json({ ok: true, ...resultado });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

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
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get("/mis-reservas", async (req, res) => {
  try {
    const { page = 1, limit = 20, estado } = req.query;
    const data = await listarReservasUser(req.user.id, {
      page: Number(page), limit: Number(limit),
      estado: estado ? Number(estado) : undefined
    });
    res.json({ ok: true, reservas: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put("/:id/cancelar", async (req, res) => {
  try {
    const data = await cancelarReserva(req.params.id, req.user.id);
    res.json({ ok: true, reserva: data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// RESERVAS POR ZONA
// ══════════════════════════════════════════════════════════════

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
      .eq("id_zona", zonaId).single();

    res.json({ ok: true, plazas_disponibles: plazas, disponible: plazas > 0, zona });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// CAMBIO: quitado placaVehiculo, agregado participantes[]
// Body: { zonaId, fechaInicio, fechaFin, descripcion?, participantes?: [{id_persona, placa_vehiculo}] }
router.post("/zona", async (req, res) => {
  try {
    const { zonaId, fechaInicio, fechaFin, descripcion, participantes } = req.body;

    if (!zonaId || !fechaInicio || !fechaFin)
      return res.status(400).json({ ok: false, error: "zonaId, fechaInicio y fechaFin son requeridos" });

    const result = await crearReservaZona({
      zonaId, userId: req.user.id,
      fechaInicio, fechaFin,
      descripcion,
      participantes: participantes || []
    });

    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    const code = err.message.includes("nivel") ||
                 err.message.includes("empleado") ||
                 err.message.includes("habilitadas") ? 403 : 400;
    res.status(code).json({ ok: false, error: err.message });
  }
});

router.get("/zona/mis-reservas", async (req, res) => {
  try {
    const data = await listarReservasZonaUser(req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.put("/zona/:id/cancelar", async (req, res) => {
  try {
    const data = await cancelarReservaZona(req.params.id, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put("/zona/:id/aprobar", async (req, res) => {
  try {
    const { empleadoId, notas } = req.body;
    const data = await aprobarReservaZona(req.params.id, empleadoId, notas);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put("/zona/:id/rechazar", async (req, res) => {
  try {
    const { empleadoId, motivo } = req.body;
    const data = await rechazarReservaZona(req.params.id, empleadoId, motivo);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reserva/zona/verificar-placa/:placa
// NUEVO: AccesoManual — detecta si una placa es participante de reserva activa
// Devuelve: { es_participante, id_reserva_zona, codigo_reserva, nombre_zona, ... }
// ─────────────────────────────────────────────────────────────
router.get("/zona/verificar-placa/:placa", async (req, res) => {
  try {
    const orgId = await getOrgId(req.user.id);
    const resultado = await verificarPlacaParticipante(req.params.placa, orgId);

    if (!resultado) {
      return res.json({ ok: true, es_participante: false });
    }
    res.json({ ok: true, ...resultado });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/reserva/zona/:id/participantes
// NUEVO: Listar participantes de una reserva de zona (para mostrar en panel/app)
// ─────────────────────────────────────────────────────────────
router.get("/zona/:id/participantes", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("reserva_zona_participantes")
      .select(`
        id, placa_vehiculo, created_at,
        persona:id_persona ( id_persona, nombre, apellido, email )
      `)
      .eq("id_reserva_zona", req.params.id)
      .order("created_at");

    if (error) throw error;
    res.json({ ok: true, data: data ?? [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/reserva/zona/:id/participantes
// NUEVO: Agregar participante a una reserva de zona (desde panel)
// Body: { id_persona, placa_vehiculo? }
// ─────────────────────────────────────────────────────────────
router.post("/zona/:id/participantes", async (req, res) => {
  try {
    const { id_persona, placa_vehiculo } = req.body;
    if (!id_persona)
      return res.status(400).json({ ok: false, error: "id_persona es requerido" });

    const { data, error } = await supabase
      .from("reserva_zona_participantes")
      .insert({
        id_reserva_zona: Number(req.params.id),
        id_persona,
        placa_vehiculo: placa_vehiculo || null
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ ok: true, data });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/reserva/zona/participantes/:id
// NUEVO: Eliminar participante de una reserva
// ─────────────────────────────────────────────────────────────
router.delete("/zona/participantes/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("reserva_zona_participantes")
      .delete()
      .eq("id", req.params.id);

    if (error) throw error;
    res.json({ ok: true, message: "Participante eliminado" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;