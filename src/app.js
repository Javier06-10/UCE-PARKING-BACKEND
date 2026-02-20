import express from "express";
import cors from "cors";
import userRoutes from "./modules/users/user.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import { initSerial } from "./modules/serial/serial.service.js";
import accessRoutes from "../src/modules/access/access.routes.js";



const app = express();
  initSerial();



app.use(cors());
app.use(express.json());

app.use("/api/users", userRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/access",accessRoutes);



app.get("/", (req, res) => {
  res.json({ message: "Backend Parking Running 🚗" });
});

export default app;
