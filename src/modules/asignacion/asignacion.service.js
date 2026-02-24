import supabase from "../../config/supabase.js";

async function getAsignacionActiva(plazaId) {
  const hoy = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from("asignaciones_parqueo")
    .select("*")
    .eq("Id_Plaza", plazaId)
    .eq("Estado_Asignacion", "Activa")
    .lte("Fecha_Inicio", hoy)
    .or(`Fecha_Fin.is.null,Fecha_Fin.gte.${hoy}`)
    .maybeSingle();

  if (error) return null;
  return data;
}

export { getAsignacionActiva };