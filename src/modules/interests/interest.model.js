const { getCollection } = require("../../config/db");

async function interestsCollection() {
  return getCollection("interests");
}

let ensured = false;
async function ensureInterestIndexes() {
  if (ensured) return;
  const col = await interestsCollection();

  // ✅ Partial unique index — only one ACTIVE interest per buyer per crop.
  // Active = status is "pending" or "accepted" AND paymentStatus is not "paid".
  // Completed (paid) and rejected interests do not count, allowing repeat submissions.
  await col.createIndex(
    { cropId: 1, buyerEmail: 1 },
    {
      unique: true,
      partialFilterExpression: {
        status: { $in: ["pending", "accepted"] },
        paymentStatus: { $ne: "paid" },
      },
      name: "unique_active_interest_per_buyer_crop",
    }
  );

  // Query helpers
  await col.createIndex({ buyerEmail: 1, createdAt: -1 });
  await col.createIndex({ farmerEmail: 1, createdAt: -1 });
  await col.createIndex({ cropId: 1, createdAt: -1 });

  ensured = true;
}

module.exports = { interestsCollection, ensureInterestIndexes };
