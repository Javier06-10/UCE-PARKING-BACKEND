import supabase from "../../config/supabase.js";

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginService = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    throw new Error("Credenciales invalidas");
  }

  const { data: usuarioRow, error: userError } = await supabase
    .from("usuario")
    .select(`
      id, rol_id, id_tipo_usuario, organizacion_id, id_estado,
      persona (
        id_persona, nombre, apellido, email, telefono,
        id_tipo_persona,
        tipo_persona ( nombre, puede_reservar )
      )
    `)
    .eq("id", data.user.id)
    .single();

  if (userError || !usuarioRow) {
    throw new Error("Perfil de usuario no encontrado en el sistema");
  }

  // Enriquecer con cargo
  const { data: empData } = await supabase
    .from("empleado")
    .select("id_cargo, cargo(nombre, nivel_privilegio)")
    .eq("id_persona", usuarioRow.persona.id_persona)
    .maybeSingle();

  usuarioRow.cargo = empData?.cargo || null;

  return {
    user: { ...data.user, perfil: usuarioRow },
    token: data.session.access_token,
    session: data.session
  };
};

// ─── Listar organizaciones que aceptan registro móvil ─────────────────────────
export const getOrganizacionesMovil = async () => {
  const { data, error } = await supabase
    .from("organizacion")
    .select("id_organizacion, nombre, direccion, descripcion_publica, logo_url, latitud, longitud")
    .eq("acepta_reservas_movil", true)
    .order("nombre");

  if (error) throw error;
  return data;
};

// ─── Registro de usuario móvil ────────────────────────────────────────────────
// El trigger fn_onboarding_nuevo_usuario en auth.users crea persona + usuario + empleado
// a partir de raw_user_meta_data. Solo necesitamos pasar los datos correctos a signUp.
export const registroService = async ({
  email,
  password,
  nombre,
  apellido,
  telefono,
  cedula,
  sexo,
  fecha_nacimiento,
  direccion,
  organizacion_id
}) => {
  if (!email || !password || !nombre || !apellido || !organizacion_id) {
    throw new Error("email, password, nombre, apellido y organizacion_id son requeridos");
  }

  // 1. Verificar que la organización existe y acepta registros móviles
  const { data: org, error: orgError } = await supabase
    .from("organizacion")
    .select("id_organizacion, nombre, acepta_reservas_movil")
    .eq("id_organizacion", organizacion_id)
    .single();

  if (orgError || !org) throw new Error("Organizacion no encontrada");
  if (!org.acepta_reservas_movil) {
    throw new Error("Esta organizacion no acepta registros desde la app movil");
  }

  // 2. Crear usuario en Supabase Auth con metadata completa.
  //    El trigger fn_onboarding_nuevo_usuario lee estos campos para crear
  //    persona, usuario (organizacion_id) y empleado automáticamente.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        tipo_usuario:    'movil',
        nombre,
        apellido,
        org_id:          Number(organizacion_id),
        ...(telefono        ? { telefono }        : {}),
        ...(sexo            ? { sexo }            : {}),
        ...(fecha_nacimiento ? { fecha_nacimiento } : {}),
      }
    }
  });

  if (authError) throw new Error("Error al crear cuenta: " + authError.message);

  const authUser = authData.user;

  // 3. Actualizar persona con campos extra que el trigger no maneja
  //    (cedula, direccion). id_persona = auth.uid() según el trigger.
  if (authUser && (cedula || direccion)) {
    const extras = {};
    if (cedula)    extras.cedula    = cedula;
    if (direccion) extras.direccion = direccion;
    await supabase.from("persona").update(extras).eq("id_persona", authUser.id);
  }

  return {
    ok: true,
    message: "Cuenta creada exitosamente. Revisa tu email para confirmar tu cuenta."
  };
};
