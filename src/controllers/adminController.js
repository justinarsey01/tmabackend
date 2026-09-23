
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/*
|--------------------------------------------------------------------------
| Dashboard
|--------------------------------------------------------------------------
*/

export async function getAdminDashboard(req, res) {
  try {
    const [
      usersResult,
      activeUsersResult,
      ordersResult,
      pendingOrdersResult,
      servicesResult,
      coinsResult,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true }),

      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),

      supabase
        .from("smm_orders")
        .select("id", { count: "exact", head: true }),

      supabase
        .from("smm_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),

      supabase
        .from("smm_services")
        .select("id", { count: "exact", head: true })
        .eq("active", true),

      supabase
        .from("profiles")
        .select("balance"),
    ]);

    const errors = [
      usersResult.error,
      activeUsersResult.error,
      ordersResult.error,
      pendingOrdersResult.error,
      servicesResult.error,
      coinsResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error("Dashboard errors:", errors);

      return res.status(500).json({
        success: false,
        message: "Could not load dashboard statistics",
      });
    }

    const totalCoins = (coinsResult.data || []).reduce(
      (total, profile) =>
        total + Number(profile.balance || 0),
      0
    );

    return res.json({
      success: true,
      statistics: {
        totalUsers: usersResult.count || 0,
        activeUsers: activeUsersResult.count || 0,
        totalOrders: ordersResult.count || 0,
        pendingOrders: pendingOrdersResult.count || 0,
        activeServices: servicesResult.count || 0,
        coinsInCirculation: totalCoins,
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load dashboard",
    });
  }
}

/*
|--------------------------------------------------------------------------
| Current Administrator
|--------------------------------------------------------------------------
*/

export async function getAdminProfile(req, res) {
  return res.json({
    success: true,
    admin: req.admin,
  });
}

/*
|--------------------------------------------------------------------------
| Users
|--------------------------------------------------------------------------
*/

export async function getAdminUsers(req, res) {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    let query = supabase
      .from("profiles")
      .select(`
        id,
        telegram_id,
        username,
        first_name,
        last_name,
        balance,
        total_earned,
        total_spent,
        referral_code,
        is_active,
        is_admin,
        banned_at,
        banned_reason,
        created_at
      `)
      .order("created_at", {
        ascending: false,
      })
      .limit(100);

    if (search) {
      const escapedSearch = search.replace(
        /[%_]/g,
        "\\$&"
      );

      query = query.or(
        `telegram_id.ilike.%${escapedSearch}%,username.ilike.%${escapedSearch}%,first_name.ilike.%${escapedSearch}%,last_name.ilike.%${escapedSearch}%`
      );
    }

    const {
      data,
      error,
    } = await query;

    if (error) {
      console.error("Get admin users error:", error);

      return res.status(500).json({
        success: false,
        message: "Could not load users",
      });
    }

    return res.json({
      success: true,
      users: data || [],
    });
  } catch (error) {
    console.error("Admin users error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load users",
    });
  }
}

/*
|--------------------------------------------------------------------------
| Activate / Deactivate User
|--------------------------------------------------------------------------
*/

export async function updateUserStatus(req, res) {
  try {
    const { id } = req.params;

    const {
      active,
      reason,
    } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    if (typeof active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Active must be true or false",
      });
    }

    if (id === req.admin.id) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot deactivate your own administrator account",
      });
    }

    const updateData = {
      is_active: active,
      updated_at: new Date().toISOString(),
    };

    if (active) {
      updateData.banned_at = null;
      updateData.banned_reason = null;
    } else {
      updateData.banned_at =
        new Date().toISOString();

      updateData.banned_reason =
        typeof reason === "string"
          ? reason.trim() || null
          : null;
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
        is_active,
        is_admin,
        banned_at,
        banned_reason
      `)
      .single();

    if (error) {
      console.error(
        "Update user status error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Could not update user",
      });
    }

    await supabase
      .from("admin_logs")
      .insert({
        admin_user_id: req.admin.id,
        action: active
          ? "activate_user"
          : "deactivate_user",
        target_user_id: id,
        details: {
          reason: reason || null,
        },
      });

    return res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error(
      "Update user status controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Could not update user",
    });
  }
}

/*
|--------------------------------------------------------------------------
| Services
|--------------------------------------------------------------------------
*/

export async function getAdminServices(req, res) {
  try {
    const {
      data,
      error,
    } = await supabase
      .from("smm_services")
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
        created_at
      `)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Get admin services error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Could not load services",
      });
    }

    return res.json({
      success: true,
      services: data || [],
    });
  } catch (error) {
    console.error(
      "Admin services error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Could not load services",
    });
  }
}

/*
|--------------------------------------------------------------------------
| Create Service
|--------------------------------------------------------------------------
*/

