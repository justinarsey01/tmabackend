
import express from "express";

import { adminTelegramAuth } from "../middleware/adminTelegramAuth.js";
import { adminAuth } from "../middleware/adminAuth.js";

import {
  getAdminDashboard,
  getAdminProfile,
  getAdminUsers,
  updateUserStatus,
  getAdminServices,
  createService,
  updateService,
  getAdminOrders,
  updateAdminOrderStatus,
} from "../controllers/adminController.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Admin Authentication
|--------------------------------------------------------------------------
*/
router.use(
  adminTelegramAuth,
  adminAuth
);

/*
|--------------------------------------------------------------------------
| Administrator
|--------------------------------------------------------------------------
*/

router.get(
  "/me",
  getAdminProfile
);

router.get(
  "/dashboard",
  getAdminDashboard
);

/*
|--------------------------------------------------------------------------
| Users
|--------------------------------------------------------------------------
*/

router.get(
  "/users",
  getAdminUsers
);

router.patch(
  "/users/:id/status",
  updateUserStatus
);

/*
|--------------------------------------------------------------------------
| SMM Services
|--------------------------------------------------------------------------
*/

router.get(
  "/services",
  getAdminServices
);

router.post(
  "/services",
  createService
);

router.patch(
  "/services/:id",
  updateService
);

/*
|--------------------------------------------------------------------------
| SMM Orders
|--------------------------------------------------------------------------
*/

router.get(
  "/orders",
  getAdminOrders
);

router.patch(
  "/orders/:id/status",
  updateAdminOrderStatus
);

export default router;
