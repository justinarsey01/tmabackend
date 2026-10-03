import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/*
|--------------------------------------------------------------------------
| SHARED HELPERS
|--------------------------------------------------------------------------
*/

const TASK_COLUMNS = `
  id,
  title,
  description,
  type,
  target,
  reward,
  active,
  advertiser,
  image_url,
  created_at,
  updated_at
`;

// Trimmed string, or null when empty / not a string.
function cleanOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  return value.trim() || null;
}

// Returns an error message, or null when the link is acceptable.
function validateImageUrl(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      return "Ad image URL must start with https://";
    }

    return null;
  } catch {
    return "Please enter a valid ad image URL";
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
      .select(TASK_COLUMNS)
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
      advertiser,
      image_url,
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

    /*
    |--------------------------------------------------------------------------
    | SPONSORED TELEGRAM AD FIELDS
    |--------------------------------------------------------------------------
    */

    const isAd =
      taskType === "telegram_ad";

    const taskAdvertiser = isAd
      ? cleanOptionalText(advertiser)
      : null;

    const taskImageUrl = isAd
      ? cleanOptionalText(image_url)
      : null;

    if (isAd) {
      if (!taskAdvertiser) {
        return res.status(400).json({
          success: false,
          message:
            "Advertiser name is required for Sponsored Telegram Ads",
        });
      }

      if (!taskImageUrl) {
        return res.status(400).json({
          success: false,
          message:
            "Ad image URL is required for Sponsored Telegram Ads",
        });
      }

      const imageError =
        validateImageUrl(taskImageUrl);

      if (imageError) {
        return res.status(400).json({
          success: false,
          message: imageError,
        });
      }
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

        advertiser: taskAdvertiser,

        image_url: taskImageUrl,
      })
      .select(TASK_COLUMNS)
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
      advertiser,
      image_url,
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

    /*
    |--------------------------------------------------------------------------
    | SPONSORED TELEGRAM AD FIELDS
    |--------------------------------------------------------------------------
    */

    if (advertiser !== undefined) {
      updateData.advertiser =
        cleanOptionalText(advertiser);
    }

    if (image_url !== undefined) {
      const cleanedImage =
        cleanOptionalText(image_url);

      if (cleanedImage) {
        const imageError =
          validateImageUrl(cleanedImage);

        if (imageError) {
          return res.status(400).json({
            success: false,
            message: imageError,
          });
        }
      }

      updateData.image_url =
        cleanedImage;
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
      .select("id, type, advertiser, image_url")
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
    | AD RULES
    |
    | Only enforced when this request touches the type or ad fields, so
    | simple actions like activate / deactivate always work.
    |--------------------------------------------------------------------------
    */

    const touchesAd =
      type !== undefined ||
      advertiser !== undefined ||
      image_url !== undefined;

    if (touchesAd) {
      const finalType =
        updateData.type !== undefined
          ? updateData.type
          : existingTask.type;

      if (finalType === "telegram_ad") {
        const finalAdvertiser =
          updateData.advertiser !== undefined
            ? updateData.advertiser
            : existingTask.advertiser;

        const finalImageUrl =
          updateData.image_url !== undefined
            ? updateData.image_url
            : existingTask.image_url;

        if (!finalAdvertiser) {
          return res.status(400).json({
            success: false,
            message:
              "Advertiser name is required for Sponsored Telegram Ads",
          });
        }

        if (!finalImageUrl) {
          return res.status(400).json({
            success: false,
            message:
              "Ad image URL is required for Sponsored Telegram Ads",
          });
        }
      } else {
        // Normal tasks never keep ad data.
        updateData.advertiser = null;
        updateData.image_url = null;
      }
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
      .select(TASK_COLUMNS)
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