export async function createService(req, res) {
  try {
    const {
      name,
      category,
      description,
      costPrice,
      sellingPrice,
      minQuantity,
      maxQuantity,
      active,
    } = req.body;

    if (
      typeof name !== "string" ||
      !name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Service name is required",
      });
    }

    const parsedCost = Number(costPrice);
    const parsedSelling = Number(sellingPrice);
    const parsedMin = Number(minQuantity);
    const parsedMax = Number(maxQuantity);

    if (
      !Number.isFinite(parsedCost) ||
      parsedCost < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid cost price",
      });
    }

    if (
      !Number.isFinite(parsedSelling) ||
      parsedSelling < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid selling price",
      });
    }

    if (
      !Number.isInteger(parsedMin) ||
      parsedMin <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid minimum quantity",
      });
    }

    if (
      !Number.isInteger(parsedMax) ||
      parsedMax < parsedMin
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid maximum quantity",
      });
    }

    const {
      data: service,
      error,
    } = await supabase
      .from("smm_services")
      .insert({
        name: name.trim(),
        category:
          typeof category === "string"
            ? category.trim()
            : "telegram",
        description:
          typeof description === "string"
            ? description.trim()
            : null,
        cost_price: parsedCost,
        selling_price: parsedSelling,
        min_quantity: parsedMin,
        max_quantity: parsedMax,
        active:
          typeof active === "boolean"
            ? active
            : true,
      })
      .select()
      .single();

    if (error) {
      console.error(
        "Create service error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Could not create service",
      });
    }

    await supabase
      .from("admin_logs")
      .insert({
        admin_user_id: req.admin.id,
        action: "create_service",
        details: {
          service_id: service.id,
          name: service.name,
        },
      });

    return res.status(201).json({
      success: true,
      service,
    });
  } catch (error) {
    console.error(
      "Create service controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Could not create service",
    });
  }
}

/*
|--------------------------------------------------------------------------
| Update Service
|--------------------------------------------------------------------------
*/

export async function updateService(req, res) {
  try {
    const { id } = req.params;

    const {
      name,
      category,
      description,
      costPrice,
      sellingPrice,
      minQuantity,
      maxQuantity,
      active,
    } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Service ID is required",
      });
    }

    const updateData = {};

    if (name !== undefined) {
      if (
        typeof name !== "string" ||
        !name.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid service name",
        });
      }

      updateData.name = name.trim();
    }

    if (category !== undefined) {
      updateData.category = category;
    }

    if (description !== undefined) {
      updateData.description =
        description || null;
    }

    if (costPrice !== undefined) {
      const value = Number(costPrice);

      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid cost price",
        });
      }

      updateData.cost_price = value;
    }

    if (sellingPrice !== undefined) {
      const value = Number(sellingPrice);

      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid selling price",
        });
      }

      updateData.selling_price = value;
    }

    if (minQuantity !== undefined) {
      const value = Number(minQuantity);

      if (
        !Number.isInteger(value) ||
        value <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid minimum quantity",
        });
      }

      updateData.min_quantity = value;
    }

    if (maxQuantity !== undefined) {
      const value = Number(maxQuantity);

      if (
        !Number.isInteger(value) ||
        value <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid maximum quantity",
        });
      }

      updateData.max_quantity = value;
    }

    if (active !== undefined) {
      updateData.active = Boolean(active);
    }

    const {
      data: service,
      error,
    } = await supabase
      .from("smm_services")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(
        "Update service error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Could not update service",
      });
    }

    await supabase
      .from("admin_logs")
      .insert({
        admin_user_id: req.admin.id,
        action: "update_service",
        details: {
          service_id: id,
          changes: updateData,
        },
      });

    return res.json({
      success: true,
      service,
    });
  } catch (error) {
    console.error(
      "Update service controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Could not update service",
    });
  }
}

/*
|--------------------------------------------------------------------------
| Orders
|--------------------------------------------------------------------------
*/

export async function getAdminOrders(req, res) {
  try {
    const { data: orders, error } = await supabase
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
        message: "Could not load SMM orders",
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
      message: "Could not load SMM orders",
    });
  }
}

/*
|--------------------------------------------------------------------------
| Update SMM Order Status
|--------------------------------------------------------------------------
*/

export async function updateAdminOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Order status is required",
      });
    }

    const allowedStatuses = [
      "pending",
      "processing",
      "completed",
      "rejected",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
      });
    }

    if (!req.admin?.id) {
      return res.status(403).json({
        success: false,
        message: "Administrator authentication required",
      });
    }

    const {
      data,
      error,
    } = await supabase.rpc(
      "admin_update_smm_order",
      {
        p_order_id: id,
        p_admin_id: req.admin.id,
        p_status: status,
        p_admin_note: adminNote || null,
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

    return res.json({
      success: true,
      message:
        status === "rejected"
          ? "Order rejected and refunded successfully"
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

