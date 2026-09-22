import express from "express";

import {
  telegramAuth,
} from "../middleware/telegramAuth.js";

import {
  getTasks,
  completeTask,
} from "../controllers/taskController.js";


const router =
  express.Router();


router.get(
  "/",
  telegramAuth,
  getTasks
);


router.post(
  "/complete",
  telegramAuth,
  completeTask
);


export default router;