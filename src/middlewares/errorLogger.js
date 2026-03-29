/**
 * ============================================================================
 * ERROR LOGGER MIDDLEWARE
 * ============================================================================
 * Centralized error logging that integrates with existing error handlers
 * Captures stack traces, request context, and error metadata
 * ============================================================================
 */

const { logger } = require("../utils/logger");

// ============================================================================
// ERROR LOGGING MIDDLEWARE
// ============================================================================

/**
 * Global error logging middleware
 * Place AFTER all routes but BEFORE other error handlers
 * Logs the error then passes it to the next error handler
 */
function errorLoggerMiddleware(err, req, res, next) {
  // Get request logger or create one with context
  const log = req.log || logger.child({
    requestId: req.id,
    userId: req.auth?.uid || req.dbUser?._id,
    method: req.method,
    url: req.url,
  });

  // Extract error details
  const errorContext = {
    // Error metadata
    errorName: err.name,
    errorMessage: err.message,
    errorCode: err.code,
    statusCode: err.statusCode || res.statusCode || 500,
    
    // Stack trace (development only)
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
    }),
    
    // Request context for debugging
    requestContext: {
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      // Only include body in development (PII risk)
      ...(process.env.NODE_ENV === "development" && req.body && {
        body: sanitizeBody(req.body),
      }),
      headers: {
        "user-agent": req.headers["user-agent"],
        "content-type": req.headers["content-type"],
        "x-request-id": req.headers["x-request-id"],
        "x-forwarded-for": req.headers["x-forwarded-for"],
      },
    },
    
    // User context (if authenticated)
    userContext: req.auth || req.dbUser ? {
      uid: req.auth?.uid,
      email: req.dbUser?.email,
      role: req.dbUser?.role,
    } : undefined,
  };

  // Determine log level based on status code
  const statusCode = errorContext.statusCode;
  if (statusCode >= 500) {
    log.error({ err, ...errorContext }, `Server Error: ${err.message}`);
  } else if (statusCode >= 400) {
    log.warn({ err, ...errorContext }, `Client Error: ${err.message}`);
  } else {
    log.info({ err, ...errorContext }, `Error: ${err.message}`);
  }

  // Pass error to next handler (do NOT handle the response)
  next(err);
}

// ============================================================================
// UNHANDLED REJECTION & EXCEPTION HANDLERS
// ============================================================================

/**
 * Setup handlers for uncaught exceptions and unhandled rejections
 * These catch errors outside of Express middleware chain
 */
function setupGlobalErrorHandlers() {
  // Handle uncaught exceptions
  process.on("uncaughtException", (err) => {
    logger.fatal({
      err,
      errorType: "uncaughtException",
      stack: err.stack,
    }, `Uncaught Exception: ${err.message}`);
    
    // Give logger time to flush before exiting
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    logger.error({
      errorType: "unhandledRejection",
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
    }, `Unhandled Promise Rejection: ${reason}`);
    
    // Log but don't exit - let the app continue if possible
    // In production, you might want to restart the process
  });

  // Handle SIGTERM (graceful shutdown)
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, starting graceful shutdown");
    
    setTimeout(() => {
      logger.info("Graceful shutdown complete");
      process.exit(0);
    }, 1000);
  });

  // Handle SIGINT (Ctrl+C in development)
  process.on("SIGINT", () => {
    logger.info("SIGINT received, shutting down");
    process.exit(0);
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Sanitize request body for logging (remove sensitive fields)
 */
function sanitizeBody(body) {
  if (!body || typeof body !== "object") return body;
  
  const sensitiveFields = ["password", "token", "secret", "apiKey", "api_key", "authorization"];
  const sanitized = { ...body };
  
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  });
  
  return sanitized;
}

/**
 * Wrapper for async route handlers to catch errors
 * Ensures errors in async functions are properly logged
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      // Log the error before passing to error handler
      const log = req.log || logger;
      log.error({
        err,
        route: req.route?.path,
        handler: fn.name || "anonymous",
      }, `Error in async handler: ${err.message}`);
      
      next(err);
    });
  };
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  // Middleware
  errorLoggerMiddleware,
  
  // Setup functions
  setupGlobalErrorHandlers,
  asyncHandler,
  
  // Helpers
  sanitizeBody,
};
