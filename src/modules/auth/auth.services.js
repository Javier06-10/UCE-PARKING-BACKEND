import supabase from "../../config/supabase.js";

export const loginService = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    throw new Error("Credenciales inválidas");
  }

  const { data: usuarioRow, error: userError } = await supabase
    .from("usuario")
    .select(`
      id, rol_id, id_tipo_usuario, organizacion_id, id_estado,
      persona ( id_persona, nombre, apellido, email, telefono )
    `)
    .eq("id", data.user.id)
    .single();

  if (userError || !usuarioRow) {
    throw new Error("Perfil de usuario no encontrado en el sistema");
  }

  return {
    user: { ...data.user, perfil: usuarioRow },
    token: data.session.access_token,
    session: data.session
  };
};
