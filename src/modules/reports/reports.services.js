import supabase from "../../config/supabase.js";

// ─── Reporte de ocupación por periodo ──────────────────────────────────────────
export async function getReporteOcupacion({ fechaDesde, fechaHasta, zonaId } = {}) {
  if (!fechaDesde || !fechaHasta) {
    throw new Error("fechaDesde y fechaHasta son requeridos");
  }

  // Todos los registros del periodo
  let query = supabase
    .from("registros_acceso")
    .select(`
      id, entrada_at, salida_at, Id_Plaza,
      vehiculos ( id, placa )
    `)
    .gte("entrada_at", fechaDesde)
    .lte("entrada_at", fechaHasta)
    .order("entrada_at", { ascending: true });

  const { data: registros, error } = await query;
  if (error) throw error;

  // Filtrar por zona si se especifica
  let plazasDeLaZona = null;
  if (zonaId) {
    const { data } = await supabase
      .from("plazas")
      .select("Id_Plaza")
      .eq("Id_Zona", zonaId);
    plazasDeLaZona = new Set(data.map(p => p.Id_Plaza));
  }

  const registrosFiltrados = plazasDeLaZona
    ? registros.filter(r => r.Id_Plaza && plazasDeLaZona.has(r.Id_Plaza))
    : registros;

  // Cálculos
  const totalEntradas = registrosFiltrados.length;
  const totalSalidas = registrosFiltrados.filter(r => r.salida_at).length;
  const vehiculosActivos = registrosFiltrados.filter(r => !r.salida_at).length;

  // Duración promedio y total (solo registros completos)
  const completados = registrosFiltrados.filter(r => r.entrada_at && r.salida_at);
  let duracionTotalMin = 0;
  completados.forEach(r => {
    duracionTotalMin += (new Date(r.salida_at) - new Date(r.entrada_at)) / 60000;
  });
  const duracionPromedioMin = completados.length > 0
    ? Math.round(duracionTotalMin / completados.length)
    : 0;

  // Ocupación por hora del día
  const porHora = Array(24).fill(0);
  registrosFiltrados.forEach(r => {
    const hora = new Date(r.entrada_at).getHours();
    porHora[hora]++;
  });
  const ocupacionPorHora = porHora.map((count, hora) => ({ hora, entradas: count }));

  // Ocupación por día
  const porDia = {};
  registrosFiltrados.forEach(r => {
    const dia = new Date(r.entrada_at).toISOString().split("T")[0];
    porDia[dia] = (porDia[dia] || 0) + 1;
  });
  const ocupacionPorDia = Object.entries(porDia)
    .map(([fecha, entradas]) => ({ fecha, entradas }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Hora pico
  const maxEntradas = Math.max(...porHora);
  const horaPico = porHora.indexOf(maxEntradas);

  return {
    periodo: { desde: fechaDesde, hasta: fechaHasta },
    resumen: {
      total_entradas: totalEntradas,
      total_salidas: totalSalidas,
      vehiculos_activos: vehiculosActivos,
      duracion_promedio_minutos: duracionPromedioMin,
      hora_pico: `${String(horaPico).padStart(2, "0")}:00`
    },
    ocupacion_por_hora: ocupacionPorHora,
    ocupacion_por_dia: ocupacionPorDia
  };
}

// ─── Guardar reporte en la BD ──────────────────────────────────────────────────
export async function guardarReporte({ tipo, descripcion, datos, personaId }) {
  const { data, error } = await supabase
    .from("reportes")
    .insert({
      Tipo_Reporte: tipo || "OCUPACION",
      Descripcion: descripcion || `Reporte generado el ${new Date().toISOString()}`,
      Datos_Adjuntos_Ruta: JSON.stringify(datos),
      persona_id: personaId || null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Listar reportes guardados ─────────────────────────────────────────────────
export async function getReportes({ page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from("reportes")
    .select(
      `Id_Reporte, created_at, Tipo_Reporte, Descripcion,
       personas ( id, nombre, apellido )`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { data, total: count, page, limit };
}
