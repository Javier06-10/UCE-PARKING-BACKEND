// src/modules/scanner/scanner.service.js
//
// Flujo completo de salida por escáner de código de barras (Opción A):
//   1. Buscar ticket por qr_token (UUID impreso en el código de barras)
//   2. Validar estado y vencimiento
//   3. Cerrar ticket
//   4. Registrar salida en acceso
//   5. Liberar plaza
//   6. Registrar evento SALIDA_ESCANER
//   7. Emitir WebSocket al panel
//   8. Abrir barrera de salida (Arduino)

import supabase from "../../config/supabase.js";
import { sendCommand } from "../../config/serial.js";

// IDs de estado_ticket (deben coincidir con BD)
const ESTADO_ACTIVO  = 1;
const ESTADO_CERRADO = 2;
const ESTADO_ANULADO = 3;

// ID de tipo_evento para SALIDA_ESCANER
const TIPO_EVENTO_SALIDA_ESCANER = 30;

// ─── Validar formato UUID ──────────────────────────────────────────────────────
function esUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// ─── Procesar salida por token de código de barras ────────────────────────────
export async function procesarSalidaEscaner({ token, dispositivoSalidaId, operadorPersonaId }) {
  if (!token || !esUUID(token.trim())) {
    throw Object.assign(new Error("Token inválido — debe ser un UUID"), { code: "TOKEN_INVALIDO", status: 400 });
  }

  const tokenLimpio = token.trim().toLowerCase();

  // ── 1. Buscar ticket ─────────────────────────────────────────────────────────
  const { data: ticket, error: ticketError } = await supabase
    .from("ticket")
    .select(`
      id_ticket, placa_capturada, qr_token,
      fecha_hora_emision, fecha_hora_vencimiento,
      id_estado, id_plaza_asignada, organizacion_id,
      visitante_nombre, visitante_apellido,
      id_codigo_reserva,
      estado_ticket ( nombre )
    `)
    .eq("qr_token", tokenLimpio)
    .maybeSingle();

  if (ticketError) throw new Error("Error consultando ticket: " + ticketError.message);
  if (!ticket) {
    throw Object.assign(new Error("Ticket no encontrado"), { code: "TICKET_NO_ENCONTRADO", status: 404 });
  }

  // ── 2. Validar estado ────────────────────────────────────────────────────────
  if (ticket.id_estado === ESTADO_CERRADO) {
    throw Object.assign(
      new Error("Este ticket ya fue procesado y la salida registrada"),
      { code: "TICKET_YA_PROCESADO", status: 409, ticket }
    );
  }

  if (ticket.id_estado === ESTADO_ANULADO) {
    throw Object.assign(
      new Error("Este ticket está anulado y no puede procesarse"),
      { code: "TICKET_ANULADO", status: 409 }
    );
  }

  // ── 3. Validar vencimiento ───────────────────────────────────────────────────
  const ahora = new Date();
  if (ticket.fecha_hora_vencimiento && new Date(ticket.fecha_hora_vencimiento) < ahora) {
    // Aun así registramos la salida — el ticket venció pero el vehículo sigue adentro
    console.warn(`[scanner] Ticket ${ticket.id_ticket} vencido — procesando salida de todas formas`);
  }

  // ── 4. Cerrar ticket ─────────────────────────────────────────────────────────
  const { error: closeError } = await supabase
    .from("ticket")
    .update({ id_estado: ESTADO_CERRADO })
    .eq("id_ticket", ticket.id_ticket);

  if (closeError) throw new Error("Error cerrando ticket: " + closeError.message);

  // ── 5. Registrar salida en acceso ────────────────────────────────────────────
  let registroAcceso = null;
  let duracion_minutos = null;

  if (ticket.placa_capturada) {
    // Buscar el vehículo por placa
    const { data: vehiculo } = await supabase
      .from("vehiculo")
      .select("id_vehiculo")
      .eq("placa", ticket.placa_capturada)
      .maybeSingle();

    if (vehiculo) {
      // Buscar acceso activo (sin salida_at)
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

        // Calcular duración
        if (accesoActivo.entrada_at) {
          duracion_minutos = Math.round(
            (ahora - new Date(accesoActivo.entrada_at)) / 60000
          );
        }

        // ── 6. Liberar plaza ─────────────────────────────────────────────────
        const plazaId = accesoActivo.id_plaza || ticket.id_plaza_asignada;
        if (plazaId) {
          await supabase
            .from("plaza")
            .update({ id_estado: 1 }) // Libre
            .eq("id_plaza", plazaId);
        }
      }
    }
  }

  // ── 7. Registrar evento SALIDA_ESCANER ───────────────────────────────────────
  const visitanteNombre = [ticket.visitante_nombre, ticket.visitante_apellido]
    .filter(Boolean).join(" ") || "Sin nombre";

  await supabase.from("evento").insert({
    fecha_hora:       ahora.toISOString(),
    descripcion:      `Salida por escáner. Placa: ${ticket.placa_capturada || "N/A"}. Visitante: ${visitanteNombre}. Ticket: #${ticket.id_ticket}. Duración: ${duracion_minutos ?? "N/A"} min.`,
    id_persona:       operadorPersonaId || null,
    organizacion_id:  ticket.organizacion_id,
    id_tipo:          TIPO_EVENTO_SALIDA_ESCANER,
    created_at:       ahora.toISOString()
  });

  // ── 8. WebSocket al panel ────────────────────────────────────────────────────
  const payload = {
    type:              "SALIDA_ESCANER",
    id_ticket:         ticket.id_ticket,
    placa:             ticket.placa_capturada,
    visitante:         visitanteNombre,
    duracion_minutos,
    timestamp:         ahora.toISOString(),
    id_codigo_reserva: ticket.id_codigo_reserva || null
  };

  if (global.io) {
    global.io.emit("salida-escaner", payload);
    global.io.emit("access-event", { type: "SALIDA", placa: ticket.placa_capturada, timestamp: ahora });
  }

  // ── 9. Abrir barrera de salida ───────────────────────────────────────────────
  sendCommand("OPEN_EXIT");

  return {
    ok:                true,
    id_ticket:         ticket.id_ticket,
    placa:             ticket.placa_capturada,
    visitante_nombre:  ticket.visitante_nombre,
    visitante_apellido: ticket.visitante_apellido,
    fecha_emision:     ticket.fecha_hora_emision,
    fecha_salida:      ahora.toISOString(),
    duracion_minutos,
    id_codigo_reserva: ticket.id_codigo_reserva || null,
    acceso:            registroAcceso
  };
}

