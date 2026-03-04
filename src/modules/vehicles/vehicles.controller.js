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
    const persona_id = req.user?.id; // Obtener el ID del usuario logueado desde el token JWT
    
    if (!persona_id) {
       return res.status(401).json({ ok: false, error: "Usuario no autenticado." });
    }

    const result = await getAllVehicles({
      page: Number(page),
      limit: Number(limit),
      search,
      persona_id
    });
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
export async function createVehicleHandler(req, res) {
  try {
    const { placa, Marca, Color, persona_id } = req.body;
    const data = await createVehicle({ placa, Marca, Color, persona_id });
    res.status(201).json({ ok: true, data });
  } catch (error) {
    console.error("[vehicles] createVehicle:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

// PUT /api/vehicles/:id
export async function updateVehicleHandler(req, res) {
  try {
    const { placa, Marca, Color, persona_id } = req.body;
    const data = await updateVehicle(req.params.id, { placa, Marca, Color, persona_id });
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
