const { usersCollection } = require("./user.model");

// Optional endpoint: create/update user record by email
async function upsertUser(req, res) {
  try {
    const { email, name, photoURL } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email required" });

    const col = await usersCollection();
    await col.updateOne(
      { email },
      {
        $set: {
          email,
          name: name || "",
          photoURL: photoURL || "",
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.json({ success: true, message: "User upserted" });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = { upsertUser };
