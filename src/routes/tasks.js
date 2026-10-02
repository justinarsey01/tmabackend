import express from "express";

import {
  telegramAuth,
} from "../middleware/telegramAuth.js";

import {
  getTasks,
  completeTask,
} from "../controllers/taskController.js";

import {
  startTask,
} from "../controllers/taskVerification.js";

const router = express.Router();

router.get(
  "/",
  telegramAuth,
  getTasks
);

router.post(
  "/start",
  telegramAuth,
  startTask
);

router.post(
  "/complete",
  telegramAuth,
  completeTask
);

export default router;