import supabase from "../../config/supabase.js";

export const getFacultades = async () => {
  const { data, error } = await supabase
    .from("facultad")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return data;
};

export const getCarrerasByFacultad = async (facultadId) => {
  const { data, error } = await supabase
    .from("carrera")
    .select("*")
    .eq("id_facultad", facultadId)
    .order("nombre");
  if (error) throw error;
  return data;
};

export const createFacultad = async (nombre) => {
  const { data, error } = await supabase
    .from("facultad")
    .insert([{ nombre }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const createCarrera = async (nombre, id_facultad) => {
  const { data, error } = await supabase
    .from("carrera")
    .insert([{ nombre, id_facultad }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getTiposPersona = async () => {
  const { data, error } = await supabase
    .from("tipo_persona")
    .select("*")
    .order("id_tipo_persona");
  if (error) throw error;
  return data;
};

export const getCargos = async () => {
  const { data, error } = await supabase
    .from("cargo")
    .select("*")
    .order("nivel_privilegio", { ascending: false });
  if (error) throw error;
  return data;
};
