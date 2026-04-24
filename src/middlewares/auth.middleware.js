import supabase from "../config/supabase.js";

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, message: "Token requerido" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ ok: false, message: "Token invalido o expirado" });
    }

    // Adjuntar auth user base
    req.user = data.user;

    // Enriquecer con el perfil completo de la tabla usuario
    const { data: perfil, error: perfilError } = await supabase
      .from("usuario")
      .select(`
        id, rol_id, id_tipo_usuario, organizacion_id, id_estado,
        persona ( id_persona, nombre, apellido, email, telefono, cedula, foto_url ),
        tipo_usuario ( id_tipo, nombre ),
        organizacion ( id_organizacion, nombre, logo_url )
      `)
      .eq("id", data.user.id)
      .maybeSingle();

    if (perfilError) {
      console.error("[auth.middleware] Error obteniendo perfil:", perfilError.message);
    }

    // req.user.perfil contiene organizacion_id, id_tipo_usuario, persona, etc.
    req.user.perfil = perfil ?? null;

    next();
  } catch (err) {
    console.error("[auth.middleware] Error verificando token:", err.message);
    res.status(500).json({ ok: false, message: "Error interno de autenticacion" });
  }
};
