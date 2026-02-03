const { ObjectId } = require("../../config/db");
const { cropsCollection } = require("../crops/crop.model");
const {
  interestsCollection,
  ensureInterestIndexes,
} = require("./interest.model");

// POST /allCrops/:id/interests  (buyer only)
async function submitInterest(req, res) {
  try {
    await ensureInterestIndexes();

    const cropIdStr = req.params.id;
    const cropId = new ObjectId(cropIdStr);

    const { quantity, message } = req.body;

    const buyerUid = req.dbUser.uid;
    const buyerId = req.dbUser._id;
    const buyerEmail = req.dbUser.email;
    const buyerName = req.dbUser.name || req.dbUser.email;

    const qty = Number(quantity);
    if (!qty || qty < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Quantity must be at least 1." });
    }

    const cropsCol = await cropsCollection();
    const crop = await cropsCol.findOne({ _id: cropId });

    if (!crop) {
      return res
        .status(404)
        .json({ success: false, message: "Crop not found." });
    }

    // prevent interest on own crop
    if (crop?.owner?.ownerEmail === buyerEmail) {
      return res.status(403).json({
        success: false,
        message: "You cannot show interest on your own crop.",
      });
    }

    const farmerEmail = crop?.owner?.ownerEmail || "";
    const farmerName = crop?.owner?.ownerName || "Unknown";

    const interestsCol = await interestsCollection();

    const now = new Date();
    const interestDoc = {
      cropId, // ObjectId
      buyerId, // ObjectId (from users collection)
      buyerUid,
      buyerEmail,
      buyerName,

      farmerEmail,
      farmerName,

      quantity: qty,
      message: message || "",
      status: "pending",

      createdAt: now,
      updatedAt: now,
    };

    try {
      const insertRes = await interestsCol.insertOne(interestDoc);
      return res.status(201).json({
        success: true,
        message: "Interest submitted successfully!",
        interest: { _id: insertRes.insertedId, ...interestDoc },
      });
    } 
    catch (e) {
      // console.log(e);
      // duplicate interest
      if (e?.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "You’ve already sent an interest for this crop.",
        });
      }
      throw e;
    }
  } catch (error) {
    console.error("submitInterest error:", error);
    return res.status(500).json({ success: false, message: "Server error." });
  }
}

// GET /myInterests  (buyer only)
async function getMyInterests(req, res) {
  try {
    const buyerEmail = req.dbUser.email;

    const interestsCol = await interestsCollection();

    // Join crop data for your current UI response shape
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
        {
          $lookup: {
            from: "payments",
            localField: "_id",
            foreignField: "interestId",
            as: "paymentHistory",
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
            cropPrice: "$crop.pricePerUnit", // Fixed: Mapping to pricePerUnit
            ownerName: "$crop.owner.ownerName",
            ownerEmail: "$crop.owner.ownerEmail",
            quantity: 1,
            message: 1,
            status: 1,
            // Count failed/cancelled payment attempts
            attemptCount: {
              $size: {
                $filter: {
                  input: "$paymentHistory",
                  as: "pay",
                  cond: { 
                    $in: ["$$pay.status", ["failed", "cancelled"]] 
                  }
                }
              }
            },
            
            // Backfill paymentStatus for legacy accepted interests
            paymentStatus: {
              $cond: {
                if: { $ifNull: ["$paymentStatus", false] },
                then: "$paymentStatus",
                else: {
                  $cond: {
                    if: { $eq: ["$status", "accepted"] },
                    then: "awaiting_payment",
                    else: null
                  }
                }
              }
            },
            transactionId: 1,
            createdAt: 1,
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      interests: results,
    });
  } catch (error) {
    console.error("getMyInterests error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// GET /allCrops/:id/interests  (farmer owner only)
async function getCropInterests(req, res) {
  try {
    const cropId = new ObjectId(req.params.id);

    const interestsCol = await interestsCollection();
    const results = await interestsCol
      .find({ cropId })
      .sort({ createdAt: -1 })
      .project({
        buyerName: 1,
        buyerEmail: 1,
        quantity: 1,
        message: 1,
        status: 1,
        createdAt: 1,
      })
      .toArray();

    return res.status(200).json({ success: true, interests: results });
  } catch (error) {
    console.error("getCropInterests error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// PATCH /updateInterestStatus/:cropId/:interestId  (farmer owner only)
async function updateInterestStatus(req, res) {
  try {
    const cropId = new ObjectId(req.params.cropId);
    const interestId = new ObjectId(req.params.interestId);
    const { status } = req.body;

    if (!["pending", "accepted", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    const interestsCol = await interestsCollection();

    // Ensure interest belongs to crop
    const interest = await interestsCol.findOne({ _id: interestId, cropId });
    if (!interest) {
      return res
        .status(404)
        .json({ success: false, message: "Interest not found" });
    }

    const cropsCol = await cropsCollection();
    const crop = await cropsCol.findOne({ _id: cropId });
    if (!crop) {
      return res
        .status(404)
        .json({ success: false, message: "Crop not found" });
    }

    if (interest.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Interest is already finalized.",
      });
    }

    let newQuantity = crop.quantity;

    if (status === "accepted") {
      newQuantity = Math.max(
        0,
        Number(crop.quantity) - Number(interest.quantity)
      );

      await cropsCol.updateOne(
        { _id: cropId },
        { $set: { quantity: newQuantity, updatedAt: new Date() } }
      );
    }

    // When farmer accepts, set paymentStatus to 'awaiting_payment'
    // This tells the buyer they need to pay now
    const updateData = { 
      status, 
      updatedAt: new Date() 
    };
    
    if (status === "accepted") {
      updateData.paymentStatus = "awaiting_payment";
    }

    await interestsCol.updateOne(
      { _id: interestId },
      { $set: updateData }
    );

    return res.status(200).json({
      success: true,
      message:
        status === "accepted"
          ? `Interest accepted and quantity reduced to ${newQuantity}`
          : "Interest status updated",
      newQuantity,
      cropId: req.params.cropId,
      interestId: req.params.interestId,
      status,
    });
  } catch (error) {
    console.error("updateInterestStatus error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = {
  submitInterest,
  getMyInterests,
  getCropInterests,
  updateInterestStatus,
};
