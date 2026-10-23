import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


/*
|--------------------------------------------------------------------------
| ADMIN PROFILE
|--------------------------------------------------------------------------
*/

export async function getAdminProfile(req, res) {
  try {
    return res.json({
      success: true,
      admin: req.admin,
    });
  } catch (error) {
    console.error(
      "Get admin profile error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not load administrator profile",
    });
  }
}


/*
|--------------------------------------------------------------------------
| ADMIN DASHBOARD
|--------------------------------------------------------------------------
*/


export async function getAdminDashboard(req, res) {
  try {
    // --------------------------------------------------
    // USERS
    // --------------------------------------------------

    const {
      count: totalUsers,
      error: usersError,
    } = await supabase
      .from("profiles")
      .select("id", {
        count: "totalUsers",
        head: true,
      });

    const {
      count: activeUsers,
      error: activeUsersError,
    } = await supabase
      .from("profiles")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("is_active", true);

    // --------------------------------------------------
    // BALANCES
    // --------------------------------------------------

    const {
      data: balances,
      error: balancesError,
    } = await supabase
      .from("profiles")
      .select("balance");

    // --------------------------------------------------
    // SMM ORDERS
    // --------------------------------------------------

    const {
      count: smmOrders,
      error: ordersError,
    } = await supabase
      .from("smm_orders")
      .select("id", {
        count: "exact",
        head: true,
      });

    const {
      count: pendingOrders,
      error: pendingError,
    } = await supabase
      .from("smm_orders")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("status", "pending");

    const {
      count: processingOrders,
      error: processingError,
    } = await supabase
      .from("smm_orders")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("status", "processing");

    const {
      count: completedOrders,
      error: completedError,
    } = await supabase
      .from("smm_orders")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("status", "completed");

    const {
      count: rejectedOrders,
      error: rejectedError,
    } = await supabase
      .from("smm_orders")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("status", "rejected");

    // --------------------------------------------------
    // SERVICES
    // --------------------------------------------------

    const {
      count: activeServices,
      error: servicesError,
    } = await supabase
      .from("smm_services")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("active", true);

    // --------------------------------------------------
    // TASKS
    // --------------------------------------------------

    const {
      count: activeTasks,
      error: tasksError,
    } = await supabase
      .from("tasks")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("active", true);

    // --------------------------------------------------
    // COINS IN CIRCULATION
    // --------------------------------------------------

    const coinsInCirculation =
      (balances || []).reduce(
        (total, profile) =>
          total + Number(profile.balance || 0),
        0
      );

    // --------------------------------------------------
    // RECENT ORDERS
    // --------------------------------------------------

    const {
      data: recentOrders,
      error: recentOrdersError,
    } = await supabase
      .from("smm_orders")
      .select(`
        id,
        order_number,
        user_id,
        service_id,
        target,
        quantity,
        amount,
        status,
        admin_note,
        created_at,
        updated_at,
        profiles:user_id (
          username,
          first_name,
          last_name
        ),
        smm_services:service_id (
          name,
          category
        )
      `)
      .order("created_at", {
        ascending: false,
      })
      .limit(10);

    // --------------------------------------------------
    // ERROR LOGGING
    // --------------------------------------------------

    if (usersError) {
      console.error(
        "Dashboard users error:",
        usersError
      );
    }

    if (activeUsersError) {
      console.error(
        "Dashboard active users error:",
        activeUsersError
      );
    }

    if (balancesError) {
      console.error(
        "Dashboard balances error:",
        balancesError
      );
    }

    if (ordersError) {
      console.error(
        "Dashboard orders error:",
        ordersError
      );
    }

    if (pendingError) {
      console.error(
        "Dashboard pending orders error:",
        pendingError
      );
    }

    if (processingError) {
      console.error(
        "Dashboard processing orders error:",
        processingError
      );
    }

    if (completedError) {
      console.error(
        "Dashboard completed orders error:",
        completedError
      );
    }

    if (rejectedError) {
      console.error(
        "Dashboard rejected orders error:",
        rejectedError
      );
    }

    if (servicesError) {
      console.error(
        "Dashboard services error:",
        servicesError
      );
    }

    if (tasksError) {
      console.error(
        "Dashboard tasks error:",
        tasksError
      );
    }

    if (recentOrdersError) {
      console.error(
        "Dashboard recent orders error:",
        recentOrdersError
      );
    }

    // --------------------------------------------------
    // DASHBOARD RESPONSE
    // --------------------------------------------------

    const stats = {
      totalUsers: totalUsers || 0,
      activeUsers: activeUsers || 0,

      coinsInCirculation,

      smmOrders: smmOrders || 0,
      pendingOrders: pendingOrders || 0,
      processingOrders: processingOrders || 0,
      completedOrders: completedOrders || 0,
      rejectedOrders: rejectedOrders || 0,

      activeServices: activeServices || 0,
      activeTasks: activeTasks || 0,

      // Kept for dashboard compatibility.
      coinsDistributed: coinsInCirculation,
    };

    console.log(
      "Admin dashboard statistics:",
      stats
    );

    return res.status(200).json({
      success: true,

      stats,

      recentOrders: recentOrders || [],
    });
  } catch (error) {
    console.error(
      "Admin dashboard error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not load dashboard statistics",
    });
  }
}



