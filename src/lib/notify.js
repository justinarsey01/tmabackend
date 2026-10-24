import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

/*
|--------------------------------------------------------------------------
| Telegram notifications
|--------------------------------------------------------------------------
| Users are messaged with the main bot (TELEGRAM_BOT_TOKEN).
| Admins are messaged with the admin bot (ADMIN_TELEGRAM_BOT_TOKEN), falling
| back to the main bot. Notifications never throw: a failed message must
| never break an order, a refund or a deposit.
*/

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resolves with the fallback if the promise takes longer than `ms`.
// Serverless hosts can freeze the function after the response is sent,
// so we wait for notifications briefly instead of leaving them dangling.
export async function withTimeout(promise, ms = 4000, fallback = null) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function sendTelegramMessage(
  botToken,
  chatId,
  text,
  { html = true } = {}
) {
  if (!botToken || !chatId) {
    return { ok: false, error: "Bot token or chat id missing" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: String(chatId),
          text,
          ...(html ? { parse_mode: "HTML" } : {}),
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: data.description || `HTTP ${response.status}`,
      };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || "Network error" };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ admins ------------------------------ */

let adminCache = { at: 0, ids: [] };

async function getAdminChatIds() {
  if (Date.now() - adminCache.at < 60_000) {
    return adminCache.ids;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("telegram_id")
    .eq("is_admin", true)
    .neq("is_active", false)
    .not("telegram_id", "is", null);

  if (error) {
    console.error("notify: could not load admins:", error);
    return adminCache.ids;
  }

  adminCache = {
    at: Date.now(),
    ids: (data || []).map((row) => String(row.telegram_id)),
  };

  return adminCache.ids;
}

export async function notifyAdmins(text) {
  try {
    const adminToken =
      process.env.ADMIN_TELEGRAM_BOT_TOKEN ||
      process.env.TELEGRAM_BOT_TOKEN;
    const mainToken = process.env.TELEGRAM_BOT_TOKEN;

    const ids = await getAdminChatIds();

    await Promise.all(
      ids.map(async (chatId) => {
        let result = await sendTelegramMessage(adminToken, chatId, text);

        if (!result.ok && mainToken && mainToken !== adminToken) {
          result = await sendTelegramMessage(mainToken, chatId, text);
        }

        if (!result.ok) {
          console.warn(`notify: admin ${chatId} not reached: ${result.error}`);
        }
      })
    );
  } catch (error) {
    console.error("notifyAdmins error:", error);
  }
}

/* ------------------------------ users ------------------------------ */

export async function notifyUserByTelegramId(telegramId, text) {
  try {
    const result = await sendTelegramMessage(
      process.env.TELEGRAM_BOT_TOKEN,
      telegramId,
      text
    );

    if (!result.ok) {
      console.warn(`notify: user ${telegramId} not reached: ${result.error}`);
    }

    return result;
  } catch (error) {
    console.error("notifyUser error:", error);
    return { ok: false, error: error.message };
  }
}

export async function notifyUserById(userId, text) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile?.telegram_id) return { ok: false, error: "No Telegram id" };

    return await notifyUserByTelegramId(profile.telegram_id, text);
  } catch (error) {
    console.error("notifyUserById error:", error);
    return { ok: false, error: error.message };
  }
}

/* ------------------------- order notifications ------------------------- */

async function loadOrderDetails(orderId) {
  const { data: order, error } = await supabase
    .from("smm_orders")
    .select(
      "id, order_number, user_id, service_id, target, quantity, amount, status, payment_method, crypto_amount, crypto_amount_usd"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) return null;

  const [{ data: service }, { data: profile }] = await Promise.all([
    supabase
      .from("smm_services")
      .select("name")
      .eq("id", order.service_id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("telegram_id, username, first_name")
      .eq("id", order.user_id)
      .maybeSingle(),
  ]);

  return { order, service, profile };
}

function formatOrderNumber(order) {
  return order.order_number ?? String(order.id).slice(0, 8);
}

function formatPaid(order) {
  if (order.payment_method === "crypto") {
    const usd = Number(order.crypto_amount_usd ?? order.crypto_amount ?? 0);
    return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 4 })} USDT`;
  }

  return `${Number(order.amount || 0).toLocaleString("en-US")} Coins`;
}

function formatTarget(order) {
  const target = String(order.target || "");

  if (target.startsWith("SOURCE:")) {
    const [sourcePart, targetsPart = ""] = target.split(" | TARGETS: ");
    const targets = targetsPart.split(", ").filter(Boolean);

    return (
      `Source: ${escapeHtml(sourcePart.replace("SOURCE:", "").trim())}\n` +
      `Targets (${targets.length}): ${escapeHtml(targets.join(", "))}`
    );
  }

  return `Target: ${escapeHtml(target.slice(0, 300))}\nQuantity: ${Number(
    order.quantity || 0
  ).toLocaleString("en-US")}`;
}

// Tells every admin that a new order was placed.
export async function notifyNewOrder(orderId) {
  try {
    const details = await loadOrderDetails(orderId);
    if (!details) return;

    const { order, service, profile } = details;

    const who = profile?.username
      ? `@${escapeHtml(profile.username)}`
      : escapeHtml(profile?.first_name || "User");

    const text =
      `🛒 <b>New order #${escapeHtml(formatOrderNumber(order))}</b>\n` +
      `Service: ${escapeHtml(service?.name || "SMM service")}\n` +
      `${formatTarget(order)}\n` +
      `Paid: ${escapeHtml(formatPaid(order))}\n` +
      `User: ${who}${profile?.telegram_id ? ` (ID ${escapeHtml(profile.telegram_id)})` : ""}`;

    await notifyAdmins(text);
  } catch (error) {
    console.error("notifyNewOrder error:", error);
  }
}

// Tells the customer when an admin changes the status of their order.
export async function notifyOrderStatus(orderId, status) {
  try {
    if (!["processing", "completed", "rejected"].includes(status)) return;

    const details = await loadOrderDetails(orderId);
    if (!details?.profile?.telegram_id) return;

    const { order, service, profile } = details;
    const number = escapeHtml(formatOrderNumber(order));
    const name = escapeHtml(service?.name || "your service");

    let text;

    if (status === "processing") {
      text = `🔄 <b>Order #${number} is being processed</b>\n${name}`;
    } else if (status === "completed") {
      text = `✅ <b>Order #${number} is completed</b>\n${name}\nThank you for using CoinEarn!`;
    } else {
      text =
        `❌ <b>Order #${number} was rejected</b>\n${name}\n` +
        (order.payment_method === "crypto"
          ? `Your ${escapeHtml(formatPaid(order))} was returned to your wallet.`
          : "Your Coins were refunded.");
    }

    await notifyUserByTelegramId(profile.telegram_id, text);
  } catch (error) {
    console.error("notifyOrderStatus error:", error);
  }
}
