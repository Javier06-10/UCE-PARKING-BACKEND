import supabase from "../../config/supabase.js";

// ─── Listar todos los vehículos ────────────────────────────────────────────────
export async function getAllVehicles({ page = 1, limit = 20, search = "", persona_id } = {}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("vehiculos")
    .select(
      `id, placa, Marca, Color, Fecha_Registro,
       personas ( id, nombre, apellido, email, telefono )`,
      { count: "exact" }
    )
    .order("Fecha_Registro", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(`placa.ilike.%${search}%,Marca.ilike.%${search}%`);
  }

  // Filtrar por usuario (si se proporciona)
  if (persona_id) {
    query = query.eq("persona_id", persona_id);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { data, total: count, page, limit };
}

// ─── Obtener un vehículo por ID ────────────────────────────────────────────────
export async function getVehicleById(id) {
  const { data, error } = await supabase
    .from("vehiculos")
    .select(
      `id, placa, Marca, Color, Fecha_Registro,
       personas ( id, nombre, apellido, email, telefono )`
    )
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

// ─── Obtener vehículo por placa ────────────────────────────────────────────────
export async function getVehicleByPlaca(placa) {
  const { data, error } = await supabase
    .from("vehiculos")
    .select(
      `id, placa, Marca, Color, Fecha_Registro,
       personas ( id, nombre, apellido, email, telefono )`
    )
    .eq("placa", placa)
    .maybeSingle();

  if (error) throw error;
  return data; // null si no existe
}

// ─── Crear vehículo ────────────────────────────────────────────────────────────
export async function createVehicle({ placa, Marca, Color, persona_id }) {
  if (!placa) throw new Error("La placa es requerida");

  // Verificar duplicado
  const existe = await getVehicleByPlaca(placa);
  if (existe) throw new Error(`Ya existe un vehículo con la placa ${placa}`);

  const { data, error } = await supabase
    .from("vehiculos")
    .insert({ placa, Marca, Color, persona_id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Actualizar vehículo ───────────────────────────────────────────────────────
export async function updateVehicle(id, { placa, Marca, Color, persona_id }) {
  // Si se cambia la placa, verificar que no colisione
  if (placa) {
    const existe = await getVehicleByPlaca(placa);
    if (existe && existe.id !== Number(id)) {
      throw new Error(`Ya existe otro vehículo con la placa ${placa}`);
    }
  }

  const campos = {};
  if (placa !== undefined) campos.placa = placa;
  if (Marca !== undefined) campos.Marca = Marca;
  if (Color !== undefined) campos.Color = Color;
  if (persona_id !== undefined) campos.persona_id = persona_id;

  const { data, error } = await supabase
    .from("vehiculos")
    .update(campos)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Eliminar vehículo ─────────────────────────────────────────────────────────
export async function deleteVehicle(id) {
  const { error } = await supabase
    .from("vehiculos")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return { deleted: true, id };
}

// ─── Historial de accesos de un vehículo ──────────────────────────────────────
export async function getVehicleAccessHistory(id) {
  const { data, error } = await supabase
    .from("registros_acceso")
    .select(
      `id, entrada_at, salida_at, tipo_evento, Id_Plaza,
       dispositivos_entrada:id_dispositivo_entrada ( id_dispositivo, ubicacion ),
       dispositivos_salida:id_dispositivo_salida  ( id_dispositivo, ubicacion )`
    )
    .eq("vehiculo_id", id)
    .order("entrada_at", { ascending: false });

  if (error) throw error;
  return data;
}
