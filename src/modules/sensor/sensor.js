/**
 * modules/sensor/sensor.js — RF4 + RF11
 *
 * El Arduino envía (cada 500ms):
 *   { "type": "plaza_update", "plazas": [{id, occupied, vip}, ...] }
 *   → serial.js lo procesa y registra el heartbeat automáticamente
 *
 * El Arduino entiende (comandos de puertas):
 *   { "command": "OPEN_MAIN" }
 *   { "command": "OPEN_EXIT" }
 *   { "command": "OPEN_VIP" }
 *
 * La config (frecuencia, umbrales, modo) se guarda en BD solamente
 * — el firmware actual no la aplica en runtime, es para referencia/futuro.
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '../../middlewares/auth.middleware.js';
import env from '../../config/env.js';
import { sendCommand, getSerialPort } from '../../config/serial.js';

const router = express.Router();

// ── Supabase admin (service role, sin RLS) ──
const supabaseAdmin = createClient(
  env.supabaseUrl,
  env.supabaseKey,
  { auth: { persistSession: false } }
);

// Comandos válidos que entiende el Arduino
const VALID_COMMANDS = ['OPEN_MAIN', 'OPEN_EXIT', 'OPEN_VIP'];

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/sensor/command
//
// Envía un comando de puerta al Arduino vía Serial.
// Body: { "command": "OPEN_MAIN" | "OPEN_EXIT" | "OPEN_VIP" }
// ──────────────────────────────────────────────────────────────────────────────
router.post('/command', verifyToken, async (req, res) => {
  const { command } = req.body;

  if (!command || !VALID_COMMANDS.includes(command)) {
    return res.status(400).json({
      error: `Comando inválido. Válidos: ${VALID_COMMANDS.join(', ')}`
    });
  }

  const serialPort = getSerialPort();
  if (!serialPort?.isOpen) {
    return res.status(503).json({
      ok:      false,
      error:   'Puerto serial no conectado',
      puerto:  env.serialPort || 'no configurado'
    });
  }

  try {
    // El Arduino espera exactamente: {"command":"OPEN_MAIN"}\n
    sendCommand(command); // sendCommand envuelve el string en {command: "..."}

    // Registrar en log de eventos (opcional)
    if (env.arduinoDeviceId && env.arduinoOrgId) {
      supabaseAdmin
        .from('evento')
        .insert([{
          fecha_hora:      new Date().toISOString(),
          descripcion:     `Comando serial enviado al Arduino: ${command}`,
          organizacion_id: env.arduinoOrgId,
          id_dispositivo:  env.arduinoDeviceId,
        }])
        .then(({ error }) => {
          if (error) console.warn('[SensorCmd] Log error:', error.message);
        });
    }

    return res.json({ ok: true, command, metodo: 'serial' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/sensor/config
//
// Guarda parámetros de configuración en la BD (config_sensor).
// El firmware actual no aplica estos valores en runtime — quedan
// guardados para referencia o para una versión futura del firmware.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/config', verifyToken, async (req, res) => {
  const {
    id_dispositivo,
    frecuencia_ms,
    umbral_ocupado,
    umbral_libre,
    modo_operacion,
    notas
  } = req.body;

  if (!id_dispositivo) {
    return res.status(400).json({ error: 'id_dispositivo es requerido' });
  }

  // Verificar que el dispositivo existe
  const { data: disp, error: dbErr } = await supabaseAdmin
    .from('dispositivo')
    .select('id_dispositivo, organizacion_id')
    .eq('id_dispositivo', id_dispositivo)
    .maybeSingle();

  if (dbErr || !disp) {
    return res.status(404).json({ error: 'Dispositivo no encontrado' });
  }

  // Persistir en BD
  const { data: cfg, error: upsertErr } = await supabaseAdmin
    .from('config_sensor')
    .upsert(
      {
        id_dispositivo,
        organizacion_id: disp.organizacion_id,
        frecuencia_ms:   frecuencia_ms  ?? 5000,
        umbral_ocupado:  umbral_ocupado ?? 70,
        umbral_libre:    umbral_libre   ?? 30,
        modo_operacion:  modo_operacion ?? 'activo',
        notas:           notas          ?? null,
        estado_config:   'aplicado',   // guardado = aplicado (firmware actual no tiene config dinámica)
        updated_at:      new Date().toISOString(),
        ultima_aplicacion: new Date().toISOString()
      },
      { onConflict: 'id_dispositivo' }
    )
    .select()
    .single();

  if (upsertErr) {
    return res.status(500).json({ error: 'Error guardando config: ' + upsertErr.message });
  }

  return res.json({
    ok:     true,
    metodo: 'db-only',
    nota:   'Firmware actual no aplica config en runtime. Parámetros guardados en BD.',
    config: cfg
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/sensor/heartbeat
//
// Para uso manual / testing (ej: Supabase SQL Editor).
// En producción el heartbeat lo registra serial.js automáticamente
// cada vez que el Arduino envía un plaza_update.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/heartbeat', async (req, res) => {
  const {
    id_dispositivo,
    organizacion_id,
    payload,
    es_error,
    mensaje_error
  } = req.body;

  if (!id_dispositivo || !organizacion_id) {
    return res.status(400).json({
      error: 'id_dispositivo y organizacion_id son requeridos'
    });
  }

  const { data, error } = await supabaseAdmin.rpc('fn_registrar_heartbeat', {
    p_id_dispositivo:  id_dispositivo,
    p_organizacion_id: organizacion_id,
    p_payload:         payload       || null,
    p_es_error:        es_error      || false,
    p_mensaje_error:   mensaje_error || null
  });

  if (error) {
    console.error('[Heartbeat] RPC error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  return res.json({
    ok:         true,
    reconexion: data?.reconexion || false
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/sensor/:id/config
//
// Devuelve la config guardada de un dispositivo.
// Útil para el panel o para un futuro firmware con soporte de config dinámica.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/:id/config', async (req, res) => {
  const id_dispositivo = parseInt(req.params.id);

  const { data, error } = await supabaseAdmin
    .from('config_sensor')
    .select('frecuencia_ms, umbral_ocupado, umbral_libre, modo_operacion, estado_config, updated_at')
    .eq('id_dispositivo', id_dispositivo)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  // Valores por defecto del firmware
  return res.json(data || {
    frecuencia_ms:  500,   // El Arduino envía cada 500ms (hardcoded en firmware)
    umbral_ocupado: null,  // No aplica — usa digitalRead LOW del IR
    umbral_libre:   null,
    modo_operacion: 'activo',
    estado_config:  'default'
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/sensor/serial/status
//
// Estado del puerto serial — útil para diagnóstico desde el panel.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/serial/status', verifyToken, (req, res) => {
  const port = getSerialPort();
  res.json({
    conectado: port?.isOpen === true,
    puerto:    env.serialPort    || null,
    baudRate:  env.serialBaudRate || null,
    arduino_device_id: env.arduinoDeviceId || null,
    arduino_org_id:    env.arduinoOrgId    || null,
  });
});

export default router;