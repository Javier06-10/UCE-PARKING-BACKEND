import supabase from "../../config/supabase.js";

// ─── Reporte General (Ocupacion y Actividad) ───────────────────────────────────
export async function getReporteGeneral({ fechaDesde, fechaHasta, zonaId, organizacionId } = {}) {
  if (!fechaDesde || !fechaHasta) {
    throw new Error("fechaDesde y fechaHasta son requeridos");
  }

  if (!organizacionId) {
    throw new Error("organizacionId es requerido para filtrar el reporte");
  }

  // 1. Registros de acceso
  let queryAccesos = supabase
    .from("acceso")
    .select("id_registro, entrada_at, salida_at, id_plaza")
    .eq("organizacion_id", organizacionId)
    .gte("entrada_at", fechaDesde)
    .lte("entrada_at", fechaHasta)
    .order("entrada_at", { ascending: true });

  const { data: registros, error: errAccesos } = await queryAccesos;
  if (errAccesos) throw errAccesos;

  // Filtrar por zona si se especifica
  let registrosFiltrados = registros;
  if (zonaId) {
    const { data: plazasZona } = await supabase
      .from("plaza")
      .select("id_plaza")
      .eq("id_zona", zonaId)
      .eq("organizacion_id", organizacionId);
    const plazasDeLaZona = new Set((plazasZona || []).map(p => p.id_plaza));
    registrosFiltrados = registros.filter(r => r.id_plaza && plazasDeLaZona.has(r.id_plaza));
  }

  // Calculos de ocupacion
  const totalEntradas = registrosFiltrados.length;
  const totalSalidas = registrosFiltrados.filter(r => r.salida_at).length;
  const vehiculosActivos = registrosFiltrados.filter(r => !r.salida_at).length;

  const completados = registrosFiltrados.filter(r => r.entrada_at && r.salida_at);
  let duracionTotalMin = 0;
  completados.forEach(r => {
    duracionTotalMin += (new Date(r.salida_at) - new Date(r.entrada_at)) / 60000;
  });
  const duracionPromedioMin = completados.length > 0
    ? Math.round(duracionTotalMin / completados.length)
    : 0;

  // Ocupacion por hora del dia
  const porHora = Array(24).fill(0);
  registrosFiltrados.forEach(r => {
    const hora = new Date(r.entrada_at).getHours();
    porHora[hora]++;
  });
  const ocupacionPorHora = porHora.map((count, hora) => ({ hora, entradas: count }));

  const maxEntradas = Math.max(...porHora);
  const horaPico = totalEntradas > 0
    ? `${String(porHora.indexOf(maxEntradas)).padStart(2, "0")}:00`
    : "N/A";

  // Ocupacion por dia
  const porDia = {};
  registrosFiltrados.forEach(r => {
    const d = new Date(r.entrada_at);
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
    .eq("organizacion_id", organizacionId)
    .gte("fecha_hora_emision", fechaDesde)
    .lte("fecha_hora_emision", fechaHasta);

  const { count: ticketsActivos } = await supabase
    .from("ticket")
    .select("id_ticket", { count: "exact", head: true })
    .eq("organizacion_id", organizacionId)
    .gte("fecha_hora_emision", fechaDesde)
    .lte("fecha_hora_emision", fechaHasta)
    .eq("id_estado", 1);

  // 3. Vehiculos registrados
  const { count: nuevosVehiculos } = await supabase
    .from("vehiculo")
    .select("id_vehiculo", { count: "exact", head: true })
    .eq("organizacion_id", organizacionId)
    .gte("created_at", fechaDesde)
    .lte("created_at", fechaHasta);

  // 4. Nuevos usuarios
  const { count: nuevosUsuarios } = await supabase
    .from("usuario")
    .select("id", { count: "exact", head: true })
    .eq("organizacion_id", organizacionId)
    .gte("created_at", fechaDesde)
    .lte("created_at", fechaHasta);

  // 5. Reservas
  const { count: totalReservas } = await supabase
    .from("reserva")
    .select("id_reserva", { count: "exact", head: true })
    .eq("organizacion_id", organizacionId)
    .gte("created_at", fechaDesde)
    .lte("created_at", fechaHasta);

  return {
    periodo: { desde: fechaDesde, hasta: fechaHasta },
    resumen_ocupacion: {
      total_entradas: totalEntradas,
      total_salidas: totalSalidas,
      vehiculos_activos: vehiculosActivos,
      duracion_promedio_minutos: duracionPromedioMin,
      hora_pico: horaPico
    },
    resumen_general: {
      tickets_emitidos: ticketsEmitidos || 0,
      tickets_activos: ticketsActivos || 0,
      nuevos_vehiculos_registrados: nuevosVehiculos || 0,
      nuevos_usuarios_registrados: nuevosUsuarios || 0,
      total_reservas: totalReservas || 0
    },
    graficos: {
      ocupacion_por_hora: ocupacionPorHora,
      ocupacion_por_dia: ocupacionPorDia
    }
  };
}

// ─── Reporte de Eventos ───────────────────────────────────────────────────────
export async function getReporteEventos({ fechaDesde, fechaHasta, organizacionId } = {}) {
  if (!fechaDesde || !fechaHasta) {
    throw new Error("fechaDesde y fechaHasta son requeridos");
  }

  if (!organizacionId) {
    throw new Error("organizacionId es requerido");
  }

  const { data: eventos, error } = await supabase
    .from("evento")
    .select(`
      id_log, fecha_hora, descripcion, id_dispositivo, created_at,
      tipo_evento ( id_tipo, nombre ),
      origen_evento ( id_origen, nombre )
    `)
    .eq("organizacion_id", organizacionId)
    .gte("created_at", fechaDesde)
    .lte("created_at", fechaHasta)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return {
    periodo: { desde: fechaDesde, hasta: fechaHasta },
    eventos: eventos || []
  };
}

// ─── Guardar reporte en la BD ──────────────────────────────────────────────────
export async function guardarReporte({ tipo, descripcion, datos, personaId, organizacion_id }) {
  const safeDesc = (descripcion || `Reporte generado el ${new Date().toISOString()}`).substring(0, 250);

  let ruta = JSON.stringify(datos);

  // FIX: Si el JSON es muy largo para la columna varchar(255) de la BD (Supabase),
  // guardamos un placeholder para que el controller lo recalcule al previsualizar/descargar.
  if (ruta.length > 250) {
    console.log(`[reports] Datos demasiado largos (${ruta.length} chars), truncando para evitar error DB.`);
    ruta = JSON.stringify({
      resumen: "Data truncada por limite de columna",
      periodo: datos.periodo || { desde: null, hasta: null },
      organizacionId: organizacion_id
    });
  }

  // Buscar id del tipo_reporte por nombre
  const { data: tipoRow } = await supabase
    .from("tipo_reporte")
    .select("id_tipo")
    .eq("nombre", tipo || "GENERAL")
    .maybeSingle();

  const { data, error } = await supabase
    .from("reporte")
    .insert({
      ruta_adjunto: ruta,
      descripcion: safeDesc,
      id_persona: personaId || null,
      organizacion_id: organizacion_id || 1,
      id_tipo: tipoRow?.id_tipo || null
    })
    .select()
    .single();

  if (error) {
    console.error("Error al guardar reporte:", error.message);
    throw new Error("Error al guardar en BD: " + error.message);
  }
  return data;
}

// ─── Listar reportes guardados ─────────────────────────────────────────────────
export async function getReportes({ page = 1, limit = 20 } = {}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from("reporte")
    .select(
      `id_reporte, created_at, descripcion,
       tipo_reporte ( id_tipo, nombre ),
       persona ( id_persona, nombre, apellido )`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { data, total: count, page, limit };
}
