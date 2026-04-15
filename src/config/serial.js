import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import env from "./env.js";
import { updatePlazas } from "../modules/parking/parking.service.js";
import supabase from "../config/supabase.js";

let port;
let parser;
let reconnectTimeout;
let estadosCatalog = [];

// Estado previo para detectar cambios reales
let lastPlazaState = null;

export const initSerial = async () => {
  if (!env.serialPort) {
    console.log("⚠ SERIAL_PORT no configurado — serial deshabilitado");
    return;
  }

  // Fetch catalog
  try {
    const { data: estados } = await supabase
      .from('estado')
      .select('id, nombre')
      .eq('contexto', 'plaza');
    estadosCatalog = estados || [];
  } catch(e) {
    console.error("Error fetching estado catalog (plaza) for serial init", e);
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

// ─── Procesar datos del Arduino ────────────────────────────────────────────────
function handleSerialData(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const json = JSON.parse(trimmed);

    if (json.type === "plaza_update" && json.plazas) {
      handlePlazaUpdate(json.plazas);
    }

    if (json.type === "gate_event") {
      console.log("🚪 Evento puerta:", json);
    }

  } catch {
    // Datos no JSON del Arduino (ej: ARDUINO_READY)
    console.log("📡 Arduino:", trimmed);
  }
}

// ─── Solo procesar si hubo cambio real ─────────────────────────────────────────
function handlePlazaUpdate(plazas) {
  const currentState = JSON.stringify(
    plazas.map(p => ({ id: p.id, occupied: p.occupied }))
  );

  // Ignorar si el estado no cambió
  if (currentState === lastPlazaState) return;

  lastPlazaState = currentState;

  console.log("🅿️ Cambio detectado en plazas:", plazas.map(p => `${p.id}:${p.occupied ? "⬛" : "⬜"}`).join(" "));

  const ESTADO_OCUPADA = estadosCatalog.find(e => e.nombre === 'Ocupada')?.id || 2;
  const ESTADO_LIBRE   = estadosCatalog.find(e => e.nombre === 'Libre')?.id   || 1;

  // Actualizar BD
  updatePlazas(plazas, ESTADO_OCUPADA, ESTADO_LIBRE);

  // Emitir por Socket.IO solo cuando hay cambio
  if (global.io) {
    global.io.emit("plaza_update", {
      plazas,
      normal: plazas.filter(p => !p.vip && p.occupied).length,
      vip: plazas.filter(p => p.vip && p.occupied).length,
    });
  }
}

// ─── Enviar comando al Arduino ─────────────────────────────────────────────────
export function sendCommand(command) {
  if (!port || !port.isOpen) {
    console.error("⚠ Serial no conectado — comando ignorado:", command);
    return;
  }

  const json = JSON.stringify({ command });
  port.write(json + "\n");
  console.log("📤 Comando enviado:", command);
}

export const getSerialPort = () => port;
