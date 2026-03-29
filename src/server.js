require("dotenv").config();
const app = require("./app");
const { connectDB } = require("./config/db");
const { setupGlobalErrorHandlers, logger } = require("./logging");

const port = process.env.PORT || 3000;

// Setup global error handlers for uncaught exceptions/unhandled rejections
setupGlobalErrorHandlers();

async function start() {
  try {
    await connectDB();
    logger.info("Connected to MongoDB!");

    app.listen(port, () => {
      logger.info({ port }, `KrishiLink server listening on port ${port}`);
    });
  } catch (err) {
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
  }
}

start();
