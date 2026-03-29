/**
 * ============================================================================
 * LOGGING MODULE INDEX
 * ============================================================================
 * Centralized exports for all logging utilities
 * ============================================================================
 */

const { logger, createChildLogger, createRequestLogger } = require("../utils/logger");
const { 
  requestLogger, 
  correlationIdMiddleware, 
  requestContextMiddleware,
  pinoHttpMiddleware,
} = require("../middlewares/requestLogger");
const { 
  errorLoggerMiddleware, 
  setupGlobalErrorHandlers,
  asyncHandler,
} = require("../middlewares/errorLogger");

module.exports = {
  // Core logger
  logger,
  log: logger, // Alias for convenience
  
  // Logger factories
  createChildLogger,
  createRequestLogger,
  
  // Middleware setup (main entry point)
  requestLogger,
  
  // Individual middlewares
  correlationIdMiddleware,
  requestContextMiddleware,
  pinoHttpMiddleware,
  errorLoggerMiddleware,
  
  // Setup functions
  setupGlobalErrorHandlers,
  
  // Utilities
  asyncHandler,
};
