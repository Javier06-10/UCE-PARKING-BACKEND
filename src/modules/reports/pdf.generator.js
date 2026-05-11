import PDFDocument from 'pdfkit';

// ─── Función unificada: análoga a buildReporteExcel ───────────────────────────
// tipo: "GENERAL" | "EVENTOS"
// reportData: objeto devuelto por getReporteGeneral o getReporteEventos
// streamObj: res (HTTP response) o cualquier stream writable
export function buildReportePDF(tipo, reportData, streamObj) {
  if (tipo === "EVENTOS") {
    return buildEventosPDF(reportData, streamObj);
  }
  return buildGeneralPDF(reportData, streamObj);
}

// ─── Helpers de estilo ────────────────────────────────────────────────────────
const COLOR_PRIMARY   = "#0056B3";
const COLOR_SECONDARY = "#4A90D9";
const COLOR_LIGHT     = "#F0F4FA";
const COLOR_TEXT      = "#1A1A2E";
const COLOR_MUTED     = "#6B7280";

function drawHeader(doc, titulo) {
  // Banda superior azul
  doc.rect(0, 0, doc.page.width, 70).fill(COLOR_PRIMARY);

  // Título en blanco
  doc.fillColor("#FFFFFF")
     .fontSize(18)
     .font("Helvetica-Bold")
     .text("UCE PARKING SYSTEM", 50, 18, { align: "left" });

  doc.fontSize(11)
     .font("Helvetica")
     .text(titulo, 50, 42, { align: "left" });

  // Fecha de emisión a la derecha
  doc.fontSize(9)
     .text(`Emitido: ${new Date().toLocaleString("es-EC")}`, 0, 28, {
       align: "right",
       width: doc.page.width - 50
     });

  doc.fillColor(COLOR_TEXT);
  doc.y = 90;
}

function drawSectionTitle(doc, texto) {
  doc.moveDown(0.5);
  const y = doc.y;
  doc.rect(50, y, doc.page.width - 100, 20).fill(COLOR_LIGHT);
  doc.fillColor(COLOR_PRIMARY)
     .fontSize(11)
     .font("Helvetica-Bold")
     .text(texto, 56, y + 4);
  doc.fillColor(COLOR_TEXT).font("Helvetica");
  doc.y = y + 28;
}

function drawKV(doc, label, value) {
  doc.fontSize(10)
     .font("Helvetica-Bold")
     .text(`${label}: `, { continued: true })
     .font("Helvetica")
     .text(String(value ?? "N/A"));
}

function drawTableHeader(doc, cols) {
  const y = doc.y;
  const tableWidth = doc.page.width - 100;
  doc.rect(50, y, tableWidth, 18).fill(COLOR_SECONDARY);
  doc.fillColor("#FFFFFF").fontSize(9).font("Helvetica-Bold");

  let x = 52;
  cols.forEach(col => {
    doc.text(col.label, x, y + 4, { width: col.width, ellipsis: true });
    x += col.width;
  });

  doc.fillColor(COLOR_TEXT).font("Helvetica");
  doc.y = y + 20;
}

function drawTableRow(doc, cols, values, isOdd) {
  const y = doc.y;
  const tableWidth = doc.page.width - 100;

  if (isOdd) {
    doc.rect(50, y, tableWidth, 16).fill("#F8FAFF");
  }

  doc.fillColor(COLOR_TEXT).fontSize(9).font("Helvetica");
  let x = 52;
  cols.forEach((col, i) => {
    doc.text(String(values[i] ?? ""), x, y + 3, { width: col.width - 2, ellipsis: true });
    x += col.width;
  });

  doc.y = y + 18;
}

function drawFooter(doc) {
  const pageRange = `Pág. 1`;
  doc.fontSize(8)
     .fillColor(COLOR_MUTED)
     .text(
       `UCE Parking System — Documento generado automáticamente — ${pageRange}`,
       50,
       doc.page.height - 40,
       { align: "center", width: doc.page.width - 100 }
     );
}

