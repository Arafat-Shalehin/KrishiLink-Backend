const { ObjectId } = require("../../config/db");
const { cropsCollection } = require("./crop.model");
const { success, fail } = require("../../utils/apiResponse");

// GET /sixCrops
async function getSixCrops(req, res) {
  try {
    const col = await cropsCollection();
    const result = await col
      .find({ status: "active" })
      .sort({ pricePerUnit: 1 })
      .limit(6)
      .toArray();
    return res.send(result); // keep original response shape
  } catch (err) {
    return fail(res, "Server error", 500);
  }
}

// GET /allCrops
async function getAllCrops(req, res) {
  try {
    const col = await cropsCollection();
    const result = await col
      .find({ status: "active" })
      .sort({ pricePerUnit: -1 })
      .toArray();
    return res.send(result); // keep original response shape
  } catch (err) {
    return fail(res, "Server error", 500);
  }
}

// GET /allCrops/:id
async function getCropById(req, res) {
  try {
    const id = req.params.id;
    const col = await cropsCollection();

    const result = await col.findOne({ _id: new ObjectId(id) });
    if (!result || result.status === "hidden") {
      return res.status(404).send({ message: "Crop not found" });
    }

    return res.send(result); // keep original response shape
  } catch (err) {
    return res.status(500).send({ message: "Internal server error" });
  }
}

// POST /allCrops
async function createCrop(req, res) {
  try {
    const cropData = req.body;

    // ✅ enforce owner server-side
    cropData.owner = {
      ownerEmail: req.dbUser.email,
      ownerName: req.dbUser.name || req.dbUser.email,
      ownerUid: req.dbUser.uid,
    };

    cropData.status = "hidden";
    cropData.createdAt = new Date();
    cropData.updatedAt = new Date();

    const col = await cropsCollection();
    const result = await col.insertOne(cropData);

    res.status(201).json({
      success: true,
      message: "Crop added successfully",
      cropId: result.insertedId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// GET /myCrops?email=...
async function getMyCrops(req, res) {
  try {
    const email = req.dbUser.email; // ✅ from verified token+db user
    const col = await cropsCollection();

    const result = await col.find({ "owner.ownerEmail": email }).toArray();

    res.status(200).json({
      success: true,
      crops: result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching user crops.",
    });
  }
}

// PUT /myCrops/:id
async function updateMyCrop(req, res) {
  try {
    const id = req.params.id;
    const updatedData = req.body;

    const col = await cropsCollection();
    const filter = { _id: new ObjectId(id) };

    const updateDoc = {
      $set: {
        name: updatedData.name,
        type: updatedData.type,
        pricePerUnit: updatedData.pricePerUnit,
        unit: updatedData.unit,
        quantity: updatedData.quantity,
        description: updatedData.description,
        location: updatedData.location,
        image: updatedData.image,
        updatedAt: new Date(),
      },
    };

    const result = await col.updateOne(filter, updateDoc);

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No crop found or no changes made.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Crop updated successfully.",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error while updating crop.",
    });
  }
}

// DELETE /myCrops/:id
async function deleteMyCrop(req, res) {
  try {
    const id = req.params.id;

    const col = await cropsCollection();
    const result = await col.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Crop not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Crop deleted successfully.",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error while deleting crop.",
    });
  }
}

module.exports = {
  getSixCrops,
  getAllCrops,
  getCropById,
  createCrop,
  getMyCrops,
  updateMyCrop,
  deleteMyCrop,
};
