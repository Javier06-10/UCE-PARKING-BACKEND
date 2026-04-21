import supabase from "../../config/supabase.js";

// ID de estado_asignacion para "Activa"
const ESTADO_ACTIVA = 1;

export async function getAsignacionActiva(plazaId) {
  const hoy = new Date().toISOString();

  const { data, error } = await supabase
    .from("asignacion")
    .select("id_asignacion, id_plaza, id_empleado, fecha_inicio, fecha_fin, id_estado")
    .eq("id_plaza", plazaId)
    .eq("id_estado", ESTADO_ACTIVA)
    .lte("fecha_inicio", hoy)
    .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`)
    .maybeSingle();

  if (error) return null;
  return data;
}
