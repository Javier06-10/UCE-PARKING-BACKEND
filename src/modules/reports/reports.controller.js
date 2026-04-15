import supabase from "../../config/supabase.js";
import {
  getReporteGeneral,
  getReporteEventos,
  guardarReporte,
  getReportes
} from "./reports.services.js";
import { buildReporteExcel } from "./excel.generator.js";

// GET /api/reports/general
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

// POST /api/reports — generar y guardar reporte
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

    if (userId) {
      const { data: usuarioRow, error: userError } = await supabase
        .from("usuario")
        .select("id_persona")
        .eq("id", userId)
        .maybeSingle();

      if (!userError && usuarioRow) {
        personaId = usuarioRow.id_persona;
      } else {
        console.warn("[reports] No se pudo obtener id_persona para usuario:", userId);
      }
    }

    const guardado = await guardarReporte({
      tipo: tipo || "GENERAL",
      descripcion: descripcion || `Reporte general ${fechaDesde} - ${fechaHasta}`,
      datos: reporte,
      personaId,
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
      page:  Number(page),
      limit: Number(limit)
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[reports] listarReportes:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// GET /api/reports/:id/download
export async function descargarReporteExcel(req, res) {
  try {
    const { id } = req.params;

    const { data: reporteRow, error } = await supabase
      .from("reporte")
      .select("*")
      .eq("id_reporte", id)
      .single();

    if (error || !reporteRow) {
      return res.status(404).json({ ok: false, message: "Reporte no encontrado" });
    }

    let payload = {};
    try { payload = JSON.parse(reporteRow.ruta_adjunto); } catch(e) {}

    let reporteData = payload;

    if (payload.resumen === "Data truncada por limite de bd") {
      let dDesde = new Date(reporteRow.created_at).toISOString();
      let dHasta = dDesde;

      if (payload.periodo && payload.periodo.desde) {
        dDesde = payload.periodo.desde;
        dHasta = payload.periodo.hasta || payload.periodo.desde;
      } else {
        const textoDesc = reporteRow.descripcion || "";
        const fechasMatch = textoDesc.match(/Reporte (.*?) (.*?) - (.*?)$/) || textoDesc.match(/general (.*?) - (.*?)$/);
        if (fechasMatch && fechasMatch.length >= 3) {
          if (fechasMatch.length === 4) {
            dDesde = fechasMatch[2].trim();
            dHasta = fechasMatch[3].trim();
          } else {
            dDesde = fechasMatch[1].trim();
            dHasta = fechasMatch[2].trim();
          }
        }
      }

      if (reporteRow.tipo_reporte === "EVENTOS") {
        reporteData = await getReporteEventos({ fechaDesde: dDesde, fechaHasta: dHasta });
      } else {
        reporteData = await getReporteGeneral({ fechaDesde: dDesde, fechaHasta: dHasta });
      }
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="reporte_${reporteRow.tipo_reporte}_${id}.xlsx"`);

    await buildReporteExcel(reporteRow.tipo_reporte, reporteData, res);

  } catch (error) {
    console.error("[reports] Error al descargar reporte:", error);
    res.status(500).json({ ok: false, error: "No se pudo generar el documento Excel" });
  }
}

// POST /api/reports/preview
export async function previsualizarReporte(req, res) {
  try {
    const { fechaDesde, fechaHasta, zonaId, tipo } = req.body;

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

    res.json({ ok: true, data: reporte });
  } catch (error) {
    console.error("[reports] previsualizarReporte:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// GET /api/reports/:id/preview
export async function obtenerDatosReporte(req, res) {
  try {
    const { id } = req.params;

    const { data: reporteRow, error } = await supabase
      .from("reporte")
      .select("*")
      .eq("id_reporte", id)
      .single();

    if (error || !reporteRow) {
      return res.status(404).json({ ok: false, message: "Reporte no encontrado" });
    }

    let payload = {};
    try { payload = JSON.parse(reporteRow.ruta_adjunto); } catch(e) {}

    let reporteData = payload;

    if (payload.resumen === "Data truncada por limite de bd") {
      let dDesde = new Date(reporteRow.created_at).toISOString();
      let dHasta = dDesde;

      if (payload.periodo && payload.periodo.desde) {
        dDesde = payload.periodo.desde;
        dHasta = payload.periodo.hasta || payload.periodo.desde;
      } else {
        const textoDesc = reporteRow.descripcion || "";
        const fechasMatch = textoDesc.match(/Reporte (.*?) (.*?) - (.*?)$/) || textoDesc.match(/general (.*?) - (.*?)$/);
        if (fechasMatch && fechasMatch.length >= 3) {
          if (fechasMatch.length === 4) {
            dDesde = fechasMatch[2].trim();
            dHasta = fechasMatch[3].trim();
          } else {
            dDesde = fechasMatch[1].trim();
            dHasta = fechasMatch[2].trim();
          }
        }
      }

      if (reporteRow.tipo_reporte === "EVENTOS") {
        reporteData = await getReporteEventos({ fechaDesde: dDesde, fechaHasta: dHasta });
      } else {
        reporteData = await getReporteGeneral({ fechaDesde: dDesde, fechaHasta: dHasta });
      }
    }

    res.json({
      ok:             true,
      tipo:           reporteRow.tipo_reporte,
      descripcion:    reporteRow.descripcion,
      fecha_creacion: reporteRow.created_at,
      data:           reporteData,
    });
  } catch (error) {
    console.error("[reports] obtenerDatosReporte:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}
