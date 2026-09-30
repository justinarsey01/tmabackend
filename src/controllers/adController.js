export async function adsgramRewardStatus(req, res) {
  try {
    /*
    |--------------------------------------------------------------------------
    | Get Telegram authentication data
    |--------------------------------------------------------------------------
    */

    const initData = req.telegramInitData;

    if (!initData) {
      return res.status(401).json({
        success: false,
        message:
          "Telegram authentication data is missing",
      });
    }

    const data = parse(initData);

    const telegramUser = data.user;

    if (!telegramUser) {
      return res.status(401).json({
        success: false,
        message:
          "Telegram user not found",
      });
    }

    const telegramId =
      String(telegramUser.id);

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

    if (profile.is_active === false) {
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
      .select("created_at")
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
    | User has never watched an AdsGram ad
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
      3 * 60 * 60 * 1000;

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