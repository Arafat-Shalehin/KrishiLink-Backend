/**
 * ============================================================================
 * REQUEST LOGGER MIDDLEWARE
 * ============================================================================
 * Express middleware for request logging with correlation IDs
 * Uses pino-http for high-performance structured request logging
 * ============================================================================
 */

const { v4: uuidv4 } = require("uuid");
const pinoHttp = require("pino-http");
const { logger } = require("../utils/logger");

// ============================================================================
// CORRELATION ID MIDDLEWARE
// ============================================================================

/**
 * Middleware to generate/parse correlation IDs for request tracking
 * Attaches requestId to req object for use throughout the request lifecycle
 */
function correlationIdMiddleware(req, res, next) {
  // Generate new ID or use one from incoming request (for distributed tracing)
  const requestId = req.headers["x-request-id"] || uuidv4();
  
  // Attach to request object
  req.id = requestId;
  
  // Expose in response headers (helps with debugging)
  res.setHeader("X-Request-Id", requestId);
  
  next();
}

// ============================================================================
// PINO-HTTP CONFIGURATION
// ============================================================================

/**
 * Pino-HTTP configuration optimized for production
 * Logs request/response details in structured JSON format
 */
const pinoHttpConfig = {
  // Use our existing logger instance
  logger,
  
  // Generate unique request IDs
  genReqId: (req) => req.id || uuidv4(),
  
  // Custom log level based on response status
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    if (req.url?.includes("/health")) return "debug"; // Lower priority for health checks
    return "info";
  },
  
  // Custom success message (or null to use default)
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed ${res.statusCode}`;
  },
  
  // Custom error message
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed ${res.statusCode}: ${err?.message || "Unknown error"}`;
  },
  
  // Additional properties to include in request logs
  customAttributeKeys: {
    req: "request",
    res: "response",
    err: "error",
    responseTime: "responseTimeMs",
  },
  
  // Redact sensitive headers
  redact: {
    paths: [
      "request.headers.authorization",
      "request.headers.cookie",
      "request.headers.x-api-key",
      "response.headers.set-cookie",
    ],
    censor: "[REDACTED]",
  },
  
  // Quiet logging for specific paths (e.g., health checks)
  autoLogging: {
    ignore: (req) => {
      // Skip logging for health checks and static assets
      return req.url?.includes("/health") || 
             req.url?.match(/\.(js|css|png|jpg|ico|svg)$/);
    },
  },
  
  // Include response body on error (useful for debugging)
  // Note: In production, be careful with PII in response bodies
  serializers: {
    err: (err) => ({
      ...require('pino').stdSerializers.err(err),
      statusCode: err.statusCode,
    }),
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      // DO NOT log the full body ever. Large payloads (up to 10MB) block the event loop and cause Fetch Fail timeouts.
      body: process.env.NODE_ENV === "development" && req.body 
        ? Object.keys(req.body).length > 0 ? "[BODY HIDDEN FOR PERFORMANCE]" : undefined
        : undefined,
      headers: {
        "user-agent": req.headers["user-agent"],
        "content-type": req.headers["content-type"],
        "x-request-id": req.headers["x-request-id"],
        "x-forwarded-for": req.headers["x-forwarded-for"],
      },
      remoteAddress: req.ip || req.connection?.remoteAddress,
    }),
    res: (res) => {
      // Defensive: res object may not have getHeader method in all contexts
      const safeGetHeader = (header) => {
        if (res && typeof res.getHeader === 'function') {
          try {
            return res.getHeader(header);
          } catch (e) {
            return undefined;
          }
        }
        return undefined;
      };
      
      return {
        statusCode: res.statusCode,
        headers: {
          "content-type": safeGetHeader("content-type"),
          "x-request-id": safeGetHeader("x-request-id"),
        },
      };
    },
  },
};

// ============================================================================
// REQUEST CONTEXT MIDDLEWARE
// ============================================================================

/**
 * Attaches a request-bound logger to the request object
 * Controllers can use req.log.info(), req.log.error(), etc.
 */
function requestContextMiddleware(req, res, next) {
  // Create child logger with request context
  req.log = logger.child({
    requestId: req.id,
    userId: req.auth?.uid || req.dbUser?._id || null,
  });
  
  next();
}

// ============================================================================
// CREATE COMBINED MIDDLEWARE
// ============================================================================

// Pino-HTTP instance
const pinoHttpMiddleware = pinoHttp(pinoHttpConfig);

/**
 * Combined request logging middleware stack
 * Usage: app.use(requestLogger);
 */
function requestLogger(app) {
  // 1. First, extract/generate correlation ID
  app.use(correlationIdMiddleware);
  
  // 2. Then, attach request-bound logger
  app.use(requestContextMiddleware);
  
  // 3. Finally, use pino-http for request/response logging
  app.use(pinoHttpMiddleware);
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  // Main middleware setup function
  requestLogger,
  
  // Individual middlewares (for custom ordering)
  correlationIdMiddleware,
  requestContextMiddleware,
  pinoHttpMiddleware,
  
  // Configuration reference
  config: pinoHttpConfig,
};
