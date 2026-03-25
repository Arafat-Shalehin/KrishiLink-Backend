// ============================================================================
// VALIDATION MODULE INDEX
// ============================================================================
// Centralized exports for all validation utilities
// Usage: const { validate, schemas } = require('../validation');
// ============================================================================

const { validate, validateAsync, ValidationError } = require('./validate');
const schemas = require('./schemas');

module.exports = {
  // Middleware
  validate,
  validateAsync,
  ValidationError,
  
  // All schemas
  schemas,
};
