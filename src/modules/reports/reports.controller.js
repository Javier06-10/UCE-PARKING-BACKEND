import {
  getReporteOcupacion,
  guardarReporte,
  getReportes
} from "./reports.services.js";

// GET /api/reports/ocupacion?fechaDesde=2026-01-01&fechaHasta=2026-01-31&zonaId=1
export async function reporteOcupacion(req, res) {
  try {
    const { fechaDesde, fechaHasta, zonaId } = req.query;
    const data = await getReporteOcupacion({
      fechaDesde,
      fechaHasta,
      zonaId: zonaId ? Number(zonaId) : undefined
    });
    res.json({ ok: true, ...data });
  } catch (error) {
    console.error("[reports] ocupacion:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// POST /api/reports — generar y guardar reporte
export async function generarYGuardar(req, res) {
  try {
    const { fechaDesde, fechaHasta, zonaId, descripcion } = req.body;

    // Generar reporte
    const reporte = await getReporteOcupacion({
      fechaDesde,
      fechaHasta,
      zonaId: zonaId ? Number(zonaId) : undefined
    });

    // Guardarlo en la BD
    const guardado = await guardarReporte({
      tipo: "OCUPACION",
      descripcion: descripcion || `Reporte de ocupación ${fechaDesde} - ${fechaHasta}`,
      datos: reporte,
      personaId: req.user?.id || null
    });

    res.status(201).json({ ok: true, reporte, guardado });
  } catch (error) {
    console.error("[reports] generarYGuardar:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// GET /api/reports — listar reportes guardados
export async function listarReportes(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await getReportes({
      page: Number(page),
      limit: Number(limit)
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[reports] listarReportes:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}
