const initFirebaseAdmin = require("../config/firebaseAdmin");

module.exports = async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split("Bearer ")[1]
      : null;

    if (!token)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const admin = initFirebaseAdmin();
    if (!admin?.auth) {
      return res.status(500).json({
        success: false,
        message: "Firebase Admin not configured on server.",
      });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // decoded.email etc.
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};
