import dotenv from "dotenv";
import { parse } from "@tma.js/init-data-node";
import { createClient } from "@supabase/supabase-js";
import {
  MIN_WAIT_SECONDS,
  verifyTaskCompletion,
} from "./taskVerification.js";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/*
|--------------------------------------------------------------------------
| GET ACTIVE TASKS
|--------------------------------------------------------------------------
*/

export async function getTasks(req, res) {
  try {
    const initData = req.telegramInitData;

    if (!initData) {
      return res.status(401).json({
        success: false,
        message: "Telegram authentication data is missing",
      });
    }

    const data = parse(initData);
    const telegramUser = data.user;

    if (!telegramUser) {
      return res.status(401).json({
        success: false,
        message: "Telegram user not found",
      });
    }

    const telegramId = String(telegramUser.id);

    console.log("GET TASKS REQUEST:", {
      telegramId,
    });

    /*
    |--------------------------------------------------------------------------
    | FIND PROFILE
    |--------------------------------------------------------------------------
    */

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(`
        id,
        telegram_id,
        is_active
      `)
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (profileError) {
      console.error(
        "Profile lookup error:",
        profileError
      );

      return res.status(500).json({
        success: false,
        message: "Could not find your profile",
      });
    }

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "CoinEarn profile not found",
      });
    }

    if (!profile.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated.",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | GET ACTIVE TASKS
    |--------------------------------------------------------------------------
    */

    const {
      data: tasks,
      error: tasksError,
    } = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        type,
        target,
        reward,
        image_url,
        advertiser
      `)
      .eq("active", true)
      .order("created_at", {
        ascending: true,
      });

    if (tasksError) {
      console.error(
        "Get tasks error:",
        tasksError
      );

      return res.status(500).json({
        success: false,
        message: "Could not load tasks",
      });
    }

    /*
    |--------------------------------------------------------------------------
    | GET COMPLETED TASKS
    |--------------------------------------------------------------------------
    */

    const {
      data: completedRows,
      error: completedError,
    } = await supabase
      .from("task_completions")
      .select("task_id")
      .eq("user_id", profile.id);

    if (completedError) {
      console.error(
        "Completed tasks lookup error:",
        completedError
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not load your completed tasks",
      });
    }

    const completedTaskIds = new Set(
      (completedRows || []).map(
        (row) => String(row.task_id)
      )
    );

    /*
    |--------------------------------------------------------------------------
    | GET STARTED TASKS (server-side wait timer)
    |--------------------------------------------------------------------------
    */

    const { data: startRows } = await supabase
      .from("task_starts")
      .select("task_id, started_at")
      .eq("user_id", profile.id);

    const startedAt = new Map(
      (startRows || []).map((row) => [
        String(row.task_id),
        new Date(row.started_at).getTime(),
      ])
    );

    /*
    |--------------------------------------------------------------------------
    | FORMAT TASKS
    |--------------------------------------------------------------------------
    */

    const formattedTasks = (tasks || []).map(
      (task) => ({
        ...task,

        completed:
          completedTaskIds.has(
            String(task.id)
          ),

        ready_to_claim:
          startedAt.has(String(task.id)) &&
          Date.now() - startedAt.get(String(task.id)) >=
            MIN_WAIT_SECONDS * 1000,

        /*
         * Make sure normal tasks have
         * predictable values.
         */
        image_url:
          task.image_url || null,

        advertiser:
          task.advertiser ||
          "CoinEarn",
      })
    );

    console.log(
      "TASKS LOADED:",
      formattedTasks.length
    );

    return res.json({
      success: true,
      tasks: formattedTasks,
    });

  } catch (error) {
    console.error(
      "Tasks controller error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Could not load tasks",
    });
  }
}

/*
|--------------------------------------------------------------------------
| COMPLETE TASK
|--------------------------------------------------------------------------
*/

export async function completeTask(req, res) {
  try {
    const initData = req.telegramInitData;

    if (!initData) {
      console.error(
        "COMPLETE TASK: Telegram authentication data missing"
      );

      return res.status(401).json({
        success: false,
        message: "Telegram authentication data is missing",
      });
    }

    const data = parse(initData);
    const telegramUser = data.user;

    if (!telegramUser) {
      console.error(
        "COMPLETE TASK: Telegram user not found"
      );

      return res.status(400).json({
        success: false,
        message: "Telegram user not found",
      });
    }

    const telegramId = String(
      telegramUser.id
    );

    const { taskId } = req.body;

    console.log(
      "COMPLETE TASK REQUEST:",
      {
        telegramId,
        taskId,
      }
    );

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Task ID is required",
      });
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("profiles")
      .select(`
        id,
        telegram_id,
        balance,
        is_active
      `)
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (profileError) {
      console.error(
        "Profile lookup error:",
        profileError
      );

      return res.status(500).json({
        success: false,
        message: "Could not find your profile",
      });
    }

    if (!profile) {
      console.error(
        "COMPLETE TASK: Profile not found:",
        telegramId
      );

      return res.status(404).json({
        success: false,
        message: "CoinEarn profile not found",
      });
    }

    if (!profile.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated.",
      });
    }

    console.log(
      "COMPLETE TASK USER:",
      {
        telegramId,
        profileId: profile.id,
        currentBalance: profile.balance,
        taskId,
      }
    );

    const check = await verifyTaskCompletion(
      profile.id,
      telegramId,
      taskId
    );

    if (!check.ok) {
      return res.status(check.status).json({
        success: false,
        message: check.message,
      });
    }

    const {
      data: result,
      error: taskError,
    } = await supabase.rpc(
      "complete_task",
      {
        p_user_id: profile.id,
        p_task_id: taskId,
      }
    );

    if (taskError) {
      console.error(
        "COMPLETE TASK RPC ERROR:",
        taskError
      );

      let message =
        taskError.message ||
        "Could not complete task";

      if (
        message.includes(
          "Task already completed"
        )
      ) {
        message =
          "You have already completed this task.";
      }

      if (
        message.includes(
          "Task not found or inactive"
        )
      ) {
        message =
          "This task is no longer available.";
      }

      return res.status(400).json({
        success: false,
        message,
      });
    }

    if (!result) {
      console.error(
        "COMPLETE TASK: RPC returned no result"
      );

      return res.status(500).json({
        success: false,
        message:
          "Task completion returned no result",
      });
    }

    const reward = Number(
      result.reward || 0
    );

    const balance = Number(
      result.balance || 0
    );

    console.log(
      "TASK COMPLETED SUCCESSFULLY:",
      {
        telegramId,
        taskId,
        reward,
        balance,
      }
    );

    return res.json({
      success: true,
      reward,
      balance,
    });

  } catch (error) {
    console.error(
      "COMPLETE TASK CONTROLLER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Task completion failed",
    });
  }
}