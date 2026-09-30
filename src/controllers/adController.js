import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parse } from "@tma.js/init-data-node";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADS_REWARD = 1500;
const COOLDOWN_HOURS = 3;

/*
|--------------------------------------------------------------------------
| AdsGram Reward
|--------------------------------------------------------------------------
|
| Called by the AdsGram Reward URL.
| The server checks the user's profile and lets the database RPC
| enforce the 3-hour cooldown.
|
|--------------------------------------------------------------------------
*/

export async function adsgramReward(req, res) {
  try {
    const telegramId =
      String(req.query.userid || "").trim();

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
      .eq(
        "telegram_id",
        telegramId
      )
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
        message: "Account has been deactivated",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Credit reward through Supabase RPC
    |--------------------------------------------------------------------------
    |
    | The RPC handles:
    | - 3-hour cooldown
    | - balance update
    | - total_earned update
    | - ad_rewards history
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

    if (rewardError) {
      console.error(
        "AdsGram reward RPC error:",
        rewardError
      );

      /*
      |--------------------------------------------------------------------------
      | Cooldown
      |--------------------------------------------------------------------------
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
        message: "Could not credit reward",
      });
    }

    console.log(
      `AdsGram reward credited: ${ADS_REWARD} Coins to Telegram ID ${telegramId}`
    );

    /*
    |--------------------------------------------------------------------------
    | Return successful reward
    |--------------------------------------------------------------------------
    */

    const nextRewardAt =
      new Date(
        Date.now() +
          COOLDOWN_HOURS *
            60 *
            60 *
            1000
      ).toISOString();

    return res.json({
      success: true,
      message: "AdsGram reward credited",
      reward: ADS_REWARD,
      balance: Number(
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
      message: "AdsGram reward failed",
    });
  }
}


/*
|--------------------------------------------------------------------------
| AdsGram Reward Status
|--------------------------------------------------------------------------
|
| Called by the CoinEarn frontend.
| Uses Telegram authentication to determine whether the user
| can receive another AdsGram reward.
|
|--------------------------------------------------------------------------
*/

export async function adsgramRewardStatus(req, res) {
  try {
    /*
    |--------------------------------------------------------------------------
    | Get Telegram authentication data
    |--------------------------------------------------------------------------
    */

    const initData =
      req.telegramInitData;

    if (!initData) {
      return res.status(401).json({
        success: false,
        message:
          "Telegram authentication data is missing",
      });
    }

    const data =
      parse(initData);

    const telegramUser =
      data.user;

    if (!telegramUser) {
      return res.status(401).json({
        success: false,
        message:
          "Telegram user not found",
      });
    }

    const telegramId =
      String(
        telegramUser.id
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
        "id, telegram_id, is_active"
      )
      .eq(
        "telegram_id",
        telegramId
      )
      .maybeSingle();

    if (profileError) {
      console.error(
        "AdsGram status profile error:",
        profileError
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not find user",
      });
    }

    if (!profile) {
      return res.status(404).json({
        success: false,
        message:
          "CoinEarn profile not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Check account status
    |--------------------------------------------------------------------------
    */

    if (
      profile.is_active === false
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Account has been deactivated",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Get latest AdsGram reward
    |--------------------------------------------------------------------------
    */

    const {
      data: lastReward,
      error: rewardError,
    } = await supabase
      .from("ad_rewards")
      .select(
        "created_at"
      )
      .eq(
        "user_id",
        profile.id
      )
      .eq(
        "provider",
        "adsgram"
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (rewardError) {
      console.error(
        "AdsGram reward status lookup error:",
        rewardError
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not check reward status",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | No previous reward
    |--------------------------------------------------------------------------
    */

    if (!lastReward) {
      return res.json({
        success: true,
        available: true,
        nextRewardAt: null,
        remainingSeconds: 0,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Calculate 3-hour cooldown
    |--------------------------------------------------------------------------
    */

    const lastRewardTime =
      new Date(
        lastReward.created_at
      ).getTime();

    const cooldownMs =
      COOLDOWN_HOURS *
      60 *
      60 *
      1000;

    const nextRewardTime =
      lastRewardTime +
      cooldownMs;

    const remainingMs =
      Math.max(
        0,
        nextRewardTime -
          Date.now()
      );

    return res.json({
      success: true,

      available:
        remainingMs === 0,

      nextRewardAt:
        new Date(
          nextRewardTime
        ).toISOString(),

      remainingSeconds:
        Math.ceil(
          remainingMs / 1000
        ),
    });

  } catch (error) {
    console.error(
      "AdsGram status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not check AdsGram status",
    });
  }
}