const { usersCollection, ensureUserIndexes } = require("./user.model");

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
      }
    );

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

module.exports = { syncUser, getMe };
