import ExcelJS from 'exceljs';

export async function buildReporteExcel(tipo, reportData, streamObj) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UCE Parking System';
  workbook.created = new Date();

  // Choose the structure based on the type
  if (tipo === "EVENTOS") {
    buildEventosSheet(workbook, reportData);
  } else {
    buildGeneralSheet(workbook, reportData);
  }

  // Stream directly to the provided output (response)
  await workbook.xlsx.write(streamObj);
}

function buildEventosSheet(workbook, reportData) {
  const sheet = workbook.addWorksheet('Registro de Eventos');
  
  // Header section
  sheet.mergeCells('A1:C1');
  sheet.getCell('A1').value = 'REPORTE DE EVENTOS DEL SISTEMA';
  sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0056B3' } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  
  sheet.getCell('A2').value = `Periodo: ${new Date(reportData.periodo.desde).toLocaleDateString()} al ${new Date(reportData.periodo.hasta).toLocaleDateString()}`;
  sheet.getCell('A3').value = `Generado el: ${new Date().toLocaleString()}`;
  sheet.getCell('A2').font = { italic: true };
  sheet.getCell('A3').font = { italic: true };

  // Data Table Headers
  sheet.getRow(5).values = ['ID Log', 'Fecha Creación', 'Tipo Evento', 'ID Dispositivo', 'Detalle Opcional'];
  sheet.getRow(5).font = { bold: true };
  sheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

  sheet.columns = [
    { key: 'id', width: 10 },
    { key: 'fecha', width: 25 },
    { key: 'tipo', width: 30 },
    { key: 'dispositivo', width: 15 },
    { key: 'detalle', width: 40 }
  ];

  // Fill data
  if (reportData.eventos && reportData.eventos.length > 0) {
    reportData.eventos.forEach(evt => {
      sheet.addRow({
        id: evt.Id_Log,
        fecha: new Date(evt.Fecha_Creacion).toLocaleString(),
        tipo: evt.Tipo_Evento,
        dispositivo: evt.id_dispositivo || 'N/A',
        detalle: evt.detalle || ''
      });
    });
  } else {
    sheet.addRow(['No se registraron eventos en este periodo']);
    sheet.mergeCells(`A6:E6`);
    sheet.getCell('A6').alignment = { horizontal: 'center' };
  }
}

function buildGeneralSheet(workbook, reportData) {
  const sheet = workbook.addWorksheet('Reporte General y Ocupación');

  // Title section
  sheet.mergeCells('A1:B1');
  sheet.getCell('A1').value = 'REPORTE DE OCUPACIÓN Y SISTEMA GENERAL';
  sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0056B3' } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.getCell('A2').value = `Periodo: ${new Date(reportData.periodo.desde).toLocaleDateString()} al ${new Date(reportData.periodo.hasta).toLocaleDateString()}`;
  sheet.getCell('A3').value = `Generado el: ${new Date().toLocaleString()}`;

  // Seccion de Ocupacion
  sheet.mergeCells('A5:B5');
  sheet.getCell('A5').value = 'RESUMEN DE OCUPACIÓN';
  sheet.getCell('A5').font = { bold: true };
  sheet.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECECEC' } };
  
  const oc = reportData.resumen_ocupacion || {};
  sheet.getRow(6).values = ['Vehículos Ingresados', oc.total_entradas];
  sheet.getRow(7).values = ['Vehículos Salientes', oc.total_salidas];
  sheet.getRow(8).values = ['Vehículos Activos (Parqueados)', oc.vehiculos_activos];
  sheet.getRow(9).values = ['Estancia Promedio (min)', oc.duracion_promedio_minutos];
  sheet.getRow(10).values = ['Hora Pico Estimada', oc.hora_pico];

  // Seccion General
  sheet.mergeCells('A12:B12');
  sheet.getCell('A12').value = 'RESUMEN DE SISTEMA / FINANCIERO';
  sheet.getCell('A12').font = { bold: true };
  sheet.getCell('A12').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECECEC' } };
  
  const gen = reportData.resumen_general || {};
  sheet.getRow(13).values = ['Tickets Emitidos', gen.tickets_emitidos];
  sheet.getRow(14).values = ['Tickets Activos', gen.tickets_activos];
  sheet.getRow(15).values = ['Nuevos Usuarios Registrados', gen.nuevos_usuarios_registrados];
  sheet.getRow(16).values = ['Nuevos Vehículos Registrados', gen.nuevos_vehiculos_registrados];
  sheet.getRow(17).values = ['Total de Reservas', gen.total_reservas];

  // Configurar anchos
  sheet.getColumn('A').width = 35;
  sheet.getColumn('B').width = 25;

  // Add Day by day array if available
  if (reportData.graficos && reportData.graficos.ocupacion_por_dia && reportData.graficos.ocupacion_por_dia.length > 0) {
      sheet.mergeCells('D5:E5');
      sheet.getCell('D5').value = 'Detalle de Entradas Diarias';
      sheet.getCell('D5').font = { bold: true };
      sheet.getCell('D5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECECEC' } };
      
      sheet.getRow(6).getCell('D').value = 'Fecha';
      sheet.getRow(6).getCell('E').value = 'Entradas';
      sheet.getRow(6).getCell('D').font = { bold: true };
      sheet.getRow(6).getCell('E').font = { bold: true };

      sheet.getColumn('D').width = 15;
      sheet.getColumn('E').width = 15;

      let rObj = 7;
      reportData.graficos.ocupacion_por_dia.forEach(diaInfo => {
        sheet.getRow(rObj).getCell('D').value = diaInfo.fecha;
        sheet.getRow(rObj).getCell('E').value = diaInfo.entradas;
        rObj++;
      });
  }
}
