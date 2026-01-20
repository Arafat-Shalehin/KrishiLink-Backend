const { cropsCollection } = require("../crops/crop.model");
const { interestsCollection } = require("../interests/interest.model");

async function getBuyerDashboard(req, res) {
  try {
    const buyerEmail = req.dbUser.email;

    const interestsCol = await interestsCollection();

    const totalInterests = await interestsCol.countDocuments({ buyerEmail });
    const pendingInterests = await interestsCol.countDocuments({
      buyerEmail,
      status: "pending",
    });
    const acceptedInterests = await interestsCol.countDocuments({
      buyerEmail,
      status: "accepted",
    });
    const rejectedInterests = await interestsCol.countDocuments({
      buyerEmail,
      status: "rejected",
    });

    const recentInterests = await interestsCol
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
      dashboard: {
        totalInterests,
        pendingInterests,
        acceptedInterests,
        rejectedInterests,
        recentInterests,
      },
    });
  } catch (err) {
    console.error("getBuyerDashboard error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function getFarmerDashboard(req, res) {
  try {
    const farmerEmail = req.dbUser.email;

    const cropsCol = await cropsCollection();
    const interestsCol = await interestsCollection();

    const totalCrops = await cropsCol.countDocuments({
      "owner.ownerEmail": farmerEmail,
    });

    const totalReceivedInterests = await interestsCol.countDocuments({
      farmerEmail,
    });
    const pendingReceivedInterests = await interestsCol.countDocuments({
      farmerEmail,
      status: "pending",
    });
    const acceptedDeals = await interestsCol.countDocuments({
      farmerEmail,
      status: "accepted",
    });
    const rejectedReceivedInterests = await interestsCol.countDocuments({
      farmerEmail,
      status: "rejected",
    });

    const recentReceivedInterests = await interestsCol
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
            cropId: 1,
            cropName: "$crop.name",
            cropType: "$crop.type",
            cropImage: "$crop.image",
            buyerName: 1,
            buyerEmail: 1,
          },
        },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      dashboard: {
        totalCrops,
        totalReceivedInterests,
        pendingReceivedInterests,
        acceptedDeals,
        rejectedReceivedInterests,
        recentReceivedInterests,
      },
    });
  } catch (err) {
    console.error("getFarmerDashboard error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = { getBuyerDashboard, getFarmerDashboard };
