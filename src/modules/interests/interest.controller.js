const { ObjectId, client } = require("../../config/db");
const { cropsCollection } = require("../crops/crop.model");
const {
  interestsCollection,
  ensureInterestIndexes,
} = require("./interest.model");
const {
  buyerCropLocksCollection,
  ensureBuyerCropLockIndexes,
} = require("./buyerCropLock.model");

// ============================================================================
// POST /allCrops/:id/interests  (buyer only)
// ============================================================================
async function submitInterest(req, res) {
  try {
    await ensureInterestIndexes();
    await ensureBuyerCropLockIndexes();

    const cropIdStr = req.params.id;
    const cropId = new ObjectId(cropIdStr);

    const { quantity, message } = req.body;

    const buyerUid = req.dbUser.uid;
    const buyerId = req.dbUser._id;
    const buyerEmail = req.dbUser.email;
    const buyerName = req.dbUser.name || req.dbUser.email;

    // --------------------------------------------------------
    // CHECK 1: Blocked user — before any other DB reads
    // --------------------------------------------------------
    if (req.dbUser.status === "blocked") {
      return res.status(403).json({
        success: false,
        message: "Your account is blocked. You cannot submit new interests.",
      });
    }

    const qty = Number(quantity);
    if (!qty || qty < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Quantity must be at least 1." });
    }

    const cropsCol = await cropsCollection();
    const crop = await cropsCol.findOne({ _id: cropId });

    if (!crop) {
      return res.status(404).json({ success: false, message: "Crop not found." });
    }

    // Prevent interest on own crop
    if (crop?.owner?.ownerEmail === buyerEmail) {
      return res.status(403).json({
        success: false,
        message: "You cannot show interest on your own crop.",
      });
    }

    // --------------------------------------------------------
    // CHECK 2: Permanent lock — 3 failed cycles
    // --------------------------------------------------------
    const locksCol = await buyerCropLocksCollection();
    const lockDoc = await locksCol.findOne({ cropId, buyerEmail });

    if (lockDoc && lockDoc.failedCycleCount >= 3) {
      return res.status(403).json({
        success: false,
        message:
          "You have been permanently locked from this crop due to 3 failed payment cycles. Please contact support.",
        permanentlyLocked: true,
        failedCycleCount: lockDoc.failedCycleCount,
      });
    }

    // --------------------------------------------------------
    // CHECK 3: One active interest at a time per crop per buyer
    // --------------------------------------------------------
    const interestsCol = await interestsCollection();

    let activeInterest;
    try {
      activeInterest = await interestsCol.findOne({
        cropId,
        buyerEmail,
        status: { $in: ["pending", "accepted"] },
        paymentStatus: { $ne: "paid" },
      });
    } catch (dbErr) {
      console.error("submitInterest: DB error checking active interest:", dbErr);
      return res.status(503).json({
        success: false,
        message: "Service temporarily unavailable. Please try again.",
      });
    }

    if (activeInterest) {
      return res.status(409).json({
        success: false,
        message: "You already have an active interest for this crop.",
      });
    }

    const farmerEmail = crop?.owner?.ownerEmail || "";
    const farmerName = crop?.owner?.ownerName || "Unknown";

    const now = new Date();
    const interestDoc = {
      cropId,
      buyerId,
      buyerUid,
      buyerEmail,
      buyerName,
      farmerEmail,
      farmerName,
      quantity: qty,
      message: message || "",
      status: "pending",
      paymentStatus: null,
      attemptCount: 0,
      totalReAttemptGrants: 0,
      createdAt: now,
      updatedAt: now,
    };

    const insertRes = await interestsCol.insertOne(interestDoc);
    return res.status(201).json({
      success: true,
      message: "Interest submitted successfully!",
      interest: { _id: insertRes.insertedId, ...interestDoc },
    });
  } catch (error) {
    console.error("submitInterest error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}

// ============================================================================
// GET /myInterests  (buyer only)
// ============================================================================
async function getMyInterests(req, res) {
  try {
    const buyerEmail = req.dbUser.email;

    const interestsCol = await interestsCollection();

    // Aggregate with crop lookup
    const results = await interestsCol
      .aggregate([
        { $match: { buyerEmail } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "allCrops",
            localField: "cropId",
            foreignField: "_id",
            as: "crop",
          },
        },
        { $unwind: { path: "$crop", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            cropId: "$cropId",
            cropName: "$crop.name",
            cropType: "$crop.type",
            cropImage: "$crop.image",
            cropLocation: "$crop.location",
            cropPrice: "$crop.pricePerUnit",
            ownerName: "$crop.owner.ownerName",
            ownerEmail: "$crop.owner.ownerEmail",
            quantity: 1,
            message: 1,
            status: 1,
            attemptCount: { $ifNull: ["$attemptCount", 0] },
            totalReAttemptGrants: { $ifNull: ["$totalReAttemptGrants", 0] },
            paymentStatus: {
              $cond: {
                if: { $ifNull: ["$paymentStatus", false] },
                then: "$paymentStatus",
                else: {
                  $cond: {
                    if: { $eq: ["$status", "accepted"] },
                    then: "awaiting_payment",
                    else: null,
                  },
                },
              },
            },
            transactionId: 1,
            createdAt: 1,
          },
        },
      ])
      .toArray();

    if (!results.length) {
      return res.status(200).json({ success: true, interests: [] });
    }

    // --------------------------------------------------------
    // Enrich with permanentlyLocked, failedCycleCount, canReInterest
    // --------------------------------------------------------
    const locksCol = await buyerCropLocksCollection();

    // Batch fetch all lock docs for this buyer
    const lockDocs = await locksCol
      .find({ buyerEmail })
      .toArray();

    const lockMap = {};
    for (const l of lockDocs) {
      lockMap[l.cropId.toString()] = l;
    }

    // Group interests by cropId to compute canReInterest
    const byCrop = {};
    for (const interest of results) {
      const key = interest.cropId.toString();
      if (!byCrop[key]) byCrop[key] = [];
      byCrop[key].push(interest);
    }

    const enriched = results.map((interest) => {
      const cropKey = interest.cropId.toString();
      const lock = lockMap[cropKey];
      const failedCycleCount = lock?.failedCycleCount ?? 0;
      const permanentlyLocked = failedCycleCount >= 3;

      const siblings = byCrop[cropKey] || [];
      const hasCompleted = siblings.some((s) => s.paymentStatus === "paid");
      const hasActive = siblings.some(
        (s) =>
          (s.status === "pending" || s.status === "accepted") &&
          s.paymentStatus !== "paid"
      );

      // canReInterest: true only on the most recent interest doc for this crop
      // when there's a completed purchase but no active interest
      const isNewest =
        siblings[0]?._id?.toString() === interest._id?.toString();
      const canReInterest = isNewest && hasCompleted && !hasActive && !permanentlyLocked;

      return {
        ...interest,
        permanentlyLocked,
        failedCycleCount,
        canReInterest: hasActive && isNewest ? false : canReInterest,
      };
    });

    return res.status(200).json({ success: true, interests: enriched });
  } catch (error) {
    console.error("getMyInterests error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============================================================================
// GET /allCrops/:id/interests  (farmer owner only)
// ============================================================================
async function getCropInterests(req, res) {
  try {
    const cropId = new ObjectId(req.params.id);

    const interestsCol = await interestsCollection();
    const locksCol = await buyerCropLocksCollection();

    // Fetch all interests for this crop
    const interests = await interestsCol
      .find({ cropId })
      .sort({ createdAt: -1 })
      .toArray();

    if (!interests.length) {
      return res.status(200).json({ success: true, interests: [] });
    }

    // Batch fetch lock docs for all unique buyers on this crop
    const buyerEmails = [...new Set(interests.map((i) => i.buyerEmail))];
    const lockDocs = await locksCol
      .find({ cropId, buyerEmail: { $in: buyerEmails } })
      .toArray();

    const lockMap = {};
    for (const l of lockDocs) {
      lockMap[l.buyerEmail] = l;
    }

    // For each buyer, count completed purchases and determine isRepeatBuyer
    const completedCountMap = {};
    for (const email of buyerEmails) {
      completedCountMap[email] = interests.filter(
        (i) => i.buyerEmail === email && i.paymentStatus === "paid"
      ).length;
    }

    const results = interests.map((interest) => {
      const lock = lockMap[interest.buyerEmail];
      const completedPurchaseCount = completedCountMap[interest.buyerEmail] ?? 0;
      return {
        _id: interest._id,
        buyerName: interest.buyerName,
        buyerEmail: interest.buyerEmail,
        quantity: interest.quantity,
        message: interest.message,
        status: interest.status,
        paymentStatus: interest.paymentStatus ?? null,
        attemptCount: interest.attemptCount ?? 0,
        createdAt: interest.createdAt,
        // New enrichment fields
        isRepeatBuyer: completedPurchaseCount > 0,
        completedPurchaseCount,
        failedCycleCount: lock?.failedCycleCount ?? 0,
      };
    });

    return res.status(200).json({ success: true, interests: results });
  } catch (error) {
    console.error("getCropInterests error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============================================================================
// PATCH /updateInterestStatus/:cropId/:interestId  (farmer owner only)
// ============================================================================
async function updateInterestStatus(req, res) {
  const session = client.startSession();
  try {
    const cropId = new ObjectId(req.params.cropId);
    const interestId = new ObjectId(req.params.interestId);
    const { status } = req.body;

    if (!["pending", "accepted", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    let result = null;

    await session.withTransaction(async () => {
      const interestsCol = await interestsCollection();
      const cropsCol = await cropsCollection();

      const interest = await interestsCol.findOne(
        { _id: interestId, cropId },
        { session }
      );
      if (!interest) throw new Error("Interest not found");

      const crop = await cropsCol.findOne({ _id: cropId }, { session });
      if (!crop) throw new Error("Crop not found");

      if (interest.status !== "pending") {
        throw new Error("Interest is already finalized.");
      }

      let newQuantity = crop.quantity;

      if (status === "accepted") {
        newQuantity = Math.max(
          0,
          Number(crop.quantity) - Number(interest.quantity)
        );
        await cropsCol.updateOne(
          { _id: cropId },
          { $set: { quantity: newQuantity, updatedAt: new Date() } },
          { session }
        );
      }

      const updateData = { status, updatedAt: new Date() };
      if (status === "accepted") {
        updateData.paymentStatus = "awaiting_payment";
      }

      await interestsCol.updateOne(
        { _id: interestId },
        { $set: updateData },
        { session }
      );

      result = { newQuantity, status };
    });

    return res.status(200).json({
      success: true,
      message:
        status === "accepted"
          ? `Interest accepted and quantity reduced to ${result.newQuantity}`
          : "Interest status updated",
      newQuantity: result.newQuantity,
      cropId: req.params.cropId,
      interestId: req.params.interestId,
      status: result.status,
    });
  } catch (error) {
    if (
      error.message.includes("not found") ||
      error.message.includes("finalized")
    ) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error("updateInterestStatus transaction error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error during transaction" });
  } finally {
    await session.endSession();
  }
}

module.exports = {
  submitInterest,
  getMyInterests,
  getCropInterests,
  updateInterestStatus,
};
