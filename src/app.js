import express from "express";
import cors from "cors";
import userRoutes from "./modules/users/user.routes.js";
import accessRoutes from "./modules/access/access.routes.js";
import vehicleRoutes from "./modules/vehicles/vehicles.routes.js";
import ticketRoutes from "./modules/tickets/tickets.routes.js";
import parkingRoutes from "./modules/parking/parking.routes.js";
import reportRoutes from "./modules/reports/reports.routes.js";
import reservaRoutes from "./modules/reserva/reserva.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/access", accessRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/parking", parkingRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/reserva", reservaRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Backend Parking Running 🚗" });
});

export default app;
