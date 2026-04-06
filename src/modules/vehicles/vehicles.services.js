import supabase from "../../config/supabase.js";

// ─── Resolvers: texto → ID (usados como fallback si el cliente sólo envía nombre) ──

async function getMarcaId(nombre) {
  if (!nombre) return null;
  let { data } = await supabase
    .from("marcas_vehiculo")
    .select("id_marca")
    .ilike("nombre", nombre)
    .maybeSingle();
  if (data) return data.id_marca;
  const { data: nueva, error } = await supabase
    .from("marcas_vehiculo")
    .insert({ nombre: nombre.toUpperCase() })
    .select("id_marca")
    .single();
  if (error) throw error;
  return nueva.id_marca;
}

async function getModeloId(nombre, id_marca) {
  if (!nombre || !id_marca) return null;
  let { data } = await supabase
    .from("modelos_vehiculo")
    .select("id_modelo")
    .ilike("nombre", nombre)
    .eq("id_marca", id_marca)
    .maybeSingle();
  if (data) return data.id_modelo;
  const { data: nueva, error } = await supabase
    .from("modelos_vehiculo")
    .insert({ nombre: nombre.toUpperCase(), id_marca })
    .select("id_modelo")
    .single();
  if (error) throw error;
  return nueva.id_modelo;
}

async function getColorId(nombre) {
  if (!nombre) return null;
  let { data } = await supabase
    .from("colores_vehiculo")
    .select("id_color")
    .ilike("nombre", nombre)
    .maybeSingle();
  if (data) return data.id_color;
  const { data: nueva, error } = await supabase
    .from("colores_vehiculo")
    .insert({ nombre: nombre.toUpperCase() })
    .select("id_color")
    .single();
  if (error) throw error;
  return nueva.id_color;
}

// ─── Select base con JOINs de catálogos ───────────────────────────────────────
const VEHICLE_SELECT = `
  id_vehiculo, placa, id_marca, id_color, id_modelo, Fecha_Registro, id_persona,
  personas ( id_persona, nombre, apellido, email, telefono ),
  marcas_vehiculo ( id_marca, nombre ),
  modelos_vehiculo ( id_modelo, nombre ),
  colores_vehiculo ( id_color, nombre )
`;

// ─── Listar todos los vehículos ────────────────────────────────────────────────
export async function getAllVehicles({ page = 1, limit = 20, search = "", persona_id } = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from("vehiculos")
    .select(VEHICLE_SELECT, { count: "exact" })
    .order("Fecha_Registro", { ascending: false })
    .range(from, to);

  if (search)     query = query.or(`placa.ilike.%${search}%`);
  if (persona_id) query = query.eq("id_persona", persona_id);

  const { data, error, count } = await query;
  if (error) throw error;

  return { data, total: count, page, limit };
}

// ─── Obtener un vehículo por ID (PK: id_vehiculo) ─────────────────────────────
export async function getVehicleById(id) {
  const { data, error } = await supabase
    .from("vehiculos")
    .select(VEHICLE_SELECT)
    .eq("id_vehiculo", id)
    .single();

  if (error) throw error;
  return data;
}

// ─── Obtener vehículo por placa ────────────────────────────────────────────────
export async function getVehicleByPlaca(placa) {
  const { data, error } = await supabase
    .from("vehiculos")
    .select(VEHICLE_SELECT)
    .eq("placa", placa)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ─── Crear vehículo ────────────────────────────────────────────────────────────
// Acepta IDs directamente (id_marca, id_modelo, id_color) o nombres como fallback.
// Los usuarios del panel envían IDs; los de la app móvil también.
export async function createVehicle({ placa, id_marca, id_modelo, id_color, persona_id, Marca, Color, modelo }) {
  if (!placa) throw new Error("La placa es requerida");

  const existe = await getVehicleByPlaca(placa);
  if (existe) throw new Error(`Ya existe un vehículo con la placa ${placa}`);

  // Preferir IDs directos; resolver desde nombre sólo si no se proporcionaron IDs
  const marcaId  = id_marca  ?? (Marca  ? await getMarcaId(Marca)                    : null);
  const modeloId = id_modelo ?? (modelo ? await getModeloId(modelo, marcaId)          : null);
  const colorId  = id_color  ?? (Color  ? await getColorId(Color)                     : null);

  const { data, error } = await supabase
    .from("vehiculos")
    .insert({ placa, id_marca: marcaId, id_color: colorId, id_modelo: modeloId, id_persona: persona_id })
    .select(VEHICLE_SELECT)
    .single();

  if (error) throw error;
  return data;
}

// ─── Actualizar vehículo ───────────────────────────────────────────────────────
export async function updateVehicle(id, { placa, id_marca, id_modelo, id_color, persona_id, Marca, Color, modelo }) {
  if (placa) {
    const existe = await getVehicleByPlaca(placa);
    if (existe && existe.id_vehiculo !== Number(id)) {
      throw new Error(`Ya existe otro vehículo con la placa ${placa}`);
    }
  }

  const campos = {};
  if (placa      !== undefined) campos.placa      = placa;
  if (persona_id !== undefined) campos.id_persona = persona_id;

  // Preferir ID directo; resolver nombre sólo si ID no fue enviado
  if (id_marca  !== undefined) campos.id_marca  = id_marca;
  else if (Marca !== undefined) campos.id_marca  = await getMarcaId(Marca);

  if (id_modelo !== undefined) campos.id_modelo = id_modelo;
  else if (modelo !== undefined) campos.id_modelo = await getModeloId(modelo, campos.id_marca);

  if (id_color  !== undefined) campos.id_color  = id_color;
  else if (Color !== undefined) campos.id_color  = await getColorId(Color);

  const { data, error } = await supabase
    .from("vehiculos")
    .update(campos)
    .eq("id_vehiculo", id)
    .select(VEHICLE_SELECT)
    .single();

  if (error) throw error;
  return data;
}

// ─── Eliminar vehículo ─────────────────────────────────────────────────────────
export async function deleteVehicle(id) {
  const { error } = await supabase
    .from("vehiculos")
    .delete()
    .eq("id_vehiculo", id);

  if (error) throw error;
  return { deleted: true, id };
}

// ─── Historial de accesos de un vehículo ──────────────────────────────────────
export async function getVehicleAccessHistory(id) {
  const { data, error } = await supabase
    .from("registros_acceso")
    .select(
      `id_registro, entrada_at, salida_at, Id_Plaza,
       tipo_evento:id_tipo_evento ( id_tipo, nombre_tipo ),
       dispositivos_entrada:id_dispositivo_entrada ( id_dispositivo, ubicacion ),
       dispositivos_salida:id_dispositivo_salida   ( id_dispositivo, ubicacion )`
    )
    .eq("id_vehiculo", id)
    .order("entrada_at", { ascending: false });

  if (error) throw error;
  return data;
}
