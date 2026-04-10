const rateLimit = require("express-rate-limit");

/**
 * General API Limiter
 * Applied globally to all routes for baseline protection.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:
    process.env.NODE_ENV === "development"
      ? 10000 // High limit in development to avoid fetch failures during testing/HMR
      : 100, // Production limit
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  skip: () => process.env.DISABLE_RATE_LIMIT === "true",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests from this IP, please try again later.",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

/**
 * Strict Authentication Limiter
 * Applied specifically to sensitive endpoints like /sync and login attempts.
 * Prevents brute-force attacks by limiting attempts for unsuccessful requests.
 */
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // 10 attempts per hour
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later.",
  },
  skipSuccessfulRequests: true, // Don't count successful syncs against the limit
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many authentication attempts, please try again later.",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
};
