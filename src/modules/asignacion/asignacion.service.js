import supabase from "../../config/supabase.js";

// ─── Helper: obtiene el id_estado de estado_asignacion por nombre ─────────────
async function getEstadoAsignacionId(nombre) {
  const { data } = await supabase
    .from("estado_asignacion")
    .select("id_estado")
    .ilike("nombre_estado", nombre)
    .maybeSingle();
  if (!data) return null;
  return data.id_estado;
}

// ─── Asignación permanente activa en una plaza ────────────────────────────────
// Usa id_estado FK en lugar de Estado_Asignacion (columna de texto no existe)
async function getAsignacionActiva(plazaId) {
  const hoy = new Date().toISOString().split("T")[0];

  const ID_ACTIVA = await getEstadoAsignacionId("Activa");
  if (!ID_ACTIVA) return null;

  const { data, error } = await supabase
    .from("asignaciones_parqueo")
    .select("*")
    .eq("Id_Plaza", plazaId)
    .eq("id_estado", ID_ACTIVA)
    .lte("Fecha_Inicio", hoy)
    .or(`Fecha_Fin.is.null,Fecha_Fin.gte.${hoy}`)
    .maybeSingle();

  if (error) return null;
  return data;
}

export { getAsignacionActiva };