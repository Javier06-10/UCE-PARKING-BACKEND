import supabase from "../../config/supabase.js";

// Estado activo de zona (id_estado = 1 = Activa)
const ZONA_ACTIVA = 1;

// ─── Helper: determinar si el usuario autenticado es tipo movil ───────────────
export async function esUsuarioMovil(userId) {
  const { data } = await supabase
    .from("usuario")
    .select("tipo_usuario ( nombre )")
    .eq("id", userId)
    .maybeSingle();

  const nombre = data?.tipo_usuario?.nombre?.toLowerCase() ?? "";
  // Es movil si su tipo NO es admin ni empleado
  return !["admin", "administrador", "empleado", "superadmin"].some(t => nombre.includes(t));
}

// ─── Estado general del parqueadero ───────────────────────────────────────────
// esMovil = true  → solo zonas activas + tipo_zona.visible_movil + sin plazas admin
// esMovil = false → todo sin restricciones
export async function getParkingStatus({ esMovil = false } = {}) {
  let query = supabase
    .from("zona")
    .select(`
      id_zona, nombre, capacidad_total, id_estado, id_tipo,
      latitud, longitud, direccion, nivel_piso, area_geografica,
      tipo_zona ( id_tipo, nombre, visible_movil ),
      plaza (
        id_plaza, numero_plaza, id_estado, id_tipo,
        estado_plaza ( id_estado, nombre ),
        tipo_plaza ( id_tipo, nombre )
      )
    `);

  // Feature 3: solo zonas activas para usuarios moviles
  if (esMovil) {
    query = query.eq("id_estado", ZONA_ACTIVA);
  }

  const { data: zonas, error: zonasError } = await query;
  if (zonasError) throw zonasError;

  const resumen = zonas
    // Feature 3: filtrar por visible_movil del tipo de zona
    .filter(zona => {
      if (!esMovil) return true;
      return zona.tipo_zona?.visible_movil !== false;
    })
    .map(zona => {
      let plazas = zona.plaza || [];

      // Feature 2: excluir plazas administrativas para usuarios moviles
      if (esMovil) {
        plazas = plazas.filter(p => {
          const tipoNombre = p.tipo_plaza?.nombre?.toLowerCase() ?? "";
          return !tipoNombre.includes("admin");
        });
      }

      const ocupadas = plazas.filter(p => p.id_estado === 2).length;
      const libres   = plazas.filter(p => p.id_estado === 1).length;
      const total    = plazas.length;

      return {
        id_zona:             zona.id_zona,
        nombre:              zona.nombre,
        capacidad_total:     total,
        latitud:             zona.latitud,
        longitud:            zona.longitud,
        direccion:           zona.direccion,
        nivel_piso:          zona.nivel_piso,
        area_geografica:     zona.area_geografica,
        ocupadas,
        libres,
        porcentaje_ocupacion: total > 0 ? Math.round((ocupadas / total) * 100) : 0,
        plazas
      };
    });

  const totalCapacidad = resumen.reduce((s, z) => s + z.capacidad_total, 0);
  const totalOcupadas  = resumen.reduce((s, z) => s + z.ocupadas, 0);
  const totalLibres    = resumen.reduce((s, z) => s + z.libres, 0);

  return {
    total_capacidad:      totalCapacidad,
    total_ocupadas:       totalOcupadas,
    total_libres:         totalLibres,
    porcentaje_ocupacion: totalCapacidad > 0
      ? Math.round((totalOcupadas / totalCapacidad) * 100)
      : 0,
    zonas: resumen
  };
}

// ─── Obtener plazas filtradas ──────────────────────────────────────────────────
export async function getPlazas({ zonaId, estado, esMovil = false } = {}) {
  // Feature 3: para movil obtener primero las zonas activas y visibles
  let zonaIdsPermitidos = null;
  if (esMovil) {
    const { data: zonasActivas } = await supabase
      .from("zona")
      .select("id_zona, tipo_zona ( visible_movil )")
      .eq("id_estado", ZONA_ACTIVA);

    zonaIdsPermitidos = (zonasActivas ?? [])
      .filter(z => z.tipo_zona?.visible_movil !== false)
      .map(z => z.id_zona);

    if (zonaIdsPermitidos.length === 0) return [];
  }

  let query = supabase
    .from("plaza")
    .select(`
      id_plaza, numero_plaza, amplitud, longitud, id_estado, id_tipo,
      estado_plaza ( id_estado, nombre ),
      tipo_plaza   ( id_tipo, nombre ),
      zona         ( id_zona, nombre )
    `)
    .order("id_plaza");

  if (zonaId) query = query.eq("id_zona", zonaId);
  if (estado) query = query.eq("id_estado", estado);

  // Feature 3: restringir a zonas activas
  if (zonaIdsPermitidos) {
    query = query.in("id_zona", zonaIdsPermitidos);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Feature 2: excluir plazas administrativas para movil
  if (esMovil) {
    return data.filter(p => {
      const tipoNombre = p.tipo_plaza?.nombre?.toLowerCase() ?? "";
      return !tipoNombre.includes("admin");
    });
  }

  return data;
}
