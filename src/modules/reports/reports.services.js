import supabase from "../../config/supabase.js";

// ─── Reporte General (Ocupación y Actividad) ───────────────────────────────────
export async function getReporteGeneral({ fechaDesde, fechaHasta, zonaId } = {}) {
  if (!fechaDesde || !fechaHasta) {
    throw new Error("fechaDesde y fechaHasta son requeridos");
  }

  // 1. Registros de Acceso (Ocupación)
  let queryAccesos = supabase
    .from("registros_acceso")
    .select(`id, entrada_at, salida_at, Id_Plaza`)
    .gte("entrada_at", fechaDesde)
    .lte("entrada_at", fechaHasta)
    .order("entrada_at", { ascending: true });

  const { data: registros, error: errAccesos } = await queryAccesos;
  if (errAccesos) throw errAccesos;

  // Filtrar por zona si se especifica
  let registrosFiltrados = registros;
  if (zonaId) {
    const { data: plazasZona } = await supabase
      .from("plazas")
      .select("Id_Plaza")
      .eq("Id_Zona", zonaId);
    const plazasDeLaZona = new Set((plazasZona || []).map(p => p.Id_Plaza));
    registrosFiltrados = registros.filter(r => r.Id_Plaza && plazasDeLaZona.has(r.Id_Plaza));
  }

  // Cálculos Ocupación
  const totalEntradas = registrosFiltrados.length;
  const totalSalidas = registrosFiltrados.filter(r => r.salida_at).length;
  const vehiculosActivos = registrosFiltrados.filter(r => !r.salida_at).length;

  const completados = registrosFiltrados.filter(r => r.entrada_at && r.salida_at);
  let duracionTotalMin = 0;
  completados.forEach(r => {
    duracionTotalMin += (new Date(r.salida_at) - new Date(r.entrada_at)) / 60000;
  });
  const duracionPromedioMin = completados.length > 0 ? Math.round(duracionTotalMin / completados.length) : 0;

  // Ocupación por hora del día
  const porHora = Array(24).fill(0);
  registrosFiltrados.forEach(r => {
    const hora = new Date(r.entrada_at).getHours();
    porHora[hora]++;
  });
  const ocupacionPorHora = porHora.map((count, hora) => ({ hora, entradas: count }));
  
  const maxEntradas = Math.max(...porHora);
  const horaPico = totalEntradas > 0 ? `${String(porHora.indexOf(maxEntradas)).padStart(2, "0")}:00` : "N/A";

  // Ocupación por día (Fixed timezone issue)
  const porDia = {};
  registrosFiltrados.forEach(r => {
    // Convert to local date string format YYYY-MM-DD reliably
    const d = new Date(r.entrada_at);
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    porDia[dia] = (porDia[dia] || 0) + 1;
  });
  const ocupacionPorDia = Object.entries(porDia)
    .map(([fecha, entradas]) => ({ fecha, entradas }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // 2. Tickets
  const { count: ticketsEmitidos, error: errT1 } = await supabase
    .from("tickets")
    .select("Id_Ticket", { count: "exact", head: true })
    .gte("Fecha_Hora_Emision", fechaDesde)
    .lte("Fecha_Hora_Emision", fechaHasta);

  const { count: ticketsActivos, error: errT2 } = await supabase
    .from("tickets")
    .select("Id_Ticket", { count: "exact", head: true })
    .gte("Fecha_Hora_Emision", fechaDesde)
    .lte("Fecha_Hora_Emision", fechaHasta)
    .eq("id_estado", 1); // 1 = Activo según el sistema

  // 3. Vehículos Registrados
  const { count: nuevosVehiculos, error: errV } = await supabase
    .from("vehiculos")
    .select("id", { count: "exact", head: true })
    .gte("Fecha_Registro", fechaDesde)
    .lte("Fecha_Registro", fechaHasta);

  // 4. Nuevos Usuarios
  const { count: nuevosUsuarios, error: errU } = await supabase
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .gte("created_at", fechaDesde)
    .lte("created_at", fechaHasta);

  // 5. Reservas
  const { count: totalReservas, error: errR } = await supabase
    .from("RESERVA")
    .select("Id_Reserva", { count: "exact", head: true })
    .gte("created_at", fechaDesde)
    .lte("created_at", fechaHasta);

  if (errT1 || errT2 || errV || errU || errR) {
    console.error("Error obteniendo datos generales para reporte:", { errT1, errT2, errV, errU, errR });
  }

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

// ─── Reporte de Eventos (Hardware/Sistema) ──────────────────────────────────
export async function getReporteEventos({ fechaDesde, fechaHasta } = {}) {
  if (!fechaDesde || !fechaHasta) {
    throw new Error("fechaDesde y fechaHasta son requeridos");
  }

  const { data: eventos, error } = await supabase
    .from("eventos")
    .select("*")
    .gte("Fecha_Creacion", fechaDesde)
    .lte("Fecha_Creacion", fechaHasta)
    .order("Fecha_Creacion", { ascending: false });

  if (error) {
    console.error("Error obteniendo eventos:", error);
    throw error;
  }

  return {
    periodo: { desde: fechaDesde, hasta: fechaHasta },
    eventos: eventos || []
  };
}

// ─── Guardar reporte en la BD ──────────────────────────────────────────────────
export async function guardarReporte({ tipo, descripcion, datos, personaId }) {
  // Truncate desc so it doesn't crash if it's too long
  const safeDesc = (descripcion || `Reporte generado el ${new Date().toISOString()}`).substring(0, 250);
  
  // Convert datos to JSON string, but if Datos_Adjuntos_Ruta is just a varchar we need to truncate.
  // Ideally this would be a JSON or TEXT column, but we will store a safe summary snippet.
  const fullJsonString = JSON.stringify(datos);
  const safeJsonString = fullJsonString.length > 250 
      ? JSON.stringify({ 
          resumen: "Data truncada por limite de bd", 
          periodo: datos.periodo || {},
          preview: fullJsonString.substring(0, 100) + "..." 
        })
      : fullJsonString;

  const { data, error } = await supabase
    .from("reportes")
    .insert({
      Tipo_Reporte: tipo || "OCUPACION",
      Descripcion: safeDesc,
      Datos_Adjuntos_Ruta: safeJsonString,
      persona_id: personaId || null
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
