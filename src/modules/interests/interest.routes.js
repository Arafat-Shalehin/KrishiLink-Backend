const express = require("express");
const router = express.Router();

const verifyFirebaseToken = require("../../middlewares/verifyFirebaseToken");
const attachDbUser = require("../../middlewares/attachDbUser");
const requireRole = require("../../middlewares/requireRole");
const requireOwnership = require("../../middlewares/requireOwnership");

const {
  submitInterest,
  getMyInterests,
  getCropInterests,
  updateInterestStatus,
} = require("./interest.controller");

// Buyer only
router.post(
  "/allCrops/:id/interests",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["buyer"]),
  submitInterest
);

router.get(
  "/myInterests",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["buyer"]),
  getMyInterests
);

// Farmer owner only (view interests on a crop)
router.get(
  "/allCrops/:id/interests",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["farmer"]),
  requireOwnership("id"),
  getCropInterests
);

// Farmer owner only (update status + reduce quantity)
router.patch(
  "/updateInterestStatus/:cropId/:interestId",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["farmer"]),
  requireOwnership("cropId"),
  updateInterestStatus
);

module.exports = router;
