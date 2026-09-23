import dotenv from "dotenv";
import { validate } from "@tma.js/init-data-node";

dotenv.config();

export async function adminTelegramAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Telegram authentication required",
      });
    }

    if (!authHeader.startsWith("tma ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication format",
      });
    }

    const initData = authHeader.substring(4);

    const adminBotToken =
      process.env.ADMIN_TELEGRAM_BOT_TOKEN;

    if (!adminBotToken) {
      console.error(
        "ADMIN_TELEGRAM_BOT_TOKEN is not configured"
      );

      return res.status(500).json({
        success: false,
        message:
          "Admin Telegram authentication is not configured",
      });
    }

    await validate(
      initData,
      adminBotToken,
      {
        expiresIn: 86400,
      }
    );

    req.telegramInitData = initData;

    next();
  } catch (error) {
    console.error(
      "Admin Telegram authentication error:",
      error
    );

    return res.status(401).json({
      success: false,
      message: "Invalid or expired Telegram session",
    });
  }
}