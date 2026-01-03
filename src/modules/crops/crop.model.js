const { getCollection } = require("../../config/db");

async function cropsCollection() {
  return getCollection("allCrops");
}

module.exports = { cropsCollection };
