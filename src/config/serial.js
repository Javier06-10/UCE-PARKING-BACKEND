import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { createClient } from "@supabase/supabase-js";
import env from "./env.js";
import { updatePlazas } from "../modules/parking/parking.service.js";

let port;
let parser;
let reconnectTimeout;

// Estado previo para detectar cambios reales
let lastPlazaState = null;

// ── Supabase admin (service role) para registrar heartbeats ──
const supabaseAdmin = env.supabaseUrl && env.supabaseKey
  ? createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false } })
  : null;

export const initSerial = () => {
  if (!env.serialPort) {
    console.log("⚠ SERIAL_PORT no configurado — serial deshabilitado");
    return;
  }

  port = new SerialPort({
    path: env.serialPort,
    baudRate: env.serialBaudRate,
    autoOpen: false,
  });

  // Parser línea a línea para recibir JSON completo
  parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

  parser.on("data", handleSerialData);

  port.on("open", () => {
    console.log(`🔌 Serial conectado en ${env.serialPort}`);
  });

  port.on("error", (err) => {
    console.log("❌ Error serial:", err.message);
  });

  port.on("close", () => {
    console.log("⚠ Serial desconectado");
    scheduleReconnect();
  });

  const connect = () => {
    port.open((err) => {
      if (err) {
        console.log("❌ Error abriendo puerto:", err.message);
        scheduleReconnect();
      }
    });
  };

  const scheduleReconnect = () => {
    if (reconnectTimeout) return;
    reconnectTimeout = setTimeout(() => {
      console.log("🔄 Intentando reconectar...");
      reconnectTimeout = null;
      connect();
    }, 5000);
  };

  connect();
};

// ─── Procesar datos del Arduino ─────────────────────────────────────────────
async function handleSerialData(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const json = JSON.parse(trimmed);

    if (json.type === "plaza_update" && json.plazas) {
      handlePlazaUpdate(json.plazas);

      // ── Registrar heartbeat automático en Supabase ──
      // El Arduino no llama HTTP — lo hacemos aquí cada vez que envía datos
      if (supabaseAdmin && env.arduinoDeviceId && env.arduinoOrgId) {
        const occupied = json.plazas.filter((p) => p.occupied).length;
        const total    = json.plazas.length;

        supabaseAdmin
          .rpc("fn_registrar_heartbeat", {
            p_id_dispositivo:  env.arduinoDeviceId,
            p_organizacion_id: env.arduinoOrgId,
            p_payload:         { occupied, total, plazas: json.plazas },
            p_es_error:        false,
            p_mensaje_error:   null,
          })
          .then(({ error }) => {
            if (error) console.warn("[Serial] Heartbeat RPC error:", error.message);
          });
      }
    }

    if (json.type === "gate_event") {
      console.log("🚪 Evento puerta:", json);
    }

  } catch {
    // Datos no JSON del Arduino (ej: ARDUINO_READY)
    console.log("📡 Arduino:", trimmed);
  }
}

// ─── Solo procesar si hubo cambio real ───────────────────────────────────────
function handlePlazaUpdate(plazas) {
  const currentState = JSON.stringify(
    plazas.map((p) => ({ id: p.id, occupied: p.occupied }))
  );

  // Ignorar si el estado no cambió
  if (currentState === lastPlazaState) return;

  lastPlazaState = currentState;

  console.log(
    "🅿️ Cambio detectado en plazas:",
    plazas.map((p) => `${p.id}:${p.occupied ? "⬛" : "⬜"}`).join(" ")
  );

  // Actualizar BD
  updatePlazas(plazas);

  // Emitir por Socket.IO solo cuando hay cambio
  if (global.io) {
    global.io.emit("plaza_update", {
      plazas,
      normal: plazas.filter((p) => !p.vip && p.occupied).length,
      vip:    plazas.filter((p) =>  p.vip && p.occupied).length,
    });
  }
}

// ─── Enviar comando al Arduino ────────────────────────────────────────────────
// Acepta:
//   string  → empaqueta como { command: "..." }  (OPEN_MAIN, OPEN_EXIT, OPEN_VIP)
//   object  → serializa directamente
export function sendCommand(command) {
  if (!port || !port.isOpen) {
    console.error("⚠ Serial no conectado — comando ignorado:", command);
    return;
  }

  const payload =
    typeof command === "string"
      ? JSON.stringify({ command })
      : JSON.stringify(command);

  port.write(payload + "\n");
  console.log("📤 Comando enviado:", payload);
}

export const getSerialPort = () => port;
