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

// POST /api/reports — generar y guardar reporte
export async function generarYGuardar(req, res) {
  try {
    const { fechaDesde, fechaHasta, zonaId, descripcion, tipo } = req.body;

    // Generar reporte
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

    // Validar usuario
    const userId = req.user?.id;
    let personaId = null;

    if (userId) {
      const { data: usuarioRow, error: userError } = await supabase
        .from('usuarios')
        .select('persona_id')
        .eq('id', userId)
        .maybeSingle();

      if (!userError && usuarioRow) {
        personaId = usuarioRow.persona_id;
      } else {
        console.warn("[reports] No se pudo obtener el persona_id para el usuario:", userId);
      }
    }

    // Guardarlo en la BD
    const guardado = await guardarReporte({
      tipo: tipo || "GENERAL",
      descripcion: descripcion || `Reporte general ${fechaDesde} - ${fechaHasta}`,
      datos: reporte,
      personaId: personaId
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

// GET /api/reports/:id/download — descargar y generar el excel en vivo
export async function descargarReporteExcel(req, res) {
  try {
    const { id } = req.params;

    // 1. Fetch the report meta
    const { data: reporteRow, error } = await supabase
      .from("reportes")
      .select("*")
      .eq("Id_Reporte", id)
      .single();

    if (error || !reporteRow) {
      return res.status(404).json({ ok: false, message: "Reporte no encontrado" });
    }

    // Extract dates to regenerate payload
    let payload = {};
    try { payload = JSON.parse(reporteRow.Datos_Adjuntos_Ruta); } catch(e) {}

    let reporteData = payload;
    
    // Regenerate data directly from db if it was truncated
    if (payload.resumen === "Data truncada por limite de bd") {
        let dDesde = new Date(reporteRow.created_at).toISOString();
        let dHasta = dDesde;

        // Intentar primero obtener las fechas directamente del payload seguro
        if (payload.periodo && payload.periodo.desde) {
            dDesde = payload.periodo.desde;
            dHasta = payload.periodo.hasta || payload.periodo.desde;
        } else {
            // Fallback para reportes históricos viejos con el regex
            const textoDesc = reporteRow.Descripcion || "";
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

        if (reporteRow.Tipo_Reporte === "EVENTOS") {
            reporteData = await getReporteEventos({ fechaDesde: dDesde, fechaHasta: dHasta });
        } else {
            reporteData = await getReporteGeneral({ fechaDesde: dDesde, fechaHasta: dHasta });
        }
    }

    // 3. Set Excel headers
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="reporte_${reporteRow.Tipo_Reporte}_${id}.xlsx"`);

    // 4. Construct the EXCEL on the fly and pipe to response
    await buildReporteExcel(reporteRow.Tipo_Reporte, reporteData, res);

  } catch (error) {
    console.error("[reports] Error al descargar reporte:", error);
    res.status(500).json({ ok: false, error: "No se pudo generar el documento Excel" });
  }
}

