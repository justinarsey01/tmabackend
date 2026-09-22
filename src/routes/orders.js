import express from "express";

import {
  telegramAuth,
} from "../middleware/telegramAuth.js";

import {
  createSmmOrder,
} from "../controllers/orderController.js";


const router =
  express.Router();


/*
|--------------------------------------------------------------------------
| CREATE SMM ORDER
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  telegramAuth,
  createSmmOrder
);


export default router;