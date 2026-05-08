-- Seed: catálogos mínimos requeridos por el sistema
-- NOTA: Las tablas usan GENERATED ALWAYS AS IDENTITY.
--       Para insertar con IDs específicos se requiere OVERRIDING SYSTEM VALUE.
--       Ejecutar en Supabase SQL Editor.

-- ─── Estado de plazas (parking.service.js usa 1=Libre, 2=Ocupada) ─────────────
INSERT INTO estado_plaza (id_estado, nombre)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'Libre'),
  (2, 'Ocupada'),
  (3, 'Reservada'),
  (4, 'Mantenimiento'),
  (5, 'Asignada')
ON CONFLICT (id_estado) DO NOTHING;

-- ─── Estado de reservas (reserva.service.js usa 1=Activa, 2=Cancelada, 3=Expirada)
INSERT INTO estado_reserva (id_estado, nombre)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'Activa'),
  (2, 'Cancelada'),
  (3, 'Expirada')
ON CONFLICT (id_estado) DO NOTHING;

-- ─── Estado de tickets (tickets.services.js usa 1=Activo) ─────────────────────
INSERT INTO estado_ticket (id_estado, nombre)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'Activo'),
  (2, 'Cerrado'),
  (3, 'Anulado')
ON CONFLICT (id_estado) DO NOTHING;

-- ─── Estado de zona (parking.status.js usa 1=Activa) ──────────────────────────
INSERT INTO estado_zona (id_estado, nombre)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'Activa'),
  (2, 'Inactiva'),
  (3, 'Mantenimiento')
ON CONFLICT (id_estado) DO NOTHING;

-- ─── Estado de asignacion (asignacion.service.js usa 1=Activa) ────────────────
INSERT INTO estado_asignacion (id_estado, nombre)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'Activa'),
  (2, 'Inactiva')
ON CONFLICT (id_estado) DO NOTHING;

-- ─── Estado de usuario / empleado ─────────────────────────────────────────────
INSERT INTO estado_usuario (id_estado, nombre)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'Activo'),
  (2, 'Inactivo'),
  (3, 'Bloqueado')
ON CONFLICT (id_estado) DO NOTHING;

-- ─── Tipos de evento (requeridos por parking.service.js para conflictos) ───────
INSERT INTO tipo_evento (nombre) VALUES
  ('ENTRADA'),
  ('SALIDA'),
  ('CONFLICTO_ASIGNACION'),
  ('CONFLICTO_RESERVA'),
  ('TICKET_EMITIDO')
ON CONFLICT (nombre) DO NOTHING;

-- ─── Tipos de zona ────────────────────────────────────────────────────────────
INSERT INTO tipo_zona (id_tipo, nombre, visible_movil)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'General',        true),
  (2, 'VIP',            false),
  (3, 'Administrativo', false)
ON CONFLICT (id_tipo) DO NOTHING;

-- ─── Tipos de plaza ───────────────────────────────────────────────────────────
INSERT INTO tipo_plaza (id_tipo, nombre)
OVERRIDING SYSTEM VALUE VALUES
  (1, 'General'),
  (2, 'VIP'),
  (3, 'Administrativo'),
  (4, 'Discapacitados')
ON CONFLICT (id_tipo) DO NOTHING;

-- ─── Origen de eventos ────────────────────────────────────────────────────────
INSERT INTO origen_evento (nombre) VALUES
  ('CAMARA'),
  ('GARITA'),
  ('SISTEMA'),
  ('SENSOR')
ON CONFLICT (nombre) DO NOTHING;

-- ─── Marca y modelo genérico (usados por resolverVehiculo como fallback) ───────
INSERT INTO marca (nombre) VALUES ('Genérico') ON CONFLICT (nombre) DO NOTHING;

INSERT INTO modelo (id_modelo, id_marca, nombre)
OVERRIDING SYSTEM VALUE
SELECT 1, m.id_marca, 'Genérico'
FROM marca m WHERE m.nombre = 'Genérico'
ON CONFLICT (id_modelo) DO NOTHING;

-- ─── Color genérico ───────────────────────────────────────────────────────────
INSERT INTO color (nombre) VALUES ('Sin especificar') ON CONFLICT (nombre) DO NOTHING;

-- ─── Tipo de persona ──────────────────────────────────────────────────────────
INSERT INTO tipo_persona (nombre, puede_reservar, requiere_carnet) VALUES
  ('Visitante',  false, false),
  ('Estudiante', true,  true),
  ('Empleado',   true,  false),
  ('Docente',    true,  false)
ON CONFLICT (nombre) DO NOTHING;

-- ─── Tipo de usuario ──────────────────────────────────────────────────────────
INSERT INTO tipo_usuario (nombre) VALUES
  ('Admin'),
  ('Empleado'),
  ('Estudiante'),
  ('Garita')
ON CONFLICT (nombre) DO NOTHING;

-- ─── Tipo de dispositivo ──────────────────────────────────────────────────────
INSERT INTO tipo_dispositivo (nombre) VALUES
  ('Cámara LPR'),
  ('Sensor Ultrasónico'),
  ('Barrera'),
  ('Panel')
ON CONFLICT (nombre) DO NOTHING;

-- ─── Tipo de acceso ───────────────────────────────────────────────────────────
INSERT INTO tipo_acceso (nombre) VALUES
  ('Entrada'),
  ('Salida'),
  ('Entrada/Salida')
ON CONFLICT (nombre) DO NOTHING;

-- ─── Dispositivo de cámara por defecto ────────────────────────────────────────
-- Ajusta ip_address a la IP real de tu cámara RTSP
INSERT INTO dispositivo (ip_address, organizacion_id, activo)
SELECT '192.168.100.98', 1, true
WHERE NOT EXISTS (
  SELECT 1 FROM dispositivo WHERE ip_address = '192.168.100.98'
);
