// src/modules/auth/auth.routes.js
import express from "express";
import supabase from "../../config/supabase.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ ok: false, error: "Email y contraseña requeridos" });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user)
      return res.status(401).json({ ok: false, error: "Credenciales inválidas" });

    const { data: usuario } = await supabase
      .from("usuario")
      .select(`
        id, rol_id, id_tipo_usuario, organizacion_id, id_estado,
        rol ( id_rol, nombre ),
        tipo_usuario ( id_tipo, nombre ),
        persona (
          id_persona, nombre, apellido, email, telefono, cedula, foto_url,
          condicion_salud, detalle_condicion_salud,
          id_tipo_persona,
          tipo_persona ( id_tipo_persona, nombre, puede_reservar, requiere_carnet )
        )
      `)
      .eq("id", data.user.id)
      .single();

    if (!usuario)
      return res.status(404).json({ ok: false, error: "Perfil de usuario no encontrado" });

    if (usuario.id_estado !== 1)
      return res.status(403).json({ ok: false, error: "Cuenta suspendida o inactiva" });

    res.json({
      ok: true,
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: usuario
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/registro
// CAMBIO: acepta condicion_salud y detalle_condicion_salud
// ─────────────────────────────────────────────────────────────
router.post("/registro", async (req, res) => {
  try {
    const {
      email, password,
      nombre, apellido, telefono, cedula, sexo, fecha_nacimiento,
      id_tipo_persona, organizacion_id,
      condicion_salud, detalle_condicion_salud
    } = req.body;

    if (!email || !password || !nombre || !apellido || !organizacion_id)
      return res.status(400).json({ ok: false, error: "Campos requeridos: email, password, nombre, apellido, organizacion_id" });

    const { data: org } = await supabase
      .from("organizacion")
      .select("id_organizacion, nombre, acepta_reservas_movil")
      .eq("id_organizacion", organizacion_id)
      .single();

    if (!org)
      return res.status(404).json({ ok: false, error: "Organización no encontrada" });
    if (!org.acepta_reservas_movil)
      return res.status(403).json({ ok: false, error: "Esta organización no permite registro desde la app móvil" });

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError)
      return res.status(400).json({ ok: false, error: authError.message });

    const userId = authData.user.id;

    // CAMBIO: incluye condicion_salud y detalle_condicion_salud
    const { error: personaError } = await supabase
      .from("persona")
      .insert({
        id_persona:              userId,
        nombre,
        apellido,
        email,
        telefono:                telefono     || null,
        cedula:                  cedula       || null,
        sexo:                    sexo         || null,
        fecha_nacimiento:        fecha_nacimiento || null,
        id_tipo_persona:         id_tipo_persona  || null,
        condicion_salud:         condicion_salud  ?? false,
        detalle_condicion_salud: condicion_salud ? (detalle_condicion_salud || null) : null
      });

    if (personaError) {
      await supabase.auth.admin.deleteUser(userId);
      return res.status(400).json({ ok: false, error: "Error al crear persona: " + personaError.message });
    }

    const { error: usuarioError } = await supabase
      .from("usuario")
      .insert({
        id:             userId,
        id_persona:     userId,
        rol_id:         6,
        id_tipo_usuario: 2,
        organizacion_id,
        id_estado:      1
      });

    if (usuarioError) {
      await supabase.from("persona").delete().eq("id_persona", userId);
      await supabase.auth.admin.deleteUser(userId);
      return res.status(400).json({ ok: false, error: "Error al crear usuario: " + usuarioError.message });
    }

    res.status(201).json({ ok: true, message: "Cuenta creada exitosamente", user_id: userId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/auth/organizaciones
// ─────────────────────────────────────────────────────────────
router.get("/organizaciones", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("organizacion")
      .select("id_organizacion, nombre, descripcion_publica, logo_url, latitud, longitud")
      .eq("acepta_reservas_movil", true)
      .order("nombre");

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/auth/me
// CAMBIO: incluye condicion_salud, detalle_condicion_salud y requiere_carnet
// ─────────────────────────────────────────────────────────────
router.get("/me", verifyToken, async (req, res) => {
  try {
    const { data: usuario, error } = await supabase
      .from("usuario")
      .select(`
        id, rol_id, id_tipo_usuario, organizacion_id, id_estado, created_at,
        rol ( id_rol, nombre ),
        tipo_usuario ( id_tipo, nombre ),
        organizacion ( id_organizacion, nombre, logo_url ),
        persona (
          id_persona, nombre, apellido, email, telefono, cedula,
          sexo, fecha_nacimiento, foto_url,
          condicion_salud, detalle_condicion_salud,
          id_tipo_persona,
          tipo_persona ( id_tipo_persona, nombre, puede_reservar, requiere_carnet )
        )
      `)
      .eq("id", req.user.id)
      .single();

    if (error || !usuario)
      return res.status(404).json({ ok: false, error: "Perfil no encontrado" });

    const { data: empleado } = await supabase
      .from("empleado")
      .select(`
        id_empleado, id_estado,
        departamento ( nombre ),
        cargo ( id_cargo, nombre, nivel_privilegio )
      `)
      .eq("id_persona", req.user.id)
      .maybeSingle();

    const { data: estudianteData } = await supabase
      .from("estudiante")
      .select(`
        id_estudiante, numero_carnet, año_academico,
        carrera ( id_carrera, nombre, codigo,
          facultad ( id_facultad, nombre, codigo )
        )
      `)
      .eq("id_persona", req.user.id)
      .maybeSingle();

    res.json({
      ok: true,
      data: {
        ...usuario,
        empleado:   empleado      || null,
        estudiante: estudianteData || null
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/auth/me/perfil
// NUEVO: Actualizar perfil propio desde la app móvil
// Permite editar: telefono, direccion, condicion_salud, detalle_condicion_salud
// ─────────────────────────────────────────────────────────────
router.patch("/me/perfil", verifyToken, async (req, res) => {
  try {
    const { telefono, direccion, condicion_salud, detalle_condicion_salud } = req.body;

    const campos = {};
    if (telefono    !== undefined) campos.telefono    = telefono;
    if (direccion   !== undefined) campos.direccion   = direccion;
    if (condicion_salud !== undefined) {
      campos.condicion_salud         = condicion_salud;
      // Si desactivan la condición, limpiar el detalle
      campos.detalle_condicion_salud = condicion_salud
        ? (detalle_condicion_salud || null)
        : null;
    }

    if (Object.keys(campos).length === 0)
      return res.status(400).json({ ok: false, error: "No hay campos para actualizar" });

    const { data, error } = await supabase
      .from("persona")
      .update(campos)
      .eq("id_persona", req.user.id)
      .select("id_persona, nombre, apellido, telefono, direccion, condicion_salud, detalle_condicion_salud")
      .single();

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// ─────────────────────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token)
      return res.status(400).json({ ok: false, error: "refresh_token requerido" });

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error || !data.session)
      return res.status(401).json({ ok: false, error: "Token inválido o expirado" });

    res.json({
      ok: true,
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;