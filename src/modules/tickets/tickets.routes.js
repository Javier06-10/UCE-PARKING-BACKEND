import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import {
  listTickets,
  getTicket,
  createTicket,
  patchTicketEstado,
  removeTicket
} from "./tickets.controller.js";

const router = express.Router();

router.use(verifyToken);

// GET  /api/tickets              → lista paginada (query: page, limit, estado, search)
router.get("/", listTickets);

// GET  /api/tickets/:id          → detalle de un ticket
router.get("/:id", getTicket);

// POST /api/tickets              → emitir ticket
router.post("/", createTicket);

// PATCH /api/tickets/:id/estado  → cambiar estado (cerrar, anular, etc.)
router.patch("/:id/estado", patchTicketEstado);

// DELETE /api/tickets/:id        → eliminar ticket
router.delete("/:id", removeTicket);

export default router;
