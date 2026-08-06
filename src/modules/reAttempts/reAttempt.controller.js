const { ObjectId } = require("../../config/db");
const {
  reAttemptRequestsCollection,
  ensureReAttemptIndexes,
} = require("./reAttempt.model");
const { interestsCollection } = require("../interests/interest.model");
const { cropsCollection } = require("../crops/crop.model");
const { buyerCropLocksCollection } = require("../interests/buyerCropLock.model");

const DEFAULT_REJECTION_COOLDOWN_DAYS = 3;

// ============================================================================
// GET /farmer/failed-payments
// Farmer: list all interests on their crops where buyer is locked out
// ============================================================================
async function getMyFailedPayments(req, res) {
  try {
    const farmerEmail = req.dbUser.email;

    const interestsCol = await interestsCollection();
    const reAttemptsCol = await reAttemptRequestsCollection();

    // Find all accepted interests for this farmer's crops where buyer
    // has used up their attempts (attemptCount >= 3) and hasn't paid yet
    const lockedInterests = await interestsCol
      .find({
        farmerEmail,
        status: "accepted",
        paymentStatus: { $ne: "paid" },
        attemptCount: { $gte: 3 },
      })
      .sort({ updatedAt: -1 })
      .toArray();

    if (lockedInterests.length === 0) {
      return res.status(200).json({ success: true, failedPayments: [] });
    }

    // For each locked interest, attach the latest re-attempt request (if any)
    const interestIds = lockedInterests.map((i) => i._id);
    const existingRequests = await reAttemptsCol
      .find({ interestId: { $in: interestIds } })
      .sort({ createdAt: -1 })
      .toArray();

    // Map: interestId -> most recent request
    const requestMap = {};
    for (const req of existingRequests) {
      const key = req.interestId.toString();
      if (!requestMap[key]) {
        requestMap[key] = req;
      }
    }

    // Also get crop names
    const cropIds = [...new Set(lockedInterests.map((i) => i.cropId.toString()))].map(
      (id) => new ObjectId(id)
    );
    const cropsCol = await cropsCollection();
    const crops = await cropsCol
      .find({ _id: { $in: cropIds } }, { projection: { name: 1 } })
      .toArray();
    const cropNameMap = {};
    for (const c of crops) {
      cropNameMap[c._id.toString()] = c.name;
    }

    // Batch fetch failedCycleCount for each locked interest
    const locksCol = await buyerCropLocksCollection();
    const lockPairs = lockedInterests.map((i) => ({
      cropId: i.cropId,
      buyerEmail: i.buyerEmail,
    }));
    // Build $or query to fetch all relevant lock docs in one round-trip
    const lockDocs = lockPairs.length
      ? await locksCol
          .find({ $or: lockPairs })
          .toArray()
      : [];

    const lockMap = {};
    for (const l of lockDocs) {
      lockMap[`${l.cropId.toString()}|${l.buyerEmail}`] = l;
    }

    const result = lockedInterests.map((interest) => {
      const key = interest._id.toString();
      const latestRequest = requestMap[key] || null;
      const lockKey = `${interest.cropId.toString()}|${interest.buyerEmail}`;
      const lockDoc = lockMap[lockKey];

      // Check cooldown: if the latest request was rejected, is the cooldown over?
      let cooldownEndsAt = null;
      let canReRequest = true;
      if (latestRequest && latestRequest.status === "rejected") {
        const cooldownDays =
          latestRequest.rejectionCooldownDays ?? DEFAULT_REJECTION_COOLDOWN_DAYS;
        cooldownEndsAt = new Date(latestRequest.updatedAt);
        cooldownEndsAt.setDate(cooldownEndsAt.getDate() + cooldownDays);
        canReRequest = new Date() >= cooldownEndsAt;
      }

      if (latestRequest && latestRequest.status === "pending") {
        canReRequest = false;
      }

      return {
        interestId: interest._id,
        cropId: interest.cropId,
        cropName: cropNameMap[interest.cropId.toString()] || "Unknown Crop",
        buyerName: interest.buyerName,
        buyerEmail: interest.buyerEmail,
        quantity: interest.quantity,
        attemptCount: interest.attemptCount || 0,
        totalReAttemptGrants: interest.totalReAttemptGrants || 0,
        failedCycleCount: lockDoc?.failedCycleCount ?? 0,
        latestRequest,
        canReRequest,
        cooldownEndsAt,
      };
    });

    return res.status(200).json({ success: true, failedPayments: result });
  } catch (error) {
    console.error("getMyFailedPayments error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============================================================================
// POST /farmer/re-attempt-request
// Farmer: submit a re-attempt request for a locked-out buyer
// ============================================================================
async function submitReAttemptRequest(req, res) {
  try {
    await ensureReAttemptIndexes();

    const farmerEmail = req.dbUser.email;
    const farmerName = req.dbUser.name || farmerEmail;
    const { interestId, farmerMessage } = req.body;

    if (!interestId || !farmerMessage?.trim()) {
      return res.status(400).json({
        success: false,
        message: "interestId and farmerMessage are required",
      });
    }

    const interestsCol = await interestsCollection();
    const interest = await interestsCol.findOne({
      _id: new ObjectId(interestId),
    });

    if (!interest) {
      return res.status(404).json({ success: false, message: "Interest not found" });
    }

    // Verify this farmer owns the crop that the interest belongs to
    if (interest.farmerEmail !== farmerEmail) {
      return res.status(403).json({
        success: false,
        message: "You can only submit re-attempt requests for your own crops",
      });
    }

    // Buyer must actually be locked out
    if ((interest.attemptCount || 0) < 3) {
      return res.status(400).json({
        success: false,
        message: "Buyer has not exhausted their payment attempts yet",
      });
    }

    // Buyer must not have already paid
    if (interest.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "This interest has already been paid",
      });
    }

    const reAttemptsCol = await reAttemptRequestsCollection();

    // Check cooldown: most recent request for this interest
    const latestRequest = await reAttemptsCol.findOne(
      { interestId: new ObjectId(interestId) },
      { sort: { createdAt: -1 } }
    );

    if (latestRequest) {
      if (latestRequest.status === "pending") {
        return res.status(409).json({
          success: false,
          message: "A re-attempt request is already pending for this buyer",
        });
      }

      if (latestRequest.status === "rejected") {
        const cooldownDays =
          latestRequest.rejectionCooldownDays ?? DEFAULT_REJECTION_COOLDOWN_DAYS;
        const cooldownEndsAt = new Date(latestRequest.updatedAt);
        cooldownEndsAt.setDate(cooldownEndsAt.getDate() + cooldownDays);

        if (new Date() < cooldownEndsAt) {
          return res.status(429).json({
            success: false,
            message: `You must wait until ${cooldownEndsAt.toLocaleDateString()} before re-submitting`,
            cooldownEndsAt,
          });
        }
      }
    }

    // Get crop name
    const cropsCol = await cropsCollection();
    const crop = await cropsCol.findOne(
      { _id: interest.cropId },
      { projection: { name: 1 } }
    );

    const now = new Date();
    const doc = {
      interestId: new ObjectId(interestId),
      cropId: interest.cropId,
      cropName: crop?.name || "Unknown Crop",
      buyerEmail: interest.buyerEmail,
      buyerName: interest.buyerName,
      farmerEmail,
      farmerName,
      farmerMessage: farmerMessage.trim(),
      status: "pending",
      adminNote: null,
      rejectionCooldownDays: null, // admin sets this on rejection
      createdAt: now,
      updatedAt: now,
    };

    const result = await reAttemptsCol.insertOne(doc);

    return res.status(201).json({
      success: true,
      message: "Re-attempt request submitted successfully",
      requestId: result.insertedId,
    });
  } catch (error) {
    // Duplicate pending request (race condition)
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A re-attempt request is already pending for this buyer",
      });
    }
    console.error("submitReAttemptRequest error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============================================================================
// GET /admin/re-attempt-requests
// Admin: list all re-attempt requests with optional status filter
// ============================================================================
async function getAllReAttemptRequests(req, res) {
  try {
    const statusFilter = req.query.status || "";
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit || "10", 10)));
    const skip = (page - 1) * limit;

    const reAttemptsCol = await reAttemptRequestsCollection();

    const query = {};
    if (statusFilter) query.status = statusFilter;

    const [requests, total] = await Promise.all([
      reAttemptsCol
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      reAttemptsCol.countDocuments(query),
    ]);

    // Attach totalReAttemptGrants for each interest
    const interestIds = [...new Set(requests.map((r) => r.interestId.toString()))].map(
      (id) => new ObjectId(id)
    );
    const interestsCol = await interestsCollection();
    const interests = await interestsCol
      .find(
        { _id: { $in: interestIds } },
        { projection: { totalReAttemptGrants: 1 } }
      )
      .toArray();
    const grantsMap = {};
    for (const i of interests) {
      grantsMap[i._id.toString()] = i.totalReAttemptGrants || 0;
    }

    const enriched = requests.map((r) => ({
      ...r,
      totalReAttemptGrants: grantsMap[r.interestId.toString()] ?? 0,
    }));

    return res.status(200).json({
      success: true,
      requests: enriched,
      meta: { total, page, limit },
    });
  } catch (error) {
    console.error("getAllReAttemptRequests error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============================================================================
// PATCH /admin/re-attempt-requests/:id
// Admin: approve or reject a re-attempt request
// ============================================================================
async function reviewReAttemptRequest(req, res) {
  try {
    const requestId = req.params.id;
    const { action, adminNote, rejectionCooldownDays } = req.body;

    if (!["approved", "rejected"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "action must be 'approved' or 'rejected'",
      });
    }

    const reAttemptsCol = await reAttemptRequestsCollection();
    const request = await reAttemptsCol.findOne({ _id: new ObjectId(requestId) });

    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    if (request.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "This request has already been reviewed",
      });
    }

    const now = new Date();

    if (action === "approved") {
      // 1. Reset the interest's attemptCount to 0 and increment totalReAttemptGrants
      const interestsCol = await interestsCollection();
      await interestsCol.updateOne(
        { _id: request.interestId },
        {
          $set: {
            attemptCount: 0,
            paymentAttemptReset: true,
            updatedAt: now,
          },
          $inc: { totalReAttemptGrants: 1 },
        }
      );

      // 2. Mark request as approved
      await reAttemptsCol.updateOne(
        { _id: new ObjectId(requestId) },
        {
          $set: {
            status: "approved",
            adminNote: adminNote?.trim() || null,
            reviewedAt: now,
            updatedAt: now,
          },
        }
      );

      // 3. Create a pending notification for the buyer
      const { getCollection } = require("../../config/db");
      const notificationsCol = await getCollection("notifications");
      await notificationsCol.insertOne({
        recipientEmail: request.buyerEmail,
        type: "re_attempt_approved",
        title: "You've been given another chance to pay!",
        message: `Great news! The farmer has requested and the admin has approved a payment re-attempt for "${request.cropName}". You now have 3 new attempts to complete your payment. Please make sure your payment details are correct before proceeding.`,
        cropName: request.cropName,
        interestId: request.interestId,
        reAttemptRequestId: new ObjectId(requestId),
        read: false,
        createdAt: now,
      });

      return res.status(200).json({
        success: true,
        message: "Re-attempt request approved. Buyer's attempt count has been reset.",
      });
    }

    // action === "rejected"
    const cooldownDays =
      Number.isInteger(rejectionCooldownDays) && rejectionCooldownDays > 0
        ? rejectionCooldownDays
        : DEFAULT_REJECTION_COOLDOWN_DAYS;

    await reAttemptsCol.updateOne(
      { _id: new ObjectId(requestId) },
      {
        $set: {
          status: "rejected",
          adminNote: adminNote?.trim() || null,
          rejectionCooldownDays: cooldownDays,
          reviewedAt: now,
          updatedAt: now,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: `Re-attempt request rejected. Farmer can re-submit after ${cooldownDays} day(s).`,
    });
  } catch (error) {
    console.error("reviewReAttemptRequest error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============================================================================
// GET /buyer/notifications
// Buyer: fetch unread re-attempt approval notifications
// ============================================================================
async function getBuyerNotifications(req, res) {
  try {
    const recipientEmail = req.dbUser.email;

    const { getCollection } = require("../../config/db");
    const notificationsCol = await getCollection("notifications");

    const notifications = await notificationsCol
      .find({ recipientEmail, read: false })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({ success: true, notifications });
  } catch (error) {
    console.error("getBuyerNotifications error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============================================================================
// PATCH /buyer/notifications/:id/read
// Buyer: mark a notification as read
// ============================================================================
async function markNotificationRead(req, res) {
  try {
    const notificationId = req.params.id;
    const recipientEmail = req.dbUser.email;

    const { getCollection } = require("../../config/db");
    const notificationsCol = await getCollection("notifications");

    await notificationsCol.updateOne(
      { _id: new ObjectId(notificationId), recipientEmail },
      { $set: { read: true, readAt: new Date() } }
    );

    return res.status(200).json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    console.error("markNotificationRead error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = {
  getMyFailedPayments,
  submitReAttemptRequest,
  getAllReAttemptRequests,
  reviewReAttemptRequest,
  getBuyerNotifications,
  markNotificationRead,
};
