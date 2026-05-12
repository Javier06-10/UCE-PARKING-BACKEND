// src/modules/scanner/scanner.controller.js

import { procesarSalidaEscaner, previsualizarTicket } from "./Scanner.service.js";
import supabase from "../../config/supabase.js";

// ─── Helper: obtener id_persona del operador autenticado ──────────────────────
async function getPersonaId(userId) {
  const { data } = await supabase
    .from("usuario")
    .select("id_persona")
    .eq("id", userId)
    .maybeSingle();
  return data?.id_persona ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scanner/salida-ticket
// Body: { token: "uuid", dispositivoSalidaId?: int }
// ─────────────────────────────────────────────────────────────────────────────
export async function salidaTicket(req, res) {
  try {
    const { token, dispositivoSalidaId } = req.body;

    if (!token) {
      return res.status(400).json({ ok: false, error: "El token del código de barras es requerido" });
    }

    const operadorPersonaId = await getPersonaId(req.user.id);

    const resultado = await procesarSalidaEscaner({
      token,
      dispositivoSalidaId: dispositivoSalidaId || null,
      operadorPersonaId
    });

    return res.json(resultado);

  } catch (err) {
    console.error("[scanner] salidaTicket:", err.message);

    const status = err.status || 500;
    const code   = err.code   || "ERROR_INTERNO";

    // Si el ticket ya fue procesado, devolver 409 con los datos del ticket
    // para que el panel pueda mostrarlo informativo
    if (code === "TICKET_YA_PROCESADO") {
      return res.status(409).json({
        ok:      false,
        code,
        error:   err.message,
        ticket:  err.ticket || null
      });
    }

    return res.status(status).json({ ok: false, code, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/scanner/ticket/:token
// Previsualiza el ticket sin procesarlo — el panel lo muestra antes de abrir
// ─────────────────────────────────────────────────────────────────────────────
export async function getTicketPorToken(req, res) {
  try {
    const { token } = req.params;
    const data = await previsualizarTicket(token);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error("[scanner] getTicketPorToken:", err.message);
    const status = err.status || 500;
    return res.status(status).json({ ok: false, code: err.code, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/scanner/test
// Solo en desarrollo — simula una lectura del escáner con un token manual
// ─────────────────────────────────────────────────────────────────────────────
export async function testEscaner(req, res) {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ ok: false, error: "Endpoint disponible solo en desarrollo" });
  }

  try {
    const { token, dispositivoSalidaId } = req.body;
    if (!token) {
      return res.status(400).json({ ok: false, error: "token requerido" });
    }

    const operadorPersonaId = await getPersonaId(req.user.id);

    const resultado = await procesarSalidaEscaner({
      token,
      dispositivoSalidaId: dispositivoSalidaId || null,
      operadorPersonaId
    });

    return res.json({ ok: true, test: true, resultado });
  } catch (err) {
    return res.status(err.status || 400).json({ ok: false, code: err.code, error: err.message });
  }
}