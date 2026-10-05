import express from "express";

import {
  getForexSignals,
  getAllForexSignals,
  createForexSignal,
  updateForexSignal,
  toggleForexSignal,
  deleteForexSignal,
} from "../controllers/forexSignalController.js";

import {
  telegramAuth,
} from "../middleware/telegramAuth.js";

import {
  adminAuth,
} from "../middleware/adminAuth.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| USER — GET ACTIVE FOREX SIGNALS
|--------------------------------------------------------------------------
|
| GET /api/forex-signals
|
| Used by the CoinEarn HomeScreen.
|
| Only active forex signal channels should be returned.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  telegramAuth,
  getForexSignals
);

/*
|--------------------------------------------------------------------------
| ADMIN — GET ALL FOREX SIGNALS
|--------------------------------------------------------------------------
|
| GET /api/forex-signals/admin
|
| Returns active and inactive channels.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/admin",
  adminAuth,
  getAllForexSignals
);

/*
|--------------------------------------------------------------------------
| ADMIN — CREATE FOREX SIGNAL
|--------------------------------------------------------------------------
|
| POST /api/forex-signals/admin
|
|--------------------------------------------------------------------------
*/

router.post(
  "/admin",
  adminAuth,
  createForexSignal
);

/*
|--------------------------------------------------------------------------
| ADMIN — UPDATE FOREX SIGNAL
|--------------------------------------------------------------------------
|
| PUT /api/forex-signals/admin/:id
|
|--------------------------------------------------------------------------
*/

router.put(
  "/admin/:id",
  adminAuth,
  updateForexSignal
);

/*
|--------------------------------------------------------------------------
| ADMIN — ACTIVATE / DEACTIVATE FOREX SIGNAL
|--------------------------------------------------------------------------
|
| PATCH /api/forex-signals/admin/:id/toggle
|
|--------------------------------------------------------------------------
*/

router.patch(
  "/admin/:id/toggle",
  adminAuth,
  toggleForexSignal
);

/*
|--------------------------------------------------------------------------
| ADMIN — DELETE FOREX SIGNAL
|--------------------------------------------------------------------------
|
| DELETE /api/forex-signals/admin/:id
|
|--------------------------------------------------------------------------
*/

router.delete(
  "/admin/:id",
  adminAuth,
  deleteForexSignal
);

export default router;