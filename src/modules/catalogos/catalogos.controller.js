import * as catalogosService from "./catalogos.services.js";

export const getFacultades = async (req, res) => {
  try {
    const data = await catalogosService.getFacultades();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const getCarrerasByFacultad = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await catalogosService.getCarrerasByFacultad(id);
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const createFacultad = async (req, res) => {
  try {
    const { nombre } = req.body;
    const data = await catalogosService.createFacultad(nombre);
    res.status(201).json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const createCarrera = async (req, res) => {
  try {
    const { nombre, id_facultad } = req.body;
    const data = await catalogosService.createCarrera(nombre, id_facultad);
    res.status(201).json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const getTiposPersona = async (req, res) => {
  try {
    const data = await catalogosService.getTiposPersona();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const getCargos = async (req, res) => {
  try {
    const data = await catalogosService.getCargos();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
