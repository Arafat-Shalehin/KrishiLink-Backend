// crops.controller.js
const { ObjectId } = require("../../config/db");
const { cropsCollection } = require("./crop.model");
const { success, fail } = require("../../utils/apiResponse");

// ─────────────────────────────────────────────────────────────
// GET /sixCrops
// ─────────────────────────────────────────────────────────────
async function getSixCrops(req, res) {
  try {
    const col = await cropsCollection();
    const result = await col
      .find({ status: "active" })
      .sort({ pricePerUnit: 1 })
      .limit(6)
      .toArray();
    return res.send(result);
  } catch (err) {
    return fail(res, "Server error", 500);
  }
}

// ─────────────────────────────────────────────────────────────
// GET /allCrops (with filters, sorting, pagination)
// ─────────────────────────────────────────────────────────────
async function getAllCrops(req, res) {
  try {
    const col = await cropsCollection();

    // Extract query parameters
    const {
      search = "",
      type = "",
      location = "",
      status = "",
      minPrice = "",
      maxPrice = "",
      sort = "",
      page = 1,
      limit = 12,
    } = req.query;

    // Convert to numbers
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    // Build filter query
    const filter = { status: "active" };

    // Search by name (case-insensitive)
    if (search && search.trim()) {
      filter.name = { $regex: search.trim(), $options: "i" };
    }

    // Filter by type
    if (type && type.trim()) {
      filter.type = { $regex: `^${type.trim()}$`, $options: "i" };
    }

    // Filter by location
    if (location && location.trim()) {
      filter.location = { $regex: location.trim(), $options: "i" };
    }

    // Filter by availability status (if you have this field, else remove)
    // This is different from the document status field
    if (status && status.trim()) {
      if (status === "available") {
        filter.quantity = { $gt: 0 };
      } else if (status === "sold") {
        filter.quantity = { $lte: 0 };
      }
    }

    // Filter by price range
    if (minPrice || maxPrice) {
      filter.pricePerUnit = {};
      if (minPrice) {
        filter.pricePerUnit.$gte = parseFloat(minPrice);
      }
      if (maxPrice) {
        filter.pricePerUnit.$lte = parseFloat(maxPrice);
      }
      // Remove empty object if no valid price filters
      if (Object.keys(filter.pricePerUnit).length === 0) {
        delete filter.pricePerUnit;
      }
    }

    // Build sort options
    let sortOption = { createdAt: -1 }; // Default: newest first

    switch (sort) {
      case "price_asc":
        sortOption = { pricePerUnit: 1 };
        break;
      case "price_desc":
        sortOption = { pricePerUnit: -1 };
        break;
      case "newest":
        sortOption = { createdAt: -1 };
        break;
      case "oldest":
        sortOption = { createdAt: 1 };
        break;
      case "name_asc":
        sortOption = { name: 1 };
        break;
      case "name_desc":
        sortOption = { name: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    // Execute queries in parallel
    const [crops, total] = await Promise.all([
      col.find(filter).sort(sortOption).skip(skip).limit(limitNum).toArray(),
      col.countDocuments(filter),
    ]);

    // Return formatted response
    return res.status(200).json({
      success: true,
      crops,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("getAllCrops error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      crops: [],
      meta: { total: 0, page: 1, limit: 12, totalPages: 0 },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /allCrops/filter-options (for dynamic filter dropdowns)
// ─────────────────────────────────────────────────────────────
async function getFilterOptions(req, res) {
  try {
    const col = await cropsCollection();

    // ✅ Use aggregation with $facet (Stable API compatible)
    const result = await col
      .aggregate([
        { $match: { status: "active" } },
        {
          $facet: {
            types: [
              { $group: { _id: "$type" } },
              { $match: { _id: { $ne: null } } },
              { $sort: { _id: 1 } },
            ],
            locations: [
              { $group: { _id: "$location" } },
              { $match: { _id: { $ne: null } } },
              { $sort: { _id: 1 } },
            ],
          },
        },
      ])
      .toArray();

    // Extract values from aggregation result
    const types = result[0]?.types?.map((doc) => doc._id) || [];
    const locations = result[0]?.locations?.map((doc) => doc._id) || [];

    return res.status(200).json({
      success: true,
      types,
      locations,
    });
  } catch (err) {
    console.error("getFilterOptions error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      types: [],
      locations: [],
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GET /allCrops/:id
// ─────────────────────────────────────────────────────────────
async function getCropById(req, res) {
  try {
    const id = req.params.id;
    const col = await cropsCollection();

    const result = await col.findOne({ _id: new ObjectId(id) });
    if (!result || result.status === "hidden") {
      return res.status(404).send({ message: "Crop not found" });
    }

    return res.send(result);
  } catch (err) {
    return res.status(500).send({ message: "Internal server error" });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /allCrops
// ─────────────────────────────────────────────────────────────
async function createCrop(req, res) {
  try {
    const cropData = req.body;

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

// ─────────────────────────────────────────────────────────────
// GET /myCrops
// ─────────────────────────────────────────────────────────────
async function getMyCrops(req, res) {
  try {
    const email = req.dbUser.email;
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

// ─────────────────────────────────────────────────────────────
// PUT /myCrops/:id
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// DELETE /myCrops/:id
// ─────────────────────────────────────────────────────────────
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
  getFilterOptions, // ✨ New export
  getCropById,
  createCrop,
  getMyCrops,
  updateMyCrop,
  deleteMyCrop,
};
