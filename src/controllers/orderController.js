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
| CREATE SMM ORDER
|--------------------------------------------------------------------------
*/

export async function createSmmOrder(req, res) {

  try {

    /*
    |--------------------------------------------------------------------------
    | Get Telegram user
    |--------------------------------------------------------------------------
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
    |--------------------------------------------------------------------------
    | Read request body
    |--------------------------------------------------------------------------
    */

    const {
      serviceId,
      target,
      quantity,
    } = req.body;


    if (!serviceId) {

      return res.status(400).json({
        success: false,
        message:
          "Service is required",
      });

    }


    if (
      typeof target !== "string" ||
      !target.trim()
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Target is required",
      });

    }


    const parsedQuantity =
      Number(quantity);


    if (
      !Number.isInteger(
        parsedQuantity
      ) ||
      parsedQuantity <= 0
    ) {

      return res.status(400).json({
        success: false,
        message:
          "Invalid quantity",
      });

    }


    /*
    |--------------------------------------------------------------------------
    | Find CoinEarn profile
    |--------------------------------------------------------------------------
    */

    const {
      data: profile,
      error: profileError,
    } =
      await supabase
        .from("profiles")
        .select(
          "id,telegram_id,balance,is_active"
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

    if (!profile.is_active) {

      return res.status(403).json({
        success: false,
        message:
          "Your account has been deactivated.",
      });

    }


    /*
    |--------------------------------------------------------------------------
    | Create order through secure DB function
    |--------------------------------------------------------------------------
    */

    const {
      data: result,
      error: orderError,
    } =
      await supabase.rpc(
        "create_smm_order",
        {
          p_user_id:
            profile.id,

          p_service_id:
            serviceId,

          p_target:
            target.trim(),

          p_quantity:
            parsedQuantity,
        }
      );


    if (orderError) {

      console.error(
        "Create SMM order error:",
        orderError
      );


      let message =
        orderError.message ||
        "Could not create order";


      /*
      |--------------------------------------------------------------------------
      | Make database messages friendlier
      |--------------------------------------------------------------------------
      */

      if (
        message.includes(
          "Insufficient Coin balance"
        )
      ) {
        message =
          "Insufficient Coin balance";
      }

      if (
        message.includes(
          "Service is unavailable"
        )
      ) {
        message =
          "This service is currently unavailable";
      }


      return res.status(400).json({
        success: false,
        message,
      });

    }


    /*
    |--------------------------------------------------------------------------
    | Return result
    |--------------------------------------------------------------------------
    */

    return res.json({

      success: true,

      order: {

        id:
          result.order_id,

        orderNumber:
          Number(
            result.order_number
          ),

        amount:
          Number(
            result.amount
          ),

        balance:
          Number(
            result.balance
          ),

        status:
          result.status,

      },

    });

  } catch (error) {

    console.error(
      "Create order controller error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Order request failed",

    });

  }

}