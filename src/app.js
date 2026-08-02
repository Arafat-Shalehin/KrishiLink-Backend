const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

// Logging imports
const { requestLogger, errorLoggerMiddleware, logger } = require("./logging");

const cropRoutes = require("./modules/crops/crop.routes");
const interestRoutes = require("./modules/interests/interest.routes");
const userRoutes = require("./modules/users/user.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");
const adminRoutes = require("./modules/admin/admin.routes");
const paymentRoutes = require("./modules/payments/payment.routes");
const reAttemptRoutes = require("./modules/reAttempts/reAttempt.routes");

const app = express();

// Trust proxy for correct client IP detection behind load balancers (Vercel, etc.)
app.set("trust proxy", 1);

// ============================================================================
// CORS - Must be early to handle preflight requests
// ============================================================================
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173", "http://localhost:3000"];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      process.env.NODE_ENV === "development"
    ) {
      callback(null, true);
    } else {
      logger.warn({ origin }, "CORS blocked request");
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["X-Request-Id"], // Allow frontend to read this header
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// ============================================================================
// LOGGING MIDDLEWARE (After CORS for proper preflight handling)
// ============================================================================
requestLogger(app);

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// 1. Helmet - Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", process.env.BACKEND_URL],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "same-origin" },
  }),
);

const { apiLimiter } = require("./middlewares/rateLimiter");

// Apply rate limiting to all API routes
app.use("/", apiLimiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ============================================================================
// ROUTES
// ============================================================================

app.use(cropRoutes);
app.use(interestRoutes);
app.use(userRoutes);
app.use(dashboardRoutes);
app.use(adminRoutes);
app.use(paymentRoutes);
app.use(reAttemptRoutes);

// Health check endpoint (excluded from rate limiting for monitoring)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Root endpoint
app.get("/", (req, res) => {
  req.log?.info("Root endpoint accessed");
  res.send("KrishiLink Server is running.");
});

// ============================================================================
// ERROR HANDLING (Must be last)
// ============================================================================

// Error logging middleware (logs then passes to handlers)
app.use(errorLoggerMiddleware);

// 404 handler
app.use((req, res) => {
  req.log?.warn({ url: req.originalUrl, method: req.method }, "404 Not Found");
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Error already logged by errorLoggerMiddleware
  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode >= 500 
    ? "Internal server error" 
    : (err.message || "Error");
  
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && {
      error: err.message,
      stack: err.stack,
    }),
  });
});

module.exports = app;
