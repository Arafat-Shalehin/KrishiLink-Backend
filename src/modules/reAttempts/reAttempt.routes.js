const express = require("express");
const router = express.Router();

const verifyFirebaseToken = require("../../middlewares/verifyFirebaseToken");
const attachDbUser = require("../../middlewares/attachDbUser");
const requireRole = require("../../middlewares/requireRole");

const {
  getMyFailedPayments,
  submitReAttemptRequest,
  getAllReAttemptRequests,
  reviewReAttemptRequest,
  getBuyerNotifications,
  markNotificationRead,
} = require("./reAttempt.controller");

// ── Farmer routes ────────────────────────────────────────────────────────────
router.get(
  "/farmer/failed-payments",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["farmer"]),
  getMyFailedPayments
);

router.post(
  "/farmer/re-attempt-request",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["farmer"]),
  submitReAttemptRequest
);

// ── Admin routes ─────────────────────────────────────────────────────────────
router.get(
  "/admin/re-attempt-requests",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["admin"]),
  getAllReAttemptRequests
);

router.patch(
  "/admin/re-attempt-requests/:id",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["admin"]),
  reviewReAttemptRequest
);

// ── Buyer notification routes ─────────────────────────────────────────────────
router.get(
  "/buyer/notifications",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["buyer"]),
  getBuyerNotifications
);

router.patch(
  "/buyer/notifications/:id/read",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["buyer"]),
  markNotificationRead
);

module.exports = router;