/*
|--------------------------------------------------------------------------
| ADMIN USERS
|--------------------------------------------------------------------------
*/

export async function getAdminUsers(req, res) {
  try {
    const {
      data: users,
      error,
    } = await supabase
      .from("profiles")
      .select(`
        id,
        telegram_id,
        username,
        first_name,
        last_name,
        photo_url,
        balance,
        total_earned,
        total_spent,
        is_active,
        is_admin,
        banned_at,
        banned_reason,
        created_at,
        updated_at
      `)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Admin users lookup error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not load registered users",
      });
    }

    return res.status(200).json({
      success: true,
      users: users || [],
      total: users?.length || 0,
    });
  } catch (error) {
    console.error(
      "Get admin users error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while loading users",
    });
  }
}


/*
|--------------------------------------------------------------------------
| ACTIVATE / DEACTIVATE USER
|--------------------------------------------------------------------------
*/

export async function updateUserStatus(req, res) {
  try {
    const { id } = req.params;

    const {
      isActive,
      reason,
    } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "User ID is required",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message:
          "isActive must be true or false",
      });
    }

    if (req.admin?.id === id) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot deactivate your own administrator account",
      });
    }

    const updateData = {
      is_active: isActive,
      updated_at:
        new Date().toISOString(),
    };

    if (isActive) {
      updateData.banned_at = null;
      updateData.banned_reason = null;
    } else {
      updateData.banned_at =
        new Date().toISOString();

      updateData.banned_reason =
        reason?.trim() ||
        "Deactivated by administrator";
    }

    const {
      data: user,
      error,
    } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", id)
      .select(`
        id,
        telegram_id,
        username,
        first_name,
        last_name,
        photo_url,
        balance,
        total_earned,
        total_spent,
        is_active,
        is_admin,
        banned_at,
        banned_reason
      `)
      .single();

    if (error) {
      console.error(
        "Admin user status update error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not update user status",
      });
    }

    const {
      error: logError,
    } = await supabase
      .from("admin_logs")
      .insert({
        admin_user_id:
          req.admin.id,

        action: isActive
          ? "user_activated"
          : "user_deactivated",

        target_user_id: id,

        details: {
          reason:
            reason?.trim() ||
            (isActive
              ? "User activated by administrator"
              : "Deactivated by administrator"),
        },
      });

    if (logError) {
      console.error(
        "Admin user status log error:",
        logError
      );
    }

    return res.json({
      success: true,

      message: isActive
        ? "User activated successfully"
        : "User deactivated successfully",

      user,
    });
  } catch (error) {
    console.error(
      "Update user status controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while updating user status",
    });
  }
}


/*
|--------------------------------------------------------------------------
| GET ADMIN SMM SERVICES
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| CHANNEL COPY SERVICE FIELDS (shared by create + update)
|--------------------------------------------------------------------------
| service_type: "standard" (priced per 1,000 units) or "channel_copy"
| (one source channel, 1..max_targets target channels, price by number of targets).
| tier_prices[i]     = coin price for i+1 targets
| tier_prices_usd[i] = USDT price for i+1 targets (optional)
*/

