const { z } = require("zod");

/**
 * Centralized validation middleware factory
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {string} source - Request property to validate: 'body' | 'query' | 'params'
 * @returns {Function} Express middleware
 */
const validate = (schema, source = "body") => {
  return (req, res, next) => {
    try {
      const data = req[source];
      const validated = schema.parse(data);
      
      // Replace request data with validated/sanitized version
      req[source] = validated;
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Format Zod errors into readable messages
        const errors = error.issues.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors,
        });
      }

      // Unexpected error
      console.error("Validation middleware error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal validation error",
      });
    }
  };
};

/**
 * Async validation wrapper for controllers
 * Useful when you need validation inside controller logic
 * @param {z.ZodSchema} schema
 * @param {*} data
 * @returns {Promise<*>} Validated data
 */
const validateAsync = async (schema, data) => {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      throw new ValidationError("Validation failed", errors);
    }
    throw error;
  }
};

/**
 * Custom validation error class
 */
class ValidationError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = "ValidationError";
    this.errors = errors;
    this.statusCode = 400;
  }
}

module.exports = {
  validate,
  validateAsync,
  ValidationError,
};
