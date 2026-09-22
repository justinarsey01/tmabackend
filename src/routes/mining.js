import express from "express";

import { telegramAuth } from "../middleware/telegramAuth.js";

import {
  mineCoin,
} from "../controllers/miningController.js";


const router =
  express.Router();


router.post(
  "/tap",
  telegramAuth,
  mineCoin
);


export default router;