const express = require("express");
const router = express.Router();

const verifyFirebaseToken = require("../../middlewares/verifyFirebaseToken");
const attachDbUser = require("../../middlewares/attachDbUser");
const requireRole = require("../../middlewares/requireRole");

const {
  listUsers,
  setUserStatus,
  setUserRole,
  listFarmerRequests,
  approveFarmerRequest,
  rejectFarmerRequest,
  listAllCrops,
  setCropStatus,
  deleteCrop,
  getAdminOverview,
} = require("./admin.controller");

// Everything here requires admin
router.use(verifyFirebaseToken, attachDbUser, requireRole(["admin"]));

router.get("/admin/overview", getAdminOverview);

// Users
router.get("/admin/users", listUsers);
router.patch("/admin/users/:id/status", setUserStatus);
router.patch("/admin/users/:id/role", setUserRole);

// Farmer requests
router.get("/admin/farmer-requests", listFarmerRequests);
router.patch("/admin/farmer-requests/:id/approve", approveFarmerRequest);
router.patch("/admin/farmer-requests/:id/reject", rejectFarmerRequest);

// Crops moderation
router.get("/admin/crops", listAllCrops);
router.patch("/admin/crops/:id/status", setCropStatus);
router.delete("/admin/crops/:id", deleteCrop);

module.exports = router;
