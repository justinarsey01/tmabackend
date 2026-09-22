import dotenv from "dotenv";
import { parse } from "@tma.js/init-data-node";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function telegramLogin(req, res) {
  try {
    const initData = req.telegramInitData;

    const data = parse(initData);

    const telegramUser = data.user;

    if (!telegramUser) {
      return res.status(400).json({
        success: false,
        message: "Telegram user information not found",
      });
    }

    const telegramId = String(telegramUser.id);

    const username =
      telegramUser.username || null;

    const firstName =
      telegramUser.firstName || null;

    const lastName =
      telegramUser.lastName || null;

    const photoUrl =
      telegramUser.photoUrl || null;


    /*
    --------------------------------------------------
    Find existing CoinEarn profile
    --------------------------------------------------
    */

    const {
      data: existingProfile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select("*")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (profileError) {
      console.error(
        "Profile lookup error:",
        profileError
      );

      return res.status(500).json({
        success: false,
        message: "Could not load profile",
      });
      if (
  existingProfile &&
  existingProfile.is_active === false
) {

  return res.status(403).json({
    success: false,
    message:
      "Your CoinEarn account has been deactivated. Please contact support.",
  });

}
    }


    let profile;


    /*
    --------------------------------------------------
    Create new profile
    --------------------------------------------------
    */

    if (!existingProfile) {
      const {
        data: newProfile,
        error: createError,
      } = await supabase
        .from("profiles")
        .insert({
          telegram_id: telegramId,
          username,
          first_name: firstName,
          last_name: lastName,
          photo_url: photoUrl,
          balance: 0,
          total_earned: 0,
          total_spent: 0,
        })
        .select()
        .single();

      if (createError) {
        console.error(
          "Profile creation error:",
          createError
        );

        return res.status(500).json({
          success: false,
          message: "Could not create profile",
        });
      }

      profile = newProfile;


      /*
      ------------------------------------------------
      Create mining account
      ------------------------------------------------
      */

      const {
        error: miningError,
      } = await supabase
        .from("mining")
        .insert({
          user_id: profile.id,
          energy: 1000,
          last_energy_update:
            new Date().toISOString(),
        });

      if (miningError) {
        console.error(
          "Mining creation error:",
          miningError
        );
      }

    } else {

      /*
      ------------------------------------------------
      Update Telegram information
      ------------------------------------------------
      */

      const {
        data: updatedProfile,
        error: updateError,
      } = await supabase
        .from("profiles")
        .update({
          username,
          first_name: firstName,
          last_name: lastName,
          photo_url: photoUrl,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", existingProfile.id)
        .select()
        .single();

      if (updateError) {
        console.error(
          "Profile update error:",
          updateError
        );

        profile = existingProfile;

      } else {
        profile = updatedProfile;
      }


      /*
      ------------------------------------------------
      Make sure mining row exists
      ------------------------------------------------
      */

      const {
        data: miningAccount,
      } = await supabase
        .from("mining")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (!miningAccount) {
        await supabase
          .from("mining")
          .insert({
            user_id: profile.id,
            energy: 1000,
            last_energy_update:
              new Date().toISOString(),
          });
      }
    }


    /*
    --------------------------------------------------
    Get current mining state
    --------------------------------------------------
    */

    const {
      data: mining,
      error: miningError,
    } = await supabase
      .from("mining")
      .select(
        "energy,last_energy_update"
      )
      .eq("user_id", profile.id)
      .maybeSingle();

    if (miningError) {
      console.error(
        "Mining state error:",
        miningError
      );
    }


    /*
    --------------------------------------------------
    Return user information
    --------------------------------------------------
    */

    return res.json({
      success: true,

      user: {
        id: profile.id,
        telegramId:
          profile.telegram_id,
        username:
          profile.username,
        firstName:
          profile.first_name,
        lastName:
          profile.last_name,
        photoUrl:
          profile.photo_url,
      },

      balance:
        Number(profile.balance || 0),

      mining: {
        energy:
          Number(mining?.energy ?? 1000),

        lastEnergyUpdate:
          mining?.last_energy_update ??
          new Date().toISOString(),
      },
    });

  } catch (error) {

    console.error(
      "Telegram login error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }
}