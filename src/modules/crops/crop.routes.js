const express = require("express");
const router = express.Router();

const {
  getSixCrops,
  getAllCrops,
  getCropById,
  createCrop,
  getMyCrops,
  updateMyCrop,
  deleteMyCrop,
} = require("./crop.controller");

// Same endpoints
router.get("/sixCrops", getSixCrops);
router.get("/allCrops", getAllCrops);
router.get("/allCrops/:id", getCropById);
router.post("/allCrops", createCrop);

router.get("/myCrops", getMyCrops);
router.put("/myCrops/:id", updateMyCrop);
router.delete("/myCrops/:id", deleteMyCrop);

module.exports = router;
