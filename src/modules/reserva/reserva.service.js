import supabase from "../../config/supabase.js";

async function getReservaActiva(plazaId) {

  const { data, error } = await supabase
    .from('RESERVA')
    .select('*')
    .eq('Id_Plaza', plazaId)
    .eq('Estado_Reserva', 'Activa')
    .lte('Fecha_Hora_Inicio', new Date())
    .gte('Fecha_Hora_Fin', new Date())
    .single();

  if (error) return null;

  return data;
}

export { getReservaActiva };
