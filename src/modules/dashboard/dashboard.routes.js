const express = require("express");
const router = express.Router();
const { getOverview } = require("./dashboard.controller");

router.get("/dashboard/overview", getOverview);

module.exports = router;
