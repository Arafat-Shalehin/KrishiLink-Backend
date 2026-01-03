const express = require("express");
const router = express.Router();
const { upsertUser } = require("./user.controller");

router.post("/users", upsertUser);

module.exports = router;
