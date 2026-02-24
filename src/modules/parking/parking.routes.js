import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { getParkingStatus, getPlazas } from "./parking.status.js";

const router = express.Router();

router.use(verifyToken);

// GET /api/parking/status → estado completo del parqueadero
router.get("/status", async (req, res) => {
  try {
    const data = await getParkingStatus();
    res.json({ ok: true, ...data });
  } catch (error) {
    console.error("[parking] status:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/parking/plazas?zonaId=1&estado=1
router.get("/plazas", async (req, res) => {
  try {
    const { zonaId, estado } = req.query;
    const data = await getPlazas({
      zonaId: zonaId ? Number(zonaId) : undefined,
      estado: estado ? Number(estado) : undefined
    });
    res.json({ ok: true, data });
  } catch (error) {
    console.error("[parking] plazas:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
