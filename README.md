# 🚗 UCE Parking Backend

Backend del sistema de parqueo inteligente para la Universidad Central del Este, basado en IoT con integración Arduino, Supabase y Socket.IO para tiempo real.

## Tecnologías

| Componente | Tecnología |
|---|---|
| Runtime | Node.js (ES Modules) |
| Framework | Express 4 |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth |
| Tiempo real | Socket.IO |
| IoT | SerialPort (Arduino) |

## Instalación

```bash
# Clonar e instalar
git clone <repo-url>
cd uce-parkink-backend
npm install

# Configurar variables de entorno
cp .env.example .env
```

### Variables de entorno (`.env`)

```env
PORT=4000
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
SERIAL_PORT=COM7
SERIAL_BAUDRATE=9600
```

### Ejecutar

```bash
npm run dev    # Desarrollo (nodemon)
npm start      # Producción
```

---

## Estructura del Proyecto

```
src/
├── app.js                          # Express app + rutas
├── server.js                       # HTTP server + Socket.IO + Serial init
├── config/
│   ├── env.js                      # Variables de entorno
│   ├── supabase.js                 # Cliente Supabase
│   └── serial.js                   # Comunicación Arduino (unificado)
├── middlewares/
│   └── auth.middleware.js          # Verificación token Supabase Auth
└── modules/
    ├── access/                     # Entrada, salida, historial
    ├── vehicles/                   # CRUD vehículos
    ├── tickets/                    # Emisión y gestión de tickets
    ├── parking/                    # Estado plazas y zonas
    ├── reports/                    # Reportes de ocupación
    ├── users/                      # Gestión de usuarios
    ├── reserva/                    # Reservas activas
    └── asignacion/                 # Asignaciones permanentes
```

---

## Autenticación

Todas las rutas protegidas requieren el token de Supabase Auth:

```
Authorization: Bearer <supabase_access_token>
```

El middleware valida con `supabase.auth.getUser(token)` y adjunta los datos del usuario a `req.user`.

---

## API Endpoints

### Health Check

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/` | ❌ | Estado del servidor |

---

### 🚗 Acceso — `/api/access`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/entrada` | ❌ | Registrar entrada (desde cámara/Arduino) |
| `POST` | `/entrada-visitante` | ✅ | Entrada de visitante autorizado |
| `POST` | `/salida` | ✅ | Registrar salida manual por placa |
| `GET` | `/historial` | ✅ | Historial paginado con duración |
| `POST` | `/open-main` | ✅ | Abrir barrera principal |
| `POST` | `/open-vip` | ✅ | Abrir barrera VIP |

**POST `/entrada`**
```json
{ "placa": "ABC-1234", "dispositivoEntradaId": 1 }
```

**POST `/salida`**
```json
{ "placa": "ABC-1234", "dispositivoSalidaId": 2 }
```

**POST `/entrada-visitante`**
```json
{
  "nombre": "Juan Pérez",
  "placa": "XYZ-5678",
  "dispositivoEntradaId": 1,
  "adminPersonaId": "uuid-admin",
  "motivo": "Reunión"
}
```

**GET `/historial`** — Query params: `page`, `limit`, `fechaDesde`, `fechaHasta`

Respuesta incluye `duracion_minutos` calculado para cada registro.

---

### 🚙 Vehículos — `/api/vehicles`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/` | ✅ | Lista paginada |
| `GET` | `/:id` | ✅ | Detalle con datos de persona |
| `GET` | `/placa/:placa` | ✅ | Buscar por placa |
| `GET` | `/:id/history` | ✅ | Historial de accesos del vehículo |
| `POST` | `/` | ✅ | Crear vehículo |
| `PUT` | `/:id` | ✅ | Actualizar vehículo |
| `DELETE` | `/:id` | ✅ | Eliminar vehículo |

**POST/PUT Body:**
```json
{ "placa": "ABC-1234", "Marca": "Toyota", "Color": "Blanco", "persona_id": "uuid" }
```

**GET `/`** — Query params: `page`, `limit`, `search`

---

### 🎫 Tickets — `/api/tickets`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/` | ✅ | Lista paginada |
| `GET` | `/:id` | ✅ | Detalle del ticket |
| `POST` | `/` | ✅ | Emitir ticket |
| `PATCH` | `/:id/estado` | ✅ | Cambiar estado |
| `DELETE` | `/:id` | ✅ | Eliminar ticket |

**POST Body:**
```json
{
  "placa": "ABC-1234",
  "color": "Rojo",
  "marca": "Chevrolet",
  "plazaAsignada": 5,
  "personaId": "uuid",
  "dispositivoEntradaId": 1
}
```

**GET `/`** — Query params: `page`, `limit`, `estado` (id), `search` (placa)

---

### 🅿️ Parking — `/api/parking`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/status` | ✅ | Snapshot completo del parqueadero |
| `GET` | `/plazas` | ✅ | Plazas filtradas |

**GET `/status`** — Respuesta:
```json
{
  "ok": true,
  "total_capacidad": 50,
  "total_ocupadas": 12,
  "total_libres": 38,
  "porcentaje_ocupacion": 24,
  "zonas": [
    {
      "id_zona": 1,
      "nombre": "Zona A",
      "capacidad_total": 25,
      "ocupadas": 8,
      "libres": 17,
      "porcentaje_ocupacion": 32,
      "plazas": [...]
    }
  ]
}
```

