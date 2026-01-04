const { getCollection } = require("../../config/db");

async function usersCollection() {
  return getCollection("users");
}

// Optional but recommended: ensure indexes once (safe to call multiple times)
let indexesEnsured = false;
async function ensureUserIndexes() {
  if (indexesEnsured) return;
  const col = await usersCollection();
  await col.createIndex({ uid: 1 }, { unique: true });
  await col.createIndex({ email: 1 }, { unique: true });
  indexesEnsured = true;
}

module.exports = { usersCollection, ensureUserIndexes };
