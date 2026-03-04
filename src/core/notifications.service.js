// Servicio simple para enviar notificaciones vía WebSockets

/**
 * Notifica a un usuario específico
 * @param {string} userId - ID del usuario.
 * @param {string} eventName - Nombre del evento.
 * @param {object} payload - Datos a enviar.
 */
export function notifyUser(userId, eventName, payload) {
  if (global.io) {
     // En un escenario real las salas (rooms) ayudarían, 
     // aquí emitimos a todos y el cliente filtra o usamos un room si implementamos login de sockets.
     // Para este nivel vamos a emitir con un topico e ID:
     global.io.emit(`${eventName}_${userId}`, payload);
  }
}

/**
 * Notifica a los administradores
 * @param {string} eventName - Nombre del evento.
 * @param {object} payload - Datos a enviar.
 */
export function notifyAdmin(eventName, payload) {
  if (global.io) {
     global.io.emit(`ADMIN_${eventName}`, payload);
  }
}
