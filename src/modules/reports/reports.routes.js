import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import {
  reporteGeneral,
  generarYGuardar,
  listarReportes,
  descargarReporteExcel
} from "./reports.controller.js";

const router = express.Router();

router.use(verifyToken);

// GET  /api/reports/general → reporte de ocupación en JSON
router.get("/general", reporteGeneral);

// GET  /api/reports           → listar reportes guardados
router.get("/", listarReportes);

// POST /api/reports           → generar y guardar reporte
router.post("/", generarYGuardar);

// GET  /api/reports/:id/download  → Generar Excel al vuelo
router.get("/:id/download", descargarReporteExcel);

export default router;
