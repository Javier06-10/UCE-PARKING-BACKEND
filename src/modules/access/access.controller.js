import {registrarEntrada, registrarEntradaVisitante } from "./access.services.js";


async function entrada(req, res) {
  try {
    const { placa, dispositivoEntradaId } = req.body;

    const registro = await registrarEntrada({
      placa,
      dispositivoEntradaId
    });

    res.json({
      ok: true,
      registro
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
async function entradaVisitante(req, res) {
  try {

    const {
      nombre,
      placa,
      dispositivoEntradaId,
      adminPersonaId,
      motivo
    } = req.body;

    const registro = await registrarEntradaVisitante({
      nombre,
      placa,
      dispositivoEntradaId,
      adminPersonaId,
      motivo
    });

    res.json({ ok: true, registro });

  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
}

export { entrada, entradaVisitante };
