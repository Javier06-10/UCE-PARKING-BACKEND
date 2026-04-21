import supabase from "../../config/supabase.js";

// ─── Listar vehículos con paginación ──────────────────────────────────────────
export async function getAllVehicles({ page = 1, limit = 20, search = "", persona_id } = {}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("vehiculo")
    .select(
      `id_vehiculo, placa, created_at, organizacion_id, id_estado, id_tipo,
       persona ( id_persona, nombre, apellido, email, telefono ),
       modelo ( id_modelo, nombre, marca ( id_marca, nombre ) ),
       color ( id_color, nombre )`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.ilike("placa", `%${search}%`);
  }

  if (persona_id) {
    query = query.eq("id_persona", persona_id);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { data, total: count, page, limit };
}

// ─── Obtener un vehículo por ID ────────────────────────────────────────────────
export async function getVehicleById(id) {
  const { data, error } = await supabase
    .from("vehiculo")
    .select(
      `id_vehiculo, placa, created_at, organizacion_id, id_estado, id_tipo,
       persona ( id_persona, nombre, apellido, email, telefono ),
       modelo ( id_modelo, nombre, marca ( id_marca, nombre ) ),
       color ( id_color, nombre )`
    )
    .eq("id_vehiculo", id)
    .single();

  if (error) throw error;
  return data;
}

// ─── Obtener vehículo por placa ────────────────────────────────────────────────
export async function getVehicleByPlaca(placa) {
  const { data, error } = await supabase
    .from("vehiculo")
    .select(
      `id_vehiculo, placa, created_at, organizacion_id, id_estado, id_tipo,
       persona ( id_persona, nombre, apellido, email, telefono ),
       modelo ( id_modelo, nombre, marca ( id_marca, nombre ) ),
       color ( id_color, nombre )`
    )
    .eq("placa", placa)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ─── Crear vehículo ────────────────────────────────────────────────────────────
export async function createVehicle({ placa, id_modelo, id_color, id_persona, organizacion_id, id_estado, id_tipo }) {
  if (!placa) throw new Error("La placa es requerida");

  const existe = await getVehicleByPlaca(placa);
  if (existe) throw new Error(`Ya existe un vehículo con la placa ${placa}`);

  const { data, error } = await supabase
    .from("vehiculo")
    .insert({ placa, id_modelo, id_color, id_persona, organizacion_id, id_estado, id_tipo })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Actualizar vehículo ───────────────────────────────────────────────────────
export async function updateVehicle(id, { placa, id_modelo, id_color, id_persona, id_estado, id_tipo }) {
  if (placa) {
    const existe = await getVehicleByPlaca(placa);
    if (existe && existe.id_vehiculo !== Number(id)) {
      throw new Error(`Ya existe otro vehículo con la placa ${placa}`);
    }
  }

  const campos = {};
  if (placa !== undefined) campos.placa = placa;
  if (id_modelo !== undefined) campos.id_modelo = id_modelo;
  if (id_color !== undefined) campos.id_color = id_color;
  if (id_persona !== undefined) campos.id_persona = id_persona;
  if (id_estado !== undefined) campos.id_estado = id_estado;
  if (id_tipo !== undefined) campos.id_tipo = id_tipo;

  const { data, error } = await supabase
    .from("vehiculo")
    .update(campos)
    .eq("id_vehiculo", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Eliminar vehículo ─────────────────────────────────────────────────────────
export async function deleteVehicle(id) {
  const { error } = await supabase
    .from("vehiculo")
    .delete()
    .eq("id_vehiculo", id);

  if (error) throw error;
  return { deleted: true, id };
}

// ─── Historial de accesos de un vehículo ──────────────────────────────────────
export async function getVehicleAccessHistory(id) {
  const { data, error } = await supabase
    .from("acceso")
    .select(
      `id_registro, entrada_at, salida_at, id_plaza, id_tipo_evento,
       dispositivo_entrada:id_dispositivo_entrada ( id_dispositivo, ip_address ),
       dispositivo_salida:id_dispositivo_salida  ( id_dispositivo, ip_address )`
    )
    .eq("id_vehiculo", id)
    .order("entrada_at", { ascending: false });

  if (error) throw error;
  return data;
}
