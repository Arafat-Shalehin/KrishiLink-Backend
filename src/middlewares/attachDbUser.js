const { usersCollection } = require("../modules/users/user.model");

module.exports = async function attachDbUser(req, res, next) {
  try {
    const uid = req.auth?.uid;
    if (!uid) {
      return res.status(401).json({ success: false, message: "Unauthorized: No UID" });
    }

    const col = await usersCollection();
    const user = await col.findOne({ uid });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in DB. Please sync account.",
      });
    }

    // console.log("User attached:", user.email, "Status:", user.status);

    if (user.status === "blocked") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Your account is blocked.",
      });
    }

    req.dbUser = user;
    next();
  } catch (err) {
    console.error("attachDbUser error:", err);
    return res.status(500).json({ success: false, message: "Server error in auth" });
  }
};
