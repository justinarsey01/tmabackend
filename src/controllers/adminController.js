
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
    const { count: totalUsers, error: usersError } =
      await supabase
        .from("profiles")
        .select("id", {
          count: "exact",
          head: true,
        });

    const { count: smmOrders, error: ordersError } =
      await supabase
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
      data: balances,
      error: balancesError,
    } = await supabase
      .from("profiles")
      .select("balance");

    if (usersError) {
      console.error(
        "Dashboard users error:",
        usersError
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

    if (balancesError) {
      console.error(
        "Dashboard balances error:",
        balancesError
      );
    }

    const coinsInCirculation =
      (balances || []).reduce(
        (total, profile) => {
          return (
            total +
            Number(profile.balance || 0)
          );
        },
        0
      );

    const stats = {
      totalUsers: totalUsers || 0,
      coinsInCirculation,
      smmOrders: smmOrders || 0,
      pendingOrders: pendingOrders || 0,
    };

    console.log(
      "Admin dashboard statistics:",
      stats
    );

    return res.status(200).json({
      success: true,
      stats,
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
    const { isActive, reason } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be true or false",
      });
    }

    // Prevent an administrator from accidentally
    // deactivating their own account.
    if (req.admin?.id === id) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own administrator account",
      });
    }

    const updateData = {
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    if (isActive) {
      updateData.banned_at = null;
      updateData.banned_reason = null;
    } else {
      updateData.banned_at = new Date().toISOString();
      updateData.banned_reason =
        reason?.trim() || "Deactivated by administrator";
    }

    const { data: user, error } = await supabase
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
        message: "Could not update user status",
      });
    }

    // Record the administrator action.
    const { error: logError } = await supabase
      .from("admin_logs")
      .insert({
        admin_user_id: req.admin.id,
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
      message: "Server error while updating user status",
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

