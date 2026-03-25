const { z } = require("zod");

// ============================================================================
// CROP VALIDATION SCHEMAS
// ============================================================================

const cropTypes = [
  "vegetable",
  "fruit",
  "grain",
  "pulse",
  "spice",
  "flower",
  "other",
  "legume",
];

const units = ["kg", "g", "ton", "lb", "piece", "bundle", "liter", "bag"];

/**
 * Schema for creating a new crop
 */
const createCropSchema = z
  .object({
    name: z
      .string()
      .min(2, "Crop name must be at least 2 characters")
      .max(100, "Crop name cannot exceed 100 characters")
      .trim()
      .regex(/^[a-zA-Z0-9\s\-_]+$/, "Crop name contains invalid characters"),

    type: z.string().refine((val) => cropTypes.includes(val.toLowerCase()), {
      message: `Invalid crop type. Must be one of: ${cropTypes.join(", ")}`,
    }),

    pricePerUnit: z
      .number()
      .positive("Price must be greater than 0")
      .max(1000000, "Price seems too high. Please verify.")
      .refine((val) => !isNaN(val), {
        message: "Price must be a valid number",
      }),

    unit: z.string().refine((val) => units.includes(val.toLowerCase()), {
      message: `Invalid unit. Must be one of: ${units.join(", ")}`,
    }),

    quantity: z
      .number()
      .int("Quantity must be a whole number")
      .positive("Quantity must be greater than 0")
      .max(100000, "Maximum quantity is 100,000 units"),

    description: z
      .string()
      .min(10, "Description must be at least 10 characters")
      .max(2000, "Description cannot exceed 2000 characters")
      .trim(),

    location: z
      .string()
      .min(2, "Location is required")
      .max(100, "Location cannot exceed 100 characters")
      .trim(),

    image: z
      .string()
      .url("Invalid image URL format")
      .optional()
      .or(z.literal("")),
  
    harvestDate: z.string().optional(),

    organic: z.boolean().default(false),
  })
  .passthrough();

/**
 * Schema for updating a crop
 */
const updateCropSchema = createCropSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

/**
 * Schema for crop filtering (query params)
 */
const cropFilterSchema = z.object({
  search: z.string().max(100, "Search query too long").trim().optional(),

  type: z.string().optional(),

  location: z.string().max(100).optional(),

  status: z.enum(["available", "sold", "hidden", "active"]).optional(),

  minPrice: z
    .string()
    .refine((val) => !isNaN(parseFloat(val)), {
      message: "minPrice must be a number",
    })
    .transform((val) => parseFloat(val))
    .optional(),

  maxPrice: z
    .string()
    .refine((val) => !isNaN(parseFloat(val)), {
      message: "maxPrice must be a number",
    })
    .transform((val) => parseFloat(val))
    .optional(),

  sort: z
    .enum([
      "price_asc",
      "price_desc",
      "newest",
      "oldest",
      "name_asc",
      "name_desc",
    ])
    .default("newest"),

  page: z
    .string()
    .refine((val) => !isNaN(parseInt(val)), {
      message: "Page must be a number",
    })
    .transform((val) => Math.max(1, parseInt(val)))
    .default("1"),

  limit: z
    .string()
    .refine((val) => !isNaN(parseInt(val)), {
      message: "Limit must be a number",
    })
    .transform((val) => {
      const parsed = parseInt(val);
      return Math.min(50, Math.max(1, parsed));
    })
    .default("12"),
});

// ============================================================================
// USER VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema for user profile sync
 */
const syncUserSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name cannot exceed 50 characters")
    .trim()
    .regex(/^[a-zA-Z\s\-'.]+$/, "Name contains invalid characters")
    .optional(),

  photoURL: z
    .string()
    .url("Invalid photo URL")
    .regex(/^https:\/\//, "Photo URL must use HTTPS")
    .optional()
    .or(z.literal("")),
});

/**
 * Schema for user role update (admin only)
 */
const updateUserRoleSchema = z.object({
  role: z.enum(["buyer", "farmer", "admin"], {
    message: "Invalid role. Must be buyer, farmer, or admin",
  }),
});

/**
 * Schema for user status update (admin only)
 */
const updateUserStatusSchema = z.object({
  status: z.enum(["active", "blocked"], {
    message: "Invalid status. Must be active or blocked",
  }),
});

/**
 * Schema for admin user listing query params
 */
const listUsersQuerySchema = z.object({
  search: z.string().max(100).optional(),
  role: z.enum(["buyer", "farmer", "admin"]).optional(),
  status: z.enum(["active", "blocked"]).optional(),
  page: z
    .string()
    .transform((val) => Math.max(1, parseInt(val) || 1))
    .default("1"),
  limit: z
    .string()
    .transform((val) => Math.min(50, Math.max(5, parseInt(val) || 10)))
    .default("10"),
});

// ============================================================================
// INTEREST VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema for submitting interest in a crop
 */
const submitInterestSchema = z.object({
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(10000, "Maximum interest quantity is 10,000 units"),

  message: z
    .string()
    .max(500, "Message cannot exceed 500 characters")
    .trim()
    .optional()
    .or(z.literal("")),
});

/**
 * Schema for updating interest status (farmer action)
 */
const updateInterestStatusSchema = z.object({
  status: z.enum(["pending", "accepted", "rejected"], {
    message: "Invalid status. Must be pending, accepted, or rejected",
  }),
});

// ============================================================================
// PAYMENT VALIDATION SCHEMAS
// ============================================================================

const bangladeshDivisions = [
  "Dhaka",
  "Chittagong",
  "Rajshahi",
  "Khulna",
  "Barisal",
  "Sylhet",
  "Rangpur",
  "Mymensingh",
];

/**
 * Schema for initiating payment
 */
const initPaymentSchema = z.object({
  interestId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/, "Invalid interest ID format"),

  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .max(1000000, "Amount exceeds maximum limit")
    .refine((val) => {
      // Ensure amount has at most 2 decimal places
      const decimals = (val.toString().split(".")[1] || "").length;
      return decimals <= 2;
    }, "Amount cannot have more than 2 decimal places"),

  customerName: z
    .string()
    .min(2, "Name is required")
    .max(100, "Name too long")
    .trim(),

  customerEmail: z
    .string()
    .email("Invalid email format")
    .max(100)
    .toLowerCase(),

  customerPhone: z
    .string()
    .regex(
      /^01[3-9]\d{8}$/,
      "Invalid Bangladesh phone number. Format: 01XXXXXXXXX",
    ),

  customerAddress: z
    .string()
    .min(5, "Address is too short")
    .max(200, "Address cannot exceed 200 characters")
    .trim(),

  customerCity: z
    .string()
    .refine(
      (val) =>
        bangladeshDivisions.some(
          (div) => div.toLowerCase() === val.toLowerCase(),
        ),
      {
        message: `Invalid city. Must be one of: ${bangladeshDivisions.join(", ")}`,
      },
    ),

  customerPostCode: z
    .string()
    .regex(/^\d{4}$/, "Invalid postcode. Must be 4 digits"),
});

/**
 * Schema for payment callback validation
 */
const paymentCallbackSchema = z.object({
  tran_id: z.string().min(1, "Transaction ID is required"),
  val_id: z.string().optional(),
  error: z.string().optional(),
  status: z.string().optional(),
});

// ============================================================================
// ADMIN VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema for farmer request approval/rejection
 */
const farmerRequestActionSchema = z.object({
  action: z.enum(["approve", "reject", "reset"], {
    message: "Invalid action. Must be approve, reject, or reset",
  }),
});

/**
 * Schema for crop moderation (admin)
 */
const moderateCropSchema = z.object({
  status: z.enum(["active", "hidden"], {
    message: "Invalid status. Must be active or hidden",
  }),
});

// ============================================================================
// ID PARAM VALIDATION
// ============================================================================

/**
 * MongoDB ObjectId validation
 */
const objectIdSchema = z.object({
  id: z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid ID format"),
});

module.exports = {
  // Crop schemas
  createCropSchema,
  updateCropSchema,
  cropFilterSchema,

  // User schemas
  syncUserSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  listUsersQuerySchema,

  // Interest schemas
  submitInterestSchema,
  updateInterestStatusSchema,

  // Payment schemas
  initPaymentSchema,
  paymentCallbackSchema,

  // Admin schemas
  farmerRequestActionSchema,
  moderateCropSchema,

  // Utility schemas
  objectIdSchema,
};
