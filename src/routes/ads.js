import express from "express";
import { adsgramReward } from "../controllers/adController.js";

const router = express.Router();

router.get("/reward", adsgramReward);

export default router;