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
    const {
      count: totalUsers,
      error: usersError,
    } = await supabase
      .from("profiles")
      .select("id", {
        count: "exact",
        head: true,
      });

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
        (total, profile) =>
          total + Number(profile.balance || 0),
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

export async function getAdminServices(req, res) {
  try {
    const {
      data: services,
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
        ascending: true,
      });

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