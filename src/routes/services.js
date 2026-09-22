import express from "express";

import {
  telegramAuth,
} from "../middleware/telegramAuth.js";

import {
  getServices,
} from "../controllers/serviceController.js";


const router =
  express.Router();


/*
|--------------------------------------------------------------------------
| GET ACTIVE SERVICES
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  telegramAuth,
  getServices
);


export default router;