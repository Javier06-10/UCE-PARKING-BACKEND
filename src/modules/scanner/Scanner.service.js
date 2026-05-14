// src/modules/scanner/scanner.service.js
// CORRECCIONES:
//   - ESTADO_CERRADO = 2, ESTADO_VENCIDO = 3, ESTADO_ANULADO = 4 (BD real)
//   - Ticket vencido → cierra con estado 3 (Vencido), igual registra salida y abre barrera
//   - INSERT evento con campos correctos de la tabla evento

import supabase from "../../config/supabase.js";
import { sendCommand } from "../../config/serial.js";

// IDs reales en BD (estado_ticket)
const ESTADO_ACTIVO  = 1;
const ESTADO_CERRADO = 2;
const ESTADO_VENCIDO = 3;
const ESTADO_ANULADO = 4;

// ID tipo_evento SALIDA_ESCANER
const TIPO_EVENTO_SALIDA_ESCANER = 30;

function esUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// ─── Procesar salida por token de código de barras ────────────────────────────
export async function procesarSalidaEscaner({ token, dispositivoSalidaId, operadorPersonaId }) {
  if (!token || typeof token !== "string") {
    throw Object.assign(
      new Error("Token inválido"),
      { code: "TOKEN_INVALIDO", status: 400 }
    );
  }

  const tokenLimpio = token.trim();
  let esFormatoUUID = esUUID(tokenLimpio.toLowerCase());
  let idTicketFormato = null;

  const matchLargo = tokenLimpio.match(/^TICKET-(\d+)-/i);
  if (matchLargo) {
    idTicketFormato = parseInt(matchLargo[1], 10);
  } else {
    const matchNum = tokenLimpio.match(/^(\d+)$/);
    if (matchNum) idTicketFormato = parseInt(matchNum[1], 10);
  }

  if (!esFormatoUUID && !idTicketFormato) {
    throw Object.assign(new Error("Formato de código no reconocido"), { code: "TOKEN_INVALIDO", status: 400 });
  }

  // ── 1. Buscar ticket ─────────────────────────────────────────────────────────
  let query = supabase
    .from("ticket")
    .select(`
      id_ticket, placa_capturada, qr_token,
      fecha_hora_emision, fecha_hora_vencimiento,
      id_estado, id_plaza_asignada, organizacion_id,
      visitante_nombre, visitante_apellido, visitante_telefono,
      descripcion, id_codigo_reserva,
      estado_ticket ( id_estado, nombre )
    `);

  if (esFormatoUUID) {
    query = query.eq("qr_token", tokenLimpio.toLowerCase());
  } else {
    query = query.eq("id_ticket", idTicketFormato);
  }

  const { data: ticket, error: ticketError } = await query.maybeSingle();

  if (ticketError) throw new Error("Error consultando ticket: " + ticketError.message);

  if (!ticket) {
    throw Object.assign(
      new Error("Ticket no encontrado — verifica que el código sea correcto"),
      { code: "TICKET_NO_ENCONTRADO", status: 404 }
    );
  }

  // ── 2. Validar estado ────────────────────────────────────────────────────────
  if (ticket.id_estado === ESTADO_CERRADO || ticket.id_estado === ESTADO_VENCIDO) {
    throw Object.assign(
      new Error("Este ticket ya fue procesado — la salida ya fue registrada"),
      { code: "TICKET_YA_PROCESADO", status: 409, ticket }
    );
  }

  if (ticket.id_estado === ESTADO_ANULADO) {
    throw Object.assign(
      new Error("Este ticket está anulado y no puede procesarse"),
      { code: "TICKET_ANULADO", status: 409 }
    );
  }

  // ── 3. Verificar vencimiento ─────────────────────────────────────────────────
  const ahora = new Date();
  const estaVencido = ticket.fecha_hora_vencimiento
    ? new Date(ticket.fecha_hora_vencimiento) < ahora
    : false;

  if (estaVencido) {
    console.warn(`[scanner] Ticket #${ticket.id_ticket} vencido — procesando salida de todas formas`);
  }

  // ── 4. Cerrar ticket — vencido queda como estado 3, normal como 2 ───────────
  const nuevoEstado = estaVencido ? ESTADO_VENCIDO : ESTADO_CERRADO;

  const { error: closeError } = await supabase
    .from("ticket")
    .update({ id_estado: nuevoEstado })
    .eq("id_ticket", ticket.id_ticket);

  if (closeError) throw new Error("Error cerrando ticket: " + closeError.message);

  // ── 5. Registrar salida en acceso + liberar plaza ────────────────────────────
  let registroAcceso   = null;
  let duracion_minutos = null;
  let plazaLiberada    = null;

  if (ticket.placa_capturada) {
    const { data: vehiculo } = await supabase
      .from("vehiculo")
      .select("id_vehiculo")
      .eq("placa", ticket.placa_capturada)
      .maybeSingle();

    if (vehiculo) {
      const { data: accesoActivo } = await supabase
        .from("acceso")
        .select("id_registro, entrada_at, id_plaza")
        .eq("id_vehiculo", vehiculo.id_vehiculo)
        .is("salida_at", null)
        .order("entrada_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (accesoActivo) {
        const { data: accesoActualizado } = await supabase
          .from("acceso")
          .update({
            salida_at:             ahora.toISOString(),
            id_dispositivo_salida: dispositivoSalidaId || null
          })
          .eq("id_registro", accesoActivo.id_registro)
          .select()
          .single();

        registroAcceso = accesoActualizado;

        if (accesoActivo.entrada_at) {
          duracion_minutos = Math.round(
            (ahora - new Date(accesoActivo.entrada_at)) / 60000
          );
        }

        const plazaId = accesoActivo.id_plaza || ticket.id_plaza_asignada;
        if (plazaId) {
          await supabase
            .from("plaza")
            .update({ id_estado: 1 })
            .eq("id_plaza", plazaId);
          plazaLiberada = plazaId;
        }
      }
    }
  }

  // ── 6. Registrar evento SALIDA_ESCANER ───────────────────────────────────────
  const visitanteNombre = [ticket.visitante_nombre, ticket.visitante_apellido]
    .filter(Boolean).join(" ") || "Sin nombre";

  const descripcionEvento =
    `Salida por escáner. ` +
    `Placa: ${ticket.placa_capturada || "N/A"}. ` +
    `Visitante: ${visitanteNombre}. ` +
    `Ticket: #${ticket.id_ticket}. ` +
    `Duración: ${duracion_minutos != null ? duracion_minutos + " min" : "N/A"}.` +
    (estaVencido ? " [TICKET VENCIDO]" : "");

  await supabase.from("evento").insert({
    fecha_hora:      ahora.toISOString(),
    descripcion:     descripcionEvento,
    id_persona:      operadorPersonaId || null,
    organizacion_id: ticket.organizacion_id,
    id_tipo:         TIPO_EVENTO_SALIDA_ESCANER,
    created_at:      ahora.toISOString()
  });

  // ── 7. WebSocket al panel ────────────────────────────────────────────────────
  const socketPayload = {
    type:              "SALIDA_ESCANER",
    id_ticket:         ticket.id_ticket,
    placa:             ticket.placa_capturada,
    visitante:         visitanteNombre,
    duracion_minutos,
    vencido:           estaVencido,
    timestamp:         ahora.toISOString(),
    id_codigo_reserva: ticket.id_codigo_reserva || null
  };

  if (global.io) {
    global.io.emit("salida-escaner", socketPayload);
    global.io.emit("access-event", {
      type:      "SALIDA",
      placa:     ticket.placa_capturada,
      timestamp: ahora.toISOString()
    });
  }

  // ── 8. Abrir barrera de salida ───────────────────────────────────────────────
  sendCommand("OPEN_EXIT");

  return {
    ok:                 true,
    id_ticket:          ticket.id_ticket,
    placa:              ticket.placa_capturada,
    visitante_nombre:   ticket.visitante_nombre   || null,
    visitante_apellido: ticket.visitante_apellido || null,
    fecha_emision:      ticket.fecha_hora_emision,
    fecha_salida:       ahora.toISOString(),
    duracion_minutos,
    vencido:            estaVencido,
    plaza_liberada:     plazaLiberada,
    id_codigo_reserva:  ticket.id_codigo_reserva || null,
    acceso:             registroAcceso
  };
}

