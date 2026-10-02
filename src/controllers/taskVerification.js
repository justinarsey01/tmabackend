import dotenv from "dotenv";
import { parse } from "@tma.js/init-data-node";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Seconds the user must wait after opening the task before claiming.
export const MIN_WAIT_SECONDS = 10;

/* ------------------------------------------------------------------ */
/* Channel membership check (Telegram Bot API)                         */
/* ------------------------------------------------------------------ */

// Returns the public username for "@name", "t.me/name", "https://t.me/name".
// Returns null for invite links (t.me/+xxxx), bots, or anything else.
function extractChannelUsername(target) {
  const value = String(target || "").trim();

  const match =
    value.match(/^@([A-Za-z0-9_]{5,32})$/) ||
    value.match(
      /^(?:https?:\/\/)?(?:t|telegram)\.me\/([A-Za-z0-9_]{5,32})\/?$/
    ) ||
    value.match(/^([A-Za-z0-9_]{5,32})$/);

  return match ? match[1] : null;
}

// true  = user is in the channel
// false = user is NOT in the channel
// null  = could not verify (bot not admin there, invite link, API error)
async function isChannelMember(target, telegramUserId) {
  const username = extractChannelUsername(target);

  if (!username || !process.env.BOT_TOKEN) {
    return null;
  }

  try {
    const url =
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChatMember` +
      `?chat_id=${encodeURIComponent("@" + username)}` +
      `&user_id=${encodeURIComponent(telegramUserId)}`;

    const response = await fetch(url);
    const json = await response.json();

    if (!json.ok) {
      console.warn("getChatMember could not verify:", username, json.description);
      return null;
    }

    const { status, is_member } = json.result;

    if (["member", "administrator", "creator"].includes(status)) {
      return true;
    }

    if (status === "restricted") {
      return is_member === true;
    }

    return false; // "left" or "kicked"
  } catch (error) {
    console.error("getChatMember request failed:", error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* POST /api/tasks/start                                               */
/* ------------------------------------------------------------------ */

export async function startTask(req, res) {
  try {
    const initData = req.telegramInitData;

    if (!initData) {
      return res.status(401).json({
        success: false,
        message: "Telegram authentication data is missing",
      });
    }

    const telegramUser = parse(initData).user;

    if (!telegramUser) {
      return res.status(401).json({
        success: false,
        message: "Telegram user not found",
      });
    }

    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Task ID is required",
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, is_active")
      .eq("telegram_id", String(telegramUser.id))
      .maybeSingle();

    if (profileError) {
      console.error("START TASK profile error:", profileError);
      return res.status(500).json({
        success: false,
        message: "Could not find your profile",
      });
    }

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "CoinEarn profile not found",
      });
    }

    if (!profile.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated.",
      });
    }

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", taskId)
      .eq("active", true)
      .maybeSingle();

    if (taskError) {
      console.error("START TASK task error:", taskError);
      return res.status(500).json({
        success: false,
        message: "Could not start task",
      });
    }

    if (!task) {
      return res.status(400).json({
        success: false,
        message: "This task is no longer available.",
      });
    }

    // ignoreDuplicates keeps the ORIGINAL started_at, so reopening
    // the task or reloading the app never restarts the clock.
    const { error: upsertError } = await supabase
      .from("task_starts")
      .upsert(
        { user_id: profile.id, task_id: task.id },
        { onConflict: "user_id,task_id", ignoreDuplicates: true }
      );

    if (upsertError) {
      console.error("START TASK upsert error:", upsertError);
      return res.status(500).json({
        success: false,
        message: "Could not start task",
      });
    }

    const { data: start } = await supabase
      .from("task_starts")
      .select("started_at")
      .eq("user_id", profile.id)
      .eq("task_id", task.id)
      .maybeSingle();

    const elapsed = start
      ? (Date.now() - new Date(start.started_at).getTime()) / 1000
      : 0;

    return res.json({
      success: true,
      waitSeconds: Math.max(0, Math.ceil(MIN_WAIT_SECONDS - elapsed)),
    });
  } catch (error) {
    console.error("START TASK controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Could not start task",
    });
  }
}

/* ------------------------------------------------------------------ */
/* Gate used by completeTask before the complete_task RPC runs         */
/* ------------------------------------------------------------------ */

export async function verifyTaskCompletion(profileId, telegramId, taskId) {
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, type, target")
    .eq("id", taskId)
    .eq("active", true)
    .maybeSingle();

  if (taskError) {
    console.error("VERIFY task error:", taskError);
    return { ok: false, status: 500, message: "Could not verify task" };
  }

  if (!task) {
    return {
      ok: false,
      status: 400,
      message: "This task is no longer available.",
    };
  }

  const { data: start, error: startError } = await supabase
    .from("task_starts")
    .select("started_at")
    .eq("user_id", profileId)
    .eq("task_id", taskId)
    .maybeSingle();

  if (startError) {
    console.error("VERIFY start error:", startError);
    return { ok: false, status: 500, message: "Could not verify task" };
  }

  if (!start) {
    return {
      ok: false,
      status: 400,
      message: "Open the task first, then come back to claim your reward.",
    };
  }

  const elapsed = (Date.now() - new Date(start.started_at).getTime()) / 1000;

  if (elapsed < MIN_WAIT_SECONDS) {
    return {
      ok: false,
      status: 400,
      message: `Please wait ${Math.ceil(MIN_WAIT_SECONDS - elapsed)}s before claiming.`,
    };
  }

  if (task.type === "telegram" || task.type === "telegram_ad") {
    const member = await isChannelMember(task.target, telegramId);

    if (member === false) {
      return {
        ok: false,
        status: 400,
        message: "Join the channel first, then claim your reward.",
      };
    }

    // member === null means we could not verify (bot is not an admin of
    // that channel, or the target is an invite link). We allow it and rely
    // on the timer. Change this to a rejection if you want to fail closed.
  }

  return { ok: true };
}