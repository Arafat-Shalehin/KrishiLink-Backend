const { getCollection } = require("../../config/db");

async function buyerCropLocksCollection() {
  return getCollection("buyerCropLocks");
}

let ensured = false;
async function ensureBuyerCropLockIndexes() {
  if (ensured) return;

  const col = await buyerCropLocksCollection();

  // One lock-tracking document per buyer per crop
  await col.createIndex({ cropId: 1, buyerEmail: 1 }, { unique: true });

  // Buyer-side lookups (e.g. "is this buyer locked on any crop?")
  await col.createIndex({ buyerEmail: 1 });

  ensured = true;
}

module.exports = { buyerCropLocksCollection, ensureBuyerCropLockIndexes };
