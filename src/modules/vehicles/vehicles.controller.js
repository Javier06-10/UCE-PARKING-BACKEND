import {
  getAllVehicles,
  getVehicleById,
  getVehicleByPlaca,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicleAccessHistory
} from "./vehicles.services.js";

// GET /api/vehicles?page=1&limit=20&search=abc
export async function listVehicles(req, res) {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    // id_persona FK in vehiculo — comes from req.user.perfil populated by middleware
    const persona_id = req.user?.perfil?.persona?.id_persona;

    if (!persona_id) {
      return res.status(401).json({ ok: false, error: "Usuario no autenticado o sin perfil." });
    }

    const result = await getAllVehicles({ page: Number(page), limit: Number(limit), search, persona_id });
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[vehicles] listVehicles:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// GET /api/vehicles/:id
export async function getVehicle(req, res) {
  try {
    const data = await getVehicleById(req.params.id);
    res.json({ ok: true, data });
  } catch (error) {
    console.error("[vehicles] getVehicle:", error.message);
    res.status(404).json({ ok: false, error: error.message });
  }
}

// GET /api/vehicles/placa/:placa
export async function getByPlaca(req, res) {
  try {
    const data = await getVehicleByPlaca(req.params.placa);
    if (!data) return res.status(404).json({ ok: false, error: "Vehículo no encontrado" });
    res.json({ ok: true, data });
  } catch (error) {
    console.error("[vehicles] getByPlaca:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// POST /api/vehicles
// Body: { placa, id_modelo, id_color, id_persona, organizacion_id?, id_estado?, id_tipo? }
export async function createVehicleHandler(req, res) {
  try {
    const { placa, id_modelo, id_color, id_persona, id_estado, id_tipo } = req.body;
    // organizacion_id from body or fallback to the authenticated user's org
    const organizacion_id = req.body.organizacion_id ?? req.user?.perfil?.organizacion_id;
    const data = await createVehicle({ placa, id_modelo, id_color, id_persona, organizacion_id, id_estado, id_tipo });
    res.status(201).json({ ok: true, data });
  } catch (error) {
    console.error("[vehicles] createVehicle:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// PUT /api/vehicles/:id
// Body: { placa?, id_modelo?, id_color?, id_persona?, id_estado?, id_tipo? }
export async function updateVehicleHandler(req, res) {
  try {
    const { placa, id_modelo, id_color, id_persona, id_estado, id_tipo } = req.body;
    const data = await updateVehicle(req.params.id, { placa, id_modelo, id_color, id_persona, id_estado, id_tipo });
    res.json({ ok: true, data });
  } catch (error) {
    console.error("[vehicles] updateVehicle:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// DELETE /api/vehicles/:id
export async function deleteVehicleHandler(req, res) {
  try {
    const result = await deleteVehicle(req.params.id);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[vehicles] deleteVehicle:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

// GET /api/vehicles/:id/history
export async function vehicleHistory(req, res) {
  try {
    const data = await getVehicleAccessHistory(req.params.id);
    res.json({ ok: true, data });
  } catch (error) {
    console.error("[vehicles] vehicleHistory:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}
