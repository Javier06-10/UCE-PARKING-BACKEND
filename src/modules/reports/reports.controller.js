import supabase from "../../config/supabase.js";
import {
  getReporteGeneral,
  getReporteEventos,
  guardarReporte,
  getReportes
} from "./reports.services.js";
import { buildReporteExcel } from "./excel.generator.js";

// GET /api/reports/general?fechaDesde=2026-01-01&fechaHasta=2026-01-31&zonaId=1
export async function reporteGeneral(req, res) {
  try {
    const { fechaDesde, fechaHasta, zonaId } = req.query;
    const data = await getReporteGeneral({
      fechaDesde,
      fechaHasta,
      zonaId: zonaId ? Number(zonaId) : undefined
    });
    res.json({ ok: true, ...data });
  } catch (error) {
    console.error("[reports] general:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// POST /api/reports
export async function generarYGuardar(req, res) {
  try {
    const { fechaDesde, fechaHasta, zonaId, descripcion, tipo } = req.body;

    let reporte = null;
    if (tipo === "EVENTOS") {
      reporte = await getReporteEventos({ fechaDesde, fechaHasta });
    } else {
      reporte = await getReporteGeneral({
        fechaDesde,
        fechaHasta,
        zonaId: zonaId ? Number(zonaId) : undefined
      });
    }

    const userId = req.user?.id;
    let personaId = null;
    let organizacion_id = 1;

    if (userId) {
      const { data: usuarioRow } = await supabase
        .from("usuario")
        .select("id_persona, organizacion_id")
        .eq("id", userId)
        .maybeSingle();

      if (usuarioRow) {
        personaId = usuarioRow.id_persona;
        organizacion_id = usuarioRow.organizacion_id || 1;
      }
    }

    const guardado = await guardarReporte({
      tipo: tipo || "GENERAL",
      descripcion: descripcion || `Reporte general ${fechaDesde} - ${fechaHasta}`,
      datos: reporte,
      personaId,
      organizacion_id
    });

    res.status(201).json({ ok: true, reporte, guardado });
  } catch (error) {
    console.error("[reports] generarYGuardar:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// GET /api/reports
export async function listarReportes(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await getReportes({ page: Number(page), limit: Number(limit) });
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[reports] listarReportes:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// POST /api/reports/preview
export async function previsualizarNuevo(req, res) {
  try {
    const { fechaDesde, fechaHasta, zonaId, tipo } = req.body;
    let data = null;

    if (tipo === "EVENTOS") {
      data = await getReporteEventos({ fechaDesde, fechaHasta });
    } else {
      data = await getReporteGeneral({
        fechaDesde,
        fechaHasta,
        zonaId: zonaId ? Number(zonaId) : undefined
      });
    }

    res.json({ ok: true, data });
  } catch (error) {
    console.error("[reports] previsualizarNuevo:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// GET /api/reports/:id/preview
export async function previsualizarExistente(req, res) {
  try {
    const { id } = req.params;

    const { data: reporteRow, error } = await supabase
      .from("reporte")
      .select(`
        id_reporte, ruta_adjunto, descripcion, created_at,
        tipo_reporte ( id_tipo, nombre )
      `)
      .eq("id_reporte", id)
      .single();

    if (error || !reporteRow) {
      return res.status(404).json({ ok: false, message: "Reporte no encontrado" });
    }

    let payload = {};
    try {
      payload = JSON.parse(reporteRow.ruta_adjunto);
    } catch (e) {
      /* ignorar */
    }

    let reporteData = payload;
    const tipoNombre = reporteRow.tipo_reporte?.nombre || "GENERAL";

    // Si la data está truncada, la recalculamos
    if (payload.resumen === "Data truncada por limite de columna") {
      let dDesde = new Date(reporteRow.created_at).toISOString();
      let dHasta = dDesde;

      if (payload.periodo?.desde) {
        dDesde = payload.periodo.desde;
        dHasta = payload.periodo.hasta || dDesde;
      }

      if (tipoNombre === "EVENTOS") {
        reporteData = await getReporteEventos({ fechaDesde: dDesde, fechaHasta: dHasta });
      } else {
        reporteData = await getReporteGeneral({ fechaDesde: dDesde, fechaHasta: dHasta });
      }
    }

    res.json({
      ok: true,
      tipo: tipoNombre,
      descripcion: reporteRow.descripcion,
      created_at: reporteRow.created_at,
      data: reporteData
    });
  } catch (error) {
    console.error("[reports] previsualizarExistente:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// GET /api/reports/:id/download
export async function descargarReporteExcel(req, res) {
  try {
    const { id } = req.params;

    const { data: reporteRow, error } = await supabase
      .from("reporte")
      .select(`
        id_reporte, ruta_adjunto, descripcion, created_at,
        tipo_reporte ( id_tipo, nombre )
      `)
      .eq("id_reporte", id)
      .single();

    if (error || !reporteRow) {
      return res.status(404).json({ ok: false, message: "Reporte no encontrado" });
    }

    let payload = {};
    try { payload = JSON.parse(reporteRow.ruta_adjunto); } catch (e) { /* ignorar */ }

    let reporteData = payload;
    const tipoNombre = reporteRow.tipo_reporte?.nombre || "GENERAL";

    if (payload.resumen === "Data truncada por limite de columna") {
      let dDesde = new Date(reporteRow.created_at).toISOString();
      let dHasta = dDesde;

      if (payload.periodo?.desde) {
        dDesde = payload.periodo.desde;
        dHasta = payload.periodo.hasta || dDesde;
      } else {
        const match = (reporteRow.descripcion || "").match(/general (.+?) - (.+?)$/);
        if (match) {
          dDesde = match[1].trim();
          dHasta = match[2].trim();
        }
      }

      if (tipoNombre === "EVENTOS") {
        reporteData = await getReporteEventos({ fechaDesde: dDesde, fechaHasta: dHasta });
      } else {
        reporteData = await getReporteGeneral({ fechaDesde: dDesde, fechaHasta: dHasta });
      }
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="reporte_${tipoNombre}_${id}.xlsx"`);

    await buildReporteExcel(tipoNombre, reporteData, res);

  } catch (error) {
    console.error("[reports] Error al descargar reporte:", error);
    res.status(500).json({ ok: false, error: "No se pudo generar el documento Excel" });
  }
}
