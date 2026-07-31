/**
 * scripts/migrateRepeatInterest.js
 *
 * One-time migration for the repeat-interest-purchase feature.
 *
 * WHAT THIS DOES:
 *   1. Drops the old unconditional unique index on { cropId, buyerEmail } from interests
 *   2. Creates the new partial unique index (active interests only)
 *   3. Creates the buyerCropLocks collection with its unique index
 *   4. Seeds buyerCropLocks from existing failed interests in the DB
 *
 * RUN AFTER deploying the new code, not before.
 *
 *   node scripts/migrateRepeatInterest.js
 */

require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = `mongodb+srv://${encodeURIComponent(
  process.env.DB_USERNAME
)}:${encodeURIComponent(
  process.env.DB_PASSWORD
)}@crud-server.b5xdndi.mongodb.net/?appName=Crud-Server`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function main() {
  await client.connect();
  console.log("Connected to MongoDB.");

  const db = client.db("KrishiLink");
  const interestsCol = db.collection("interests");
  const locksCol = db.collection("buyerCropLocks");

  const stats = { processed: 0, upserted: 0, retried: 0, errors: 0 };

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 1: Drop the old unconditional unique index
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[1/4] Dropping old unconditional unique index on interests...");
  try {
    await interestsCol.dropIndex({ cropId: 1, buyerEmail: 1 });
    console.log("    ✓ Old index dropped.");
  } catch (err) {
    // IndexNotFound is fine — already dropped or never existed
    if (err.codeName === "IndexNotFound" || err.code === 27) {
      console.log("    ℹ Index not found, skipping drop.");
    } else {
      console.error("    ✗ Unexpected error dropping index:", err.message);
      stats.errors++;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2: Create the new partial unique index on interests
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[2/4] Creating partial unique index on interests...");
  try {
    await interestsCol.createIndex(
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
    console.log("    ✓ Partial unique index created.");
  } catch (err) {
    if (err.codeName === "IndexOptionsConflict" || err.code === 85) {
      console.log("    ℹ Index already exists with same spec, skipping.");
    } else {
      console.error("    ✗ Error creating partial index:", err.message);
      stats.errors++;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 3: Create buyerCropLocks collection indexes
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[3/4] Creating buyerCropLocks indexes...");
  try {
    await locksCol.createIndex(
      { cropId: 1, buyerEmail: 1 },
      { unique: true, name: "unique_lock_per_buyer_crop" }
    );
    await locksCol.createIndex({ buyerEmail: 1 });
    console.log("    ✓ buyerCropLocks indexes created.");
  } catch (err) {
    if (err.codeName === "IndexOptionsConflict" || err.code === 85) {
      console.log("    ℹ buyerCropLocks indexes already exist, skipping.");
    } else {
      console.error("    ✗ Error creating buyerCropLocks indexes:", err.message);
      stats.errors++;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 4: Backfill buyerCropLocks from existing failed interests
  //
  // A "failed interest" = accepted + attemptCount >= 3 + paymentStatus != "paid"
  // Group by { cropId, buyerEmail } and set failedCycleCount = group count.
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n[4/4] Seeding buyerCropLocks from existing failed interests...");

  const failedGroups = await interestsCol
    .aggregate([
      {
        $match: {
          status: "accepted",
          attemptCount: { $gte: 3 },
          paymentStatus: { $ne: "paid" },
        },
      },
      {
        $group: {
          _id: { cropId: "$cropId", buyerEmail: "$buyerEmail" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  console.log(`    Found ${failedGroups.length} { cropId, buyerEmail } group(s) to seed.`);

  const now = new Date();

  for (const group of failedGroups) {
    stats.processed++;
    const { cropId, buyerEmail } = group._id;
    const failedCycleCount = group.count;

    try {
      await locksCol.updateOne(
        { cropId, buyerEmail },
        {
          $set: {
            failedCycleCount,
            updatedAt: now,
            // Set lockedAt if already at or beyond 3 cycles
            ...(failedCycleCount >= 3 ? { lockedAt: now } : {}),
          },
          $setOnInsert: {
            createdAt: now,
            ...(failedCycleCount < 3 ? { lockedAt: null } : {}),
          },
        },
        { upsert: true }
      );
      stats.upserted++;
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key — document was inserted concurrently; use $inc instead
        console.log(
          `    [RETRY] Resolved duplicate key for cropId=${cropId} buyerEmail=${buyerEmail}`
        );
        try {
          await locksCol.updateOne(
            { cropId, buyerEmail },
            {
              $inc: { failedCycleCount },
              $set: { updatedAt: now },
            }
          );
          stats.retried++;
        } catch (retryErr) {
          console.error(
            `    ✗ Retry failed for cropId=${cropId} buyerEmail=${buyerEmail}:`,
            retryErr.message
          );
          stats.errors++;
        }
      } else {
        console.error(
          `    ✗ Upsert error for cropId=${cropId} buyerEmail=${buyerEmail}:`,
          err.message
        );
        stats.errors++;
      }
    }
  }

  console.log("\n──────────────────────────────────────────");
  console.log("Migration complete.");
  console.log(stats);
  console.log("──────────────────────────────────────────\n");
}

main()
  .catch((err) => {
    console.error("Fatal migration error:", err);
    process.exit(1);
  })
  .finally(() => client.close());
