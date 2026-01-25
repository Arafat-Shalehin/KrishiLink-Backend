const express = require("express");
const router = express.Router();

const verifyFirebaseToken = require("../../middlewares/verifyFirebaseToken");
const attachDbUser = require("../../middlewares/attachDbUser");
const requireRole = require("../../middlewares/requireRole");

const {
  getBuyerDashboard,
  getFarmerDashboard,
} = require("./dashboard.controller");

router.get(
  "/dashboard/buyer",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["buyer"]),
  getBuyerDashboard,
);

router.get(
  "/dashboard/farmer",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["farmer"]),
  getFarmerDashboard,
);

module.exports = router;
