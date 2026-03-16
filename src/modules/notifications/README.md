# Módulo de Notificaciones

## Descripción general

Este módulo gestiona las notificaciones del sistema de parqueadero UCE. Persiste las notificaciones en la tabla `notificaciones` de Supabase y las distribuye en tiempo real mediante **Socket.IO**.

Soporta dos tipos de distribución:
- **General** → `persona_id = null` → se emite a todos los clientes conectados.
- **Personal** → `persona_id = UUID` → se emite solo al destinatario específico.

---

## Estructura de archivos

```
src/modules/notifications/
├── notifications.service.js    # Lógica con Supabase + emisión Socket.IO
├── notifications.controller.js # Handlers HTTP
├── notifications.routes.js     # Definición de rutas (protegidas con JWT)
└── README.md                   # Esta documentación
```

---

## Endpoints REST

Base: `/api/notifications` — **Todas las rutas requieren `Authorization: Bearer <token>`**

| Método   | Ruta                       | Descripción                                           |
|----------|----------------------------|-------------------------------------------------------|
| `GET`    | `/`                        | Lista notificaciones personales + generales (paginada)|
| `GET`    | `/unread-count`            | Cantidad de notificaciones no leídas (badge)          |
| `PATCH`  | `/read-all`                | Marcar **todas** las notificaciones como leídas       |
| `PATCH`  | `/:id/read`                | Marcar **una** notificación como leída                |
| `POST`   | `/`                        | Crear una notificación (uso interno / admin)          |
| `DELETE` | `/:id`                     | Eliminar una notificación                             |

### Query params para `GET /`

| Param          | Tipo    | Descripción                                        |
|----------------|---------|----------------------------------------------------|
| `page`         | number  | Número de página (default: `1`)                    |
| `limit`        | number  | Resultados por página (default: `20`)              |
| `soloNoLeidas` | boolean | Si `true`, retorna solo las no leídas              |

### Body para `POST /`

```json
{
  "tipo":       "AVISO",
  "contenido":  "El parqueadero cierra a las 22h",
  "persona_id": null,
  "id_tipo":    1
}
```

- `persona_id = null` → notificación **general** (broadcast).
- `persona_id = "uuid"` → notificación **personal**.

---

## Distribución en tiempo real (Socket.IO)

### Eventos emitidos por el servidor

| Evento                | Canal               | Cuándo se emite                  |
|-----------------------|---------------------|----------------------------------|
| `notificacion:general`| Broadcast (todos)   | Al crear notificación general    |
| `notificacion`        | Room `user:<uuid>`  | Al crear notificación personal   |

### Configuración del cliente

Para recibir notificaciones personales, el cliente debe unirse a su room propio al conectarse:

```js
// Cliente Flutter / JS / cualquier socket.io-client
socket.emit("join", persona_id); // persona_id = UUID del usuario logueado
```

Escuchar eventos:
```js
socket.on("notificacion",         (data) => { /* personal */ });
socket.on("notificacion:general", (data) => { /* general  */ });
```

---

## Uso desde otros módulos

Importa `createNotification` del servicio para generar notificaciones dentro del backend:

```js
import { createNotification } from "../notifications/notifications.service.js";

// Notificación personal
await createNotification({
  tipo:       "RESERVA_EXPIRADA",
  contenido:  "Tu reserva ha vencido.",
  persona_id: "uuid-del-usuario",
  id_tipo:    2, // FK a tipo_notificacion (opcional)
});

// Notificación general (broadcast a todos)
await createNotification({
  tipo:      "MANTENIMIENTO",
  contenido: "El sistema estará en mantenimiento de 22h a 23h.",
});
```

---

## Tabla en base de datos

```sql
CREATE TABLE public.notificaciones (
  ID_Notificacion integer GENERATED ALWAYS AS IDENTITY,
  created_at      timestamp with time zone DEFAULT now(),
  Tipo            character varying NOT NULL,
  Contenido       text NOT NULL,
  Leida           boolean NOT NULL DEFAULT false,
  persona_id      uuid,                        -- null = general
  id_tipo         integer,                     -- FK a tipo_notificacion
  CONSTRAINT notificaciones_pkey PRIMARY KEY (ID_Notificacion),
  CONSTRAINT notificacion_tipo_fk     FOREIGN KEY (id_tipo)     REFERENCES public.tipo_notificacion(id_tipo),
  CONSTRAINT notificacion_id_persona_fkey FOREIGN KEY (persona_id) REFERENCES public.personas(id)
);
```

---

## Cambios en archivos existentes

Solo se modificó **`src/app.js`** con 2 líneas para registrar el módulo:

```js
import notificationRoutes from "./modules/notifications/notifications.routes.js";
app.use("/api/notifications", notificationRoutes);
```
