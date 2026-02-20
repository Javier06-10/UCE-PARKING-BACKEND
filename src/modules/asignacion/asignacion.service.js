import  supabase  from "../../config/supabase.js";

async function getAsignacionActiva(plazaId) {

    const hoy = new Date().toDateString().split('T')[0];
    
    const { data, error } = await supabase
    from ("asignaciones_parqueo")
    .select("*")
    .eq("Id_plaza", plazaId)
    .eq("estado_asignacion", "Activa")
    .lte("fecha_inicio", hoy)
    .gte("fecha_fin", hoy)
    .or(`Fecha_Fin.is.null, Fecha_Fin.gte.${hoy}`)
    .single();
    if (error) return null;

    return data;
}
export { getAsignacionActiva };