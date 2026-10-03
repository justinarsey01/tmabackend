import express from "express";

import {
  telegramAuth,
} from "../middleware/telegramAuth.js";

import {
  getCarouselSlides,
} from "../controllers/carouselController.js";

const router = express.Router();

router.get(
  "/",
  telegramAuth,
  getCarouselSlides
);

export default router;