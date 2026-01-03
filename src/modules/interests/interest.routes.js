const express = require("express");
const router = express.Router();

const {
  submitInterest,
  getMyInterests,
  updateInterestStatus,
} = require("./interest.controller");

// Keep exact endpoints
router.post("/allCrops/:id/interests", submitInterest);
router.get("/myInterests", getMyInterests);
router.patch("/updateInterestStatus/:cropId/:interestId", updateInterestStatus);

module.exports = router;
