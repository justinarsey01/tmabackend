import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADS_REWARD = 1500;

export async function adsgramReward(req, res) {
  try {
    /*
    AdsGram sends the Telegram user ID in the
    userid query parameter.

    Example:
    /api/ads/reward?userid=123456789
    */

    const telegramId = String(req.query.userid || "").trim();

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "Telegram user ID is required",
      });
    }

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
      .select("id, telegram_id, balance, total_earned, is_active")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (profileError) {
      console.error(
        "AdsGram profile lookup error:",
        profileError
      );

      return res.status(500).json({
        success: false,
        message: "Could not find user",
      });
    }

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "CoinEarn profile not found",
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
        message: "Account has been deactivated",
      });
    }

    /*
    --------------------------------------------------
    Secure atomic reward
    --------------------------------------------------

    The database function performs the balance update
    so two simultaneous requests cannot corrupt the
    wallet balance.
    */

    const {
      data: result,
      error: rewardError,
    } = await supabase.rpc(
      "reward_adsgram",
      {
        p_user_id: profile.id,
        p_reward: ADS_REWARD,
      }
    );

    if (rewardError) {
      console.error(
        "AdsGram reward RPC error:",
        rewardError
      );

      return res.status(500).json({
        success: false,
        message: "Could not credit reward",
      });
    }

    return res.json({
      success: true,
      message: "AdsGram reward credited",
      reward: ADS_REWARD,
      balance: Number(result.balance),
    });

  } catch (error) {
    console.error(
      "AdsGram reward controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "AdsGram reward failed",
    });
  }
}