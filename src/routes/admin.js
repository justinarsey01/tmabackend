import express from "express";

import {
  adminTelegramAuth,
} from "../middleware/adminTelegramAuth.js";

import {
  adminAuth,
} from "../middleware/adminAuth.js";

import {
  getAdminDashboard,
  getAdminProfile,

  getAdminUsers,
  updateUserStatus,

  getAdminServices,
  createService,
  updateService,

  getAdminTasks,
  createTask,
  updateTask,
  deleteTask,

  getAdminOrders,
  updateAdminOrderStatus,
} from "../controllers/adminController.js";

const router = express.Router();


/*
|--------------------------------------------------------------------------
| ADMIN AUTHENTICATION
|--------------------------------------------------------------------------
*/

router.use(
  adminTelegramAuth,
  adminAuth
);


/*
|--------------------------------------------------------------------------
| ADMIN PROFILE
|--------------------------------------------------------------------------
*/

router.get(
  "/me",
  getAdminProfile
);


/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  getAdminDashboard
);


/*
|--------------------------------------------------------------------------
| USERS
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
| SMM SERVICES
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
| TASKS
|--------------------------------------------------------------------------
*/

router.get(
  "/tasks",
  getAdminTasks
);

router.post(
  "/tasks",
  createTask
);

router.patch(
  "/tasks/:id",
  updateTask
);

router.delete(
  "/tasks/:id",
  deleteTask
);


/*
|--------------------------------------------------------------------------
| ORDERS
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