import express from "express";

import { telegramAuth } from "../middleware/telegramAuth.js";
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
} from "../controllers/adminController.js";

const router = express.Router();


/*
|--------------------------------------------------------------------------
| Every route requires Telegram authentication
| AND administrator privileges.
|--------------------------------------------------------------------------
*/

router.use(
  telegramAuth,
  adminAuth
);


/*
|--------------------------------------------------------------------------
| Admin profile
|--------------------------------------------------------------------------
*/

router.get(
  "/me",
  getAdminProfile
);


/*
|--------------------------------------------------------------------------
| Dashboard
|--------------------------------------------------------------------------
*/

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
| Services
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
| Orders
|--------------------------------------------------------------------------
*/

router.get(
  "/orders",
  getAdminOrders
);


export default router;