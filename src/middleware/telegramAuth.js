import dotenv from "dotenv";
import { validate } from "@tma.js/init-data-node";

dotenv.config();

export async function telegramAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Telegram authentication required"
      });
    }

    if (!authHeader.startsWith("tma ")) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication format"
      });
    }

    const initData = authHeader.substring(4);

    await validate(
      initData,
      process.env.TELEGRAM_BOT_TOKEN,
      {
        expiresIn: 86400
      }
    );

    req.telegramInitData = initData;

    next();
  } catch (error) {
    console.error("Telegram authentication error:", error);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired Telegram session"
    });
  }
}