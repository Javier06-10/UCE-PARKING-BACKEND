import {
  crearReserva,
  listarReservasUser,
  cancelarReserva
} from "./reserva.service.js";
import { notifyUser, notifyAdmin } from "../../core/notifications.service.js";

export async function create(req, res) {
  try {
    const { plazaId, fechaInicio, fechaFin, organizacion_id } = req.body;
    const userId = req.user.id;

    if (!plazaId || !fechaInicio || !fechaFin) {
      return res.status(400).json({ ok: false, error: "plazaId, fechaInicio y fechaFin son requeridos" });
    }
    if (!organizacion_id) {
      return res.status(400).json({ ok: false, error: "organizacion_id es requerido" });
    }

    const start = new Date(fechaInicio);
    const end   = new Date(fechaFin);

    if (start < new Date()) {
      return res.status(400).json({ ok: false, error: "La fecha de inicio no puede estar en el pasado." });
    }
    if (start >= end) {
      return res.status(400).json({ ok: false, error: "La fecha de inicio debe ser anterior a la fecha de fin" });
    }
    const diffHours = (end - start) / (1000 * 60 * 60);
    if (diffHours > 2) {
      return res.status(400).json({ ok: false, error: "Las reservas no pueden durar más de 2 horas." });
    }

    const reserva = await crearReserva(plazaId, userId, start, end, organizacion_id);

    notifyUser(userId, "RESERVA_CREADA", {
      mensaje: "Tu reserva ha sido confirmada exitosamente.",
      reserva,
    });
    notifyAdmin("NUEVA_RESERVA", {
      mensaje: `Nueva reserva creada para la plaza ${plazaId}.`,
      reserva,
    });

    return res.status(201).json({ ok: true, reserva });
  } catch (error) {
    console.error("[reserva] create:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

export async function listByUser(req, res) {
  try {
    const userId = req.user.id;
    const reservas = await listarReservasUser(userId);
    return res.json({ ok: true, reservas });
  } catch (error) {
    console.error("[reserva] list:", error.message);
    res.status(500).json({ ok: false, error: "Error al obtener las reservas" });
  }
}

export async function cancel(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const cancelada = await cancelarReserva(id, userId);
    return res.json({ ok: true, reserva: cancelada });
  } catch (error) {
    console.error("[reserva] cancel:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}
