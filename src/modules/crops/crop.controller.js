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
    return success(res, { crops: result });
  } catch (err) {
    return fail(res, "Server error while fetching latest crops", 500);
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
    return success(res, { 
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
    return fail(res, "Server error while fetching crops catalog", 500, {
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

    return success(res, { types, locations });
  } catch (err) {
    console.error("getFilterOptions error:", err);
    return fail(res, "Server error while fetching filter options", 500, {
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
      return fail(res, "Crop not found", 404);
    }

    return success(res, { crop: result });
  } catch (err) {
    return fail(res, "Internal server error while fetching crop details", 500);
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

    return success(res, { cropId: result.insertedId }, "Crop added successfully", 201);
  } catch (error) {
    console.error(error);
    return fail(res, "Server error while creating crop", 500);
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

    return success(res, { crops: result });
  } catch (error) {
    console.error(error);
    return fail(res, "Server error while fetching your crops", 500);
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
    // 🛡️ Defense-in-Depth: Enforce ownership at the query level
    const filter = { 
      _id: new ObjectId(id), 
      "owner.ownerEmail": req.dbUser.email 
    };

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
      return fail(res, "No crop found or no changes made", 404);
    }

    return success(res, {}, "Crop updated successfully.");
  } catch (err) {
    return fail(res, "Server error while updating crop", 500);
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /myCrops/:id
// ─────────────────────────────────────────────────────────────
async function deleteMyCrop(req, res) {
  try {
    const id = req.params.id;

    const col = await cropsCollection();
    // 🛡️ Defense-in-Depth: Enforce ownership at the query level
    const result = await col.deleteOne({ 
      _id: new ObjectId(id), 
      "owner.ownerEmail": req.dbUser.email 
    });

    if (result.deletedCount === 0) {
      return fail(res, "Crop not found", 404);
    }

    return success(res, {}, "Crop deleted successfully.");
  } catch (err) {
    return fail(res, "Server error while deleting crop", 500);
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
