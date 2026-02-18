import { SerialPort } from "serialport";
import env from "./env.js";

let port;
let reconnectTimeout;

export const initSerial = () => {
  if (!env.serialPort) {
    console.log("⚠ SERIAL_PORT no configurado");
    return;
  }

  port = new SerialPort({
    path: env.serialPort,
    baudRate: env.serialBaudRate,
    autoOpen: false,
  });

  const connect = () => {
    port.open((err) => {
      if (err) {
        console.log("❌ Error abriendo puerto:", err.message);
        scheduleReconnect();
        return;
      }
    });
  };
  port.on("data", (data) => {
    const message = data.toString().trim();

    console.log("Arduino:", message);

    if (message.startsWith("PARKING:")) {
      const parts = message.split(":");

      const freeNormal = parts[2];
      const freeVip = parts[4];

      console.log("Libre Normal:", freeNormal);
      console.log("Libre VIP:", freeVip);

      // Aquí podemos guardar en Supabase
    }

    if (message === "ACK:MAIN_OPENED") {
      console.log("Puerta principal confirmada");
    }
  });

  port.on("open", () => {
    console.log(`🔌 Serial conectado en ${env.serialPort}`);
  });

  port.on("data", (data) => {
    const message = data.toString().trim();
    console.log("📡 Arduino:", message);
  });

  port.on("error", (err) => {
    console.log("❌ Error serial:", err.message);
  });

  port.on("close", () => {
    console.log("⚠ Serial desconectado");
    scheduleReconnect();
  });

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

export const getSerialPort = () => port;
