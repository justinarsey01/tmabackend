import dotenv from "dotenv";
import { parse } from "@tma.js/init-data-node";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/*
|--------------------------------------------------------------------------
| SETTINGS
|--------------------------------------------------------------------------
*/

// Coins paid when a friend joins through someone's link.
const REFERRER_BONUS = Number(process.env.REFERRER_BONUS || 500);
const REFERRED_BONUS = Number(process.env.REFERRED_BONUS || 250);

// Only accounts created within this time can claim a referral.
const NEW_USER_WINDOW_MS = 60 * 60 * 1000;

const BOT_USERNAME = (process.env.BOT_USERNAME || "coinearn90_bot")
  .trim()
  .replace(/^@/, "");

// Optional: the short name of your Mini App from BotFather.
// Leave empty to use https://t.me/<bot>?startapp=...
const APP_SHORT_NAME = (process.env.MINI_APP_SHORT_NAME || "").trim();

function buildReferralLink(telegramId) {
  const base = APP_SHORT_NAME
    ? `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}`
    : `https://t.me/${BOT_USERNAME}`;

  return `${base}?startapp=ref_${telegramId}`;
}

/*
|--------------------------------------------------------------------------
| HELPER: SIGNED TELEGRAM USER
|--------------------------------------------------------------------------
*/

function getTelegramData(req) {
  const initData = req.telegramInitData;

  if (!initData) {
    return null;
  }

  const data = parse(initData);

  if (!data.user) {
    return null;
  }

  return data;
}


/*
|--------------------------------------------------------------------------
| GET MY REFERRAL LINK AND STATS
|--------------------------------------------------------------------------
*/

export async function getReferralInfo(req, res) {
  try {
    const data = getTelegramData(req);

    if (!data) {
      return res.status(401).json({
        success: false,
        message: "Telegram authentication data is missing",
      });
    }

    const telegramId = String(data.user.id);

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("id, telegram_id, is_active")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (profileError) {
      console.error("Referral profile error:", profileError);

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

    const {
      data: rows,
      error: rowsError,
    } = await supabase
      .from("referrals")
      .select("referred_id, referrer_bonus, created_at")
      .eq("referrer_id", profile.id)
      .order("created_at", {
        ascending: false,
      });

    if (rowsError) {
      console.error("Referral list error:", rowsError);

      // TEMPORARY DIAGNOSTIC: shows the real database reason on the card.
      // Remove the part in brackets once the problem is fixed.
      return res.status(500).json({
        success: false,
        message: `Could not load your referrals [${rowsError.code || "error"}: ${rowsError.message}]`,
      });
    }

    const referrals = rows || [];

    const totalEarned = referrals.reduce(
      (total, row) => total + Number(row.referrer_bonus || 0),
      0
    );

    /*
    |--------------------------------------------------------------------------
    | NAMES OF THE 10 MOST RECENT FRIENDS
    |--------------------------------------------------------------------------
    */

    const recent = referrals.slice(0, 10);

    let namesById = new Map();

    if (recent.length > 0) {
      const {
        data: friendProfiles,
        error: friendsError,
      } = await supabase
        .from("profiles")
        .select("id, first_name, username")
        .in(
          "id",
          recent.map((row) => row.referred_id)
        );

      if (friendsError) {
        // Names are optional. Never fail the whole request for them.
        console.error("Referral friends lookup error:", friendsError);
      } else {
        namesById = new Map(
          (friendProfiles || []).map((friend) => [
            friend.id,
            friend.first_name || friend.username || "Friend",
          ])
        );
      }
    }

    const friends = recent.map((row) => ({
      name: namesById.get(row.referred_id) || "Friend",
      bonus: Number(row.referrer_bonus || 0),
      created_at: row.created_at,
    }));

    return res.json({
      success: true,
      link: buildReferralLink(telegramId),
      invited: referrals.length,
      totalEarned,
      referrerBonus: REFERRER_BONUS,
      referredBonus: REFERRED_BONUS,
      friends,
    });
  } catch (error) {
    console.error("Get referral info error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load referral information",
    });
  }
}


/*
|--------------------------------------------------------------------------
| CLAIM A REFERRAL (called once after a new user logs in)
|--------------------------------------------------------------------------
|
| The referrer comes from the SIGNED start_param inside Telegram's
| initData, so it cannot be faked by the client.
|
|--------------------------------------------------------------------------
*/

export async function claimReferral(req, res) {
  try {
    const data = getTelegramData(req);

    if (!data) {
      return res.status(401).json({
        success: false,
        message: "Telegram authentication data is missing",
      });
    }

    const notClaimed = () =>
      res.json({
        success: true,
        claimed: false,
      });

    const startParam = String(data.startParam ?? data.start_param ?? "");

    const match = /^ref_(\d{3,20})$/.exec(startParam);

    if (!match) {
      return notClaimed();
    }

    const referrerTelegramId = match[1];
    const telegramId = String(data.user.id);

    // Nobody can refer themselves.
    if (referrerTelegramId === telegramId) {
      return notClaimed();
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("id, created_at, referred_by, is_active")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (profileError) {
      console.error("Claim referral profile error:", profileError);

      return res.status(500).json({
        success: false,
        message: "Could not find your profile",
      });
    }

    if (!profile || !profile.is_active) {
      return notClaimed();
    }

    // Already invited by someone.
    if (profile.referred_by) {
      return notClaimed();
    }

    // Only brand-new accounts can use a referral.
    const accountAge = Date.now() - new Date(profile.created_at).getTime();

    if (!Number.isFinite(accountAge) || accountAge > NEW_USER_WINDOW_MS) {
      return notClaimed();
    }

    const {
      data: referrer,
      error: referrerError,
    } = await supabase
      .from("profiles")
      .select("id, is_active")
      .eq("telegram_id", referrerTelegramId)
      .maybeSingle();

    if (referrerError) {
      console.error("Claim referral referrer error:", referrerError);

      return res.status(500).json({
        success: false,
        message: "Could not verify the invitation",
      });
    }

    if (!referrer || !referrer.is_active || referrer.id === profile.id) {
      return notClaimed();
    }

    const {
      data: result,
      error: claimError,
    } = await supabase.rpc("claim_referral", {
      p_referrer_id: referrer.id,
      p_referred_id: profile.id,
      p_referrer_bonus: REFERRER_BONUS,
      p_referred_bonus: REFERRED_BONUS,
    });

    if (claimError) {
      if (String(claimError.message || "").includes("already claimed")) {
        return notClaimed();
      }

      console.error("Claim referral RPC error:", claimError);

      return res.status(500).json({
        success: false,
        message: "Could not apply the invitation",
      });
    }

    return res.json({
      success: true,
      claimed: true,
      reward: REFERRED_BONUS,
      balance: Number(result?.referred_balance ?? 0),
    });
  } catch (error) {
    console.error("Claim referral error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not apply the invitation",
    });
  }
}