import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { create, listByUser, cancel } from "./reserva.controller.js";

const router = express.Router();

router.use(verifyToken);

// Crear una reserva
router.post("/", create);

// Obtener las reservas del usuario autenticado
router.get("/mis-reservas", listByUser);

// Cancelar una reserva
router.put("/:id/cancelar", cancel);

export default router;
