import {
  registrarEntrada,
  registrarEntradaVisitante,
  registrarSalida,
  getHistorialAccesos
} from "./access.services.js";

async function entrada(req, res) {
  try {
    const { placa, dispositivoEntradaId } = req.body;
    const registro = await registrarEntrada({ placa, dispositivoEntradaId });
    res.json({ ok: true, registro });
  } catch (error) {
    console.error("[access] entrada:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

async function entradaVisitante(req, res) {
  try {
    const { nombre, placa, dispositivoEntradaId, adminPersonaId, motivo } = req.body;
    const registro = await registrarEntradaVisitante({
      nombre, placa, dispositivoEntradaId, adminPersonaId, motivo
    });
    res.json({ ok: true, registro });
  } catch (error) {
    console.error("[access] entradaVisitante:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

async function salida(req, res) {
  try {
    const { placa, dispositivoSalidaId } = req.body;
    const registro = await registrarSalida({ placa, dispositivoSalidaId });
    res.json({ ok: true, registro });
  } catch (error) {
    console.error("[access] salida:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
}

async function historial(req, res) {
  try {
    const { page = 1, limit = 20, fechaDesde, fechaHasta } = req.query;
    const result = await getHistorialAccesos({
      page: Number(page),
      limit: Number(limit),
      fechaDesde,
      fechaHasta
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[access] historial:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

export { entrada, entradaVisitante, salida, historial };