function parseCopyServiceFields(body) {
  if (body.service_type === undefined) {
    return { fields: null };
  }

  if (body.service_type !== "channel_copy") {
    return {
      fields: {
        service_type: "standard",
        max_targets: null,
        tier_prices: null,
        tier_prices_usd: null,
      },
    };
  }

  const maxTargets = Number(body.max_targets);

  if (
    !Number.isInteger(maxTargets) ||
    maxTargets < 1 ||
    maxTargets > 10
  ) {
    return {
      error:
        "Maximum target channels must be a whole number from 1 to 10",
    };
  }

  // Channel copy is paid with USDT only: a price is required for
  // every number of target channels (1 to maxTargets).
  if (
    !Array.isArray(body.tier_prices_usd) ||
    body.tier_prices_usd.length !== maxTargets
  ) {
    return {
      error: `Enter a USDT price for each number of target channels (1 to ${maxTargets})`,
    };
  }

  const tierPricesUsd = body.tier_prices_usd.map(Number);

  if (
    tierPricesUsd.some(
      (value) =>
        !Number.isFinite(value) || value <= 0
    )
  ) {
    return {
      error:
        "Every USDT price must be a number greater than 0",
    };
  }

  return {
    fields: {
      service_type: "channel_copy",
      max_targets: maxTargets,
      tier_prices: null,
      tier_prices_usd: tierPricesUsd.map((value) =>
        Number(value.toFixed(4))
      ),
    },
  };
}


