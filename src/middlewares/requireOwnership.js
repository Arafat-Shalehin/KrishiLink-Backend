const { ObjectId, getCollection } = require("../config/db");

module.exports = function requireOwnership() {
  return async (req, res, next) => {
    try {
      const cropId = req.params.id || req.params.cropId;
      const email = req.user?.email;

      if (!cropId)
        return res.status(400).json({ success: false, message: "Missing id" });
      if (!email)
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });

      const cropsCollection = await getCollection("allCrops");
      const crop = await cropsCollection.findOne({ _id: new ObjectId(cropId) });

      if (!crop)
        return res
          .status(404)
          .json({ success: false, message: "Crop not found" });
      if (crop?.owner?.ownerEmail !== email) {
        return res.status(403).json({ success: false, message: "Not allowed" });
      }

      next();
    } catch (err) {
      return res.status(500).json({ success: false, message: "Server error" });
    }
  };
};
