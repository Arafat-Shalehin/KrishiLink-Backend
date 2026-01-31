const { ObjectId } = require("../../config/db");
const { usersCollection } = require("../users/user.model");
const { cropsCollection } = require("../crops/crop.model");
const { interestsCollection } = require("../interests/interest.model");

async function getAdminOverview(req, res) {
  try {
    const usersCol = await usersCollection();
    const cropsCol = await cropsCollection();
    const interestsCol = await interestsCollection();

    const totalUsers = await usersCol.countDocuments();
    const blockedUsers = await usersCol.countDocuments({ status: "blocked" });

    const totalBuyers = await usersCol.countDocuments({ role: "buyer" });
    const totalFarmers = await usersCol.countDocuments({ role: "farmer" });

    const pendingRequests = await usersCol.countDocuments({
      farmerRequest: { $exists: true },
      "farmerRequest.status": "pending",
    });

    const totalCrops = await cropsCol.countDocuments();
    const activeCrops = await cropsCol.countDocuments({ status: "active" });
    const hiddenCrops = await cropsCol.countDocuments({ status: "hidden" });

    const totalInterests = await interestsCol.countDocuments();
    const pendingInterests = await interestsCol.countDocuments({
      status: "pending",
    });
    const acceptedInterests = await interestsCol.countDocuments({
      status: "accepted",
    });
    const rejectedInterests = await interestsCol.countDocuments({
      status: "rejected",
    });

    const acceptedDeals = acceptedInterests;

    // Recent farmer requests (pending + latest)
    const recentRequests = await usersCol
      .find(
        { farmerRequest: { $exists: true } },
        {
          projection: {
            name: 1,
            email: 1,
            role: 1,
            status: 1,
            farmerRequest: 1,
          },
        },
      )
      .sort({ "farmerRequest.updatedAt": -1 })
      .limit(5)
      .toArray();

    // Recent hidden crops (admin moderation queue)
    const recentHiddenCrops = await cropsCol
      .find(
        { status: "hidden" },
        {
          projection: {
            name: 1,
            type: 1,
            location: 1,
            createdAt: 1,
            updatedAt: 1,
            owner: 1,
            status: 1,
          },
        },
      )
      .sort({ updatedAt: -1 })
      .limit(5)
      .toArray();

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        blockedUsers,
        totalBuyers,
        totalFarmers,
        pendingRequests,
        totalCrops,
        activeCrops,
        hiddenCrops,
        totalInterests,
        pendingInterests,
        acceptedInterests,
        rejectedInterests,
        acceptedDeals,
      },
      recentRequests,
      recentHiddenCrops,
    });
  } catch (err) {
    console.error("getAdminOverview error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// -------------------- USERS --------------------

// GET /admin/users?search=&role=&status=&page=&limit=
async function listUsers(req, res) {
  try {
    const col = await usersCollection();

    const search = (req.query.search || "").trim().toLowerCase();
    const role = (req.query.role || "").trim();
    const status = (req.query.status || "").trim();

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(
      50,
      Math.max(5, parseInt(req.query.limit || "10", 10)),
    );
    const skip = (page - 1) * limit;

    const query = {};

    if (role) query.role = role;
    if (status) query.status = status;

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
    }

    const total = await col.countDocuments(query);
    const users = await col
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .project({
        uid: 1,
        name: 1,
        email: 1,
        photoURL: 1,
        role: 1,
        status: 1,
        farmerRequest: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .toArray();

    return res.status(200).json({
      success: true,
      meta: { total, page, limit },
      users,
    });
  } catch (err) {
    console.error("listUsers error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// PATCH /admin/users/:id/status  body: { status: "active" | "blocked" }
async function setUserStatus(req, res) {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!["active", "blocked"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    const col = await usersCollection();

    const result = await col.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: `User status updated to ${status}`,
    });
  } catch (err) {
    console.error("setUserStatus error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// PATCH /admin/users/:id/role  body: { role: "buyer" | "farmer" | "admin" }
async function setUserRole(req, res) {
  try {
    const id = req.params.id;
    const { role } = req.body;

    if (!["buyer", "farmer", "admin"].includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    const col = await usersCollection();

    const result = await col.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          role,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: `User role updated to ${role}`,
    });
  } catch (err) {
    console.error("setUserRole error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// -------------------- FARMER REQUESTS --------------------

// GET /admin/farmer-requests?status=pending&page=&limit=
async function listFarmerRequests(req, res) {
  try {
    const col = await usersCollection();

    const status = (req.query.status || "pending").trim();
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(
      50,
      Math.max(5, parseInt(req.query.limit || "10", 10)),
    );
    const skip = (page - 1) * limit;

    const query = {
      farmerRequest: { $exists: true },
      "farmerRequest.status": status,
    };

    const total = await col.countDocuments(query);
    const users = await col
      .find(query)
      .sort({ "farmerRequest.requestedAt": -1 })
      .skip(skip)
      .limit(limit)
      .project({
        uid: 1,
        name: 1,
        email: 1,
        role: 1,
        status: 1,
        farmerRequest: 1,
      })
      .toArray();

    return res.status(200).json({
      success: true,
      meta: { total, page, limit },
      requests: users,
    });
  } catch (err) {
    console.error("listFarmerRequests error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// PATCH /admin/farmer-requests/:id/approve
async function approveFarmerRequest(req, res) {
  try {
    const id = req.params.id;
    const col = await usersCollection();
    const now = new Date();

    const user = await col.findOne({ _id: new ObjectId(id) });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    if (user.status === "blocked") {
      return res
        .status(403)
        .json({ success: false, message: "Blocked users cannot be approved." });
    }

    await col.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          role: "farmer",
          "farmerRequest.status": "approved",
          "farmerRequest.updatedAt": now,
          updatedAt: now,
        },
      },
    );

    return res
      .status(200)
      .json({ success: true, message: "Farmer request approved." });
  } catch (err) {
    console.error("approveFarmerRequest error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// PATCH /admin/farmer-requests/:id/reject
async function rejectFarmerRequest(req, res) {
  try {
    const id = req.params.id;
    const col = await usersCollection();
    const now = new Date();

    const user = await col.findOne({ _id: new ObjectId(id) });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    await col.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          "farmerRequest.status": "rejected",
          "farmerRequest.updatedAt": now,
          updatedAt: now,
        },
      },
    );

    return res
      .status(200)
      .json({ success: true, message: "Farmer request rejected." });
  } catch (err) {
    console.error("rejectFarmerRequest error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// -------------------- CROPS MODERATION --------------------

// GET /admin/crops?search=&status=&page=&limit=
async function listAllCrops(req, res) {
  try {
    const col = await cropsCollection();

    const search = (req.query.search || "").trim();
    const status = (req.query.status || "").trim();

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(
      50,
      Math.max(6, parseInt(req.query.limit || "12", 10)),
    );
    const skip = (page - 1) * limit;

    const query = {};
    if (status) query.status = status;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
        { "owner.ownerEmail": { $regex: search, $options: "i" } },
      ];
    }

    const total = await col.countDocuments(query);

    const crops = await col
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return res.status(200).json({
      success: true,
      meta: { total, page, limit },
      crops,
    });
  } catch (err) {
    console.error("listAllCrops error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// PATCH /admin/crops/:id/status body: { status: "active" | "hidden" }
async function setCropStatus(req, res) {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!["active", "hidden"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    const col = await cropsCollection();

    const result = await col.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Crop not found" });
    }

    return res.status(200).json({
      success: true,
      message: `Crop status updated to ${status}`,
    });
  } catch (err) {
    console.error("setCropStatus error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// DELETE /admin/crops/:id
async function deleteCrop(req, res) {
  try {
    const id = req.params.id;

    const cropsCol = await cropsCollection();
    const interestsCol = await interestsCollection();

    // delete crop
    const cropDelete = await cropsCol.deleteOne({ _id: new ObjectId(id) });
    if (cropDelete.deletedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Crop not found" });
    }

    // cleanup interests tied to crop (optional but recommended)
    await interestsCol.deleteMany({ cropId: new ObjectId(id) });

    return res.status(200).json({
      success: true,
      message: "Crop deleted successfully.",
    });
  } catch (err) {
    console.error("deleteCrop error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = {
  listUsers,
  setUserStatus,
  setUserRole,
  listFarmerRequests,
  approveFarmerRequest,
  rejectFarmerRequest,
  listAllCrops,
  setCropStatus,
  deleteCrop,
  getAdminOverview,
};
