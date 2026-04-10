const { usersCollection } = require("../modules/users/user.model");

// In-memory cache for user data to prevent DB load on every request
// Structure: Map<uid, { user: object, expiry: number }>
const userCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Invalidates the cache for a specific user.
 * Call this when user role or status is updated in the DB.
 */
function invalidateUserCache(uid) {
  if (uid) {
    userCache.delete(uid);
  }
}

async function attachDbUser(req, res, next) {
  try {
    const uid = req.auth?.uid;
    if (!uid) {
      return res.status(401).json({ success: false, message: "Unauthorized: No UID" });
    }

    // 1. Check Cache
    const cachedEntry = userCache.get(uid);
    const now = Date.now();

    if (cachedEntry && now < cachedEntry.expiry) {
      req.dbUser = cachedEntry.user;
      
      // Still need to check blocked status from cached data
      if (req.dbUser.status === "blocked") {
        return res.status(403).json({
          success: false,
          message: "Forbidden: Your account is blocked.",
        });
      }
      
      return next();
    }

    // 2. Cache Miss -> Query DB
    const col = await usersCollection();
    const user = await col.findOne({ uid });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in DB. Please sync account.",
      });
    }

    if (user.status === "blocked") {
      // Even if blocked, we cache it briefly to prevent spamming the DB
      userCache.set(uid, { user, expiry: now + CACHE_TTL });
      return res.status(403).json({
        success: false,
        message: "Forbidden: Your account is blocked.",
      });
    }

    // 3. Update Cache & Proceed
    userCache.set(uid, { user, expiry: now + CACHE_TTL });
    req.dbUser = user;
    next();
  } catch (err) {
    console.error("attachDbUser error:", err);
    return res.status(500).json({ success: false, message: "Server error in auth" });
  }
}

// Attach helper to function for easy access while maintaining middleware signature
attachDbUser.invalidateUserCache = invalidateUserCache;

module.exports = attachDbUser;
