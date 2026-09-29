
import dotenv from "dotenv";
import { parse } from "@tma.js/init-data-node";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function mineCoin(req, res) {
  try {
    /*
    --------------------------------------------------
    Telegram authentication has already been verified
    by telegramAuth middleware.
    --------------------------------------------------
    */

    const initData = req.telegramInitData;

    if (!initData) {
      return res.status(401).json({
        success: false,
        message: "Telegram authentication data is missing",
      });
    }

    const data = parse(initData);

    const telegramUser = data.user;

    if (!telegramUser) {
      return res.status(400).json({
        success: false,
        message: "Telegram user not found",
      });
    }

    const telegramId = String(telegramUser.id);

    /*
    --------------------------------------------------
    Find the CoinEarn profile
    --------------------------------------------------
    */

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("id,balance,telegram_id,is_active")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (profileError) {
      console.error(
        "Profile lookup error:",
        profileError
      );

      return res.status(500).json({
        success: false,
        message: "Could not find your profile",
      });
    }

    /*
    --------------------------------------------------
    Make sure profile exists
    --------------------------------------------------
    */

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    /*
    --------------------------------------------------
    Check account status
    --------------------------------------------------
    */

    if (profile.is_active === false) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated.",
      });
    }

    /*
    --------------------------------------------------
    Perform secure mining operation
    --------------------------------------------------
    */

    const {
      data: result,
      error: miningError,
    } = await supabase.rpc("mine_coin", {
      p_user_id: profile.id,
    });

    if (miningError) {
      console.error(
        "Mining RPC error:",
        miningError
      );

      return res.status(400).json({
        success: false,
        message:
          miningError.message || "Mining failed",
      });
    }

    /*
    --------------------------------------------------
    Make sure RPC returned a result
    --------------------------------------------------
    */

    if (!result) {
      return res.status(500).json({
        success: false,
        message: "Mining returned no result",
      });
    }

    /*
    --------------------------------------------------
    Return updated mining state
    --------------------------------------------------
    */

    return res.json({
      success: true,

      balance: Number(result.balance || 0),

      energy: Number(result.energy || 0),

      last_energy_update:
        result.last_energy_update || null,
    });

  } catch (error) {
    console.error(
      "Mining controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Mining request failed",
    });
  }
}

