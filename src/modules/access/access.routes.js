import express from "express";
import { sendCommand } from "../../config/serial.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { entrada, entradaVisitante, salida, historial } from "./access.controller.js";

const router = express.Router();

// Registro de acceso (sin token — viene de la cámara/Arduino)
router.post('/entrada', entrada);

// Rutas protegidas
router.post("/entrada-visitante", verifyToken, entradaVisitante);
router.post("/salida", verifyToken, salida);
router.get("/historial", verifyToken, historial);

// Control manual de barreras
router.post('/open-main', verifyToken, (req, res) => {
  sendCommand('open_main');
  res.json({ ok: true, message: "Barrera principal abierta" });
});

router.post('/open-vip', verifyToken, (req, res) => {
  sendCommand('open_vip');
  res.json({ ok: true, message: "Barrera VIP abierta" });
});

export default router;