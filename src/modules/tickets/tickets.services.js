import supabase from "../../config/supabase.js";

// ─── Listar tickets con paginación y filtros ───────────────────────────────────
export async function getAllTickets({ page = 1, limit = 20, estado, search } = {}) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("tickets")
    .select(
      `Id_Ticket, Placa_Capturada, Fecha_Hora_Emision, Fecha_Hora_Vencimiento,
       Estado, Color_Vehiculo, Marca_Vehiculo,
       id_estado, id_persona, Id_Vehiculo, Id_Plaza_Asignada,
       estado_ticket ( id_estado, nombre_estado ),
       personas ( id, nombre, apellido ),
       vehiculos ( id, placa, Marca, Color )`,
      { count: "exact" }
    )
    .order("Fecha_Hora_Emision", { ascending: false })
    .range(from, to);

  if (estado) {
    query = query.eq("id_estado", estado);
  }

  if (search) {
    query = query.ilike("Placa_Capturada", `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { data, total: count, page, limit };
}

// ─── Obtener ticket por ID ─────────────────────────────────────────────────────
export async function getTicketById(id) {
  const { data, error } = await supabase
    .from("tickets")
    .select(
      `Id_Ticket, Placa_Capturada, Fecha_Hora_Emision, Fecha_Hora_Vencimiento,
       Estado, Color_Vehiculo, Marca_Vehiculo,
       id_estado, id_persona, Id_Vehiculo, Id_Plaza_Asignada,
       estado_ticket ( id_estado, nombre_estado ),
       personas ( id, nombre, apellido ),
       vehiculos ( id, placa, Marca, Color )`
    )
    .eq("Id_Ticket", id)
    .single();

  if (error) throw error;
  return data;
}

// ─── Emitir un ticket (vehículo no registrado) ────────────────────────────────
export async function emitirTicket({
  placa,
  color,
  marca,
  plazaAsignada,
  personaId,
  dispositivoEntradaId
}) {
  if (!placa) throw new Error("La placa es requerida para emitir un ticket");

  // Buscar o crear vehículo
  let vehiculo;
  const { data: existente } = await supabase
    .from("vehiculos")
    .select("id")
    .eq("placa", placa)
    .maybeSingle();

  if (existente) {
    vehiculo = existente;
  } else {
    const { data: nuevo, error } = await supabase
      .from("vehiculos")
      .insert({ placa, Marca: marca || null, Color: color || null })
      .select("id")
      .single();
    if (error) throw error;
    vehiculo = nuevo;
  }

  // Crear ticket — vence en 24h por defecto
  const ahora = new Date();
  const vencimiento = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      Id_Vehiculo: vehiculo.id,
      Placa_Capturada: placa,
      Color_Vehiculo: color || null,
      Marca_Vehiculo: marca || null,
      Fecha_Hora_Emision: ahora,
      Fecha_Hora_Vencimiento: vencimiento,
      Id_Plaza_Asignada: plazaAsignada || null,
      id_persona: personaId || null,
      id_dispositivo_entrada: dispositivoEntradaId || null,
      id_estado: 1 // Estado inicial (ej: "Activo")
    })
    .select()
    .single();

  if (error) throw error;

  // Emitir evento en tiempo real
  if (global.io) {
    global.io.emit("ticket-emitido", {
      ticketId: ticket.Id_Ticket,
      placa,
      emision: ahora
    });
  }

  return ticket;
}

// ─── Actualizar estado de ticket ───────────────────────────────────────────────
export async function updateTicketEstado(id, { id_estado, Estado }) {
  const campos = {};
  if (id_estado !== undefined) campos.id_estado = id_estado;
  if (Estado !== undefined) campos.Estado = Estado;

  const { data, error } = await supabase
    .from("tickets")
    .update(campos)
    .eq("Id_Ticket", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Eliminar ticket ──────────────────────────────────────────────────────────
export async function deleteTicket(id) {
  const { error } = await supabase
    .from("tickets")
    .delete()
    .eq("Id_Ticket", id);

  if (error) throw error;
  return { deleted: true, id };
}
