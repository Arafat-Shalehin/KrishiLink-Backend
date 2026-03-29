/**
 * ============================================================================
 * LOGGER UTILITY MODULE
 * ============================================================================
 * Production-grade structured logging using Pino
 * Features: JSON logs, redaction, correlation IDs, environment-aware config
 * ============================================================================
 */

const pino = require('pino');

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");
const NODE_ENV = process.env.NODE_ENV || "development";
const SERVICE_NAME = process.env.SERVICE_NAME || "krishilink-api";

// Fields to redact for security (passwords, tokens, PII)
const REDACT_PATHS = [
  "password",
  "token",
  "authorization",
  "apiKey",
  "api_key",
  "secret",
  "cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers[\"set-cookie\"]",
  "owner.ownerEmail", // Can contain PII
  "customerEmail",
  "customerPhone",
];

// ============================================================================
// BASE LOGGER CONFIGURATION
// ============================================================================

const baseConfig = {
  level: LOG_LEVEL,
  name: SERVICE_NAME,
  
  // Always include these fields in every log
  base: {
    service: SERVICE_NAME,
    environment: NODE_ENV,
    version: process.env.npm_package_version || "1.0.0",
  },

  // Redact sensitive fields
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
    remove: false, // Keep field but redact value
  },

  // Safe serialization using Pino's built-in robust serializers
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },

  // Custom formatters for production
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      service: SERVICE_NAME,
    }),
  },

  // Timestamp format: ISO 8601
  timestamp: () => `,"time":"${new Date().toISOString()}"`,

  // Pretty print in development
  ...(NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname,service,environment,version",
        messageFormat: "{levelLabel} {msg}",
        singleLine: true,
      },
    },
  }),
};

// ============================================================================
// CREATE BASE LOGGER INSTANCE
// ============================================================================

const rootLogger = pino(baseConfig);

// ============================================================================
// CHILD LOGGER FACTORY
// ============================================================================

/**
 * Creates a child logger with additional context
 * @param {Object} context - Additional fields to include in all logs
 * @returns {Object} Child logger instance
 * @example
 * const logger = createChildLogger({ userId: '123', requestId: 'abc' });
 * logger.info('User action'); // { userId: '123', requestId: 'abc', msg: 'User action' }
 */
function createChildLogger(context = {}) {
  return rootLogger.child(context);
}

/**
 * Creates a request-bound logger with correlation ID
 * @param {Object} req - Express request object
 * @returns {Object} Request-bound logger
 */
function createRequestLogger(req) {
  const requestId = req.id || req.headers["x-request-id"] || "unknown";
  const userId = req.auth?.uid || req.dbUser?._id || "anonymous";
  
  return rootLogger.child({
    requestId,
    userId,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection?.remoteAddress,
  });
}

// ============================================================================
// CONVENIENCE EXPORT
// ============================================================================

/**
 * Wrap console methods for backward compatibility during migration
 * Routes console.log/error to Pino with warning
 */
if (NODE_ENV === "production") {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args) => {
    rootLogger.debug({ consoleArgs: args }, "console.log used (migrate to logger)");
  };

  console.error = (...args) => {
    const [first, ...rest] = args;
    if (first instanceof Error) {
      rootLogger.error({ err: first, extra: rest }, first.message);
    } else {
      rootLogger.error({ consoleArgs: args }, String(first));
    }
  };

  console.warn = (...args) => {
    rootLogger.warn({ consoleArgs: args }, String(args[0]));
  };
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  // Main logger instance
  logger: rootLogger,
  
  // Factory functions
  createChildLogger,
  createRequestLogger,
  
  // Raw pino for advanced use cases
  pino,
  
  // Configuration reference
  config: {
    level: LOG_LEVEL,
    environment: NODE_ENV,
    redactPaths: REDACT_PATHS,
  },
};
