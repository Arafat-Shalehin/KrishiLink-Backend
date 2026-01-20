const { getCollection } = require("../../config/db");

async function interestsCollection() {
  return getCollection("interests");
}

let ensured = false;
async function ensureInterestIndexes() {
  if (ensured) return;
  const col = await interestsCollection();

  // ✅ Unique per buyer per crop (works for both migrated + new data)
  await col.createIndex({ cropId: 1, buyerEmail: 1 }, { unique: true });

  // Query helpers
  await col.createIndex({ buyerEmail: 1, createdAt: -1 });
  await col.createIndex({ farmerEmail: 1, createdAt: -1 });
  await col.createIndex({ cropId: 1, createdAt: -1 });

  ensured = true;
}

module.exports = { interestsCollection, ensureInterestIndexes };
