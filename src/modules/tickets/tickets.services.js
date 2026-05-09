// src/modules/tickets/tickets.services.js
// CAMBIO: emitirTicket acepta fecha_hora_vencimiento_custom para tickets de reserva zona
//         (el vencimiento es la fecha_fin de la reserva, no 24 horas fijas)
// CAMBIO: TICKET_SELECT ya incluye id_codigo_reserva (ya estaba) — confirmado

import supabase from "../../config/supabase.js";

const TICKET_SELECT = `
  id_ticket, placa_capturada, fecha_hora_emision, fecha_hora_vencimiento,
  id_plaza_asignada, id_estado, qr_token, organizacion_id,
  visitante_nombre, visitante_apellido, visitante_telefono, visitante_sexo, descripcion,
  id_codigo_reserva,
  estado_ticket ( id_estado, nombre ),
  marca ( id_marca, nombre ),
  modelo ( id_modelo, nombre ),
  color ( id_color, nombre )
`;

export async function getAllTickets({ page = 1, limit = 20, estado, search } = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from("ticket")
    .select(TICKET_SELECT, { count: "exact" })
    .order("fecha_hora_emision", { ascending: false })
    .range(from, to);

  if (estado) query = query.eq("id_estado", estado);
  if (search) query = query.ilike("placa_capturada", `%${search}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, total: count, page, limit };
}

export async function getTicketById(id) {
  const { data, error } = await supabase
    .from("ticket")
    .select(TICKET_SELECT)
    .eq("id_ticket", id)
    .single();

  if (error) throw error;
  return data;
}

// ─── Emitir ticket ────────────────────────────────────────────────────────────
// CAMBIO: si viene id_codigo_reserva, el vencimiento = fecha_fin de la reserva
//         Si no, vencimiento = 24 horas (flujo normal)
export async function emitirTicket({
  placa,
  visitante_nombre,
  visitante_apellido,
  visitante_telefono,
  visitante_sexo,
  id_color_capturado,
  id_marca_capturada,
  id_modelo_capturado,
  plazaAsignada,
  organizacion_id,
  descripcion,
  id_codigo_reserva
}) {
  if (!placa) throw new Error("La placa es requerida para emitir un ticket");

  const ahora = new Date();
  let vencimiento = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

  // Si el ticket es de reserva de zona, el vencimiento = fecha_fin de la reserva
  if (id_codigo_reserva) {
    const { data: reserva } = await supabase
      .from("reserva_zona")
      .select("fecha_hora_fin")
      .eq("codigo_reserva", id_codigo_reserva)
      .maybeSingle();

    if (reserva?.fecha_hora_fin) {
      vencimiento = new Date(reserva.fecha_hora_fin);
    }
  }

  const { data: ticket, error } = await supabase
    .from("ticket")
    .insert({
      placa_capturada:         placa,
      fecha_hora_emision:      ahora,
      fecha_hora_vencimiento:  vencimiento,
      id_plaza_asignada:       plazaAsignada          || null,
      id_estado:               1,
      organizacion_id:         organizacion_id        || 1,
      visitante_nombre:        visitante_nombre       || null,
      visitante_apellido:      visitante_apellido     || null,
      visitante_telefono:      visitante_telefono     || null,
      visitante_sexo:          visitante_sexo         || null,
      id_color_capturado:      id_color_capturado     || null,
      id_marca_capturada:      id_marca_capturada     || null,
      id_modelo_capturado:     id_modelo_capturado    || null,
      descripcion:             descripcion            || null,
      id_codigo_reserva:       id_codigo_reserva      || null
    })
    .select()
    .single();

  if (error) throw error;

  if (global.io) {
    global.io.emit("ticket-emitido", {
      ticketId: ticket.id_ticket,
      placa,
      emision:   ahora,
      es_reserva_zona: !!id_codigo_reserva
    });
  }

  return ticket;
}

export async function updateTicketEstado(id, { id_estado }) {
  const { data, error } = await supabase
    .from("ticket")
    .update({ id_estado })
    .eq("id_ticket", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTicket(id) {
  const { error } = await supabase.from("ticket").delete().eq("id_ticket", id);
  if (error) throw error;
  return { deleted: true, id };
}