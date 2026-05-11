import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import {
  reporteGeneral,
  generarYGuardar,
  listarReportes,
  descargarReporteExcel,
  descargarReportePDF,
  previsualizarNuevo,
  previsualizarExistente
} from "./reports.controller.js";

const router = express.Router();

router.use(verifyToken);

// GET  /api/reports/general → reporte de ocupación en JSON
router.get("/general", reporteGeneral);

// GET  /api/reports           → listar reportes guardados
router.get("/", listarReportes);

// POST /api/reports/preview   → previsualizar antes de guardar
router.post("/preview", previsualizarNuevo);

// GET  /api/reports/:id/preview → previsualizar un reporte ya guardado
router.get("/:id/preview", previsualizarExistente);

// POST /api/reports           → generar y guardar reporte
router.post("/", generarYGuardar);

// GET  /api/reports/:id/download      → Generar Excel al vuelo
router.get("/:id/download", descargarReporteExcel);

// GET  /api/reports/:id/download-pdf  → Generar PDF al vuelo (RF16.3)
router.get("/:id/download-pdf", descargarReportePDF);

export default router;
