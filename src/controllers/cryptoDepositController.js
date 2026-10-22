import "dotenv/config";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  getActiveProfileFromRequest,
  describeDbError,
} from "./cryptoOrderController.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const NOWPAYMENTS_API_URL = (
  process.env.NOWPAYMENTS_API_URL || "https://api.nowpayments.io/v1"
).replace(/\/+$/, "");

const MIN_DEPOSIT_USD =
  Number(process.env.MIN_DEPOSIT_USD) > 0 ? Number(process.env.MIN_DEPOSIT_USD) : 5;
const MAX_DEPOSIT_USD =
  Number(process.env.MAX_DEPOSIT_USD) > 0 ? Number(process.env.MAX_DEPOSIT_USD) : 5000;

// App asset -> NOWPayments currency code
const PAY_CURRENCY = {
  "USDT-BSC": "usdtbsc",
};

function isConfigured() {
  return Boolean(
    process.env.NOWPAYMENTS_API_KEY &&
      process.env.NOWPAYMENTS_IPN_SECRET &&
      process.env.PUBLIC_API_URL
  );
}

async function nowPaymentsRequest(path, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${NOWPAYMENTS_API_URL}${path}`, {
      method,
      headers: {
        "x-api-key": process.env.NOWPAYMENTS_API_KEY,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        data?.message || `NOWPayments request failed (${response.status}).`
      );
      error.upstreamStatus = response.status;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

// NOWPayments signs the JSON body with its keys sorted alphabetically.
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = sortKeys(value[key]);
        return sorted;
      }, {});
  }
  return value;
}

function isValidSignature(body, signature) {
  if (!signature || typeof signature !== "string") return false;

  const expected = crypto
    .createHmac("sha512", String(process.env.NOWPAYMENTS_IPN_SECRET).trim())
    .update(JSON.stringify(sortKeys(body)))
    .digest("hex");

  const received = signature.trim().toLowerCase();
  if (received.length !== expected.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(received, "utf8"),
    Buffer.from(expected, "utf8")
  );
}

/*
|--------------------------------------------------------------------------
| POST /api/orders/crypto/deposit  (Telegram auth)
| Creates a NOWPayments invoice and returns its payment link.
|--------------------------------------------------------------------------
*/
export async function createCryptoDeposit(req, res) {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Crypto deposits are not available right now.",
      });
    }

    const profile = await getActiveProfileFromRequest(req);
    const asset = req.body?.asset || "USDT-BSC";
    const amountUsd = Math.round(Number(req.body?.amountUsd) * 100) / 100;

    if (!PAY_CURRENCY[asset]) {
      return res.status(400).json({ success: false, message: "Choose a valid crypto asset." });
    }
    if (!Number.isFinite(amountUsd) || amountUsd < MIN_DEPOSIT_USD || amountUsd > MAX_DEPOSIT_USD) {
      return res.status(400).json({
        success: false,
        message: `Deposit amount must be between $${MIN_DEPOSIT_USD} and $${MAX_DEPOSIT_USD}.`,
      });
    }

    // Light abuse guard: too many unpaid invoices in the last hour.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("crypto_deposits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("credited", false)
      .gte("created_at", since);
    if (countError) throw countError;
    if (count >= 10) {
      return res.status(429).json({
        success: false,
        message: "Too many unpaid deposits. Please try again later.",
      });
    }

    const orderId = `dep_${crypto.randomUUID()}`;

    const { error: insertError } = await supabase.from("crypto_deposits").insert({
      order_id: orderId,
      user_id: profile.id,
      asset,
      price_usd: amountUsd,
    });
    if (insertError) throw insertError;

    const baseUrl = String(process.env.PUBLIC_API_URL).replace(/\/+$/, "");

    let invoice;
    try {
      invoice = await nowPaymentsRequest("/invoice", {
        method: "POST",
        body: {
          price_amount: amountUsd,
          price_currency: "usd",
          pay_currency: PAY_CURRENCY[asset],
          order_id: orderId,
          order_description: `CoinEarn ${asset} deposit`,
          ipn_callback_url: `${baseUrl}/api/orders/crypto/ipn`,
          ...(process.env.NOWPAYMENTS_SUCCESS_URL && {
            success_url: process.env.NOWPAYMENTS_SUCCESS_URL,
          }),
          ...(process.env.NOWPAYMENTS_CANCEL_URL && {
            cancel_url: process.env.NOWPAYMENTS_CANCEL_URL,
          }),
        },
      });
    } catch (error) {
      console.error("NOWPayments create invoice failed:", error);
      await supabase
        .from("crypto_deposits")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("order_id", orderId);
      return res.status(502).json({
        success: false,
        message: `Could not create the payment: ${error.message}`,
      });
    }

    if (!invoice?.invoice_url) {
      return res.status(502).json({
        success: false,
        message: "The payment provider did not return a payment link.",
      });
    }

    await supabase
      .from("crypto_deposits")
      .update({
        invoice_id: invoice.id ? String(invoice.id) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId);

    return res.json({ success: true, orderId, invoiceUrl: invoice.invoice_url });
  } catch (error) {
    console.error("createCryptoDeposit:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status
        ? error.message
        : describeDbError(error) || "Could not start the deposit.",
    });
  }
}

/*
|--------------------------------------------------------------------------
| GET /api/orders/crypto/deposits  (Telegram auth)
|--------------------------------------------------------------------------
*/
export async function listCryptoDeposits(req, res) {
  try {
    const profile = await getActiveProfileFromRequest(req);

    const { data, error } = await supabase
      .from("crypto_deposits")
      .select("order_id, asset, price_usd, status, credited, credited_amount, created_at")
      .eq("user_id", profile.id)
      .not("status", "in", "(failed,pending,waiting)") // hide unpaid invoices
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;

    return res.json({
      success: true,
      deposits: (data || []).map((row) => ({
        orderId: row.order_id,
        asset: row.asset,
        amountUsd: Number(row.price_usd),
        status: row.status,
        credited: row.credited,
        creditedAmount: row.credited_amount == null ? null : Number(row.credited_amount),
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("listCryptoDeposits:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status
        ? error.message
        : describeDbError(error) || "Could not load deposits.",
    });
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/orders/crypto/ipn  (public, signature-verified)
| NOWPayments calls this whenever a payment changes status.
|--------------------------------------------------------------------------
*/
export async function nowPaymentsIpn(req, res) {
  try {
    if (!process.env.NOWPAYMENTS_IPN_SECRET || !process.env.NOWPAYMENTS_API_KEY) {
      return res.status(503).json({ success: false });
    }

    const body = req.body;
    if (!body || typeof body !== "object") {
      return res.status(400).json({ success: false });
    }

    if (!isValidSignature(body, req.headers["x-nowpayments-sig"])) {
      console.warn("NOWPayments IPN rejected: bad signature");
      return res.status(401).json({ success: false });
    }

    const orderId = String(body.order_id || "");
    const paymentId = body.payment_id != null ? String(body.payment_id) : null;

    const { data: deposit, error: findError } = await supabase
      .from("crypto_deposits")
      .select("order_id, asset, credited")
      .eq("order_id", orderId)
      .maybeSingle();
    if (findError) throw findError;

    if (!deposit) {
      // Not one of ours (or an old test). Answer 200 so NOWPayments stops retrying.
      console.warn("NOWPayments IPN for unknown order:", orderId);
      return res.json({ success: true, ignored: true });
    }

    if (deposit.credited) {
      return res.json({ success: true, alreadyCredited: true });
    }

    if (!paymentId) {
      return res.json({ success: true, ignored: true });
    }

    // Do not trust the callback body alone: confirm the payment with NOWPayments.
    // If this call fails we answer 5xx so NOWPayments retries later.
    const payment = await nowPaymentsRequest(`/payment/${encodeURIComponent(paymentId)}`);

    if (String(payment.order_id) !== orderId) {
      console.warn("NOWPayments IPN order mismatch:", orderId, payment.order_id);
      return res.json({ success: true, ignored: true });
    }

    const status = String(payment.payment_status || body.payment_status || "unknown");

    await supabase
      .from("crypto_deposits")
      .update({
        status,
        payment_id: paymentId,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .eq("credited", false);

    if (status !== "finished") {
      return res.json({ success: true, status });
    }

    const expectedCurrency = PAY_CURRENCY[deposit.asset];
    if (String(payment.pay_currency || "").toLowerCase() !== expectedCurrency) {
      console.error(
        "NOWPayments currency mismatch, not credited:",
        orderId,
        payment.pay_currency,
        expectedCurrency
      );
      await supabase
        .from("crypto_deposits")
        .update({ status: "currency_mismatch", updated_at: new Date().toISOString() })
        .eq("order_id", orderId);
      return res.json({ success: true, needsReview: true });
    }

    const amount = Number(payment.actually_paid);
    if (!Number.isFinite(amount) || amount <= 0) {
      console.error("NOWPayments finished payment without actually_paid:", orderId);
      return res.json({ success: true, needsReview: true });
    }

    const { error: creditError } = await supabase.rpc("credit_crypto_deposit", {
      p_order_id: orderId,
      p_amount: amount,
      p_payment_id: paymentId,
      p_status: status,
    });
    if (creditError) throw creditError;

    return res.json({ success: true, credited: true });
  } catch (error) {
    console.error("nowPaymentsIpn:", error);
    // 5xx makes NOWPayments retry the notification.
    return res.status(500).json({ success: false });
  }
}
