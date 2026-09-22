import express from "express";

import {
  telegramAuth,
} from "../middleware/telegramAuth.js";

import {
  getTasks,
  completeTask,
} from "../controllers/taskController.js";


const router = express.Router();


/*
|--------------------------------------------------------------------------
| GET ACTIVE TASKS
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  telegramAuth,
  getTasks
);


/*
|--------------------------------------------------------------------------
| COMPLETE TASK
|--------------------------------------------------------------------------
*/

router.post(
  "/complete",
  telegramAuth,
  completeTask
);


export default router;