import { loginService, registroService, getOrganizacionesMovil } from "./auth.services.js";

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginService(email, password);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

// GET /api/auth/organizaciones — lista orgs que aceptan registro movil
export const listarOrganizaciones = async (req, res, next) => {
  try {
    const data = await getOrganizacionesMovil();
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/registro
export const registro = async (req, res, next) => {
  try {
    const {
      email, password, nombre, apellido,
      telefono, cedula, sexo, fecha_nacimiento,
      direccion, organizacion_id
    } = req.body;

    const result = await registroService({
      email, password, nombre, apellido,
      telefono, cedula, sexo, fecha_nacimiento,
      direccion, organizacion_id
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};
