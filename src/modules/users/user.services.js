import supabase from "../../config/supabase.js";

export const getUsers = async () => {
  const { data, error } = await supabase
    .from("usuario")
    .select(`
      id, rol_id, id_tipo_usuario, organizacion_id, created_at, id_estado,
      persona ( id_persona, nombre, apellido, email, telefono, cedula )
    `);

  if (error) throw error;
  return data;
};
