import supabase from "../../config/supabase.js";
import QRCode from "qrcode";

// ─── Helper: id de estado para tickets (tabla global con contexto) ──────────────
async function getEstadoTicketId(nombre) {
  const { data } = await supabase
    .from("estado_ticket")
    .select("id_estado")
    .ilike("nombre", nombre)
    .maybeSingle();
  return data?.id_estado || 1;
}

// ─── Listar tickets con paginación y filtros ───────────────────────────────────
export async function getAllTickets({ page = 1, limit = 20, estado, search } = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from("ticket")
    .select(
      `id_ticket, placa_capturada, fecha_hora_emision, fecha_hora_vencimiento,
       id_estado, id_visitante, id_vehiculo, id_plaza_asignada, qr_token, id_persona,
       estado:id_estado ( id_estado, nombre ),
       persona ( id_persona, nombre, apellido ),
       vehiculo (
         id_vehiculo, placa,
         color ( id_color, nombre ),
         modelo ( 
           id_modelo, nombre,
           marca ( id_marca, nombre )
         )
       )`,
      { count: "exact" }
    )
    .order("fecha_hora_emision", { ascending: false })
    .range(from, to);

  if (estado) query = query.eq("id_estado", estado);
  if (search) query = query.ilike("placa_capturada", `%${search}%`);

  const { data, error, count } = await query;
  if (error) throw error;

  return { data, total: count, page, limit };
}

// ─── Obtener ticket por ID ─────────────────────────────────────────────────────
export async function getTicketById(id) {
  const { data, error } = await supabase
    .from("ticket")
    .select(
      `id_ticket, placa_capturada, fecha_hora_emision, fecha_hora_vencimiento,
       id_estado, id_visitante, id_vehiculo, id_plaza_asignada, qr_token, id_persona,
       estado ( id, nombre, contexto ),
       persona ( id_persona, nombre, apellido ),
       vehiculo (
         id_vehiculo, placa,
         marca ( id_marca, nombre ),
         modelo ( id_modelo, nombre ),
         color ( id_color, nombre )
       )`
    )
    .eq("id_ticket", id)
    .single();

  if (error) throw error;
  return data;
}

// ─── Emitir un ticket ─────────────────────────────────────────────────────────
export async function emitirTicket({
  placa,
  plazaAsignada,
  personaId,
  dispositivoEntradaId,
  organizacion_id,
  id_vehiculo,
}) {
  if (!placa)          throw new Error("La placa es requerida para emitir un ticket");
  if (!organizacion_id) throw new Error("organizacion_id es requerido para emitir un ticket");

  let vehiculoId = id_vehiculo;
  if (!vehiculoId) {
    const { data: existente } = await supabase
      .from("vehiculo")
      .select("id_vehiculo")
      .eq("placa", placa)
      .maybeSingle();

    if (existente) {
      vehiculoId = existente.id_vehiculo;
    } else {
      const { data: nuevo, error } = await supabase
        .from("vehiculo")
        .insert({ placa, organizacion_id })
        .select("id_vehiculo")
        .single();
      if (error) throw error;
      vehiculoId = nuevo.id_vehiculo;
    }
  }

  const ahora       = new Date();
  const vencimiento = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const ID_ACTIVO   = await getEstadoTicketId("Activo");

  const { data: ticket, error } = await supabase
    .from("ticket")
    .insert({
      id_vehiculo:            vehiculoId,
      placa_capturada:        placa,
      fecha_hora_emision:     ahora,
      fecha_hora_vencimiento: vencimiento,
      id_plaza_asignada:      plazaAsignada || null,
      id_persona:             personaId     || null,
      id_dispositivo_entrada: dispositivoEntradaId || null,
      id_estado:              ID_ACTIVO,
      organizacion_id,
    })
    .select("*, qr_token")
    .single();

  if (error) throw error;

  let qrImage = null;
  if (ticket.qr_token) {
    qrImage = await QRCode.toDataURL(ticket.qr_token);
  }
  ticket.qrImage = qrImage;

  if (global.io) {
    global.io.emit("ticket-emitido", {
      ticketId: ticket.id_ticket,
      placa,
      emision:  ahora,
    });
  }

  return ticket;
}

// ─── Actualizar estado de ticket ───────────────────────────────────────────────
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

// ─── Eliminar ticket ──────────────────────────────────────────────────────────
export async function deleteTicket(id) {
  const { error } = await supabase
    .from("ticket")
    .delete()
    .eq("id_ticket", id);

  if (error) throw error;
  return { deleted: true, id };
}
