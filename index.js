const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// MiddleWare;
app.use(cors());
app.use(express.json());

// MongoDB Thing
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@crud-server.b5xdndi.mongodb.net/?appName=Crud-Server`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("Crops");

    const cropsCollection = db.collection("allCrops");

    app.get("/sixCrops", async (req, res) => {
      const cursor = cropsCollection.find();
      const result = await cursor.sort({ pricePerUnit: 1 }).limit(6).toArray();
      res.send(result);
    });

    app.get("/allCrops", async (req, res) => {
      const cursor = cropsCollection.find();
      const result = await cursor.sort({ pricePerUnit: 1 }).toArray();
      res.send(result);
    });

    app.get("/allCrops/:id", async (req, res) => {
      try {
        const id = req.params.id;
        // console.log("Fetching crop with ID:", id);

        const query = { _id: new ObjectId(id) };
        const result = await cropsCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Crop not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("Error fetching crop:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.post("/allCrops/:id/interests", async (req, res) => {
      try {
        const cropId = req.params.id;
        const { userEmail, userName, quantity, message } = req.body;

        if (!userEmail || !userName || !quantity) {
          return res.status(400).send({ message: "Missing required fields." });
        }

        const cropObjectId = new ObjectId(cropId);

        const existingInterest = await cropsCollection.findOne({
          _id: cropObjectId,
          "interests.userEmail": userEmail,
        });

        if (existingInterest) {
          return res
            .status(400)
            .send({
              message: "You’ve already sent an interest for this crop.",
            });
        }

        const interestId = new ObjectId();
        const newInterest = {
          _id: interestId,
          cropId: cropId,
          userEmail,
          userName,
          quantity,
          message,
          status: "pending",
          createdAt: new Date(),
        };

        const result = await cropsCollection.updateOne(
          { _id: cropObjectId },
          { $push: { interests: newInterest } }
        );

        if (result.modifiedCount > 0) {
          res.send({
            success: true,
            message: "Interest submitted successfully!",
            interest: newInterest,
          });
        } else {
          res.status(404).send({ message: "Crop not found." });
        }
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error." });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Everything is okey.");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
