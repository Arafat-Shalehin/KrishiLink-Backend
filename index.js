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

    // Latest Crops
    app.get("/sixCrops", async (req, res) => {
      const cursor = cropsCollection.find();
      const result = await cursor.sort({ pricePerUnit: 1 }).limit(6).toArray();
      res.send(result);
    });

    // All Crops
    app.get("/allCrops", async (req, res) => {
      const cursor = cropsCollection.find();
      const result = await cursor.sort({ pricePerUnit: -1 }).toArray();
      res.send(result);
    });

    // Specific Crops
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

    // Interest wise Apis
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
          return res.status(400).send({
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

    // My Crops all parts:
    app.get("/myCrops", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Missing user email.",
          });
        }

        const result = await cropsCollection
          .find({ "owner.ownerEmail": email })
          .toArray();

        res.status(200).json({
          success: true,
          crops: result,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Server error while fetching user crops.",
        });
      }
    });

    app.put("/myCrops/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const filter = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            name: updatedData.name,
            type: updatedData.type,
            pricePerUnit: updatedData.pricePerUnit,
            unit: updatedData.unit,
            quantity: updatedData.quantity,
            description: updatedData.description,
            location: updatedData.location,
            image: updatedData.image,
            updatedAt: new Date(),
          },
        };

        const result = await cropsCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "No crop found or no changes made.",
          });
        }

        res.status(200).json({
          success: true,
          message: "Crop updated successfully.",
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Server error while updating crop.",
        });
      }
    });

    app.delete("/myCrops/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await cropsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Crop not found.",
          });
        }

        res.status(200).json({
          success: true,
          message: "Crop deleted successfully.",
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: "Server error while deleting crop.",
        });
      }
    });

    // Making new crops Apis
    app.post("/allCrops", async (req, res) => {
      try {
        const cropData = req.body;

        cropData.interests = [];

        const result = await cropsCollection.insertOne(cropData);

        res.status(201).json({
          success: true,
          message: "Crop added successfully",
          cropId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
      }
    });

    // My interest Crops
    app.get("/myInterests", async (req, res) => {
      try {
        const userEmail = req.query.email;
        if (!userEmail) {
          return res
            .status(400)
            .json({ success: false, message: "Email required" });
        }

        const allCrops = await cropsCollection
          .find()
          .sort({ quantity: 1 })
          .toArray();

        const userInterests = [];

        allCrops.forEach((crop) => {
          if (Array.isArray(crop.interests)) {
            crop.interests.forEach((interest) => {
              if (interest.userEmail === userEmail) {
                userInterests.push({
                  _id: interest._id,
                  cropId: crop._id,
                  cropName: crop.name,
                  cropType: crop.type,
                  cropImage: crop.image,
                  cropLocation: crop.location,
                  ownerName: crop.owner?.ownerName || "Unknown",
                  quantity: interest.quantity,
                  message: interest.message,
                  status: interest.status,
                });
              }
            });
          }
        });

        res.status(200).json({
          success: true,
          interests: userInterests,
        });
      } catch (error) {
        console.error("Error fetching user interests:", error);
        res.status(500).json({ success: false, message: "Server error" });
      }
    });

    // Interest Status handle
    app.patch("/updateInterestStatus/:cropId/:interestId", async (req, res) => {
      const { cropId, interestId } = req.params;
      const { status } = req.body;

      try {
        const crop = await cropsCollection.findOne({
          _id: new ObjectId(cropId),
        });
        if (!crop) {
          return res
            .status(404)
            .json({ success: false, message: "Crop not found" });
        }

        const interest = crop.interests.find(
          (i) => i._id.toString() === interestId
        );
        if (!interest) {
          return res
            .status(404)
            .json({ success: false, message: "Interest not found" });
        }

        let newQuantity = crop.quantity;

        if (status === "accepted") {
          const interestQty = parseInt(interest.quantity);
          newQuantity = Math.max(0, crop.quantity - interestQty);

          await cropsCollection.updateOne(
            {
              _id: new ObjectId(cropId),
              "interests._id": new ObjectId(interestId),
            },
            {
              $set: {
                quantity: newQuantity,
                "interests.$.status": status,
              },
            }
          );
        } else {
          await cropsCollection.updateOne(
            {
              _id: new ObjectId(cropId),
              "interests._id": new ObjectId(interestId),
            },
            {
              $set: {
                "interests.$.status": status,
              },
            }
          );
        }

        res.status(200).json({
          success: true,
          message:
            status === "accepted"
              ? `Interest accepted and quantity reduced to ${newQuantity}`
              : "Interest status updated",
          newQuantity,
          cropId,
          interestId,
          status,
        });
      } catch (error) {
        console.error("Update interest error:", error);
        res.status(500).json({ success: false, message: "Server error" });
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