import express from "express";

import { telegramAuth } from "../middleware/telegramAuth.js";
import { telegramLogin } from "../controllers/authController.js";

const router = express.Router();

router.post(
  "/telegram",
  telegramAuth,
  telegramLogin
);

export default router;