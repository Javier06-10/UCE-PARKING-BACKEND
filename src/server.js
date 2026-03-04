import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import env from "./config/env.js";
import { initSerial } from "./config/serial.js";
import { initCronJobs } from "./core/cron.service.js"; // Importar cron jobs

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

// Hacer io accesible globalmente ANTES de inicializar serial
global.io = io;
app.set("io", io);

// Inicializar serial después de que io esté disponible
initSerial();

// Inicializar Cron Jobs
initCronJobs();

io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);
  });
});

server.listen(env.port, () => {
  console.log(`🚀 Servidor corriendo en puerto ${env.port}`);
});
