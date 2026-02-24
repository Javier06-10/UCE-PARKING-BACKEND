import {
  getAllTickets,
  getTicketById,
  emitirTicket,
  updateTicketEstado,
  deleteTicket
} from "./tickets.services.js";

// GET /api/tickets?page=1&limit=20&estado=1&search=ABC
export async function listTickets(req, res) {
  try {
    const { page = 1, limit = 20, estado, search } = req.query;
    const result = await getAllTickets({
      page: Number(page),
      limit: Number(limit),
      estado: estado ? Number(estado) : undefined,
      search
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[tickets] listTickets:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// GET /api/tickets/:id
export async function getTicket(req, res) {
  try {
    const data = await getTicketById(req.params.id);
    res.json({ ok: true, data });
  } catch (error) {
    console.error("[tickets] getTicket:", error.message);
    res.status(404).json({ ok: false, error: error.message });
  }
}

// POST /api/tickets
export async function createTicket(req, res) {
  try {
    const { placa, color, marca, plazaAsignada, personaId, dispositivoEntradaId } = req.body;
    const data = await emitirTicket({ placa, color, marca, plazaAsignada, personaId, dispositivoEntradaId });
    res.status(201).json({ ok: true, data });
  } catch (error) {
    console.error("[tickets] createTicket:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// PATCH /api/tickets/:id/estado
export async function patchTicketEstado(req, res) {
  try {
    const { id_estado, Estado } = req.body;
    const data = await updateTicketEstado(req.params.id, { id_estado, Estado });
    res.json({ ok: true, data });
  } catch (error) {
    console.error("[tickets] patchEstado:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// DELETE /api/tickets/:id
export async function removeTicket(req, res) {
  try {
    const result = await deleteTicket(req.params.id);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[tickets] removeTicket:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}
