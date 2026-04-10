const express = require("express");
const router = express.Router();

const verifyFirebaseToken = require("../../middlewares/verifyFirebaseToken");
const { authLimiter } = require("../../middlewares/rateLimiter");
const {
  syncUser,
  getMe,
  requestFarmer,
  cancelFarmerRequest,
  getMyStats,
} = require("./user.controller");

router.post("/users/sync", authLimiter, verifyFirebaseToken, syncUser);
router.get("/users/me", verifyFirebaseToken, getMe);
router.post("/users/request-farmer", verifyFirebaseToken, requestFarmer);
router.patch(
  "/users/request-farmer/cancel",
  verifyFirebaseToken,
  cancelFarmerRequest
);
router.get("/users/me/stats", verifyFirebaseToken, getMyStats);

module.exports = router;
