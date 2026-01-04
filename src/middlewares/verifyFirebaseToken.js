const initFirebaseAdmin = require("../config/firebaseAdmin");

module.exports = async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const admin = initFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(token);

    req.auth = decoded; // contains uid, email, etc.
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};
