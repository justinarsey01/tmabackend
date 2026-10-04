import express from "express";

import {
  telegramAuth,
} from "../middleware/telegramAuth.js";

import {
  getReferralInfo,
  claimReferral,
} from "../controllers/referralController.js";

const router = express.Router();

router.get(
  "/",
  telegramAuth,
  getReferralInfo
);

router.post(
  "/claim",
  telegramAuth,
  claimReferral
);

export default router;