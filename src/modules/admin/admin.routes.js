const express = require("express");
const router = express.Router();

const verifyFirebaseToken = require("../../middlewares/verifyFirebaseToken");
const attachDbUser = require("../../middlewares/attachDbUser");
const requireRole = require("../../middlewares/requireRole");
const restrictDemoAdmin = require("../../middlewares/restrictDemoAdmin");

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
  resetFarmerRequest,
} = require("./admin.controller");

// Everything here requires admin
router.use("/admin", verifyFirebaseToken, attachDbUser, requireRole(["admin"]));

router.get("/admin/overview", getAdminOverview);

// Users
router.get("/admin/users", listUsers);
router.patch("/admin/users/:id/status", restrictDemoAdmin, setUserStatus); // Restricted
router.patch("/admin/users/:id/role", restrictDemoAdmin, setUserRole);

// Farmer requests
router.get("/admin/farmer-requests", listFarmerRequests);
router.patch("/admin/farmer-requests/:id/approve", approveFarmerRequest);
router.patch("/admin/farmer-requests/:id/reject", rejectFarmerRequest);
router.patch("/admin/farmer-requests/:id/reset", resetFarmerRequest);

// Crops moderation
router.get("/admin/crops", listAllCrops);
router.patch("/admin/crops/:id/status", restrictDemoAdmin, setCropStatus); // Restricted
router.delete("/admin/crops/:id", restrictDemoAdmin, deleteCrop); // Restricted

module.exports = router;
