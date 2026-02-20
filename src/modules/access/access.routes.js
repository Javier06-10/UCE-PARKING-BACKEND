
import express from "express";
import { sendCommand } from "../serial/serial.service.js";
import { entrada,entradaVisitante } from "./access.controller.js";

const router = express.Router();

router.post('/entrada', entrada);

router.post("/entrada-visitante", entradaVisitante);


router.post('/open-main', (req, res) => {
  sendCommand('open_main');
  res.json({ success: true });
});

router.post('/open-vip', (req, res) => {
  sendCommand('open_vip');
  res.json({ success: true });
});

export default router;