// ─── Previsualizar ticket por token (sin procesar) ────────────────────────────
export async function previsualizarTicket(token) {
  if (!token || typeof token !== "string") {
    throw Object.assign(new Error("Token inválido"), { code: "TOKEN_INVALIDO", status: 400 });
  }

  const tokenLimpio = token.trim();
  let esFormatoUUID = esUUID(tokenLimpio.toLowerCase());
  let idTicketFormato = null;

  const matchLargo = tokenLimpio.match(/^TICKET-(\d+)-/i);
  if (matchLargo) {
    idTicketFormato = parseInt(matchLargo[1], 10);
  } else {
    const matchNum = tokenLimpio.match(/^(\d+)$/);
    if (matchNum) idTicketFormato = parseInt(matchNum[1], 10);
  }

  if (!esFormatoUUID && !idTicketFormato) {
    throw Object.assign(new Error("Formato de código no reconocido"), { code: "TOKEN_INVALIDO", status: 400 });
  }

  let query = supabase
    .from("ticket")
    .select(`
      id_ticket, placa_capturada, qr_token,
      fecha_hora_emision, fecha_hora_vencimiento,
      id_estado, id_plaza_asignada, organizacion_id,
      visitante_nombre, visitante_apellido, visitante_telefono,
      descripcion, id_codigo_reserva,
      estado_ticket ( id_estado, nombre ),
      plaza:id_plaza_asignada ( numero_plaza, zona ( nombre ) )
    `);

  if (esFormatoUUID) {
    query = query.eq("qr_token", tokenLimpio.toLowerCase());
  } else {
    query = query.eq("id_ticket", idTicketFormato);
  }

  const { data: ticket, error } = await query.maybeSingle();

  if (error) throw new Error("Error consultando ticket: " + error.message);
  if (!ticket) {
    throw Object.assign(new Error("Ticket no encontrado"), { code: "TICKET_NO_ENCONTRADO", status: 404 });
  }

  const ahora   = new Date();
  const vencido = ticket.fecha_hora_vencimiento
    ? new Date(ticket.fecha_hora_vencimiento) < ahora
    : false;

  return {
    ...ticket,
    vencido,
    ya_procesado: ticket.id_estado === ESTADO_CERRADO || ticket.id_estado === ESTADO_VENCIDO,
    anulado:      ticket.id_estado === ESTADO_ANULADO
  };
}