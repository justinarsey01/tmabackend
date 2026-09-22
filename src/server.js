import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import miningRoutes from "./routes/mining.js";
import taskRoutes from "./routes/tasks.js";
import serviceRoutes from "./routes/services.js";
import orderRoutes from "./routes/orders.js";
import adminRoutes from "./routes/admin.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "CoinEarn backend is running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "CoinEarn API is healthy",
  });
});

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/mining",
  miningRoutes
);

app.use(
  "/api/tasks",
  taskRoutes
);

app.use(
  "/api/services",
  serviceRoutes
);

app.use(
  "/api/orders",
  orderRoutes
);

app.use(
  "/api/admin",
  adminRoutes
);

export default app;

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(
      `CoinEarn backend running on port ${PORT}`
    );
  });
}