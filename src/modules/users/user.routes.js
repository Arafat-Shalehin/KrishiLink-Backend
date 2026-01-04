const express = require("express");
const router = express.Router();

const verifyFirebaseToken = require("../../middlewares/verifyFirebaseToken");
const { syncUser, getMe } = require("./user.controller");

router.post("/users/sync", verifyFirebaseToken, syncUser);
router.get("/users/me", verifyFirebaseToken, getMe);

module.exports = router;
