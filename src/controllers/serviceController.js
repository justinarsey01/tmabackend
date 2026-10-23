
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
    const BASE_COLUMNS = `
        id,
        name,
        category,
        description,
        selling_price,
        crypto_price_usd,
        min_quantity,
        max_quantity,
        active
      `;
    const COPY_COLUMNS = `,
        service_type,
        max_targets,
        tier_prices,
        tier_prices_usd
      `;

    const queryServices = (columns) =>
      supabase
        .from("smm_services")
        .select(columns)
        .eq("active", true)
        .order("created_at", {
          ascending: true,
        });

    let { data, error } = await queryServices(BASE_COLUMNS + COPY_COLUMNS);

    // Database not updated yet (42703 = unknown column): fall back to the old fields.
    if (error && error.code === "42703") {
      ({ data, error } = await queryServices(BASE_COLUMNS));
    }

    if (error) {
      console.error("Get services error:", error);

      return res.status(500).json({
        success: false,
        message: "Could not load services",
      });
    }

    const services = (data || []).map((service) => ({
      id: service.id,

      name: service.name,

      category: service.category,

      description: service.description,

      sellingPrice: Number(
        service.selling_price || 0
      ),

      // Crypto price in USD per 1,000 service units.
      // null means crypto pricing has not been configured.
      cryptoPriceUsd:
        service.crypto_price_usd == null
          ? null
          : Number(service.crypto_price_usd),

      minQuantity: Number(
        service.min_quantity || 1
      ),

      maxQuantity: Number(
        service.max_quantity || 1
      ),

      active: service.active,

      serviceType: service.service_type || "standard",

      maxTargets:
        service.max_targets == null
          ? null
          : Number(service.max_targets),

      // USDT price for 1, 2, 3 ... target channels
      tierPricesUsd: Array.isArray(service.tier_prices_usd)
        ? service.tier_prices_usd.map(Number)
        : null,
    }));

    return res.json({
      success: true,
      services,
    });
  } catch (error) {
    console.error("Services controller error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load services",
    });
  }
}

