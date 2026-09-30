import express from "express";

import {
  adsgramReward,
  adsgramRewardStatus,
} from "../controllers/adController.js";

import {
  telegramAuth,
} from "../middleware/telegramAuth.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| AdsGram reward callback
|--------------------------------------------------------------------------
|
| AdsGram calls this directly.
| DO NOT put telegramAuth here.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/reward",
  adsgramReward
);

/*
|--------------------------------------------------------------------------
| Check user's AdsGram cooldown
|--------------------------------------------------------------------------
|
| This is called by the TMA itself.
| Telegram authentication protects this endpoint.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/status",
  telegramAuth,
  adsgramRewardStatus
);

export default router;