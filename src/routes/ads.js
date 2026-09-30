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
| AdsGram server callback
|--------------------------------------------------------------------------
*/

router.get(
  "/reward",
  adsgramReward
);

/*
|--------------------------------------------------------------------------
| CoinEarn frontend cooldown status
|--------------------------------------------------------------------------
*/

router.get(
  "/status",
  telegramAuth,
  adsgramRewardStatus
);

export default router;