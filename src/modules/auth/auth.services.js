// src/modules/auth/auth.services.js
// CAMBIO: registroService acepta condicion_salud y detalle_condicion_salud

import supabase from "../../config/supabase.js";

export const loginService = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Credenciales inválidas");

  const { data: usuarioRow, error: userError } = await supabase
    .from("usuario")
    .select(`
      id, rol_id, id_tipo_usuario, organizacion_id, id_estado,
      persona (
        id_persona, nombre, apellido, email, telefono,
        condicion_salud, detalle_condicion_salud,
        id_tipo_persona,
        tipo_persona ( nombre, puede_reservar, requiere_carnet )
      )
    `)
    .eq("id", data.user.id)
    .single();

  if (userError || !usuarioRow) throw new Error("Perfil de usuario no encontrado");

  const { data: empData } = await supabase
    .from("empleado")
    .select("id_cargo, cargo(nombre, nivel_privilegio)")
    .eq("id_persona", usuarioRow.persona.id_persona)
    .maybeSingle();

  usuarioRow.cargo = empData?.cargo || null;

  return {
    user:    { ...data.user, perfil: usuarioRow },
    token:   data.session.access_token,
    session: data.session
  };
};

export const getOrganizacionesMovil = async () => {
  const { data, error } = await supabase
    .from("organizacion")
    .select("id_organizacion, nombre, direccion, descripcion_publica, logo_url, latitud, longitud")
    .eq("acepta_reservas_movil", true)
    .order("nombre");
  if (error) throw error;
  return data;
};

// CAMBIO: acepta condicion_salud y detalle_condicion_salud
export const registroService = async ({
  email, password, nombre, apellido, telefono, cedula,
  sexo, fecha_nacimiento, direccion, id_tipo_persona, organizacion_id,
  condicion_salud = false, detalle_condicion_salud = null
}) => {
  if (!email || !password || !nombre || !apellido || !organizacion_id)
    throw new Error("email, password, nombre, apellido y organizacion_id son requeridos");

  const { data: org, error: orgError } = await supabase
    .from("organizacion")
    .select("id_organizacion, nombre, acepta_reservas_movil")
    .eq("id_organizacion", organizacion_id)
    .single();

  if (orgError || !org) throw new Error("Organización no encontrada");
  if (!org.acepta_reservas_movil)
    throw new Error("Esta organización no acepta registros desde la app móvil");

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true
  });

  if (authError) throw new Error("Error al crear cuenta: " + authError.message);

  const userId = authData.user.id;

  const { error: personaError } = await supabase
    .from("persona")
    .insert({
      id_persona:              userId,
      nombre,
      apellido,
      email,
      telefono:                telefono         || null,
      cedula:                  cedula           || null,
      sexo:                    sexo             || null,
      fecha_nacimiento:        fecha_nacimiento || null,
      direccion:               direccion        || null,
      id_tipo_persona:         id_tipo_persona  || null,
      condicion_salud:         condicion_salud  ?? false,
      detalle_condicion_salud: condicion_salud ? (detalle_condicion_salud || null) : null
    });

  if (personaError) {
    await supabase.auth.admin.deleteUser(userId);
    throw new Error("Error al crear persona: " + personaError.message);
  }

  const { error: usuarioError } = await supabase
    .from("usuario")
    .insert({
      id:              userId,
      id_persona:      userId,
      rol_id:          6,
      id_tipo_usuario: 2,
      organizacion_id: Number(organizacion_id),
      id_estado:       1
    });

  if (usuarioError) {
    await supabase.from("persona").delete().eq("id_persona", userId);
    await supabase.auth.admin.deleteUser(userId);
    throw new Error("Error al crear usuario: " + usuarioError.message);
  }

  return { ok: true, message: "Cuenta creada exitosamente.", user_id: userId };
};