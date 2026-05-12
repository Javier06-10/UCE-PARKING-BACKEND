// src/modules/scanner/scanner.routes.js

import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { salidaTicket, getTicketPorToken, testEscaner } from "./Scanner.controller.js";

const router = express.Router();
router.use(verifyToken);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scanner/salida-ticket
// Principal: recibe el token leído por el escáner y procesa la salida completa
//
// Body:
//   { token: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", dispositivoSalidaId?: 1 }
//
// Respuestas:
//   200 → { ok, id_ticket, placa, visitante_nombre, duracion_minutos, ... }
//   400 → token inválido o faltante
//   404 → ticket no encontrado
//   409 → ticket ya procesado o anulado
// ─────────────────────────────────────────────────────────────────────────────
router.post("/salida-ticket", salidaTicket);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/scanner/ticket/:token
// Previsualizar ticket por token — el panel web lo usa para mostrar datos
// ANTES de confirmar la salida (opcional, el panel puede usar esto para
// mostrar al guardia los datos del visitante antes de abrir la barrera)
//
// Respuesta: { ok, data: { id_ticket, placa, visitante, estado, vencido, ... } }
// ─────────────────────────────────────────────────────────────────────────────
router.get("/ticket/:token", getTicketPorToken);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scanner/test
// Solo desarrollo — simula la lectura del escáner sin hardware físico
// Body: { token: "uuid" }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/test", testEscaner);

export default router;