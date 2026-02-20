import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import env from "./config/env.js";
import { initSerial } from "./config/serial.js";



const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

initSerial();


app.set("io", io);

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);
});

server.listen(env.port, () => {
  console.log(`Servidor corriendo en puerto ${env.port}`);
});
