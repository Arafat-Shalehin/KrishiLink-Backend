const express = require("express");
const router = express.Router();

const verifyFirebaseToken = require("../../middlewares/verifyFirebaseToken");
const attachDbUser = require("../../middlewares/attachDbUser");
const requireRole = require("../../middlewares/requireRole");
const requireOwnership = require("../../middlewares/requireOwnership");
const { validate, schemas } = require("../../validation");

const {
  getSixCrops,
  getAllCrops,
  getFilterOptions,
  getCropById,
  createCrop,
  getMyCrops,
  updateMyCrop,
  deleteMyCrop,
} = require("./crop.controller");

// Public
router.get("/sixCrops", getSixCrops);
router.get("/allCrops", getAllCrops);
router.get("/allCrops/filter-options", getFilterOptions);
router.get("/allCrops/:id", getCropById);

// Protected (farmer)
router.post(
  "/allCrops",
  verifyFirebaseToken,
  attachDbUser,
  validate(schemas.createCropSchema, "body"),
  createCrop
);

router.get(
  "/myCrops",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["farmer"]),
  getMyCrops,
);

router.put(
  "/myCrops/:id",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["farmer"]),
  requireOwnership("id"),
  updateMyCrop,
);

router.delete(
  "/myCrops/:id",
  verifyFirebaseToken,
  attachDbUser,
  requireRole(["farmer"]),
  requireOwnership("id"),
  deleteMyCrop,
);

module.exports = router;
