import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import {
  listHandler,
  unreadCountHandler,
  markOneReadHandler,
  markAllReadHandler,
  createHandler,
  deleteHandler
} from "./notifications.controller.js";

const router = express.Router();

// Todos los endpoints requieren token válido
router.use(verifyToken);

// GET  /api/notifications                → lista paginada (page, limit, soloNoLeidas)
router.get("/", listHandler);

// GET  /api/notifications/unread-count   → cantidad de no leídas
// ⚠ DEBE ir ANTES de /:id para que "unread-count" no sea interpretado como un id
router.get("/unread-count", unreadCountHandler);

// PATCH /api/notifications/read-all      → marcar todas como leídas
router.patch("/read-all", markAllReadHandler);

// PATCH /api/notifications/:id/read      → marcar una como leída
router.patch("/:id/read", markOneReadHandler);

// POST  /api/notifications               → crear notificación (uso admin/interno)
router.post("/", createHandler);

// DELETE /api/notifications/:id          → eliminar notificación
router.delete("/:id", deleteHandler);

export default router;