import supabase from "../../config/supabase.js";

// ─── Estado general del parqueadero ───────────────────────────────────────────
export async function getParkingStatus() {
  const { data: zonas, error: zonasError } = await supabase
    .from("zona")
    .select(`
      id_zona, nombre, capacidad_total,
      plaza ( id_plaza, numero_plaza, id_estado,
        estado_plaza ( id_estado, nombre )
      )
    `);

  if (zonasError) throw zonasError;

  const resumen = zonas.map(zona => {
    const plazas = zona.plaza || [];
    const ocupadas = plazas.filter(p => p.id_estado === 2).length;
    const libres = plazas.filter(p => p.id_estado === 1).length;

    return {
      id_zona: zona.id_zona,
      nombre: zona.nombre,
      capacidad_total: zona.capacidad_total,
      ocupadas,
      libres,
      porcentaje_ocupacion: zona.capacidad_total > 0
        ? Math.round((ocupadas / zona.capacidad_total) * 100)
        : 0,
      plazas
    };
  });

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
    .from("plaza")
    .select(`
      id_plaza, numero_plaza, amplitud, longitud, id_estado,
      estado_plaza ( id_estado, nombre ),
      zona ( id_zona, nombre )
    `)
    .order("id_plaza");

  if (zonaId) query = query.eq("id_zona", zonaId);
  if (estado) query = query.eq("id_estado", estado);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
