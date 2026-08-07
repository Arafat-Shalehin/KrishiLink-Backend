const { getCollection } = require("../../config/db");

async function reAttemptRequestsCollection() {
  return getCollection("reAttemptRequests");
}

let ensured = false;
async function ensureReAttemptIndexes() {
  if (ensured) return;

  const col = await reAttemptRequestsCollection();

  // Only ONE open (pending) request per interest at a time
  await col.createIndex(
    { interestId: 1, status: 1 },
    {
      unique: true,
      partialFilterExpression: { status: "pending" },
      name: "unique_pending_per_interest",
    }
  );

  // Lookup by farmer / buyer / status
  await col.createIndex({ farmerEmail: 1, createdAt: -1 });
  await col.createIndex({ buyerEmail: 1, createdAt: -1 });
  await col.createIndex({ status: 1, createdAt: -1 });
  await col.createIndex({ interestId: 1, createdAt: -1 });

  ensured = true;
}

module.exports = { reAttemptRequestsCollection, ensureReAttemptIndexes };
