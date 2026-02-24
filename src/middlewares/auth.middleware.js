import supabase from "../config/supabase.js";

/**
 * Middleware que verifica el token JWT de Supabase Auth.
 * El cliente envía: Authorization: Bearer <supabase_access_token>
 */
export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, message: "Token requerido" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ ok: false, message: "Token inválido o expirado" });
    }

    // Adjuntar datos del usuario de Supabase al request
    req.user = data.user;
    next();
  } catch (err) {
    console.error("[auth.middleware] Error verificando token:", err.message);
    res.status(500).json({ ok: false, message: "Error interno de autenticación" });
  }
};
