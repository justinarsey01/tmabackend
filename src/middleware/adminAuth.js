import dotenv from "dotenv";
import { parse } from "@tma.js/init-data-node";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function adminAuth(req, res, next) {
  try {
    const initData = req.telegramInitData;

    if (!initData) {
      return res.status(401).json({
        success: false,
        message: "Telegram authentication required",
      });
    }

    const data = parse(initData);
    const telegramUser = data.user;

    if (!telegramUser) {
      return res.status(401).json({
        success: false,
        message: "Telegram user not found",
      });
    }

    const telegramId = String(telegramUser.id);

    const {
      data: profile,
      error,
    } = await supabase
      .from("profiles")
      .select(`
        id,
        telegram_id,
        username,
        first_name,
        last_name,
        is_admin,
        is_active
      `)
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (error) {
      console.error("Admin profile lookup error:", error);

      return res.status(500).json({
        success: false,
        message: "Could not verify administrator",
      });
    }

    if (!profile) {
      return res.status(403).json({
        success: false,
        message: "CoinEarn account not found",
      });
    }

    if (!profile.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated",
      });
    }

    if (!profile.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Administrator access required",
      });
    }

    req.admin = profile;

    next();
  } catch (error) {
    console.error("Admin authentication error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid administrator session",
    });
  }
}