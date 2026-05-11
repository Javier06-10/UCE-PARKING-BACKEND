import express from "express";
import cors from "cors";
import userRoutes from "./modules/users/user.routes.js";
import accessRoutes from "./modules/access/access.routes.js";
import vehicleRoutes from "./modules/vehicles/vehicles.routes.js";
import ticketRoutes from "./modules/tickets/tickets.routes.js";
import parkingRoutes from "./modules/parking/parking.routes.js";
import reportRoutes from "./modules/reports/reports.routes.js";
import reservaRoutes from "./modules/reserva/reserva.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import subscriptionRoutes from "./modules/suscripcion/Subscriptions.routes.js";
import notificationRoutes from "./modules/notifications/notifications.routes.js";
import catalogosRoutes from "./modules/catalogos/catalogos.routes.js";
import sensorRoutes from "./modules/sensor/sensor.js";

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true
}));


// ⚠️ IMPORTANTE: El webhook de Stripe necesita el raw body ANTES de express.json()
// Se registra primero con su propio middleware de body parsing
app.use(
  "/api/subscriptions/webhook",
  express.raw({ type: "application/json" }),
  subscriptionRoutes
);

// Para el resto de rutas, JSON normal
app.use(express.json());


app.use('/api/sensor', sensorRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/access", accessRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/parking", parkingRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/reserva", reservaRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/catalogos", catalogosRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Backend UCE Parking 🚗", version: "1.0.0" });
});

export default app;