export async function getAdminServices(req, res) {
  try {
    const BASE_COLUMNS = `
        id,
        name,
        category,
        description,
        cost_price,
        selling_price,
        min_quantity,
        max_quantity,
        crypto_price_usd,
        active,
        created_at
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
        .order("created_at", {
          ascending: true,
        });

    let { data: services, error } =
      await queryServices(BASE_COLUMNS + COPY_COLUMNS);

    // Database not updated yet (42703 = unknown column): fall back to the old fields.
    if (error && error.code === "42703") {
      ({ data: services, error } =
        await queryServices(BASE_COLUMNS));
    }

    if (error) {
      console.error(
        "Admin services lookup error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not load SMM services",
      });
    }

    return res.json({
      success: true,
      services: services || [],
    });
  } catch (error) {
    console.error(
      "Get admin services error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not load SMM services",
    });
  }
}


/*
|--------------------------------------------------------------------------
| CREATE SMM SERVICE
|--------------------------------------------------------------------------
*/

export async function createService(req, res) {
  try {
    const {
      name,
      category,
      description,
      cost_price,
      selling_price,
      min_quantity,
      max_quantity,
      crypto_price_usd,
      active,
    } = req.body;

    const serviceName =
      typeof name === "string"
        ? name.trim()
        : "";

    const serviceCategory =
      typeof category === "string"
        ? category.trim()
        : "";

    const serviceDescription =
      typeof description === "string"
        ? description.trim()
        : "";

    const costPrice =
      Number(cost_price);

    const sellingPrice =
      Number(selling_price);

    const minQuantity =
      Number(min_quantity);

    const maxQuantity =
      Number(max_quantity);

    const serviceActive =
      typeof active === "boolean"
        ? active
        : true;
        const cryptoPriceUsd =
  crypto_price_usd === undefined ||
  crypto_price_usd === null ||
  crypto_price_usd === ""
    ? null
    : Number(crypto_price_usd);

    if (
  cryptoPriceUsd !== null &&
  (!Number.isFinite(cryptoPriceUsd) || cryptoPriceUsd <= 0)
) {
  return res.status(400).json({
    success: false,
    message: "Crypto price must be greater than 0, or left empty",
  });
}

    /*
    |--------------------------------------------------------------------------
    | VALIDATION
    |--------------------------------------------------------------------------
    */

    if (!serviceName) {
      return res.status(400).json({
        success: false,
        message:
          "Service name is required",
      });
    }

    if (!serviceCategory) {
      return res.status(400).json({
        success: false,
        message:
          "Service category is required",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | COST PRICE
    |
    | ZERO IS VALID
    |--------------------------------------------------------------------------
    */

    if (
      !Number.isFinite(costPrice) ||
      costPrice < 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid cost price",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | SELLING PRICE
    |--------------------------------------------------------------------------
    */

    if (
      !Number.isFinite(sellingPrice) ||
      sellingPrice <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid selling price",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | MINIMUM QUANTITY
    |--------------------------------------------------------------------------
    */

    if (
      !Number.isInteger(minQuantity) ||
      minQuantity < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid minimum quantity",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | MAXIMUM QUANTITY
    |--------------------------------------------------------------------------
    */

    if (
      !Number.isInteger(maxQuantity) ||
      maxQuantity < minQuantity
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid maximum quantity",
      });
    }

    const copyParsed = parseCopyServiceFields(req.body);

    if (copyParsed.error) {
      return res.status(400).json({
        success: false,
        message: copyParsed.error,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | CREATE SERVICE
    |--------------------------------------------------------------------------
    */

    const {
      data: service,
      error,
    } = await supabase
      .from("smm_services")
      .insert({
        name: serviceName,
        category: serviceCategory,
        description:
          serviceDescription || null,
        cost_price: costPrice,
        selling_price: sellingPrice,
        min_quantity: minQuantity,
        max_quantity: maxQuantity,
        active: serviceActive,
        crypto_price_usd: cryptoPriceUsd,
        // Only send the new fields for channel copy services, so standard
        // services still save even before the database script is run.
        ...(copyParsed.fields?.service_type === "channel_copy"
          ? copyParsed.fields
          : {}),
      })
      .select(`
        id,
        name,
        category,
        description,
        cost_price,
        selling_price,
        min_quantity,
        max_quantity,
        active, 
        crypto_price_usd,
        service_type,
        max_targets,
        tier_prices,
        tier_prices_usd,
        created_at
       
      `)
      .single();

    if (error) {
      console.error(
        "Create service database error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Could not create SMM service",
      });
    }

    return res.status(201).json({
      success: true,
      message:
        "SMM service created successfully",
      service,
    });
  } catch (error) {
    console.error(
      "Create service controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while creating service",
    });
  }
}


/*
|--------------------------------------------------------------------------
| UPDATE SMM SERVICE
|--------------------------------------------------------------------------
*/

export async function updateService(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Service ID is required",
      });
    }

    const {
      name,
      category,
      description,
      cost_price,
      selling_price,
      min_quantity,
      max_quantity,
      crypto_price_usd,
      active,
    } = req.body;

    const updateData = {};

    /*
    |--------------------------------------------------------------------------
    | NAME
    |--------------------------------------------------------------------------
    */

    if (name !== undefined) {
      const serviceName =
        typeof name === "string"
          ? name.trim()
          : "";

      if (!serviceName) {
        return res.status(400).json({
          success: false,
          message:
            "Service name cannot be empty",
        });
      }

      updateData.name =
        serviceName;
    }

    /*
    |--------------------------------------------------------------------------
    | CATEGORY
    |--------------------------------------------------------------------------
    */

    if (category !== undefined) {
      const serviceCategory =
        typeof category === "string"
          ? category.trim()
          : "";

      if (!serviceCategory) {
        return res.status(400).json({
          success: false,
          message:
            "Service category cannot be empty",
        });
      }

      updateData.category =
        serviceCategory;
    }

    /*
    |--------------------------------------------------------------------------
    | DESCRIPTION
    |--------------------------------------------------------------------------
    */

    if (description !== undefined) {
      updateData.description =
        typeof description === "string"
          ? description.trim() || null
          : null;
    }

    /*
    |--------------------------------------------------------------------------
    | COST PRICE
    |
    | ZERO IS VALID
    |--------------------------------------------------------------------------
    */

    if (cost_price !== undefined) {
      const costPrice =
        Number(cost_price);

      if (
        !Number.isFinite(costPrice) ||
        costPrice < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid cost price",
        });
      }

      updateData.cost_price =
        costPrice;
    }

    /*
    |--------------------------------------------------------------------------
    | SELLING PRICE
    |--------------------------------------------------------------------------
    */

    if (selling_price !== undefined) {
      const sellingPrice =
        Number(selling_price);

      if (
        !Number.isFinite(sellingPrice) ||
        sellingPrice <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid selling price",
        });
      }

      updateData.selling_price =
        sellingPrice;
    }

    /*
    |--------------------------------------------------------------------------
    | MINIMUM QUANTITY
    |--------------------------------------------------------------------------
    */

    if (min_quantity !== undefined) {
      const minQuantity =
        Number(min_quantity);

      if (
        !Number.isInteger(minQuantity) ||
        minQuantity < 1
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid minimum quantity",
        });
      }

      updateData.min_quantity =
        minQuantity;
    }

    /*
    |--------------------------------------------------------------------------
    | MAXIMUM QUANTITY
    |--------------------------------------------------------------------------
    */

    if (max_quantity !== undefined) {
      const maxQuantity =
        Number(max_quantity);

      if (
        !Number.isInteger(maxQuantity) ||
        maxQuantity < 1
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid maximum quantity",
        });
      }

      updateData.max_quantity =
        maxQuantity;
    }

    /*
    |--------------------------------------------------------------------------
    | ACTIVE STATUS
    |--------------------------------------------------------------------------
    */

    if (active !== undefined) {
      if (
        typeof active !== "boolean"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Active must be true or false",
        });
      }

      updateData.active =
        active;
    }

    /*
    |--------------------------------------------------------------------------
    | CRYPTO PRICE (USD per 1,000 units; null/empty = auto from coin price)
    |--------------------------------------------------------------------------
    */

    if (crypto_price_usd !== undefined) {
      const cryptoPriceUsd =
        crypto_price_usd === null ||
        crypto_price_usd === ""
          ? null
          : Number(crypto_price_usd);

      if (
        cryptoPriceUsd !== null &&
        (!Number.isFinite(cryptoPriceUsd) ||
          cryptoPriceUsd <= 0)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Crypto price must be greater than 0, or left empty",
        });
      }

      updateData.crypto_price_usd =
        cryptoPriceUsd;
    }

    /*
    |--------------------------------------------------------------------------
    | CHANNEL COPY FIELDS
    |--------------------------------------------------------------------------
    */

    const copyParsed = parseCopyServiceFields(req.body);

    if (copyParsed.error) {
      return res.status(400).json({
        success: false,
        message: copyParsed.error,
      });
    }

    if (copyParsed.fields) {
      Object.assign(updateData, copyParsed.fields);
    }

    /*
    |--------------------------------------------------------------------------
    | GET EXISTING SERVICE
    |--------------------------------------------------------------------------
    */

    const {
      data: existingService,
      error: existingError,
    } = await supabase
      .from("smm_services")
      .select(`
        id,
        min_quantity,
        max_quantity
      `)
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      console.error(
        "Existing service lookup error:",
        existingError
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not verify existing service",
      });
    }

    if (!existingService) {
      return res.status(404).json({
        success: false,
        message:
          "Service not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | FINAL QUANTITY VALIDATION
    |--------------------------------------------------------------------------
    */

    const finalMinQuantity =
      updateData.min_quantity !==
      undefined
        ? updateData.min_quantity
        : Number(
            existingService.min_quantity
          );

    const finalMaxQuantity =
      updateData.max_quantity !==
      undefined
        ? updateData.max_quantity
        : Number(
            existingService.max_quantity
          );

    if (
      finalMaxQuantity <
      finalMinQuantity
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Maximum quantity must be greater than or equal to minimum quantity",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | MAKE SURE SOMETHING IS BEING UPDATED
    |--------------------------------------------------------------------------
    */

    if (
      Object.keys(
        updateData
      ).length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "No service changes provided",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | UPDATE SERVICE
    |
    | IMPORTANT:
    | We intentionally do NOT use updated_at here.
    |--------------------------------------------------------------------------
    */

    const {
      data: service,
      error,
    } = await supabase
      .from("smm_services")
      .update(updateData)
      .eq("id", id)
      .select(`
        id,
        name,
        category,
        description,
        cost_price,
        selling_price,
        min_quantity,
        max_quantity,
        crypto_price_usd,
        service_type,
        max_targets,
        tier_prices,
        tier_prices_usd,
        active,
        created_at
      `)
      .single();

    if (error) {
      console.error(
        "Update service database error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Could not update SMM service",
      });
    }

    return res.json({
      success: true,
      message:
        "SMM service updated successfully",
      service,
    });
  } catch (error) {
    console.error(
      "Update service controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while updating service",
    });
  }
}
/*
|--------------------------------------------------------------------------
| GET ADMIN ORDERS
|--------------------------------------------------------------------------
*/

export async function getAdminOrders(req, res) {
  try {
    const {
      data: orders,
      error,
    } = await supabase
      .from("smm_orders")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Admin orders lookup error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not load SMM orders",
      });
    }

    return res.json({
      success: true,
      orders: orders || [],
    });
  } catch (error) {
    console.error(
      "Get admin orders error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not load SMM orders",
    });
  }
}


/*
|--------------------------------------------------------------------------
| UPDATE ADMIN ORDER STATUS
|--------------------------------------------------------------------------
*/

export async function updateAdminOrderStatus(
  req,
  res
) {
  try {
    const { id } = req.params;

    const {
      status,
      adminNote,
    } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Order ID is required",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message:
          "Order status is required",
      });
    }

    const allowedStatuses = [
      "pending",
      "processing",
      "completed",
      "rejected",
    ];

    if (
      !allowedStatuses.includes(
        status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid order status",
      });
    }

    if (!req.admin?.id) {
      return res.status(403).json({
        success: false,
        message:
          "Administrator authentication required",
      });
    }

    const {
      data,
      error,
    } = await supabase.rpc(
      "admin_update_smm_order",
      {
        p_order_id: id,

        p_admin_id:
          req.admin.id,

        p_status:
          status,

        p_admin_note:
          adminNote || null,
      }
    );

    if (error) {
      console.error(
        "Admin order status error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Could not update order",
      });
    }

    // Crypto-paid orders: put the crypto back in the user's wallet.
    // The database function refunds each order only once and ignores coin orders.
    let cryptoRefunded = false;

    if (status === "rejected") {
      const { data: refunded, error: refundError } =
        await supabase.rpc("refund_crypto_smm_order", {
          p_order_id: id,
        });

      if (refundError) {
        console.error(
          "Crypto refund error:",
          refundError
        );

        return res.status(500).json({
          success: false,
          message:
            "The order was rejected, but the crypto refund failed: " +
            (refundError.message ||
              "unknown error") +
            ". Run the refund SQL setup and try the refund again.",
        });
      }

      cryptoRefunded = refunded === true;
    }

    return res.json({
      success: true,

      message:
        status === "rejected"
          ? cryptoRefunded
            ? "Order rejected and the crypto was refunded to the user's wallet"
            : "Order rejected and refunded successfully"
          : `Order moved to ${status}`,

      order: data,
    });
  } catch (error) {
    console.error(
      "Admin order status controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while updating order",
    });
  }
}
/*
|--------------------------------------------------------------------------
| GET ADMIN TASKS
|--------------------------------------------------------------------------
*/

export async function getAdminTasks(req, res) {
  try {
    const {
      data: tasks,
      error,
    } = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        type,
        target,
        reward,
        active,
        created_at,
        updated_at
      `)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Admin tasks lookup error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not load tasks",
      });
    }

    return res.json({
      success: true,
      tasks: tasks || [],
    });
  } catch (error) {
    console.error(
      "Get admin tasks error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Could not load tasks",
    });
  }
}


