const { cropsCollection } = require("../crops/crop.model");

async function getOverview(req, res) {
  try {
    const col = await cropsCollection();
    const crops = await col.find().project({ interests: 1 }).toArray();

    const totalCrops = crops.length;
    const totalInterests = crops.reduce(
      (acc, c) => acc + (Array.isArray(c.interests) ? c.interests.length : 0),
      0
    );

    return res.json({
      success: true,
      totalCrops,
      totalInterests,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = { getOverview };
