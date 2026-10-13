import express from "express";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { createSmmOrder } from "../controllers/orderController.js";
import {
  createCryptoSmmOrder,
  getCryptoWalletBalances,
} from "../controllers/cryptoOrderController.js";

const router = express.Router();

// Crypto wallet balances and crypto-funded SMM orders.
router.get("/crypto/wallet", telegramAuth, getCryptoWalletBalances);
router.post("/crypto", telegramAuth, createCryptoSmmOrder);

// Existing Coin-funded checkout remains unchanged.
router.post("/", telegramAuth, createSmmOrder);

export default router;
