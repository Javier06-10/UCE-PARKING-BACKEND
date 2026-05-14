// src/config/scanner.serial.js
//
// Maneja el escáner de código de barras conectado por puerto serial (USB-Serial).
// Es INDEPENDIENTE del serial.js del Arduino — usa su propio puerto y parser.
//
// El escáner envía el UUID del qr_token seguido de \n al leer un código de barras.
// Formato esperado: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\n"
//
// Configurar en .env:
//   SCANNER_PORT=/dev/ttyUSB1   (Linux) o COM4 (Windows)
//   SCANNER_BAUDRATE=9600        (la mayoría de escáneres USB-Serial usan 9600 o 115200)

import { SerialPort }    from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { procesarSalidaEscaner } from "../modules/scanner/Scanner.service.js";

let scannerPort;
let reconnectTimeout;

// ─── Validar formato UUID ──────────────────────────────────────────────────────
function esUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str?.trim());
}

// ─── Inicializar el puerto serial del escáner ─────────────────────────────────
export const initScannerSerial = () => {
  const port = process.env.SCANNER_PORT;
  const baud = Number(process.env.SCANNER_BAUDRATE) || 9600;

  if (!port) {
    console.log("⚠  SCANNER_PORT no configurado — escáner serial deshabilitado");
    return;
  }

  scannerPort = new SerialPort({
    path:     port,
    baudRate: baud,
    autoOpen: false
  });

  const parser = scannerPort.pipe(new ReadlineParser({ delimiter: "\n" }));

  // ── Procesar cada línea recibida del escáner ────────────────────────────────
  parser.on("data", async (linea) => {
    const token = linea.trim();
    if (!token) return;

    console.log(`📷 Escáner serial recibió: ${token}`);

    // Validar que sea un UUID antes de consultar la BD
    if (!esUUID(token)) {
      console.warn(`[scanner.serial] Dato recibido no es un UUID válido: "${token}"`);

      // Notificar al panel que el código es inválido
      if (global.io) {
        global.io.emit("scanner-error", {
          code:    "TOKEN_INVALIDO",
          mensaje: `Código inválido recibido: ${token}`,
          timestamp: new Date().toISOString()
        });
      }
      return;
    }

    try {
      // Procesar la salida — misma lógica que la Opción A (panel web)
      const resultado = await procesarSalidaEscaner({
        token,
        dispositivoSalidaId: null,
        operadorPersonaId:   null  // salida automática por escáner, sin operador
      });

      console.log(
        `✅ Salida escáner procesada — Ticket #${resultado.id_ticket} | ` +
        `Placa: ${resultado.placa} | ` +
        `Duración: ${resultado.duracion_minutos ?? "N/A"} min`
      );

      // El WebSocket y la barrera ya se manejan dentro de procesarSalidaEscaner
      // Aquí solo emitimos el resultado para que el panel lo muestre
      if (global.io) {
        global.io.emit("scanner-resultado", {
          ok:                true,
          id_ticket:         resultado.id_ticket,
          placa:             resultado.placa,
          visitante_nombre:  resultado.visitante_nombre,
          visitante_apellido: resultado.visitante_apellido,
          duracion_minutos:  resultado.duracion_minutos,
          vencido:           resultado.vencido,
          timestamp:         resultado.fecha_salida
        });
      }

    } catch (err) {
      console.error(`[scanner.serial] Error procesando token ${token}:`, err.message);

      // Notificar al panel el error específico
      if (global.io) {
        global.io.emit("scanner-error", {
          code:      err.code    || "ERROR_DESCONOCIDO",
          mensaje:   err.message || "Error al procesar el ticket",
          token,
          timestamp: new Date().toISOString()
        });
      }
    }
  });

  // ── Eventos del puerto ──────────────────────────────────────────────────────
  scannerPort.on("open", () => {
    console.log(`📷 Escáner serial conectado en ${port} @ ${baud} baud`);
    if (global.io) {
      global.io.emit("scanner-status", { conectado: true, puerto: port });
    }
  });

  scannerPort.on("error", (err) => {
    console.error(`[scanner.serial] Error: ${err.message}`);
    if (global.io) {
      global.io.emit("scanner-status", { conectado: false, error: err.message });
    }
  });

  scannerPort.on("close", () => {
    console.warn("[scanner.serial] Puerto cerrado — intentando reconectar...");
    if (global.io) {
      global.io.emit("scanner-status", { conectado: false });
    }
    scheduleReconnect();
  });

  // ── Intentar abrir el puerto ────────────────────────────────────────────────
  const connect = () => {
    scannerPort.open((err) => {
      if (err) {
        console.error(`[scanner.serial] No se pudo abrir ${port}:`, err.message);
        scheduleReconnect();
      }
    });
  };

  const scheduleReconnect = () => {
    if (reconnectTimeout) return;
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      console.log("[scanner.serial] Reconectando...");
      connect();
    }, 5000);
  };

  connect();
};

// ─── Estado del escáner (para el endpoint /api/scanner/status) ────────────────
export const getScannerStatus = () => ({
  configurado: !!process.env.SCANNER_PORT,
  puerto:      process.env.SCANNER_PORT || null,
  conectado:   scannerPort?.isOpen ?? false
});