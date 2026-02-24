import supabase from "../../config/supabase.js";

// ─── Estado general del parqueadero (snapshot para la app) ─────────────────────
export async function getParkingStatus() {
  // Zonas con sus plazas
  const { data: zonas, error: zonasError } = await supabase
    .from("zonas_estacionamiento")
    .select(`
      Id_Zona, Nombre_Zona, Capacidad_Total,
      plazas ( Id_Plaza, Numero_Plaza, Estado_Actual, id_estado,
        estado_plaza ( id_estado, nombre_estado )
      )
    `);

  if (zonasError) throw zonasError;

  // Calcular resumen por zona
  const resumen = zonas.map(zona => {
    const plazas = zona.plazas || [];
    const ocupadas = plazas.filter(p => p.id_estado === 2).length;
    const libres = plazas.filter(p => p.id_estado === 1).length;

    return {
      id_zona: zona.Id_Zona,
      nombre: zona.Nombre_Zona,
      capacidad_total: zona.Capacidad_Total,
      ocupadas,
      libres,
      porcentaje_ocupacion: zona.Capacidad_Total > 0
        ? Math.round((ocupadas / zona.Capacidad_Total) * 100)
        : 0,
      plazas
    };
  });

  // Totales globales
  const totalCapacidad = resumen.reduce((s, z) => s + z.capacidad_total, 0);
  const totalOcupadas = resumen.reduce((s, z) => s + z.ocupadas, 0);
  const totalLibres = resumen.reduce((s, z) => s + z.libres, 0);

  return {
    total_capacidad: totalCapacidad,
    total_ocupadas: totalOcupadas,
    total_libres: totalLibres,
    porcentaje_ocupacion: totalCapacidad > 0
      ? Math.round((totalOcupadas / totalCapacidad) * 100)
      : 0,
    zonas: resumen
  };
}

// ─── Obtener plazas filtradas ──────────────────────────────────────────────────
export async function getPlazas({ zonaId, estado } = {}) {
  let query = supabase
    .from("plazas")
    .select(`
      Id_Plaza, Numero_Plaza, Estado_Actual, Amplitud, Longitud, id_estado,
      estado_plaza ( id_estado, nombre_estado ),
      zonas_estacionamiento ( Id_Zona, Nombre_Zona )
    `)
    .order("Id_Plaza");

  if (zonaId) query = query.eq("Id_Zona", zonaId);
  if (estado) query = query.eq("id_estado", estado);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
