const admin = require("firebase-admin");

let initialized = false;

function initFirebaseAdmin() {
  if (initialized) return admin;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined;

  // If you don't use Firebase Admin yet, you can keep this file for later.
  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    initialized = true;
    return admin;
  }

  // Fallback: initialize with default credentials if available
  // (Useful in some hosted environments)
  try {
    admin.initializeApp();
    initialized = true;
  } catch (e) {
    // Not initialized — that’s okay if you’re not using token verification yet.
  }

  return admin;
}

module.exports = initFirebaseAdmin;
