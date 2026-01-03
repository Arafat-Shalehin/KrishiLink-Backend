const { ObjectId } = require("../../config/db");
const { cropsCollection } = require("../crops/crop.model");

// POST /allCrops/:id/interests
async function submitInterest(req, res) {
  try {
    const cropId = req.params.id;
    const { userEmail, userName, quantity, message } = req.body;

    if (!userEmail || !userName || !quantity) {
      return res.status(400).send({ message: "Missing required fields." });
    }

    const col = await cropsCollection();
    const cropObjectId = new ObjectId(cropId);

    const existingInterest = await col.findOne({
      _id: cropObjectId,
      "interests.userEmail": userEmail,
    });

    if (existingInterest) {
      return res.status(400).send({
        message: "You’ve already sent an interest for this crop.",
      });
    }

    const interestId = new ObjectId();
    const newInterest = {
      _id: interestId,
      cropId: cropId,
      userEmail,
      userName,
      quantity,
      message,
      status: "pending",
      createdAt: new Date(),
    };

    const result = await col.updateOne(
      { _id: cropObjectId },
      { $push: { interests: newInterest } }
    );

    if (result.modifiedCount > 0) {
      return res.send({
        success: true,
        message: "Interest submitted successfully!",
        interest: newInterest,
      });
    }

    return res.status(404).send({ message: "Crop not found." });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ message: "Server error." });
  }
}

// GET /myInterests?email=...
async function getMyInterests(req, res) {
  try {
    const userEmail = req.query.email;
    if (!userEmail) {
      return res
        .status(400)
        .json({ success: false, message: "Email required" });
    }

    const col = await cropsCollection();

    // Slightly more efficient than fetching everything:
    // still preserves your output format and sorting behavior.
    const crops = await col
      .find({ "interests.userEmail": userEmail })
      .sort({ quantity: 1 })
      .toArray();

    const userInterests = [];

    crops.forEach((crop) => {
      if (Array.isArray(crop.interests)) {
        crop.interests.forEach((interest) => {
          if (interest.userEmail === userEmail) {
            userInterests.push({
              _id: interest._id,
              cropId: crop._id,
              cropName: crop.name,
              cropType: crop.type,
              cropImage: crop.image,
              cropLocation: crop.location,
              ownerName: crop.owner?.ownerName || "Unknown",
              quantity: interest.quantity,
              message: interest.message,
              status: interest.status,
            });
          }
        });
      }
    });

    return res.status(200).json({
      success: true,
      interests: userInterests,
    });
  } catch (error) {
    console.error("Error fetching user interests:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// PATCH /updateInterestStatus/:cropId/:interestId
async function updateInterestStatus(req, res) {
  const { cropId, interestId } = req.params;
  const { status } = req.body;

  try {
    const col = await cropsCollection();

    const crop = await col.findOne({ _id: new ObjectId(cropId) });
    if (!crop) {
      return res
        .status(404)
        .json({ success: false, message: "Crop not found" });
    }

    const interest = crop.interests?.find(
      (i) => i._id.toString() === interestId
    );
    if (!interest) {
      return res
        .status(404)
        .json({ success: false, message: "Interest not found" });
    }

    let newQuantity = crop.quantity;

    if (status === "accepted") {
      const interestQty = parseInt(interest.quantity);
      newQuantity = Math.max(0, crop.quantity - interestQty);

      await col.updateOne(
        {
          _id: new ObjectId(cropId),
          "interests._id": new ObjectId(interestId),
        },
        { $set: { quantity: newQuantity, "interests.$.status": status } }
      );
    } else {
      await col.updateOne(
        {
          _id: new ObjectId(cropId),
          "interests._id": new ObjectId(interestId),
        },
        { $set: { "interests.$.status": status } }
      );
    }

    return res.status(200).json({
      success: true,
      message:
        status === "accepted"
          ? `Interest accepted and quantity reduced to ${newQuantity}`
          : "Interest status updated",
      newQuantity,
      cropId,
      interestId,
      status,
    });
  } catch (error) {
    console.error("Update interest error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = {
  submitInterest,
  getMyInterests,
  updateInterestStatus,
};
