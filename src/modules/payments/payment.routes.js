const express = require("express");
const router = express.Router();

const verifyFirebaseToken = require("../../middlewares/verifyFirebaseToken");
const attachDbUser = require("../../middlewares/attachDbUser");
const requireRole = require("../../middlewares/requireRole");
const {
  initPayment,
  paymentSuccess,
  paymentFail,
  paymentCancel,
  paymentIPN,
  getMyPayments,
  getPaymentByTransaction,
} = require("./payment.controller");

// ===================================
// PROTECTED ROUTES
// ===================================

// Start Payment
router.post(
  "/payment/init",
  verifyFirebaseToken,
  attachDbUser,
  initPayment
);

// Get My Payments
router.get(
  "/payment/my-payments",
  verifyFirebaseToken,
  attachDbUser,
  getMyPayments
);

// ===================================
// PUBLIC ROUTES (SSLCommerz Callbacks)
// ===================================

router.post("/payment/success", paymentSuccess);
router.post("/payment/fail", paymentFail);
router.post("/payment/cancel", paymentCancel);
router.post("/payment/ipn", paymentIPN);

// Get Single Payment (Public/Protected? Making it public for easy receipt access)
router.get("/payment/:transactionId", getPaymentByTransaction);

module.exports = router;
