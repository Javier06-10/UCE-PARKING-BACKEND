import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import {
  listNotifications,
  unreadCount,
  readAll,
  readOne,
  create,
  remove,
} from "./notifications.controller.js";

const router = express.Router();

// Todas las rutas requieren token JWT
router.use(verifyToken);

// GET  /api/notifications                  → lista paginada (personal + generales)
router.get("/", listNotifications);

// GET  /api/notifications/unread-count     → número de no leídas (badge)
router.get("/unread-count", unreadCount);

// PATCH /api/notifications/read-all        → marcar TODAS como leídas
router.patch("/read-all", readAll);

// PATCH /api/notifications/:id/read        → marcar UNA como leída
router.patch("/:id/read", readOne);

// POST  /api/notifications                 → crear notificación (uso interno / admin)
router.post("/", create);

// DELETE /api/notifications/:id            → eliminar una notificación
router.delete("/:id", remove);

export default router;