/*
|--------------------------------------------------------------------------
| CREATE TASK
|--------------------------------------------------------------------------
*/

export async function createTask(req, res) {
  try {
    const {
      title,
      description,
      type,
      target,
      reward,
      active,
    } = req.body;

    const taskTitle =
      typeof title === "string"
        ? title.trim()
        : "";

    const taskDescription =
      typeof description === "string"
        ? description.trim()
        : "";

    const taskType =
      typeof type === "string"
        ? type.trim()
        : "";

    const taskTarget =
      typeof target === "string"
        ? target.trim()
        : "";

    const taskReward =
      Number(reward);

    const taskActive =
      typeof active === "boolean"
        ? active
        : true;

    if (!taskTitle) {
      return res.status(400).json({
        success: false,
        message:
          "Task title is required",
      });
    }

    if (!taskType) {
      return res.status(400).json({
        success: false,
        message:
          "Task type is required",
      });
    }

    if (!taskTarget) {
      return res.status(400).json({
        success: false,
        message:
          "Task target is required",
      });
    }

    if (
      !Number.isFinite(taskReward) ||
      taskReward <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Task reward must be greater than 0",
      });
    }

    const {
      data: task,
      error,
    } = await supabase
      .from("tasks")
      .insert({
        title: taskTitle,

        description:
          taskDescription || null,

        type: taskType,

        target: taskTarget,

        reward: taskReward,

        active: taskActive,
      })
      .select(`
        id,
        title,
        description,
        type,
        target,
        reward,
        active,
        created_at,
        updated_at
      `)
      .single();

    if (error) {
      console.error(
        "Create task database error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Could not create task",
      });
    }

    return res.status(201).json({
      success: true,
      message:
        "Task created successfully",
      task,
    });
  } catch (error) {
    console.error(
      "Create task controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while creating task",
    });
  }
}


