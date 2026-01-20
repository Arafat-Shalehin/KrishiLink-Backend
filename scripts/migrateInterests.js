// scripts/migrateInterests.js
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
  const db = client.db("KrishiLink");

  const cropsCol = db.collection("allCrops");
  const interestsCol = db.collection("interests");

  await interestsCol.createIndex(
    { cropId: 1, buyerEmail: 1 },
    { unique: true }
  );

  const crops = await cropsCol
    .find({ interests: { $exists: true, $ne: [] } })
    .toArray();

  console.log("Crops with nested interests:", crops.length);

  let upserted = 0;
  let skipped = 0;

  for (const crop of crops) {
    const cropId = crop._id;

    for (const interest of crop.interests || []) {
      const buyerEmail = (interest.userEmail || "").trim().toLowerCase();
      if (!buyerEmail) continue;

      const doc = {
        cropId, // ObjectId
        buyerEmail,
        buyerName: interest.userName || buyerEmail,

        // You can keep these for display
        farmerEmail: crop?.owner?.ownerEmail || "",
        farmerName: crop?.owner?.ownerName || "Unknown",

        quantity: Number(interest.quantity) || 0,
        message: interest.message || "",
        status: interest.status || "pending",

        createdAt: interest.createdAt
          ? new Date(interest.createdAt)
          : new Date(),
        updatedAt: new Date(),
      };

      try {
        await interestsCol.updateOne(
          { cropId, buyerEmail },
          { $setOnInsert: doc },
          { upsert: true }
        );
        upserted++;
      } catch (e) {
        if (e?.code === 11000) skipped++;
        else console.error(e);
      }
    }

    // Clear nested interests
    await cropsCol.updateOne({ _id: cropId }, { $set: { interests: [] } });
  }

  console.log({ upserted, skipped });
  console.log("Migration complete.");
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
