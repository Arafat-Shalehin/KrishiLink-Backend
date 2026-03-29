/**
 * ============================================================================
 * LOGGING EXAMPLES
 * ============================================================================
 * Practical examples of using the logging system throughout the application
 * ============================================================================
 */

const { logger, createChildLogger, asyncHandler } = require("../logging");

// ============================================================================
// EXAMPLE 1: Basic Controller Logging
// ============================================================================

/**
 * Example crop controller with proper logging
 */
async function createCrop(req, res) {
  // Use req.log (request-bound logger with correlation ID)
  const log = req.log;
  
  log.info("Starting crop creation");
  
  try {
    const cropData = req.body;
    log.debug({ cropName: cropData.name }, "Processing crop data");
    
    // Add owner info
    cropData.owner = {
      ownerEmail: req.dbUser.email,
      ownerName: req.dbUser.name || req.dbUser.email,
      ownerUid: req.dbUser.uid,
    };
    
    log.info({ 
      cropName: cropData.name, 
      cropType: cropData.type,
      ownerUid: req.dbUser.uid,
    }, "Creating crop in database");
    
    // Simulate database operation
    const col = await cropsCollection();
    const result = await col.insertOne(cropData);
    
    log.info({ 
      cropId: result.insertedId,
      cropName: cropData.name,
    }, "Crop created successfully");
    
    res.status(201).json({
      success: true,
      message: "Crop added successfully",
      cropId: result.insertedId,
    });
    
  } catch (error) {
    // Error will be logged by errorLoggerMiddleware
    // But we can add context-specific logging here
    log.error({ 
      err: error,
      cropName: req.body?.name,
    }, "Failed to create crop");
    
    throw error; // Pass to error handler
  }
}

// ============================================================================
// EXAMPLE 2: Using Child Loggers for Service Context
// ============================================================================

// Create a service-specific logger
const paymentLogger = createChildLogger({ 
  service: "payment-processor",
  gateway: "sslcommerz",
});

async function processPayment(data) {
  paymentLogger.info({ 
    amount: data.amount,
    customerEmail: data.customerEmail,
  }, "Processing payment");
  
  try {
    // Payment processing logic
    const result = await sslcommerz.init(data);
    
    paymentLogger.info({
      transactionId: result.transactionId,
      amount: data.amount,
      status: result.status,
    }, "Payment processed successfully");
    
    return result;
    
  } catch (error) {
    paymentLogger.error({
      err: error,
      amount: data.amount,
      customerEmail: data.customerEmail,
    }, "Payment processing failed");
    
    throw error;
  }
}

// ============================================================================
// EXAMPLE 3: Async Handler Wrapper
// ============================================================================

/**
 * Using asyncHandler to automatically catch and log errors
 */
const express = require("express");
const router = express.Router();

// Without asyncHandler - manual try/catch needed
router.post("/old-way", async (req, res) => {
  try {
    const result = await someAsyncOperation();
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Operation failed");
    res.status(500).json({ error: "Failed" });
  }
});

// With asyncHandler - errors automatically logged and passed to error handler
router.post("/new-way", asyncHandler(async (req, res) => {
  const result = await someAsyncOperation();
  res.json(result);
  // Errors automatically logged with request context
}));

// ============================================================================
// EXAMPLE 4: Different Log Levels
// ============================================================================

function demonstrateLogLevels() {
  // Debug: Detailed information for debugging
  logger.debug({ query: "db.crops.find()", duration: 45 }, "Database query executed");
  
  // Info: General operational information
  logger.info("Application started successfully");
  logger.info({ port: 3000, env: "production" }, "Server listening");
  
  // Warn: Warning conditions that don't stop operation
  logger.warn({ cacheSize: 1000, threshold: 800 }, "Cache size approaching limit");
  logger.warn({ origin: "http://suspicious.com" }, "CORS blocked request from unknown origin");
  
  // Error: Error conditions that affect operation
  logger.error({ err: new Error("DB connection timeout") }, "Failed to connect to database");
  
  // Fatal: Critical errors requiring immediate shutdown
  logger.fatal({ err: new Error("Out of memory") }, "Critical system failure");
}

// ============================================================================
// EXAMPLE 5: Structured Logging with Context
// ============================================================================

async function getUserInterests(req, res) {
  const log = req.log.child({ operation: "getUserInterests" });
  
  log.info({ userId: req.dbUser._id }, "Fetching user interests");
  
  const startTime = Date.now();
  
  try {
    const col = await interestsCollection();
    const interests = await col
      .find({ buyerEmail: req.dbUser.email })
      .toArray();
    
    const duration = Date.now() - startTime;
    
    log.info({
      userId: req.dbUser._id,
      interestCount: interests.length,
      duration: `${duration}ms`,
    }, "User interests retrieved");
    
    res.json({ success: true, interests });
    
  } catch (error) {
    log.error({
      err: error,
      userId: req.dbUser._id,
      duration: `${Date.now() - startTime}ms`,
    }, "Failed to retrieve user interests");
    
    throw error;
  }
}

// ============================================================================
// EXAMPLE 6: Log Redaction (Sensitive Data)
// ============================================================================

function demonstrateRedaction() {
  // These fields will be automatically redacted
  logger.info({
    user: "john@example.com",
    password: "supersecret123", // Will show as [REDACTED]
    token: "jwt_token_here",     // Will show as [REDACTED]
    apiKey: "secret_key",        // Will show as [REDACTED]
    action: "user_login",
  }, "User login attempt");
  
  // Output:
  // {
  //   "user": "john@example.com",
  //   "password": "[REDACTED]",
  //   "token": "[REDACTED]",
  //   "apiKey": "[REDACTED]",
  //   "action": "user_login",
  //   "msg": "User login attempt"
  // }
}

// ============================================================================
// EXAMPLE 7: Performance Monitoring with Logs
// ============================================================================

async function monitorPerformance(req, res, next) {
  const start = process.hrtime.bigint();
  
  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    req.log.info({
      responseTime: `${duration.toFixed(2)}ms`,
      statusCode: res.statusCode,
      contentLength: res.get("Content-Length"),
    }, "Request completed");
  });
  
  next();
}

// ============================================================================
// MODULE EXPORTS (for documentation)
// ============================================================================

module.exports = {
  createCrop,
  processPayment,
  demonstrateLogLevels,
  getUserInterests,
  demonstrateRedaction,
  monitorPerformance,
};
