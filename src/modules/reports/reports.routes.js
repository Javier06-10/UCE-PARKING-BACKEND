import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import {
  reporteOcupacion,
  generarYGuardar,
  listarReportes
} from "./reports.controller.js";

const router = express.Router();

router.use(verifyToken);

// GET  /api/reports/ocupacion → reporte de ocupación (sin guardar)
router.get("/ocupacion", reporteOcupacion);

// GET  /api/reports           → listar reportes guardados
router.get("/", listarReportes);

// POST /api/reports           → generar y guardar reporte
router.post("/", generarYGuardar);

export default router;
