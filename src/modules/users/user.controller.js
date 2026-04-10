const { usersCollection, ensureUserIndexes } = require("./user.model");
const attachDbUser = require("../../middlewares/attachDbUser");
const { cropsCollection } = require("../crops/crop.model");
const { interestsCollection } = require("../interests/interest.model");

// POST /users/sync
// Creates user doc if not exists, otherwise updates profile fields.
// Role defaults to "buyer" for new users (as you decided).
async function syncUser(req, res) {
  try {
    await ensureUserIndexes();

    const uid = req.auth?.uid;
    const email = req.auth?.email;

    if (!uid || !email) {
      return res.status(400).json({
        success: false,
        message: "Token missing uid/email.",
      });
    }

    const name = (req.body?.name || req.auth?.name || "").trim();
    const photoURL = (req.body?.photoURL || req.auth?.picture || "").trim();

    const col = await usersCollection();
    const existing = await col.findOne({ uid });

    // Create
    if (!existing) {
      const doc = {
        uid,
        name,
        email,
        photoURL,
        role: "buyer", // ✅ default role
        status: "active", // ✅ governance-ready
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await col.insertOne(doc);
      attachDbUser.invalidateUserCache(uid);

      return res.status(201).json({
        success: true,
        message: "User created",
        user: doc,
      });
    }

    // Update (do NOT overwrite role/status here)
    await col.updateOne(
      { uid },
      {
        $set: {
          email, // keep updated from token
          name: name || existing.name,
          photoURL: photoURL || existing.photoURL,
          updatedAt: new Date(),
        },
      },
    );

    attachDbUser.invalidateUserCache(uid);

    const updated = await col.findOne({ uid });

    return res.status(200).json({
      success: true,
      message: "User synced",
      user: updated,
    });
  } catch (err) {
    console.error("syncUser error:", err);

    // handle duplicate index errors gracefully
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "User already exists with same uid/email.",
      });
    }

    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// POST /users/request-farmer
async function requestFarmer(req, res) {
  try {
    const uid = req.auth?.uid;
    const email = req.auth?.email;

    if (!uid || !email) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const col = await usersCollection();
    const user = await col.findOne({ uid });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in DB. Call /users/sync first.",
      });
    }

    if (user.status === "blocked") {
      return res.status(403).json({
        success: false,
        message: "Your account is blocked.",
      });
    }

    if (user.role !== "buyer") {
      return res.status(400).json({
        success: false,
        message: "Only buyers can request farmer access.",
      });
    }

    if (user.farmerRequest?.status === "rejected") {
      return res.status(403).json({
        success: false,
        message:
          "Your farmer request was rejected. Please contact admin to re-apply.",
      });
    }

    // ✅ prevent duplicate pending
    if (user.farmerRequest?.status === "pending") {
      return res.status(409).json({
        success: false,
        message: "Your farmer request is already pending.",
      });
    }

    // ✅ allow re-request after cancelled/rejected/none
    const now = new Date();

    await col.updateOne(
      { uid },
      {
        $set: {
          farmerRequest: {
            status: "pending",
            requestedAt: now,
            updatedAt: now,
          },
          updatedAt: now,
        },
      },
    );

    attachDbUser.invalidateUserCache(uid);

    const updated = await col.findOne({ uid });

    return res.status(200).json({
      success: true,
      message: "Farmer request submitted.",
      user: updated,
    });
  } catch (err) {
    console.error("requestFarmer error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// PATCH /users/request-farmer/cancel
async function cancelFarmerRequest(req, res) {
  try {
    const uid = req.auth?.uid;
    const email = req.auth?.email;

    if (!uid || !email) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const col = await usersCollection();
    const user = await col.findOne({ uid });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in DB. Call /users/sync first.",
      });
    }

    if (user.farmerRequest?.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "No pending farmer request to cancel.",
      });
    }

    const now = new Date();

    await col.updateOne(
      { uid },
      {
        $set: {
          "farmerRequest.status": "cancelled",
          "farmerRequest.updatedAt": now,
          updatedAt: now,
        },
      },
    );

    attachDbUser.invalidateUserCache(uid);

    const updated = await col.findOne({ uid });

    return res.status(200).json({
      success: true,
      message: "Farmer request cancelled.",
      user: updated,
    });
  } catch (err) {
    console.error("cancelFarmerRequest error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ✅ NEW: GET /users/me/stats
// Returns counts for current logged-in user:
// - how many crops they posted (based on current schema: owner.ownerEmail)
// - how many interests they have sent (based on current schema: crops.interests[])
async function getMyStats(req, res) {
  try {
    const { email } = req.auth;
    const uid = req.auth.uid;

    const cropsCol = await cropsCollection();
    const interestsCol = await interestsCollection();
    const usersCol = await usersCollection();

    // 1. Basic Stats (Everyone)
    const myPostsCount = await cropsCol.countDocuments({
      "owner.ownerEmail": email,
    }); // Farmer: posts

    const myInterestsCount = await interestsCol.countDocuments({
      buyerEmail: email,
    }); // Buyer: interests sent

    // 2. Role Specific Stats

    // ➤ For Buyer: Count verified purchases
    const purchasedCount = await interestsCol.countDocuments({
      buyerEmail: email,
      paymentStatus: "paid",
    });

    // ➤ For Farmer: Count interests RECEIVED on their crops
    const receivedInterestsCount = await interestsCol.countDocuments({
      farmerEmail: email,
    });

    // ➤ For Admin: System health stats
    // We only fetch these if the user is actually an admin, but for simplicity/performance in this specific app scale, 
    // we can just fetch them or check role first. Let's check role to be safe/efficient if we can.
    // However, simpler is often better for "my stats". Let's just return them.
    // Ideally we should check if (user.role === 'admin').
    const userRoleObj = await usersCol.findOne({ uid }, { projection: { role: 1 } });
    
    let blockedUsersCount = 0;
    let farmerRequestsCount = 0;

    if (userRoleObj?.role === "admin") {
      blockedUsersCount = await usersCol.countDocuments({ status: "blocked" });
      farmerRequestsCount = await usersCol.countDocuments({ "farmerRequest.status": "pending" });
    }

    return res.status(200).json({
      success: true,
      stats: {
        myPostsCount,           // Farmer: Listed Crops
        myInterestsCount,       // Buyer: Total Interests Sent
        purchasedCount,         // Buyer: Confirmed Orders
        receivedInterestsCount, // Farmer: Potential Buyers
        blockedUsersCount,      // Admin: Moderation
        farmerRequestsCount     // Admin: Work items
      },
    });
  } catch (err) {
    console.error("getMyStats error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// GET /users/me
async function getMe(req, res) {
  try {
    const uid = req.auth?.uid;
    if (!uid) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const col = await usersCollection();
    const user = await col.findOne({ uid });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in DB. Call POST /users/sync first.",
      });
    }

    return res.status(200).json({ success: true, user });
  } catch (err) {
    console.error("getMe error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = {
  syncUser,
  getMe,
  requestFarmer,
  cancelFarmerRequest,
  getMyStats,
};
