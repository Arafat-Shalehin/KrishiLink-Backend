const { ObjectId } = require("../config/db");
const { cropsCollection } = require("../modules/crops/crop.model");

module.exports = function requireOwnership(paramName = "id") {
  return async (req, res, next) => {
    try {
      const cropId = req.params[paramName];
      if (!cropId) {
        return res
          .status(400)
          .json({ success: false, message: "Missing crop id" });
      }

      const col = await cropsCollection();
      const crop = await col.findOne({ _id: new ObjectId(cropId) });

      if (!crop) {
        return res
          .status(404)
          .json({ success: false, message: "Crop not found" });
      }

      const ownerEmail = crop?.owner?.ownerEmail;
      if (!ownerEmail || ownerEmail !== req.dbUser.email) {
        return res.status(403).json({ success: false, message: "Not allowed" });
      }

      req.crop = crop; // optional, useful for controllers
      next();
    } catch (err) {
      console.error("requireOwnership error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  };
};
