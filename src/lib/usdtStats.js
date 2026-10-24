import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const PAGE_SIZE = 1000;

/*
|--------------------------------------------------------------------------
| USDT spent on crypto-paid orders
| Rejected orders are excluded because they are refunded.
| Reads in pages, because the database returns at most 1,000 rows per request.
| Returns { total, byUser: Map(userId -> amount) }.
|--------------------------------------------------------------------------
*/
export async function getUsdtSpent({ userId } = {}) {
  const byUser = new Map();
  let total = 0;

  for (let from = 0; from < 500000; from += PAGE_SIZE) {
    let query = supabase
      .from("smm_orders")
      .select("user_id, crypto_amount_usd")
      .eq("payment_method", "crypto")
      .neq("status", "rejected")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) throw error;

    for (const row of data || []) {
      const value = Number(row.crypto_amount_usd || 0);
      total += value;
      byUser.set(row.user_id, (byUser.get(row.user_id) || 0) + value);
    }

    if (!data || data.length < PAGE_SIZE) break;
  }

  return { total, byUser };
}
