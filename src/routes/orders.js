import express from "express";
import { telegramAuth } from "../middleware/telegramAuth.js";
import { createSmmOrder } from "../controllers/orderController.js";
import {
  createCryptoSmmOrder,
  getCryptoWalletBalances,
} from "../controllers/cryptoOrderController.js";
import {
  createCryptoDeposit,
  listCryptoDeposits,
  nowPaymentsIpn,
} from "../controllers/cryptoDepositController.js";
import { getTransactionHistory } from "../controllers/historyController.js";

const router = express.Router();

// Crypto wallet balances and crypto-funded SMM orders.
router.get("/crypto/wallet", telegramAuth, getCryptoWalletBalances);
router.post("/crypto", telegramAuth, createCryptoSmmOrder);

// Crypto deposits through NOWPayments.
router.post("/crypto/deposit", telegramAuth, createCryptoDeposit);
router.get("/crypto/deposits", telegramAuth, listCryptoDeposits);
// Public webhook called by NOWPayments (verified by HMAC signature, not Telegram auth).
router.post("/crypto/ipn", nowPaymentsIpn);

// Combined history of coin orders, crypto orders and crypto deposits.
router.get("/history", telegramAuth, getTransactionHistory);

// Existing Coin-funded checkout remains unchanged.
router.post("/", telegramAuth, createSmmOrder);

export default router;
