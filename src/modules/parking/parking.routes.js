// src/modules/parking/parking.routes.js
import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { getParkingStatus, getPlazas } from "./parking.status.js";
import supabase from "../../config/supabase.js";

const router = express.Router();
router.use(verifyToken);

// ─── Helper: obtener nivel de privilegio del usuario ─────────────────────────
async function getNivelPrivilegio(userId) {
  const { data: usuario } = await supabase
    .from("usuario")
    .select("id_persona, organizacion_id")
    .eq("id", userId)
    .maybeSingle();

  if (!usuario) return { nivel: 1, orgId: null };

  const { data: empleado } = await supabase
    .from("empleado")
    .select("cargo(nivel_privilegio)")
    .eq("id_persona", usuario.id_persona)
    .maybeSingle();

  return {
    nivel: empleado?.cargo?.nivel_privilegio ?? 1,
    orgId: usuario.organizacion_id
  };
}

// ─── Helper: filtrar zonas visibles para el usuario ──────────────────────────
// Reglas:
//   1. Solo zonas con id_estado = 1 (Activa)
//   2. Solo zonas cuyo tipo sea "General" o accesibles (no VIP ni Administrativo)
//      a menos que el nivel_privilegio del usuario lo permita
//   3. nivel_minimo_privilegio de config_reserva_zona debe ser <= nivel del usuario
function filtrarZonasMovil(zonas, nivelUsuario, tiposAccesibles) {
  return zonas.filter(z => {
    // 1. Solo zonas Activas (id_estado = 1)
    if (z.id_estado !== 1) return false;

    // 2. Tipo de zona — si es VIP (id_tipo = 2) o Administrativo (id_tipo = 3)
    //    solo accesible si el nivel del usuario es suficiente
    const tipoId = z.id_tipo;
    if (tipoId === 2 && nivelUsuario < 7) return false;  // VIP → Director+
    if (tipoId === 3 && nivelUsuario < 3) return false;  // Administrativo → nivel 3+

    // 3. nivel_minimo_privilegio de la config
    const nivelMin = z.config_reserva_zona?.[0]?.nivel_minimo_privilegio ?? 1;
    if (nivelUsuario < nivelMin) return false;

    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/parking/status
// Vista móvil: solo zonas activas y accesibles según nivel del usuario
// ─────────────────────────────────────────────────────────────────────────────
router.get("/status", async (req, res) => {
  try {
    const { nivel, orgId } = await getNivelPrivilegio(req.user.id);

    // Traer zonas con su tipo, estado y config
    const { data: zonas, error } = await supabase
      .from("zona")
      .select(`
        id_zona, nombre, capacidad_total, descripcion,
        id_tipo, id_estado, latitud, longitud, direccion, nivel_piso,
        tipo_zona ( id_tipo, nombre ),
        estado_zona ( id_estado, nombre ),
        config_reserva_zona ( nivel_minimo_privilegio, permite_horas, permite_dias, requiere_aprobacion ),
        plaza ( id_plaza, id_estado )
      `)
      .eq("organizacion_id", orgId);

    if (error) throw error;

    // Filtrar zonas accesibles para este usuario móvil
    const zonasVisibles = filtrarZonasMovil(zonas, nivel, []);

    // Calcular stats por zona
    const zonasConStats = zonasVisibles.map(z => {
      const plazas     = z.plaza || [];
      const libres     = plazas.filter(p => p.id_estado === 1).length;
      const ocupadas   = plazas.filter(p => p.id_estado === 2).length;
      const reservadas = plazas.filter(p => p.id_estado === 3).length;
      const asignadas  = plazas.filter(p => p.id_estado === 5).length;
      const activas    = plazas.filter(p => p.id_estado !== 4).length; // excluye mantenimiento
      const pct        = activas > 0 ? Math.round(((ocupadas + reservadas + asignadas) / activas) * 100) : 0;

      return {
        id_zona:             z.id_zona,
        nombre:              z.nombre,
        capacidad_total:     z.capacidad_total,
        descripcion:         z.descripcion,
        latitud:             z.latitud   ?? null,
        longitud:            z.longitud  ?? null,
        direccion:           z.direccion ?? null,
        nivel_piso:          z.nivel_piso ?? 0,
        tipo_zona:           z.tipo_zona?.nombre ?? null,
        estado_zona:         z.estado_zona?.nombre ?? "Activa",
        libres,
        ocupadas,
        reservadas,
        asignadas,
        en_mantenimiento:    plazas.filter(p => p.id_estado === 4).length,
        porcentaje_ocupacion: pct,
        config:              z.config_reserva_zona?.[0] ?? null
      };
    });

    // Totales globales solo de zonas visibles
    const totalCapacidad = zonasConStats.reduce((s, z) => s + z.capacidad_total, 0);
    const totalOcupadas  = zonasConStats.reduce((s, z) => s + z.ocupadas, 0);
    const totalLibres    = zonasConStats.reduce((s, z) => s + z.libres, 0);
    const totalReservadas = zonasConStats.reduce((s, z) => s + z.reservadas, 0);
    const totalAsignadas  = zonasConStats.reduce((s, z) => s + z.asignadas, 0);
    const totalActivas   = totalCapacidad - zonasConStats.reduce((s, z) => s + z.en_mantenimiento, 0);
    const pctGlobal      = totalActivas > 0
      ? Math.round(((totalOcupadas + totalReservadas + totalAsignadas) / totalActivas) * 100)
      : 0;

    res.json({
      ok: true,
      total_capacidad:      totalCapacidad,
      total_libres:         totalLibres,
      total_ocupadas:       totalOcupadas,
      reservadas:           totalReservadas,
      asignadas:            totalAsignadas,
      porcentaje_ocupacion: pctGlobal,
      nivel_usuario:        nivel,
      zonas:                zonasConStats
    });
  } catch (err) {
    console.error("[parking] status:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/parking/plazas?zonaId=X&estado=X
// Solo devuelve plazas de zonas accesibles para el usuario
// ─────────────────────────────────────────────────────────────────────────────
router.get("/plazas", async (req, res) => {
  try {
    const { zonaId, estado } = req.query;
    const { nivel, orgId } = await getNivelPrivilegio(req.user.id);

    // Si viene zonaId, verificar que sea accesible
    if (zonaId) {
      const { data: zona } = await supabase
        .from("zona")
        .select("id_zona, id_tipo, id_estado, config_reserva_zona(nivel_minimo_privilegio)")
        .eq("id_zona", Number(zonaId))
        .single();

      if (!zona || zona.id_estado !== 1)
        return res.status(403).json({ ok: false, error: "Zona no disponible" });

      const nivelMin = zona.config_reserva_zona?.[0]?.nivel_minimo_privilegio ?? 1;
      if (nivel < nivelMin || (zona.id_tipo === 2 && nivel < 7) || (zona.id_tipo === 3 && nivel < 3))
        return res.status(403).json({ ok: false, error: "No tienes acceso a esta zona" });
    }

    let query = supabase
      .from("plaza")
      .select(`
        id_plaza, numero_plaza, id_estado, id_zona,
        estado_plaza ( nombre ),
        zona ( id_zona, nombre, id_tipo, id_estado )
      `)
      .eq("zona.organizacion_id", orgId ?? 1)
      .order("id_plaza");

    if (zonaId) query = query.eq("id_zona", Number(zonaId));
    if (estado)  query = query.eq("id_estado", Number(estado));

    const { data, error } = await query;
    if (error) throw error;

    // Filtrar plazas cuya zona sea accesible
    const filtradas = (data || []).filter(p => {
      const z = p.zona;
      if (!z || z.id_estado !== 1) return false;
      if (z.id_tipo === 2 && nivel < 7) return false;
      if (z.id_tipo === 3 && nivel < 3) return false;
      return true;
    }).map(p => ({
      id_plaza:     p.id_plaza,
      numero_plaza: p.numero_plaza,
      id_estado:    p.id_estado,
      id_zona:      p.id_zona,
      estado_nombre: p.estado_plaza?.nombre ?? null,
      nombre_zona:   p.zona?.nombre ?? null
    }));

    res.json({ ok: true, data: filtradas });
  } catch (err) {
    console.error("[parking] plazas:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/parking/zonas/:id/disponibilidad
// Detalle de una zona con verificación de acceso
// ─────────────────────────────────────────────────────────────────────────────
router.get("/zonas/:id/disponibilidad", async (req, res) => {
  try {
    const { nivel, orgId } = await getNivelPrivilegio(req.user.id);

    const { data: zona, error } = await supabase
      .from("zona")
      .select(`
        id_zona, nombre, capacidad_total, descripcion,
        id_tipo, id_estado, latitud, longitud, direccion, nivel_piso,
        tipo_zona ( nombre ),
        estado_zona ( nombre ),
        config_reserva_zona (
          permite_horas, permite_dias, max_horas, max_dias,
          requiere_aprobacion, hora_inicio_permitida, hora_fin_permitida,
          nivel_minimo_privilegio
        ),
        plaza ( id_plaza, numero_plaza, id_estado, estado_plaza ( nombre ) )
      `)
      .eq("id_zona", req.params.id)
      .eq("organizacion_id", orgId)
      .single();

    if (error || !zona)
      return res.status(404).json({ ok: false, error: "Zona no encontrada" });

    // Verificar acceso
    if (zona.id_estado !== 1)
      return res.status(403).json({ ok: false, error: "Esta zona no está activa" });

    const nivelMin = zona.config_reserva_zona?.[0]?.nivel_minimo_privilegio ?? 1;
    if (nivel < nivelMin)
      return res.status(403).json({ ok: false, error: "No tienes el nivel de acceso requerido para esta zona" });
    if (zona.id_tipo === 2 && nivel < 7)
      return res.status(403).json({ ok: false, error: "Esta zona es de acceso VIP" });
    if (zona.id_tipo === 3 && nivel < 3)
      return res.status(403).json({ ok: false, error: "Esta zona es de acceso administrativo" });

    const plazas     = zona.plaza || [];
    const libres     = plazas.filter(p => p.id_estado === 1).length;
    const ocupadas   = plazas.filter(p => p.id_estado === 2).length;
    const reservadas = plazas.filter(p => p.id_estado === 3).length;
    const mant       = plazas.filter(p => p.id_estado === 4).length;

    res.json({
      ok: true,
      data: {
        ...zona,
        plazas: plazas.map(p => ({
          id_plaza:      p.id_plaza,
          numero_plaza:  p.numero_plaza,
          id_estado:     p.id_estado,
          estado_nombre: p.estado_plaza?.nombre ?? null
        })),
        resumen: {
          total:     plazas.length,
          libres,
          ocupadas,
          reservadas,
          mantenimiento: mant
        }
      }
    });
  } catch (err) {
    console.error("[parking] zona disponibilidad:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;