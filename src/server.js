require("dotenv").config();
const app = require("./app");
const { connectDB } = require("./config/db");

const port = process.env.PORT || 3000;

async function start() {
  try {
    await connectDB();
    console.log("Connected to MongoDB!");

    app.listen(port, () => {
      console.log(`KrishiLink server listening on port ${port}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
