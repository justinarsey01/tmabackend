import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  sendTelegramMessage,
  sleep,
} from "../lib/notify.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MAX_MESSAGE_LENGTH = 3500;
const BATCH_DEFAULT = 60;
const BATCH_MAX = 100;
const PER_SECOND = 25; // Telegram allows about 30 messages per second

/*
|--------------------------------------------------------------------------
| POST /api/admin/notifications/send   (admin only)
| audience "me"   -> test message to the admin's own Telegram
| audience "user" -> one user, by Telegram id
| audience "all"  -> every active user, in batches (the admin page calls this
|                    repeatedly with the returned nextOffset until done)
|--------------------------------------------------------------------------
*/
export async function sendUserNotification(req, res) {
  try {
    const message = String(req.body?.message ?? "").trim();
    const audience = req.body?.audience;

    if (!message) {
      return res.status(400).json({ success: false, message: "Write a message first." });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`,
      });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({
        success: false,
        message: "TELEGRAM_BOT_TOKEN is not configured on the backend.",
      });
    }

    // Plain text on purpose: no formatting can break the message.
    const send = (chatId) =>
      sendTelegramMessage(botToken, chatId, message, { html: false });

    /* ---------- one person: test to me, or a chosen user ---------- */
    if (audience === "me" || audience === "user") {
      let telegramId;

      if (audience === "me") {
        telegramId = String(req.admin?.telegram_id || "");
      } else {
        telegramId = String(req.body?.telegramId ?? "").trim();

        if (!/^\d{3,15}$/.test(telegramId)) {
          return res.status(400).json({
            success: false,
            message: "Enter the user's numeric Telegram ID.",
          });
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("telegram_id", telegramId)
          .maybeSingle();

        if (error) throw error;

        if (!profile) {
          return res.status(404).json({
            success: false,
            message: "No user with that Telegram ID.",
          });
        }
      }

      const result = await send(telegramId);

      if (!result.ok) {
        return res.status(502).json({
          success: false,
          message: `Telegram did not deliver the message: ${result.error}`,
        });
      }

      return res.json({
        success: true,
        sent: 1,
        failed: 0,
        total: 1,
        nextOffset: 1,
        done: true,
      });
    }

    /* ---------- everyone, in batches ---------- */
    if (audience !== "all") {
      return res.status(400).json({ success: false, message: "Choose who should receive the message." });
    }

    const offset = Math.max(0, Math.floor(Number(req.body?.offset) || 0));
    const limit = Math.min(
      BATCH_MAX,
      Math.max(1, Math.floor(Number(req.body?.limit) || BATCH_DEFAULT))
    );

    const baseFilter = (query) =>
      query.neq("is_active", false).not("telegram_id", "is", null);

    const { count, error: countError } = await baseFilter(
      supabase.from("profiles").select("id", { count: "exact", head: true })
    );
    if (countError) throw countError;

    const { data: batch, error: batchError } = await baseFilter(
      supabase.from("profiles").select("telegram_id")
    )
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (batchError) throw batchError;

    let sent = 0;
    let failed = 0;
    const rows = batch || [];

    for (let index = 0; index < rows.length; index += PER_SECOND) {
      const chunk = rows.slice(index, index + PER_SECOND);

      const results = await Promise.all(
        chunk.map((row) => send(row.telegram_id))
      );

      for (const result of results) {
        if (result.ok) sent += 1;
        else failed += 1;
      }

      if (index + PER_SECOND < rows.length) {
        await sleep(1100);
      }
    }

    const nextOffset = offset + rows.length;

    return res.json({
      success: true,
      sent,
      failed,
      total: count ?? nextOffset,
      nextOffset,
      done: rows.length < limit || nextOffset >= (count ?? nextOffset),
    });
  } catch (error) {
    console.error("sendUserNotification error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Could not send the notification.",
    });
  }
}

/*
|--------------------------------------------------------------------------
| GET /api/orders/recent   (Telegram auth)
| A privacy-safe feed of REAL recent orders for the "live orders" popup.
| It exposes only the service name, quantity and time: never who ordered
| or what the target was.
|--------------------------------------------------------------------------
*/
export async function getRecentOrders(req, res) {
  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("smm_orders")
      .select("id, quantity, target, status, created_at, smm_services:service_id ( name )")
      .gte("created_at", since)
      .neq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(15);

    if (error) throw error;

    const orders = (data || [])
      .map((order) => {
        const service = Array.isArray(order.smm_services)
          ? order.smm_services[0]
          : order.smm_services;
        const isCopy = String(order.target || "").startsWith("SOURCE:");

        return {
          id: order.id,
          service: service?.name || "",
          quantity: isCopy ? null : Number(order.quantity) || null,
          createdAt: order.created_at,
        };
      })
      .filter((order) => order.service);

    return res.json({ success: true, orders });
  } catch (error) {
    console.error("getRecentOrders error:", error);
    return res.status(500).json({ success: false, message: "Could not load recent orders." });
  }
}
