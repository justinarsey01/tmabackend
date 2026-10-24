import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const PAGE_SIZE = 1000;

// Reads every row of a table in pages (the database returns at most 1,000 per request).
async function pagedRows(table, columns, apply = (query) => query, orderBy = "id") {
  const rows = [];

  for (let from = 0; from < 500000; from += PAGE_SIZE) {
    const { data, error } = await apply(
      supabase.from(table).select(columns)
    )
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    rows.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function countRows(table, apply = (query) => query) {
  const { count, error } = await apply(
    supabase.from(table).select("id", { count: "exact", head: true })
  );

  if (error) throw error;

  return count || 0;
}

const sum = (rows, key) =>
  rows.reduce((total, row) => total + Number(row[key] || 0), 0);

const round = (value) => Number(Number(value || 0).toFixed(4));

// One failing figure must never break the whole dashboard.
async function safe(label, promise, fallback) {
  try {
    return await promise;
  } catch (error) {
    console.error(`Dashboard figure "${label}" failed:`, error?.message || error);
    return fallback;
  }
}

/*
|--------------------------------------------------------------------------
| Extra dashboard figures: users, coins, USDT wallet and deposits, orders.
|--------------------------------------------------------------------------
*/
export async function getExtraDashboardStats() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const today = todayStart.toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    newUsersToday,
    newUsers7d,
    inactiveUsers,
    earnedRows,
    orderCoinRows,
    walletRows,
    depositRows,
    depositsInProgress,
    depositsNeedReview,
    ordersToday,
    usdtOrders,
    totalServices,
    copyServices,
  ] = await Promise.all([
    safe("new users today", countRows("profiles", (q) => q.gte("created_at", today)), 0),
    safe("new users 7d", countRows("profiles", (q) => q.gte("created_at", weekAgo)), 0),
    safe("inactive users", countRows("profiles", (q) => q.eq("is_active", false)), 0),
    safe("coins earned", pagedRows("profiles", "total_earned"), []),
    safe("coins spent on orders", pagedRows("smm_orders", "amount", (q) => q.neq("status", "rejected")), []),
    safe("usdt in wallets", pagedRows("crypto_wallets", "usdtbsc_balance", (q) => q, "user_id"), []),
    safe("usdt deposited", pagedRows("crypto_deposits", "credited_amount", (q) => q.eq("credited", true)), []),
    safe("deposits in progress", countRows("crypto_deposits", (q) => q.in("status", ["confirming", "confirmed", "sending"])), 0),
    safe("deposits needing review", countRows("crypto_deposits", (q) => q.in("status", ["partially_paid", "currency_mismatch"])), 0),
    safe("orders today", countRows("smm_orders", (q) => q.gte("created_at", today)), 0),
    safe("usdt orders", countRows("smm_orders", (q) => q.eq("payment_method", "crypto")), 0),
    safe("total services", countRows("smm_services"), 0),
    safe("channel copy services", countRows("smm_services", (q) => q.eq("active", true).eq("service_type", "channel_copy")), 0),
  ]);

  return {
    newUsersToday,
    newUsers7d,
    inactiveUsers,

    coinsEarned: Math.round(sum(earnedRows, "total_earned")),
    coinsSpentOnOrders: Math.round(sum(orderCoinRows, "amount")),

    usdtInWallets: round(sum(walletRows, "usdtbsc_balance")),
    usdtDeposited: round(sum(depositRows, "credited_amount")),
    depositsCredited: depositRows.length,
    depositsInProgress,
    depositsNeedReview,

    ordersToday,
    usdtOrders,

    totalServices,
    copyServices,
  };
}
