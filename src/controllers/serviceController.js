import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


/*
|--------------------------------------------------------------------------
| GET ACTIVE SERVICES
|--------------------------------------------------------------------------
*/

export async function getServices(req, res) {
  try {
    const {
      data,
      error,
    } = await supabase
      .from("smm_services")
      .select(
        `
        id,
        name,
        category,
        description,
        selling_price,
        min_quantity,
        max_quantity,
        active
        `
      )
      .eq("active", true)
      .order("created_at", {
        ascending: true,
      });


    if (error) {
      console.error(
        "Get services error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Could not load services",
      });
    }


    const services = (data || []).map(
      (service) => ({
        id: service.id,

        name: service.name,

        category: service.category,

        description:
          service.description,

        sellingPrice: Number(
          service.selling_price || 0
        ),

        minQuantity: Number(
          service.min_quantity || 1
        ),

        maxQuantity: Number(
          service.max_quantity || 1
        ),

        active: service.active,
      })
    );


    return res.json({
      success: true,
      services,
    });

  } catch (error) {

    console.error(
      "Services controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Could not load services",
    });
  }
}