/*
|--------------------------------------------------------------------------
| UPDATE TASK
|--------------------------------------------------------------------------
*/

export async function updateTask(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Task ID is required",
      });
    }

    const {
      title,
      description,
      type,
      target,
      reward,
      active,
    } = req.body;

    const updateData = {};

    if (title !== undefined) {
      const taskTitle =
        typeof title === "string"
          ? title.trim()
          : "";

      if (!taskTitle) {
        return res.status(400).json({
          success: false,
          message:
            "Task title cannot be empty",
        });
      }

      updateData.title =
        taskTitle;
    }

    if (description !== undefined) {
      updateData.description =
        typeof description === "string"
          ? description.trim() || null
          : null;
    }

    if (type !== undefined) {
      const taskType =
        typeof type === "string"
          ? type.trim()
          : "";

      if (!taskType) {
        return res.status(400).json({
          success: false,
          message:
            "Task type cannot be empty",
        });
      }

      updateData.type =
        taskType;
    }

    if (target !== undefined) {
      const taskTarget =
        typeof target === "string"
          ? target.trim()
          : "";

      if (!taskTarget) {
        return res.status(400).json({
          success: false,
          message:
            "Task target cannot be empty",
        });
      }

      updateData.target =
        taskTarget;
    }

    if (reward !== undefined) {
      const taskReward =
        Number(reward);

      if (
        !Number.isFinite(taskReward) ||
        taskReward <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Task reward must be greater than 0",
        });
      }

      updateData.reward =
        taskReward;
    }

    if (active !== undefined) {
      if (
        typeof active !== "boolean"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Active must be true or false",
        });
      }

      updateData.active =
        active;
    }

    if (
      Object.keys(updateData).length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "No task changes provided",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | CHECK TASK EXISTS
    |--------------------------------------------------------------------------
    */

    const {
      data: existingTask,
      error: existingError,
    } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      console.error(
        "Existing task lookup error:",
        existingError
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not verify task",
      });
    }

    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message:
          "Task not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | UPDATE TASK
    |--------------------------------------------------------------------------
    */

    const {
      data: task,
      error,
    } = await supabase
      .from("tasks")
      .update(updateData)
      .eq("id", id)
      .select(`
        id,
        title,
        description,
        type,
        target,
        reward,
        active,
        created_at,
        updated_at
      `)
      .single();

    if (error) {
      console.error(
        "Update task database error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Could not update task",
      });
    }

    return res.json({
      success: true,
      message:
        "Task updated successfully",
      task,
    });
  } catch (error) {
    console.error(
      "Update task controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while updating task",
    });
  }
}


