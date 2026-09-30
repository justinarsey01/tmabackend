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
    |--------------------------------------------------------------------------
    | Get Telegram ID from AdsGram Reward URL
    |--------------------------------------------------------------------------
    */

    const telegramId = String(
      req.query.userid || ""
    ).trim();

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "Telegram user ID is required",
      });
    }

    console.log(
      "AdsGram reward request for Telegram ID:",
      telegramId
    );

    /*
    |--------------------------------------------------------------------------
    | Find CoinEarn profile
    |--------------------------------------------------------------------------
    */

    const {
      data: profile,
      error: profileError,
    } = await supabase
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

    /*
    |--------------------------------------------------------------------------
    | Check account status
    |--------------------------------------------------------------------------
    */

    if (profile.is_active === false) {
      return res.status(403).json({
        success: false,
        message:
          "Account has been deactivated",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Credit AdsGram reward
    |--------------------------------------------------------------------------
    |
    | The Supabase function handles:
    |
    | - 1,500 Coin reward
    | - 3-hour cooldown
    | - wallet update
    | - reward history
    |
    |--------------------------------------------------------------------------
    */

    const {
      data: result,
      error: rewardError,
    } = await supabase.rpc(
      "reward_adsgram",
      {
        p_user_id: profile.id,
        p_reward: ADS_REWARD,
        p_telegram_id: telegramId,
      }
    );

    /*
    |--------------------------------------------------------------------------
    | Handle reward errors
    |--------------------------------------------------------------------------
    */

    if (rewardError) {
      console.error(
        "AdsGram reward RPC error:",
        rewardError
      );

      /*
       * User is still inside the 3-hour cooldown.
       */
      if (
        rewardError.message?.includes(
          "cooldown"
        )
      ) {
        return res.status(429).json({
          success: false,
          cooldown: true,
          message:
            "Your AdsGram reward is on cooldown. Please try again later.",
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Could not credit reward",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Successful reward
    |--------------------------------------------------------------------------
    */

    console.log(
      `AdsGram reward credited: ${ADS_REWARD} Coins to Telegram ID ${telegramId}`
    );

    /*
     * The next reward becomes available 3 hours
     * after this successful reward.
     */
    const nextRewardAt =
      new Date(
        Date.now() +
          3 * 60 * 60 * 1000
      ).toISOString();

    return res.json({
      success: true,

      message:
        "AdsGram reward credited",

      reward:
        ADS_REWARD,

      balance:
        Number(
          result?.balance || 0
        ),

      nextRewardAt,
    });

  } catch (error) {
    console.error(
      "AdsGram reward controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "AdsGram reward failed",
    });
  }
}