import supabase from "../../config/supabase.js";
import QRCode from "qrcode";

// ─── Helper: id_estado de estado_ticket ────────────────────────────────────────
async function getEstadoTicketId(nombre) {
  const { data } = await supabase
    .from("estado_ticket")
    .select("id_estado")
    .ilike("nombre_estado", nombre)
    .maybeSingle();
  return data?.id_estado || 1;
}

// ─── Listar tickets con paginación y filtros ───────────────────────────────────
// RLS filtra por organizacion_id automáticamente cuando el cliente usa JWT.
// Con service_role (backend) el filtro es manual a través del endpoint.
export async function getAllTickets({ page = 1, limit = 20, estado, search } = {}) {
  const from = (page - 1) * limit;
  const to   = from + limit - 1;

  let query = supabase
    .from("tickets")
    .select(
      `Id_Ticket, Placa_Capturada, Fecha_Hora_Emision, Fecha_Hora_Vencimiento,
       id_estado, id_visitante, id_vehiculo, Id_Plaza_Asignada, qr_token, id_persona,
       estado_ticket ( id_estado, nombre_estado ),
       personas ( id_persona, nombre, apellido ),
       vehiculos (
         id_vehiculo, placa,
         marcas_vehiculo ( id_marca, nombre ),
         modelos_vehiculo ( id_modelo, nombre ),
         colores_vehiculo ( id_color, nombre )
       )`,
      { count: "exact" }
    )
    .order("Fecha_Hora_Emision", { ascending: false })
    .range(from, to);

  if (estado) query = query.eq("id_estado", estado);
  if (search) query = query.ilike("Placa_Capturada", `%${search}%`);

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
       id_estado, id_visitante, id_vehiculo, Id_Plaza_Asignada, qr_token, id_persona,
       estado_ticket ( id_estado, nombre_estado ),
       personas ( id_persona, nombre, apellido ),
       vehiculos (
         id_vehiculo, placa,
         marcas_vehiculo ( id_marca, nombre ),
         modelos_vehiculo ( id_modelo, nombre ),
         colores_vehiculo ( id_color, nombre )
       )`
    )
    .eq("Id_Ticket", id)
    .single();

  if (error) throw error;
  return data;
}

// ─── Emitir un ticket ─────────────────────────────────────────────────────────
// organizacion_id: requerido por RLS (service_role no lo inyecta)
export async function emitirTicket({
  placa,
  plazaAsignada,
  personaId,
  dispositivoEntradaId,
  organizacion_id,
  id_vehiculo,     // preferir ID directo si ya se conoce
}) {
  if (!placa)          throw new Error("La placa es requerida para emitir un ticket");
  if (!organizacion_id) throw new Error("organizacion_id es requerido para emitir un ticket");

  // Buscar o crear vehículo — sin campos de texto libre
  let vehiculoId = id_vehiculo;
  if (!vehiculoId) {
    const { data: existente } = await supabase
      .from("vehiculos")
      .select("id_vehiculo")
      .eq("placa", placa)
      .maybeSingle();

    if (existente) {
      vehiculoId = existente.id_vehiculo;
    } else {
      const { data: nuevo, error } = await supabase
        .from("vehiculos")
        .insert({ placa })
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
    .from("tickets")
    .insert({
      id_vehiculo:           vehiculoId,
      Placa_Capturada:       placa,
      Fecha_Hora_Emision:    ahora,
      Fecha_Hora_Vencimiento: vencimiento,
      Id_Plaza_Asignada:     plazaAsignada || null,
      id_persona:            personaId     || null,
      id_dispositivo_entrada: dispositivoEntradaId || null,
      id_estado:             ID_ACTIVO,
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
      ticketId: ticket.Id_Ticket,
      placa,
      emision:  ahora,
    });
  }

  return ticket;
}

// ─── Actualizar estado de ticket ───────────────────────────────────────────────
export async function updateTicketEstado(id, { id_estado }) {
  const { data, error } = await supabase
    .from("tickets")
    .update({ id_estado })
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
