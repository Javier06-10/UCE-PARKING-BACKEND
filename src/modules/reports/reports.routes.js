import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import {
  reporteGeneral,
  generarYGuardar,
  listarReportes,
  descargarReporteExcel,
  previsualizarReporte,
  obtenerDatosReporte
} from "./reports.controller.js";

const router = express.Router();

router.use(verifyToken);

// GET  /api/reports/general → reporte de ocupación en JSON
router.get("/general", reporteGeneral);

// GET  /api/reports           → listar reportes guardados
router.get("/", listarReportes);

// POST /api/reports           → generar y guardar reporte
router.post("/", generarYGuardar);

// POST /api/reports/preview    → generar reporte en memoria para previsualizar (sin guardar)
router.post("/preview", previsualizarReporte);

// GET  /api/reports/:id/preview → obtener datos de reporte existente para previsualizar
router.get("/:id/preview", obtenerDatosReporte);

export default router;