// ─── Previsualizar ticket por token (sin procesar) ───────────────────────────
// El panel puede mostrar los datos antes de confirmar la salida
export async function previsualizarTicket(token) {
  if (!token || !esUUID(token.trim())) {
    throw Object.assign(new Error("Token inválido"), { code: "TOKEN_INVALIDO", status: 400 });
  }

  const { data: ticket, error } = await supabase
    .from("ticket")
    .select(`
      id_ticket, placa_capturada, qr_token,
      fecha_hora_emision, fecha_hora_vencimiento,
      id_estado, id_plaza_asignada, organizacion_id,
      visitante_nombre, visitante_apellido, visitante_telefono,
      descripcion, id_codigo_reserva,
      estado_ticket ( nombre ),
      plaza:id_plaza_asignada ( numero_plaza, zona ( nombre ) )
    `)
    .eq("qr_token", token.trim().toLowerCase())
    .maybeSingle();

  if (error) throw new Error("Error consultando ticket: " + error.message);
  if (!ticket) {
    throw Object.assign(new Error("Ticket no encontrado"), { code: "TICKET_NO_ENCONTRADO", status: 404 });
  }

  const ahora = new Date();
  const vencido = ticket.fecha_hora_vencimiento
    ? new Date(ticket.fecha_hora_vencimiento) < ahora
    : false;

  return {
    ...ticket,
    vencido,
    ya_procesado: ticket.id_estado === ESTADO_CERRADO,
    anulado:      ticket.id_estado === ESTADO_ANULADO
  };
}