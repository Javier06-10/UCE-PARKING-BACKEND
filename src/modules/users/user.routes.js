import express from "express";
import { listUsers } from "./user.controller.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", verifyToken, listUsers);

export default router;