**GET `/plazas`** — Query params: `zonaId`, `estado` (1=Libre, 2=Ocupada)

---

### 📊 Reportes — `/api/reports`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/ocupacion` | ✅ | Reporte sin guardar |
| `GET` | `/` | ✅ | Listar reportes guardados |
| `POST` | `/` | ✅ | Generar y guardar reporte |

**GET `/ocupacion`** — Query params: `fechaDesde`, `fechaHasta`, `zonaId`

Respuesta:
```json
{
  "ok": true,
  "periodo": { "desde": "2026-01-01", "hasta": "2026-01-31" },
  "resumen": {
    "total_entradas": 450,
    "total_salidas": 445,
    "vehiculos_activos": 5,
    "duracion_promedio_minutos": 127,
    "hora_pico": "08:00"
  },
  "ocupacion_por_hora": [
    { "hora": 0, "entradas": 2 },
    { "hora": 8, "entradas": 45 }
  ],
  "ocupacion_por_dia": [
    { "fecha": "2026-01-01", "entradas": 15 }
  ]
}
```

---

### 👤 Usuarios — `/api/users`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/` | ✅ | Listar usuarios |

---

## Socket.IO — Eventos en Tiempo Real

Conectar desde el cliente:

```javascript
const socket = io('http://localhost:4000');
```

### Eventos emitidos por el servidor

| Evento | Datos | Descripción |
|---|---|---|
| `plaza_update` | `{ plazas, normal, vip }` | Cambio de estado de plazas (solo cuando hay cambio real) |
| `access-event` | `{ type, placa, timestamp }` | Entrada o salida de vehículo |
| `ticket-emitido` | `{ ticketId, placa, emision }` | Ticket emitido a visitante |

---

## Comunicación Arduino (Serial)

El backend se comunica con Arduino vía puerto serial (9600 baud). Protocolo JSON línea a línea.

### Arduino → Backend

```json
{ "type": "plaza_update", "plazas": [{ "id": 1, "occupied": false }, { "id": 2, "occupied": true }] }
```

### Backend → Arduino

```json
{ "command": "open_main" }
{ "command": "open_vip" }
```

Detección de cambios: el backend compara cada `plaza_update` con el estado anterior y solo procesa/emite si hay un cambio real.

---

## Base de Datos

El proyecto usa Supabase (PostgreSQL). Las tablas principales son:

| Tabla | Propósito |
|---|---|
| `vehiculos` | Registro de vehículos (placa, marca, color) |
| `registros_acceso` | Entradas y salidas con timestamps |
| `plazas` | Espacios de estacionamiento |
| `zonas_estacionamiento` | Agrupación de plazas |
| `tickets` | Tickets para visitantes |
| `RESERVA` | Reservas de plazas |
| `asignaciones_parqueo` | Asignaciones permanentes |
| `dispositivos` | Sensores y cámaras IoT |
| `eventos` | Log de eventos del sistema |
| `reportes` | Reportes generados |
| `personas` | Datos personales |
| `usuarios` | Cuentas de usuario (Supabase Auth) |
| `empleados` | Empleados con roles |
| `notificaciones` | Notificaciones del sistema |
| `mantenimientos` | Mantenimiento de dispositivos |

### Datos iniciales requeridos

```sql
INSERT INTO estado_plaza (nombre_estado) VALUES ('Libre'), ('Ocupada')
  ON CONFLICT (nombre_estado) DO NOTHING;

INSERT INTO estado_ticket (nombre_estado) VALUES ('Activo'), ('Vencido'), ('Anulado'), ('Usado')
  ON CONFLICT (nombre_estado) DO NOTHING;

INSERT INTO estado_reserva (nombre_estado) VALUES ('Activa'), ('Completada'), ('Cancelada')
  ON CONFLICT (nombre_estado) DO NOTHING;
```

---

## Integración con Frontends

### Flutter (App Móvil)

```dart
final session = Supabase.instance.client.auth.currentSession;
final token = session?.accessToken;

final response = await http.get(
  Uri.parse('http://TU_IP:4000/api/parking/status'),
  headers: { 'Authorization': 'Bearer $token' },
);
```

Socket.IO:
```dart
final socket = IO.io('http://TU_IP:4000', { 'transports': ['websocket'] });
socket.on('plaza_update', (data) => print(data));
```

### Panel Web

```javascript
const { data: { session } } = await supabase.auth.getSession();

fetch('http://localhost:4000/api/parking/status', {
  headers: { 'Authorization': `Bearer ${session.access_token}` }
});
```

---

## Objetivos del Proyecto

| # | Objetivo | Estado |
|---|---|---|
| 1 | Registrar placas, color y marca por cámara | 50% (falta integración LPR) |
| 2 | Imprimir tickets a no registrados | ✅ 90% |
| 3 | Acceso a vehículos registrados por cámara | ✅ 75% |
| 4 | Captar hora de entrada y salida | ✅ 95% |
| 5 | Registrar periodo de permanencia | ✅ 95% |
| 6 | Disponibilidad en tiempo real | ✅ 95% |
| 7 | Reportes de ocupación por periodo | ✅ 90% |
