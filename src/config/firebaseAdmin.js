const admin = require("firebase-admin");

let initialized = false;

function initFirebaseAdmin() {
  if (initialized) return admin;

  const base64 = process.env.FB_SERVICE_KEY;
  if (!base64) {
    throw new Error("FB_SERVICE_KEY is missing in environment variables.");
  }

  // Decode JSON from base64
  const decoded = Buffer.from(base64, "base64").toString("utf8");
  const serviceAccount = JSON.parse(decoded);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  initialized = true;
  return admin;
}

module.exports = initFirebaseAdmin;
