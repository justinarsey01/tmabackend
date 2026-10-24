import { orderCode } from "../lib/orderCode.js";
import { notifyNewOrder, notifyOrderStatus, notifyUserById, withTimeout } from "../lib/notify.js";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { getActiveProfileFromRequest } from "./cryptoOrderController.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const HARD_MAX_TARGETS = 10;

const USERNAME_RE = /^@([A-Za-z][A-Za-z0-9_]{3,31})$/;
const LINK_RE = /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(.+)$/i;

// Accepts @username, t.me/username, https://t.me/username, invite links (+code / joinchat/code)
// and private channel links (t.me/c/123456). Returns a clean link and a comparison key.
function normalizeChannelLink(value) {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw || raw.length > 300) return null;

  const username = raw.match(USERNAME_RE);
  if (username) {
    const name = username[1];
    return { display: `https://t.me/${name}`, key: name.toLowerCase() };
  }

  const link = raw.match(LINK_RE);
  if (!link) return null;

  const path = link[1].replace(/[?#].*$/, "").replace(/\/+$/, "");

  let match = path.match(/^\+([\w-]{5,})$/);
  if (match) return { display: `https://t.me/+${match[1]}`, key: `+${match[1]}` };

  match = path.match(/^joinchat\/([\w-]{5,})$/i);
  if (match) return { display: `https://t.me/joinchat/${match[1]}`, key: `joinchat/${match[1]}` };

  match = path.match(/^c\/(\d+)(?:\/\d+)?$/);
  if (match) return { display: `https://t.me/c/${match[1]}`, key: `c/${match[1]}` };

  match = path.match(/^([A-Za-z][A-Za-z0-9_]{3,31})(?:\/\d+)?$/);
  if (match) return { display: `https://t.me/${match[1]}`, key: match[1].toLowerCase() };

  return null;
}

/*
|--------------------------------------------------------------------------
| POST /api/orders/copy  (Telegram auth)
| Channel copy service: one source channel, 1..N target channels.
| Paid with USDT (BSC) only. The price depends on the number of targets and is
| read from the service's USDT price table inside the database function;
| the client never sends a price.
|--------------------------------------------------------------------------
*/
export async function createChannelCopyOrder(req, res) {
  try {
    const profile = await getActiveProfileFromRequest(req);
    const { serviceId, source, targets } = req.body || {};

    if (!serviceId || typeof serviceId !== "string") {
      return res.status(400).json({ success: false, message: "A valid service is required." });
    }

    const sourceLink = normalizeChannelLink(source);
    if (!sourceLink) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid source channel link, for example https://t.me/channelname or @channelname.",
      });
    }

    if (!Array.isArray(targets) || targets.length < 1 || targets.length > HARD_MAX_TARGETS) {
      return res.status(400).json({ success: false, message: "Add at least one target channel." });
    }

    const targetLinks = [];
    for (let index = 0; index < targets.length; index += 1) {
      const link = normalizeChannelLink(targets[index]);
      if (!link) {
        return res.status(400).json({
          success: false,
          message: `Target channel ${index + 1} is not a valid Telegram link.`,
        });
      }
      targetLinks.push(link);
    }

    const keys = targetLinks.map((link) => link.key);
    if (new Set(keys).size !== keys.length) {
      return res.status(400).json({ success: false, message: "Each target channel must be different." });
    }
    if (keys.includes(sourceLink.key)) {
      return res.status(400).json({ success: false, message: "A target channel cannot be the same as the source channel." });
    }

    const { data: service, error: serviceError } = await supabase
      .from("smm_services")
      .select("id, active, service_type, max_targets")
      .eq("id", serviceId)
      .maybeSingle();
    if (serviceError) throw serviceError;

    if (!service || service.active !== true || service.service_type !== "channel_copy") {
      return res.status(404).json({ success: false, message: "Service is unavailable." });
    }
    if (targetLinks.length > Number(service.max_targets || 1)) {
      return res.status(400).json({
        success: false,
        message: `You can add up to ${service.max_targets} target channels.`,
      });
    }

    const { data, error } = await supabase.rpc("create_channel_copy_order", {
      p_user_id: profile.id,
      p_service_id: service.id,
      p_source: sourceLink.display,
      p_targets: targetLinks.map((link) => link.display),
    });

    if (error) {
      console.error("create_channel_copy_order RPC error:", error);
      const message = error.message || "Could not create the order.";
      const status = /insufficient|not found|inactive|invalid|not configured|price/i.test(message) ? 400 : 500;
      return res.status(status).json({
        success: false,
        message: status === 400 ? message : "Could not create the order.",
      });
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) throw new Error("Order transaction returned no result.");

    await withTimeout(notifyNewOrder(result.id));

    return res.status(201).json({
      success: true,
      order: {
        id: result.id,
        orderNumber: orderCode(result.id),
        paymentMethod: "crypto",
        cryptoBalance: result.cryptoBalance == null ? null : Number(result.cryptoBalance),
      },
    });
  } catch (error) {
    console.error("createChannelCopyOrder:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : "Could not create the order.",
    });
  }
}
