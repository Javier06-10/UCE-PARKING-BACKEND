import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import {
  listVehicles,
  getVehicle,
  getByPlaca,
  createVehicleHandler,
  updateVehicleHandler,
  deleteVehicleHandler,
  vehicleHistory
} from "./vehicles.controller.js";

const router = express.Router();

// Todas las rutas requieren token válido
router.use(verifyToken);

// GET  /api/vehicles              → lista paginada (query: page, limit, search)
router.get("/", listVehicles);

// GET  /api/vehicles/placa/:placa → buscar por placa (antes de /:id para evitar conflicto)
router.get("/placa/:placa", getByPlaca);

// GET  /api/vehicles/:id          → detalle de un vehículo
router.get("/:id", getVehicle);

// GET  /api/vehicles/:id/history  → historial de accesos
router.get("/:id/history", vehicleHistory);

// POST /api/vehicles              → crear vehículo
router.post("/", createVehicleHandler);

// PUT  /api/vehicles/:id          → actualizar vehículo
router.put("/:id", updateVehicleHandler);

// DELETE /api/vehicles/:id        → eliminar vehículo
router.delete("/:id", deleteVehicleHandler);

export default router;
