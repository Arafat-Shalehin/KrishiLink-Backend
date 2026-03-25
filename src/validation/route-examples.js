// ============================================================================
// ROUTE INTEGRATION EXAMPLE
// ============================================================================
// This file demonstrates how to integrate Zod validation into existing routes
// without breaking existing functionality.
// ============================================================================

const express = require("express");
const { validate, schemas } = require("../validation");
const verifyFirebaseToken = require("../middlewares/verifyFirebaseToken");
const requireRole = require("../middlewares/requireRole");

// Example: CROP ROUTES WITH VALIDATION
// ============================================================================

const router = express.Router();

/**
 * CREATE CROP - POST /allCrops
 * Validates request body before controller handles it
 */
router.post(
  "/allCrops",
  verifyFirebaseToken,
  requireRole(["farmer"]),
  validate(schemas.createCropSchema, "body"), // ← Validation middleware
  async (req, res) => {
    // Controller logic here
    // req.body is now validated and sanitized
    const cropController = require("../modules/crops/crop.controller");
    await cropController.createCrop(req, res);
  }
);

/**
 * UPDATE CROP - PUT /myCrops/:id
 * Validates both params (id) and body
 */
router.put(
  "/myCrops/:id",
  verifyFirebaseToken,
  requireRole(["farmer"]),
  validate(schemas.objectIdSchema, "params"), // Validate MongoDB ID
  validate(schemas.updateCropSchema, "body"), // Validate update data
  async (req, res) => {
    const cropController = require("../modules/crops/crop.controller");
    await cropController.updateMyCrop(req, res);
  }
);

/**
 * GET ALL CROPS - GET /allCrops
 * Validates query parameters for filtering
 */
router.get(
  "/allCrops",
  validate(schemas.cropFilterSchema, "query"), // Validate query params
  async (req, res) => {
    const cropController = require("../modules/crops/crop.controller");
    await cropController.getAllCrops(req, res);
  }
);

/**
 * GET SINGLE CROP - GET /allCrops/:id
 * Validates the ID parameter
 */
router.get(
  "/allCrops/:id",
  validate(schemas.objectIdSchema, "params"),
  async (req, res) => {
    const cropController = require("../modules/crops/crop.controller");
    await cropController.getCropById(req, res);
  }
);

// Example: USER ROUTES WITH VALIDATION
// ============================================================================

/**
 * SYNC USER - POST /users/sync
 */
router.post(
  "/users/sync",
  verifyFirebaseToken,
  validate(schemas.syncUserSchema, "body"),
  async (req, res) => {
    const userController = require("../modules/users/user.controller");
    await userController.syncUser(req, res);
  }
);

// Example: INTEREST ROUTES WITH VALIDATION
// ============================================================================

/**
 * SUBMIT INTEREST - POST /allCrops/:id/interests
 */
router.post(
  "/allCrops/:id/interests",
  verifyFirebaseToken,
  requireRole(["buyer"]),
  validate(schemas.objectIdSchema, "params"), // Validate crop ID
  validate(schemas.submitInterestSchema, "body"),
  async (req, res) => {
    const interestController = require("../modules/interests/interest.controller");
    await interestController.submitInterest(req, res);
  }
);

/**
 * UPDATE INTEREST STATUS - PATCH /updateInterestStatus/:cropId/:interestId
 */
router.patch(
  "/updateInterestStatus/:cropId/:interestId",
  verifyFirebaseToken,
  requireRole(["farmer"]),
  validate(
    z.object({
      cropId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid crop ID"),
      interestId: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid interest ID"),
    }),
    "params"
  ),
  validate(schemas.updateInterestStatusSchema, "body"),
  async (req, res) => {
    const interestController = require("../modules/interests/interest.controller");
    await interestController.updateInterestStatus(req, res);
  }
);

// Example: PAYMENT ROUTES WITH VALIDATION
// ============================================================================

/**
 * INITIATE PAYMENT - POST /payment/init
 */
router.post(
  "/payment/init",
  verifyFirebaseToken,
  requireRole(["buyer"]),
  validate(schemas.initPaymentSchema, "body"),
  async (req, res) => {
    const paymentController = require("../modules/payments/payment.controller");
    await paymentController.initPayment(req, res);
  }
);

/**
 * PAYMENT CALLBACKS - POST /payment/success, /payment/fail, etc.
 * These should validate SSLCommerz callback data
 */
router.post(
  "/payment/success",
  validate(schemas.paymentCallbackSchema, "body"),
  async (req, res) => {
    const paymentController = require("../modules/payments/payment.controller");
    await paymentController.paymentSuccess(req, res);
  }
);

// Example: ADMIN ROUTES WITH VALIDATION
// ============================================================================

/**
 * LIST USERS - GET /admin/users
 */
router.get(
  "/admin/users",
  verifyFirebaseToken,
  requireRole(["admin"]),
  validate(schemas.listUsersQuerySchema, "query"),
  async (req, res) => {
    const adminController = require("../modules/admin/admin.controller");
    await adminController.listUsers(req, res);
  }
);

/**
 * UPDATE USER ROLE - PATCH /admin/users/:id/role
 */
router.patch(
  "/admin/users/:id/role",
  verifyFirebaseToken,
  requireRole(["admin"]),
  validate(schemas.objectIdSchema, "params"),
  validate(schemas.updateUserRoleSchema, "body"),
  async (req, res) => {
    const adminController = require("../modules/admin/admin.controller");
    await adminController.setUserRole(req, res);
  }
);

/**
 * UPDATE USER STATUS - PATCH /admin/users/:id/status
 */
router.patch(
  "/admin/users/:id/status",
  verifyFirebaseToken,
  requireRole(["admin"]),
  validate(schemas.objectIdSchema, "params"),
  validate(schemas.updateUserStatusSchema, "body"),
  async (req, res) => {
    const adminController = require("../modules/admin/admin.controller");
    await adminController.setUserStatus(req, res);
  }
);

/**
 * MODERATE CROP - PATCH /admin/crops/:id/status
 */
router.patch(
  "/admin/crops/:id/status",
  verifyFirebaseToken,
  requireRole(["admin"]),
  validate(schemas.objectIdSchema, "params"),
  validate(schemas.moderateCropSchema, "body"),
  async (req, res) => {
    const adminController = require("../modules/admin/admin.controller");
    await adminController.setCropStatus(req, res);
  }
);

module.exports = router;
