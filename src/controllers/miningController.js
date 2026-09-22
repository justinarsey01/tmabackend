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

    const initData =
      req.telegramInitData;

    const data =
      parse(initData);

    const telegramUser =
      data.user;


    if (!telegramUser) {

      return res.status(400).json({
        success: false,
        message:
          "Telegram user not found",
      });

    }


    const telegramId =
      String(telegramUser.id);


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
     .select(
  "id,balance,telegram_id,is_active"
)
      
      .eq(
        "telegram_id",
        telegramId
      )
      .maybeSingle();


    if (profileError) {

      console.error(
        "Profile lookup error:",
        profileError
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not find your profile",
      });

    }


    if (!profile) {
if (!profile.is_active) {

  return res.status(403).json({
    success: false,
    message:
      "Your account has been deactivated.",
  });

}

    }


    /*
    --------------------------------------------------
    Perform secure mining operation
    --------------------------------------------------
    */

    const {
      data: result,
      error: miningError,
    } = await supabase.rpc(
      "mine_coin",
      {
        p_user_id:
          profile.id,
      }
    );


    if (miningError) {

      console.error(
        "Mining RPC error:",
        miningError
      );

      return res.status(400).json({
        success: false,
        message:
          miningError.message ||
          "Mining failed",
      });

    }


    return res.json({
      success: true,
      balance:
        Number(result.balance),

      energy:
        Number(result.energy),

      last_energy_update:
        result.last_energy_update,
    });


  } catch (error) {

    console.error(
      "Mining controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Mining request failed",
    });

  }

}