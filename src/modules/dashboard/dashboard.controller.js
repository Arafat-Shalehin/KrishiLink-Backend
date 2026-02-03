const { cropsCollection } = require("../crops/crop.model");
const { interestsCollection } = require("../interests/interest.model");
const { ObjectId } = require("../../config/db");

// helper to build chart data from interests grouped by crop
async function buildFarmerCropInterestChart(farmerEmail) {
  const interestsCol = await interestsCollection();

  const rows = await interestsCol
    .aggregate([
      { $match: { farmerEmail } },
      {
        $group: {
          _id: "$cropId",
          value: { $sum: 1 }, // count interests per crop
        },
      },
      { $sort: { value: -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: "allCrops",
          localField: "_id",
          foreignField: "_id",
          as: "crop",
        },
      },
      { $unwind: { path: "$crop", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          name: "$crop.name",
          value: 1,
        },
      },
    ])
    .toArray();

  // fallback names if crop missing
  return rows.map((r) => ({ name: r.name || "Unknown", value: r.value }));
}

// helper to build buyer journey chart data
async function buildBuyerJourneyChart(buyerEmail) {
  const interestsCol = await interestsCollection();

  const total = await interestsCol.countDocuments({ buyerEmail });
  const approved = await interestsCol.countDocuments({
    buyerEmail,
    status: "accepted",
  });
  const rejected = await interestsCol.countDocuments({
    buyerEmail,
    status: "rejected",
  });
  const pending = await interestsCol.countDocuments({
    buyerEmail,
    status: "pending",
  });

  // “Purchased” doesn’t exist in your system yet.
  // For now: set purchased = accepted (or 0). You can change later.
  const purchased = approved;

  return [
    { name: "Interested", value: total },
    { name: "Approved", value: approved },
    { name: "Pending", value: pending },
    { name: "Rejected", value: rejected },
    { name: "Purchased", value: purchased },
  ];
}

// GET /dashboard/buyer
async function getBuyerDashboard(req, res) {
  try {
    const buyerEmail = req.dbUser.email;
    const interestsCol = await interestsCollection();

    const interestedCrops = await interestsCol.countDocuments({ buyerEmail });
    const approvedRequests = await interestsCol.countDocuments({
      buyerEmail,
      status: "accepted",
    });
    const rejectedRequests = await interestsCol.countDocuments({
      buyerEmail,
      status: "rejected",
    });

    const purchases = await interestsCol.countDocuments({
      paymentStatus: "paid",
    });

    const chart = await buildBuyerJourneyChart(buyerEmail);

    const recent = await interestsCol
      .aggregate([
        { $match: { buyerEmail } },
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
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
            status: 1,
            quantity: 1,
            message: 1,
            createdAt: 1,
            cropId: 1,
            cropName: "$crop.name",
            cropType: "$crop.type",
            cropImage: "$crop.image",
            cropLocation: "$crop.location",
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      role: "buyer",
      stats: {
        interestedCrops,
        approvedRequests,
        purchases,
        rejectedRequests,
      },
      chart,
      recent,
    });
  } catch (err) {
    console.error("getBuyerDashboard error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// GET /dashboard/farmer
async function getFarmerDashboard(req, res) {
  try {
    const farmerEmail = req.dbUser.email;

    const cropsCol = await cropsCollection();
    const interestsCol = await interestsCollection();

    const myCrops = await cropsCol.countDocuments({
      "owner.ownerEmail": farmerEmail,
    });

    const interestedBuyers = await interestsCol.countDocuments({
      farmerEmail,
    });

    const approvedSales = await interestsCol.countDocuments({
      farmerEmail,
      status: "accepted",
    });

    const chart = await buildFarmerCropInterestChart(farmerEmail);

    const recent = await interestsCol
      .aggregate([
        { $match: { farmerEmail } },
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
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
            status: 1,
            quantity: 1,
            message: 1,
            createdAt: 1,
            buyerName: 1,
            buyerEmail: 1,
            cropId: 1,
            cropName: "$crop.name",
            cropType: "$crop.type",
            cropImage: "$crop.image",
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      role: "farmer",
      stats: {
        myCrops,
        interestedBuyers,
        approvedSales,
      },
      chart,
      recent,
    });
  } catch (err) {
    console.error("getFarmerDashboard error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = { getBuyerDashboard, getFarmerDashboard };
