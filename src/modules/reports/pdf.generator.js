import PDFDocument from 'pdfkit';

export function buildGeneralReportPDF(reportData, streamObj) {
  // Create a document
  const doc = new PDFDocument({ margin: 50 });

  // Pipe its output somewhere, like to a file or HTTP response
  doc.pipe(streamObj);

  // Add the title and header
  doc.fontSize(20).text('Reporte General de Operaciones', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Fecha de Emisión: ${new Date().toLocaleString()}`, { align: 'right' });
  doc.text(`Periodo: ${new Date(reportData.periodo.desde).toLocaleDateString()} al ${new Date(reportData.periodo.hasta).toLocaleDateString()}`, { align: 'right' });
  doc.moveDown(2);

  // Section 1: Resumen de Ocupación
  doc.fontSize(16).fillColor('#0056b3').text('Resumen de Ocupación', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('black');
  
  const { resumen_ocupacion: oc } = reportData;
  doc.text(`- Vehículos Ingresados: ${oc.total_entradas}`);
  doc.text(`- Vehículos Salientes: ${oc.total_salidas}`);
  doc.text(`- Vehículos Activos (Parqueados): ${oc.vehiculos_activos}`);
  doc.text(`- Estancia Promedio: ${oc.duracion_promedio_minutos} minutos`);
  doc.text(`- Hora Pico Estimada: ${oc.hora_pico}`);
  doc.moveDown();

  // Section 2: Resumen General (Financiero / Usuarios)
  doc.fontSize(16).fillColor('#0056b3').text('Resumen General (Sistema)', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('black');

  const { resumen_general: gen } = reportData;
  doc.text(`- Tickets Emitidos Totales: ${gen.tickets_emitidos}`);
  doc.text(`- Tickets Activos: ${gen.tickets_activos}`);
  doc.text(`- Nuevos Usuarios Registrados: ${gen.nuevos_usuarios_registrados}`);
  doc.text(`- Nuevos Vehículos Registrados: ${gen.nuevos_vehiculos_registrados}`);
  doc.text(`- Total de Reservas en el Periodo: ${gen.total_reservas}`);
  doc.moveDown();

  // Section 3: Ocupación Diaria
  doc.fontSize(16).fillColor('#0056b3').text('Detalle de Ocupación por Día', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('black');
  
  if (reportData.graficos && reportData.graficos.ocupacion_por_dia) {
    reportData.graficos.ocupacion_por_dia.forEach((diaInfo) => {
        doc.text(`  • Fecha: ${diaInfo.fecha} -> Entradas: ${diaInfo.entradas}`);
    });
  } else {
    doc.text('No hay detalles diarios disponibles.');
  }

  // Finalize PDF file
  doc.end();
}
