import supabase from "../../config/supabase.js";

// ─── Helper: obtiene el id de estado para asignaciones (tabla global con contexto) ─
async function getEstadoAsignacionId(nombre) {
  const { data } = await supabase
    .from("estado_asignacion")
    .select("id_estado")
    .ilike("nombre", nombre)
    .maybeSingle();
  if (!data) return null;
  return data.id_estado;
}

// ─── Asignación permanente activa en una plaza ────────────────────────────────
async function getAsignacionActiva(plazaId) {
  const hoy = new Date().toISOString().split("T")[0];

  const ID_ACTIVA = await getEstadoAsignacionId("Activa");
  if (!ID_ACTIVA) return null;

  const { data, error } = await supabase
    .from("asignacion")
    .select("*")
    .eq("id_plaza", plazaId)
    .eq("id_estado", ID_ACTIVA)
    .lte("fecha_inicio", hoy)
    .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`)
    .maybeSingle();

  if (error) return null;
  return data;
}

export { getAsignacionActiva };