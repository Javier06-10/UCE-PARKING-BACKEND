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
// Flujo correcto: auth.users → persona → usuario (solo 2 tablas propias)
// NO se crea empleado ni estudiante en el registro — eso se gestiona aparte.
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
  id_tipo_persona,
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

  // 2. Crear usuario en Supabase Auth (solo autenticación)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError) throw new Error("Error al crear cuenta: " + authError.message);

  const userId = authData.user.id;

  // 3. Crear registro en tabla PERSONA (datos personales)
  const { error: personaError } = await supabase
    .from("persona")
    .insert({
      id_persona: userId,
      nombre,
      apellido,
      email,
      telefono: telefono || null,
      cedula: cedula || null,
      sexo: sexo || null,
      fecha_nacimiento: fecha_nacimiento || null,
      direccion: direccion || null,
      id_tipo_persona: id_tipo_persona || null
    });

  if (personaError) {
    // Rollback: eliminar auth user si falla la persona
    await supabase.auth.admin.deleteUser(userId);
    throw new Error("Error al crear persona: " + personaError.message);
  }

  // 4. Crear registro en tabla USUARIO (vincula auth.users ↔ persona)
  const { error: usuarioError } = await supabase
    .from("usuario")
    .insert({
      id: userId,
      id_persona: userId,
      rol_id: 6,            // Rol: Usuario Móvil
      id_tipo_usuario: 2,   // Tipo: Móvil
      organizacion_id: Number(organizacion_id),
      id_estado: 1          // Estado: Activo
    });

  if (usuarioError) {
    // Rollback: eliminar persona + auth user si falla el usuario
    await supabase.from("persona").delete().eq("id_persona", userId);
    await supabase.auth.admin.deleteUser(userId);
    throw new Error("Error al crear usuario: " + usuarioError.message);
  }

  return {
    ok: true,
    message: "Cuenta creada exitosamente.",
    user_id: userId
  };
};
