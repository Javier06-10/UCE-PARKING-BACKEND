// src/modules/scanner/scanner.routes.js

import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { salidaTicket, getTicketPorToken, testEscaner } from "./Scanner.controller.js";
import { getScannerStatus } from "../../config/Scanner.serial.js";

const router = express.Router();
router.use(verifyToken);

// POST /api/scanner/salida-ticket — fallback manual (Opción A) + modo sin serial
router.post("/salida-ticket", salidaTicket);

// GET  /api/scanner/ticket/:token — previsualizar ticket sin procesar
router.get("/ticket/:token", getTicketPorToken);

// GET  /api/scanner/status — estado del escáner serial (conectado/desconectado)
router.get("/status", (req, res) => {
  res.json({ ok: true, scanner: getScannerStatus() });
});

// POST /api/scanner/test — solo desarrollo, simula lectura
router.post("/test", testEscaner);

export default router;