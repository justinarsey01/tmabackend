import "dotenv/config";
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

function firstRelation(value) {
  return Array.isArray(value) ? value[0] : value;
}

/*
|--------------------------------------------------------------------------
| GET /api/orders/history  (Telegram auth)
| One merged, newest-first list of the user's:
|   - Coin-paid SMM orders
|   - Crypto-paid SMM orders
|   - Crypto deposits
|--------------------------------------------------------------------------
*/
export async function getTransactionHistory(req, res) {
  try {
    const profile = await getActiveProfileFromRequest(req);

    const [ordersResult, depositsResult] = await Promise.all([
      supabase
        .from("smm_orders")
        .select(`
          id,
          order_number,
          target,
          quantity,
          amount,
          status,
          payment_method,
          crypto_asset,
          crypto_amount,
          crypto_amount_usd,
          created_at,
          smm_services:service_id ( name )
        `)
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(100),

      supabase
        .from("crypto_deposits")
        .select("order_id, asset, price_usd, status, credited, credited_amount, created_at")
        .eq("user_id", profile.id)
        .neq("status", "failed") // invoices that never got created
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (ordersResult.error) throw ordersResult.error;

    // A missing deposits table must not hide the order history.
    if (depositsResult.error) {
      console.error("getTransactionHistory deposits:", depositsResult.error);
    }

    const orderItems = (ordersResult.data || []).map((order) => {
      const isCrypto = order.payment_method === "crypto";
      const service = firstRelation(order.smm_services);
      const target = String(order.target || "").trim();

      return {
        id: `order:${order.id}`,
        kind: isCrypto ? "crypto_order" : "coin_order",
        title: service?.name || "SMM order",
        subtitle: `Qty ${Number(order.quantity || 0).toLocaleString("en-US")}${
          target ? ` · ${target}` : ""
        }`,
        amount: isCrypto ? Number(order.crypto_amount) : Number(order.amount),
        currency: isCrypto ? order.crypto_asset : "COINS",
        amountUsd:
          isCrypto && order.crypto_amount_usd != null
            ? Number(order.crypto_amount_usd)
            : null,
        status: order.status || "pending",
        credited: false,
        createdAt: order.created_at,
      };
    });

    const depositItems = (depositsResult.data || []).map((deposit) => ({
      id: `deposit:${deposit.order_id}`,
      kind: "crypto_deposit",
      title: "Crypto deposit",
      subtitle: `Requested $${Number(deposit.price_usd).toLocaleString("en-US")}`,
      amount:
        deposit.credited && deposit.credited_amount != null
          ? Number(deposit.credited_amount)
          : null,
      currency: deposit.asset,
      amountUsd: Number(deposit.price_usd),
      status: deposit.status,
      credited: Boolean(deposit.credited),
      createdAt: deposit.created_at,
    }));

    const items = [...orderItems, ...depositItems]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 100);

    return res.json({ success: true, items });
  } catch (error) {
    console.error("getTransactionHistory:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status
        ? error.message
        : describeDbError(error) || "Could not load your history.",
    });
  }
}