// ─── Reporte GENERAL ─────────────────────────────────────────────────────────
function buildGeneralPDF(reportData, streamObj) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  doc.pipe(streamObj);

  const safeData = reportData || {};
  const periodo = safeData.periodo || {};
  const oc = safeData.resumen_ocupacion || {};
  const gen = safeData.resumen_general || {};
  const diasData = safeData.graficos?.ocupacion_por_dia || [];

  drawHeader(doc, "Reporte General de Ocupación y Sistema");

  // Periodo
  doc.fontSize(10).fillColor(COLOR_MUTED)
     .text(
       `Periodo: ${periodo.desde ? new Date(periodo.desde).toLocaleDateString("es-EC") : "—"} al ${periodo.hasta ? new Date(periodo.hasta).toLocaleDateString("es-EC") : "—"}`,
       { align: "right" }
     );
  doc.moveDown();

  // ── Resumen de Ocupación ──
  drawSectionTitle(doc, "Resumen de Ocupación");
  drawKV(doc, "Vehículos Ingresados",     oc.total_entradas ?? 0);
  drawKV(doc, "Vehículos Salientes",      oc.total_salidas ?? 0);
  drawKV(doc, "Vehículos Activos (Parqueados)", oc.vehiculos_activos ?? 0);
  drawKV(doc, "Estancia Promedio",        `${oc.duracion_promedio_minutos ?? 0} min`);
  drawKV(doc, "Hora Pico Estimada",       oc.hora_pico ?? "N/A");

  // ── Resumen General del Sistema ──
  drawSectionTitle(doc, "Resumen General del Sistema");
  drawKV(doc, "Tickets Emitidos",             gen.tickets_emitidos ?? 0);
  drawKV(doc, "Tickets Activos",              gen.tickets_activos ?? 0);
  drawKV(doc, "Nuevos Usuarios Registrados",  gen.nuevos_usuarios_registrados ?? 0);
  drawKV(doc, "Nuevos Vehículos Registrados", gen.nuevos_vehiculos_registrados ?? 0);
  drawKV(doc, "Total de Reservas",            gen.total_reservas ?? 0);

  // ── Detalle de Entradas por Día ──
  if (diasData.length > 0) {
    drawSectionTitle(doc, "Detalle de Entradas por Día");

    const cols = [
      { label: "Fecha",    width: 120 },
      { label: "Entradas", width: 100 }
    ];

    drawTableHeader(doc, cols);
    diasData.forEach((d, i) => {
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
        drawTableHeader(doc, cols);
      }
      drawTableRow(doc, cols, [d.fecha, d.entradas], i % 2 === 0);
    });
  }

  drawFooter(doc);
  doc.end();
}

// ─── Reporte EVENTOS ──────────────────────────────────────────────────────────
function buildEventosPDF(reportData, streamObj) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  doc.pipe(streamObj);

  const safeData = reportData || {};
  const periodo  = safeData.periodo || {};
  const eventos  = safeData.eventos || [];

  drawHeader(doc, "Reporte de Eventos del Sistema");

  doc.fontSize(10).fillColor(COLOR_MUTED)
     .text(
       `Periodo: ${periodo.desde ? new Date(periodo.desde).toLocaleDateString("es-EC") : "—"} al ${periodo.hasta ? new Date(periodo.hasta).toLocaleDateString("es-EC") : "—"}`,
       { align: "right" }
     );
  doc.moveDown();

  // ── Resumen ──
  drawSectionTitle(doc, "Resumen de Eventos");
  drawKV(doc, "Total de Eventos Registrados", eventos.length);

  // ── Tabla de Eventos ──
  drawSectionTitle(doc, "Listado de Eventos");

  if (eventos.length === 0) {
    doc.fontSize(10).fillColor(COLOR_MUTED)
       .text("No se registraron eventos en este periodo.", { align: "center" });
  } else {
    const cols = [
      { label: "ID",          width: 45  },
      { label: "Fecha/Hora",  width: 120 },
      { label: "Tipo",        width: 110 },
      { label: "Dispositivo", width: 70  },
      { label: "Descripción", width: 150 }
    ];

    drawTableHeader(doc, cols);
    eventos.forEach((evt, i) => {
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
        drawTableHeader(doc, cols);
      }
      drawTableRow(doc, cols, [
        evt.id_log,
        new Date(evt.fecha_hora || evt.created_at).toLocaleString("es-EC"),
        evt.tipo_evento?.nombre || evt.id_tipo || "N/A",
        evt.id_dispositivo || "N/A",
        (evt.descripcion || "").substring(0, 60)
      ], i % 2 === 0);
    });
  }

  drawFooter(doc);
  doc.end();
}

// ─── Compatibilidad con la función antigua (sigue funcionando) ────────────────
export function buildGeneralReportPDF(reportData, streamObj) {
  return buildGeneralPDF(reportData, streamObj);
}
