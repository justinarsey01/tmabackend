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
    const telegramId = String(req.query.userid || "").trim();

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "Telegram user ID is required",
      });
    }

    console.log("AdsGram reward request for Telegram ID:", telegramId);

    // Find the correct CoinEarn user
    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .select(
          "id, telegram_id, balance, total_earned, is_active"
        )
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

    // Prevent rewards for deactivated accounts
    if (profile.is_active === false) {
      return res.status(403).json({
        success: false,
        message: "Account has been deactivated",
      });
    }

    // Atomically add the reward
    const { data: result, error: rewardError } =
      await supabase.rpc("reward_adsgram", {
        p_user_id: profile.id,
        p_reward: ADS_REWARD,
      });

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

    console.log(
      `AdsGram reward credited: ${ADS_REWARD} Coins to Telegram ID ${telegramId}`
    );

    return res.json({
      success: true,
      message: "AdsGram reward credited",
      reward: ADS_REWARD,
      balance: Number(result?.balance || 0),
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