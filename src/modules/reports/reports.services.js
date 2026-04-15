import supabase from "../../config/supabase.js";

// ─── Reporte General (Ocupación y Actividad) ───────────────────────────────────
export async function getReporteGeneral({ fechaDesde, fechaHasta, zonaId } = {}) {
  if (!fechaDesde || !fechaHasta) {
    throw new Error("fechaDesde y fechaHasta son requeridos");
  }

  // 1. Registros de Acceso
  let queryAccesos = supabase
    .from("acceso")
    .select(`id_registro, entrada_at, salida_at, id_plaza`)
    .gte("entrada_at", fechaDesde)
    .lte("entrada_at", fechaHasta)
    .order("entrada_at", { ascending: true });

  const { data: registros, error: errAccesos } = await queryAccesos;
  if (errAccesos) throw errAccesos;

  let registrosFiltrados = registros;
  if (zonaId) {
    const { data: plazasZona } = await supabase
      .from("plaza")
      .select("id_plaza")
      .eq("id_zona", zonaId);
    const plazasDeLaZona = new Set((plazasZona || []).map(p => p.id_plaza));
    registrosFiltrados = registros.filter(r => r.id_plaza && plazasDeLaZona.has(r.id_plaza));
  }

  const totalEntradas    = registrosFiltrados.length;
  const totalSalidas     = registrosFiltrados.filter(r => r.salida_at).length;
  const vehiculosActivos = registrosFiltrados.filter(r => !r.salida_at).length;

  const completados = registrosFiltrados.filter(r => r.entrada_at && r.salida_at);
  let duracionTotalMin = 0;
  completados.forEach(r => {
    duracionTotalMin += (new Date(r.salida_at) - new Date(r.entrada_at)) / 60000;
  });
  const duracionPromedioMin = completados.length > 0 ? Math.round(duracionTotalMin / completados.length) : 0;

  const porHora = Array(24).fill(0);
  registrosFiltrados.forEach(r => {
    const hora = new Date(r.entrada_at).getHours();
    porHora[hora]++;
  });
  const ocupacionPorHora = porHora.map((count, hora) => ({ hora, entradas: count }));
  const maxEntradas = Math.max(...porHora);
  const horaPico = totalEntradas > 0 ? `${String(porHora.indexOf(maxEntradas)).padStart(2, "0")}:00` : "N/A";

  const porDia = {};
  registrosFiltrados.forEach(r => {
    const d   = new Date(r.entrada_at);
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    porDia[dia] = (porDia[dia] || 0) + 1;
  });
  const ocupacionPorDia = Object.entries(porDia)
    .map(([fecha, entradas]) => ({ fecha, entradas }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // 2. Tickets
  const { count: ticketsEmitidos } = await supabase
    .from("ticket")
    .select("id_ticket", { count: "exact", head: true })
    .gte("fecha_hora_emision", fechaDesde)
    .lte("fecha_hora_emision", fechaHasta);

  const { count: ticketsActivos } = await supabase
    .from("ticket")
    .select("id_ticket", { count: "exact", head: true })
    .gte("fecha_hora_emision", fechaDesde)
    .lte("fecha_hora_emision", fechaHasta)
    .eq("id_estado", 1);

  // 3. Vehículos Registrados
  const { count: nuevosVehiculos } = await supabase
    .from("vehiculo")
    .select("id_vehiculo", { count: "exact", head: true })
    .gte("created_at", fechaDesde)
    .lte("created_at", fechaHasta);

  // 4. Nuevos Usuarios
  const { count: nuevosUsuarios } = await supabase
    .from("usuario")
    .select("id", { count: "exact", head: true })
    .gte("created_at", fechaDesde)
    .lte("created_at", fechaHasta);

  // 5. Reservas
  const { count: totalReservas } = await supabase
    .from("reserva")
    .select("id_reserva", { count: "exact", head: true })
    .gte("created_at", fechaDesde)
    .lte("created_at", fechaHasta);

  return {
    periodo: { desde: fechaDesde, hasta: fechaHasta },
    resumen_ocupacion: {
      total_entradas:           totalEntradas,
      total_salidas:            totalSalidas,
      vehiculos_activos:        vehiculosActivos,
      duracion_promedio_minutos: duracionPromedioMin,
      hora_pico:                horaPico,
    },
    resumen_general: {
      tickets_emitidos:             ticketsEmitidos || 0,
      tickets_activos:              ticketsActivos  || 0,
      nuevos_vehiculos_registrados: nuevosVehiculos || 0,
      nuevos_usuarios_registrados:  nuevosUsuarios  || 0,
      total_reservas:               totalReservas   || 0,
    },
    graficos: {
      ocupacion_por_hora: ocupacionPorHora,
      ocupacion_por_dia:  ocupacionPorDia,
    },
  };
}

// ─── Reporte de Eventos ────────────────────────────────────────────────────────
export async function getReporteEventos({ fechaDesde, fechaHasta } = {}) {
  if (!fechaDesde || !fechaHasta) {
    throw new Error("fechaDesde y fechaHasta son requeridos");
  }

  const { data: eventos, error } = await supabase
    .from("evento")
    .select(`
      id_log, fecha_hora, descripcion, id_plaza, created_at, id_persona,
      tipo:id_tipo ( id_tipo, nombre ),
      origen_evento:id_origen_evento ( id_origen, nombre )
    `)
    .gte("fecha_hora", fechaDesde)
    .lte("fecha_hora", fechaHasta)
    .order("fecha_hora", { ascending: false });

  if (error) {
    console.error("Error obteniendo eventos:", error);
    throw error;
  }

  return {
    periodo: { desde: fechaDesde, hasta: fechaHasta },
    eventos: eventos || [],
  };
}

// ─── Guardar reporte en la BD ──────────────────────────────────────────────────
export async function guardarReporte({ tipo, descripcion, datos, personaId, organizacion_id = null }) {
  const safeDesc = (descripcion || `Reporte generado el ${new Date().toISOString()}`).substring(0, 250);

  const fullJsonString = JSON.stringify(datos);
  const safeJsonString = fullJsonString.length > 250
    ? JSON.stringify({
        resumen: "Data truncada por limite de bd",
        periodo: datos.periodo || {},
        preview: fullJsonString.substring(0, 100) + "...",
      })
    : fullJsonString;

  const { data, error } = await supabase
    .from("reporte")
    .insert({
      tipo_reporte:  tipo || "OCUPACION",
      descripcion:   safeDesc,
      ruta_adjunto:  safeJsonString,
      id_persona:    personaId       || null,
      organizacion_id: organizacion_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase insert error in guardarReporte:", error.message, error.details);
    throw new Error("Error al guardar en BD: " + error.message);
  }
  return data;
}

// ─── Listar reportes guardados ─────────────────────────────────────────────────
export async function getReportes({ page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  const { data, error, count } = await supabase
    .from("reporte")
    .select(
      `id_reporte, created_at, tipo_reporte, descripcion,
       persona ( id_persona, nombre, apellido )`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { data, total: count, page, limit };
}