/*
|--------------------------------------------------------------------------
| DELETE TASK
|--------------------------------------------------------------------------
*/

export async function deleteTask(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Task ID is required",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | CHECK TASK EXISTS
    |--------------------------------------------------------------------------
    */

    const {
      data: existingTask,
      error: existingError,
    } = await supabase
      .from("tasks")
      .select("id, title")
      .eq("id", id)
      .maybeSingle();

    if (existingError) {
      console.error(
        "Delete task lookup error:",
        existingError
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not find task",
      });
    }

    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message:
          "Task not found",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | DELETE TASK
    |--------------------------------------------------------------------------
    */

    const {
      error,
    } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(
        "Delete task database error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Could not delete task",
      });
    }

    return res.json({
      success: true,
      message:
        "Task deleted successfully",
    });
  } catch (error) {
    console.error(
      "Delete task controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Server error while deleting task",
    });
  }
}


/*
|--------------------------------------------------------------------------
| DELETE SMM SERVICE
|--------------------------------------------------------------------------
| A service that already has orders cannot be deleted, because the orders
| keep a reference to it. In that case the admin should deactivate it.
*/

export async function deleteService(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Service ID is required",
      });
    }

    const { data: service, error: findError } = await supabase
      .from("smm_services")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();

    if (findError) throw findError;

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    const { count: orderCount, error: countError } = await supabase
      .from("smm_orders")
      .select("id", { count: "exact", head: true })
      .eq("service_id", id);

    if (countError) throw countError;

    if (orderCount > 0) {
      return res.status(409).json({
        success: false,
        message: `"${service.name}" has ${orderCount} order(s), so it cannot be deleted. Deactivate it instead to hide it from users.`,
      });
    }

    const { error: deleteError } = await supabase
      .from("smm_services")
      .delete()
      .eq("id", id);

    if (deleteError) {
      // 23503 = foreign key violation (something else still references it)
      if (deleteError.code === "23503") {
        return res.status(409).json({
          success: false,
          message:
            "This service is still referenced by other records, so it cannot be deleted. Deactivate it instead.",
        });
      }
      throw deleteError;
    }

    return res.json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error) {
    console.error("Delete service error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Server error while deleting service",
    });
  }
}
