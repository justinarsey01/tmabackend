import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  sendTelegramMessage,
  deleteTelegramMessage,
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
const DELETE_WINDOW_HOURS = 47; // Telegram only deletes messages younger than 48 hours

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------- saving what was sent ------------------------- */
// Saving is best-effort: if the tables are missing, messages still send,
// they just cannot be deleted later.

async function createNotificationRecord({ message, audience, targetLabel }) {
  try {
    const { data, error } = await supabase
      .from("admin_notifications")
      .insert({ message, audience, target_label: targetLabel })
      .select("id")
      .single();

    if (error) {
      console.error("Notification record not saved:", error.message);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error("Notification record error:", error);
    return null;
  }
}

async function saveDeliveries(notificationId, deliveries, sent, failed) {
  if (!notificationId) return;

  try {
    if (deliveries.length > 0) {
      const { error } = await supabase
        .from("admin_notification_deliveries")
        .insert(
          deliveries.map((delivery) => ({
            notification_id: notificationId,
            chat_id: String(delivery.chatId),
            message_id: delivery.messageId,
          }))
        );

      if (error) {
        console.error("Deliveries not saved:", error.message);
      }
    }

    const { data: current } = await supabase
      .from("admin_notifications")
      .select("sent_count, failed_count")
      .eq("id", notificationId)
      .maybeSingle();

    if (current) {
      await supabase
        .from("admin_notifications")
        .update({
          sent_count: (current.sent_count || 0) + sent,
          failed_count: (current.failed_count || 0) + failed,
        })
        .eq("id", notificationId);
    }
  } catch (error) {
    console.error("Save deliveries error:", error);
  }
}

// Sends to a list of chats, at most PER_SECOND per second.
async function sendBatch(botToken, chatIds, message) {
  const deliveries = [];
  let sent = 0;
  let failed = 0;
  let lastError = "";

  for (let index = 0; index < chatIds.length; index += PER_SECOND) {
    const chunk = chatIds.slice(index, index + PER_SECOND);

    const results = await Promise.all(
      // Plain text on purpose: no formatting can break the message.
      chunk.map((chatId) =>
        sendTelegramMessage(botToken, chatId, message, { html: false })
      )
    );

    results.forEach((result, position) => {
      if (result.ok) {
        sent += 1;

        if (result.messageId) {
          deliveries.push({
            chatId: chunk[position],
            messageId: result.messageId,
          });
        }
      } else {
        failed += 1;
        lastError = result.error || lastError;
      }
    });

    if (index + PER_SECOND < chatIds.length) {
      await sleep(1100);
    }
  }

  return { sent, failed, deliveries, lastError };
}

/*
|--------------------------------------------------------------------------
| POST /api/admin/notifications/send   (admin only)
| audience "me"    -> test message to the admin's own Telegram
| audience "users" -> the chosen users (telegramIds, up to 100 per request)
| audience "all"   -> every active user, in batches (the admin page calls this
|                     repeatedly with the returned nextOffset until done)
| The first call returns a notificationId; later calls send it back so all
| batches belong to the same notification (used for deleting it afterwards).
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
    if (!["me", "users", "all"].includes(audience)) {
      return res.status(400).json({ success: false, message: "Choose who should receive the message." });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({
        success: false,
        message: "TELEGRAM_BOT_TOKEN is not configured on the backend.",
      });
    }

    let notificationId =
      typeof req.body?.notificationId === "string" &&
      UUID_RE.test(req.body.notificationId)
        ? req.body.notificationId
        : null;

    let chatIds = [];
    let missing = 0;
    let total = 0;
    let nextOffset = 0;
    let done = true;
    let targetLabel = "";

    if (audience === "me") {
      const telegramId = String(req.admin?.telegram_id || "");

      if (!/^\d{3,15}$/.test(telegramId)) {
        return res.status(400).json({
          success: false,
          message: "Your admin account has no Telegram ID.",
        });
      }

      chatIds = [telegramId];
      total = 1;
      nextOffset = 1;
      targetLabel = "Test to admin";
    } else if (audience === "users") {
      const raw = Array.isArray(req.body?.telegramIds) ? req.body.telegramIds : [];
      const ids = [...new Set(raw.map((value) => String(value).trim()))];

      if (
        ids.length === 0 ||
        ids.length > BATCH_MAX ||
        ids.some((id) => !/^\d{3,15}$/.test(id))
      ) {
        return res.status(400).json({
          success: false,
          message: `Choose between 1 and ${BATCH_MAX} users per request.`,
        });
      }

      // Only send to people who really are users.
      const { data: found, error: foundError } = await supabase
        .from("profiles")
        .select("telegram_id")
        .in("telegram_id", ids);
      if (foundError) throw foundError;

      chatIds = (found || []).map((row) => String(row.telegram_id));
      missing = ids.length - chatIds.length;

      if (chatIds.length === 0) {
        return res.status(404).json({ success: false, message: "None of the chosen users were found." });
      }

      total = ids.length;
      nextOffset = ids.length;

      const everyone = Math.floor(Number(req.body?.totalRecipients) || ids.length);
      targetLabel = `${everyone} selected user${everyone === 1 ? "" : "s"}`;
    } else {
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

      chatIds = (batch || []).map((row) => String(row.telegram_id));
      total = count ?? offset + chatIds.length;
      nextOffset = offset + chatIds.length;
      done = chatIds.length < limit || nextOffset >= total;
      targetLabel = "All users";
    }

    if (!notificationId) {
      notificationId = await createNotificationRecord({
        message,
        audience,
        targetLabel,
      });
    }

    const result = await sendBatch(botToken, chatIds, message);
    const failed = result.failed + missing;

    await saveDeliveries(notificationId, result.deliveries, result.sent, failed);

    if (audience === "me" && result.sent === 0) {
      return res.status(502).json({
        success: false,
        message: `Telegram did not deliver the message: ${result.lastError || "unknown error"}. Open your user bot and press Start first.`,
      });
    }

    return res.json({
      success: true,
      sent: result.sent,
      failed,
      total,
      nextOffset,
      done,
      notificationId,
      recorded: Boolean(notificationId),
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
| GET /api/admin/notifications   (admin only)
| The latest notifications that were sent from the admin page.
|--------------------------------------------------------------------------
*/
export async function listSentNotifications(req, res) {
  try {
    const { data, error } = await supabase
      .from("admin_notifications")
      .select("id, message, audience, target_label, sent_count, failed_count, deleted_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return res.json({ success: true, notifications: [], setupNeeded: true });
      }
      throw error;
    }

    const cutoff = Date.now() - DELETE_WINDOW_HOURS * 60 * 60 * 1000;

    return res.json({
      success: true,
      notifications: (data || []).map((row) => ({
        ...row,
        deletable:
          !row.deleted_at &&
          row.sent_count > 0 &&
          new Date(row.created_at).getTime() > cutoff,
      })),
    });
  } catch (error) {
    console.error("listSentNotifications error:", error);
    return res.status(500).json({ success: false, message: "Could not load sent notifications." });
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/admin/notifications/:id   (admin only)
| Deletes the message from every user's chat, up to 60 chats per call.
| The admin page calls it repeatedly until "remaining" is 0.
| Telegram only allows deleting messages younger than 48 hours.
|--------------------------------------------------------------------------
*/
export async function deleteSentNotification(req, res) {
  try {
    const { id } = req.params;

    if (!UUID_RE.test(id || "")) {
      return res.status(400).json({ success: false, message: "Invalid notification." });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({
        success: false,
        message: "TELEGRAM_BOT_TOKEN is not configured on the backend.",
      });
    }

    const { data: notification, error: findError } = await supabase
      .from("admin_notifications")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (findError) throw findError;

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found." });
    }

    const { data: rows, error: rowsError } = await supabase
      .from("admin_notification_deliveries")
      .select("id, chat_id, message_id")
      .eq("notification_id", id)
      .is("delete_status", null)
      .order("id", { ascending: true })
      .limit(BATCH_DEFAULT);
    if (rowsError) throw rowsError;

    const deletedIds = [];
    const failures = [];

    for (let index = 0; index < (rows || []).length; index += PER_SECOND) {
      const chunk = rows.slice(index, index + PER_SECOND);

      const results = await Promise.all(
        chunk.map((row) =>
          deleteTelegramMessage(botToken, row.chat_id, row.message_id)
        )
      );

      results.forEach((result, position) => {
        if (result.ok) deletedIds.push(chunk[position].id);
        else failures.push({ id: chunk[position].id, error: result.error });
      });

      if (index + PER_SECOND < rows.length) {
        await sleep(1100);
      }
    }

    if (deletedIds.length > 0) {
      await supabase
        .from("admin_notification_deliveries")
        .update({ delete_status: "deleted" })
        .in("id", deletedIds);
    }

    await Promise.all(
      failures.map((failure) =>
        supabase
          .from("admin_notification_deliveries")
          .update({
            delete_status: "failed",
            delete_error: String(failure.error || "").slice(0, 200),
          })
          .eq("id", failure.id)
      )
    );

    const { count: remaining, error: remainingError } = await supabase
      .from("admin_notification_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("notification_id", id)
      .is("delete_status", null);
    if (remainingError) throw remainingError;

    if (!remaining) {
      await supabase
        .from("admin_notifications")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
    }

    return res.json({
      success: true,
      deleted: deletedIds.length,
      failed: failures.length,
      remaining: remaining || 0,
      done: !remaining,
    });
  } catch (error) {
    console.error("deleteSentNotification error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Could not delete the notification.",
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
