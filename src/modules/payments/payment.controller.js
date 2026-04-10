const SSLCommerzPayment = require("sslcommerz-lts");
const { ObjectId } = require("../../config/db");
const { paymentsCollection, ensurePaymentIndexes } = require("./payment.model");
const { interestsCollection } = require("../interests/interest.model");
const { cropsCollection } = require("../crops/crop.model");

const store_id = process.env.SSLCOMMERZ_STORE_ID;
const store_passwd = process.env.SSLCOMMERZ_STORE_PASSWORD;
const is_live = process.env.SSLCOMMERZ_IS_LIVE === "true"; // "false" string becomes false boolean

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

// ============================================================================
// 🚀 FUNCTION 1: initPayment - Start the payment process
// ============================================================================

/**
 * This function is called when user clicks "Pay Now" button on frontend.
 *
 * WHAT IT DOES:
 * 1. Receives order details (which interest they're paying for, how much, etc)
 * 2. Creates a payment record in our database (status: "pending")
 * 3. Sends all details to SSLCommerz
 * 4. Gets back a special URL where user can pay
 * 5. Sends that URL to frontend so user can be redirected
 *
 * WHAT WE NEED FROM FRONTEND:
 * - interestId: Which crop interest is being paid for
 * - amount: How much to pay
 * - customerName, customerEmail, customerPhone, customerAddress, etc.
 */
async function initPayment(req, res) {
  try {
    await ensurePaymentIndexes();

    // --------------------------------------------------------
    // STEP 1: Get all the data from the request
    // --------------------------------------------------------
    const {
      interestId,
      amount,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      customerCity,
      customerPostCode,
    } = req.body;

    // --------------------------------------------------------
    // STEP 2: Validate - Make sure all required fields exist
    // --------------------------------------------------------
    if (!interestId || !amount) {
      return res.status(400).json({
        success: false,
        message: "interestId and amount are required",
      });
    }

    // --------------------------------------------------------
    // STEP 3: Find the interest to get crop details
    // --------------------------------------------------------
    const interestsCol = await interestsCollection();
    // --------------------------------------------------------
    // 🔁 CHECK ATTEMPT LIMIT (Max 3 retries)
    // --------------------------------------------------------
    const paymentsCol = await paymentsCollection();
    const failedCount = await paymentsCol.countDocuments({
      interestId: new ObjectId(interestId),
      status: { $in: ["failed", "cancelled", "pending"] }
    });

    if (failedCount >= 3) {
      return res.status(403).json({
        success: false,
        message: "Maximum payment attempts reached. Contact support.",
      });
    }

    const interest = await interestsCol.findOne({
      _id: new ObjectId(interestId),
    });

    if (!interest) {
      return res.status(404).json({
        success: false,
        message: "Interest not found",
      });
    }

    // Get crop details for product info
    const cropsCol = await cropsCollection();
    const crop = await cropsCol.findOne({ _id: interest.cropId });

    // --------------------------------------------------------
    // STEP 4: Generate a UNIQUE Transaction ID
    // --------------------------------------------------------
    /**
     * Transaction ID is like a receipt number - must be unique!
     *
     * We use: KRISHI_<timestamp>_<random-string>
     * Example: KRISHI_1706789012345_abc123xyz
     *
     * This ensures no two payments ever have the same ID.
     */
    const transactionId = `KRISHI_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // --------------------------------------------------------
    // STEP 5: Save payment record to our database (status: pending)
    // --------------------------------------------------------
    /**
     * WHY SAVE BEFORE PAYMENT?
     *
     * We save it as "pending" first so that when SSLCommerz sends us
     * confirmation later (via IPN), we can find this record and
     * update it to "completed".
     */

    const paymentRecord = {
      transactionId,
      interestId: new ObjectId(interestId),
      cropId: interest.cropId,
      userId: req.dbUser?._id || null,
      userEmail: customerEmail || req.dbUser?.email || "",
      userName: customerName || req.dbUser?.name || "",

      amount: Number(amount),
      currency: "BDT", // Bangladeshi Taka

      status: "pending", // Will change to "completed" or "failed"

      // SSLCommerz will fill these after payment
      sslResponse: null,
      validationId: null,

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await paymentsCol.insertOne(paymentRecord);

    // --------------------------------------------------------
    // STEP 6: Prepare data for SSLCommerz
    // --------------------------------------------------------
    /**
     * SSLCommerz needs A LOT of information. Think of it like filling
     * a detailed form at the bank. Some fields are required, some optional.
     *
     * IMPORTANT FIELDS:
     * - total_amount: How much to charge
     * - tran_id: Our unique transaction ID (to match later)
     * - success_url, fail_url, etc.: Where to send user after payment
     * - product_name: What they're buying
     * - cus_*: Customer details
     */
    const sslData = {
      // 💰 Payment amount and currency
      total_amount: Number(amount),
      currency: "BDT",
      tran_id: transactionId, // MUST BE UNIQUE for each payment!

      // 🔗 Callback URLs (where SSLCommerz will redirect/call after payment)
      success_url: `${BACKEND_URL}/payment/success`,
      fail_url: `${BACKEND_URL}/payment/fail`,
      cancel_url: `${BACKEND_URL}/payment/cancel`,
      ipn_url: `${BACKEND_URL}/payment/ipn`, // Server-to-server notification

      // 📦 What they're buying
      product_name: crop?.name || "Agricultural Product",
      product_category: crop?.type || "Crops",
      product_profile: "general",

      // 👤 Customer information
      cus_name: customerName || req.dbUser?.name || "Customer",
      cus_email: customerEmail || req.dbUser?.email || "customer@example.com",
      cus_phone: customerPhone || "01700000000",
      cus_add1: customerAddress || "Dhaka",
      cus_add2: "",
      cus_city: customerCity || "Dhaka",
      cus_state: customerCity || "Dhaka",
      cus_postcode: customerPostCode || "1000",
      cus_country: "Bangladesh",
      cus_fax: "",

      // 🚚 Shipping (same as customer for digital products)
      shipping_method: "NO",
      ship_name: customerName || "Customer",
      ship_add1: customerAddress || "Dhaka",
      ship_add2: "",
      ship_city: customerCity || "Dhaka",
      ship_state: customerCity || "Dhaka",
      ship_postcode: customerPostCode || "1000",
      ship_country: "Bangladesh",
    };

    // --------------------------------------------------------
    // STEP 7: Call SSLCommerz API to get payment URL
    // --------------------------------------------------------
    /**
     * SSLCommerz library makes this easy:
     * 1. Create instance with our store credentials
     * 2. Call .init() with all the data
     * 3. Get back a URL where user can pay
     */
    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const apiResponse = await sslcz.init(sslData);

    // --------------------------------------------------------
    // STEP 8: Check if we got the payment URL
    // --------------------------------------------------------
    if (apiResponse?.GatewayPageURL) {
      /**
       * SUCCESS! We got the payment gateway URL.
       * Send it to frontend so they can redirect the user there.
       */
      return res.status(200).json({
        success: true,
        message: "Payment initiated successfully",
        paymentUrl: apiResponse.GatewayPageURL,
        transactionId,
      });
    } else {
      /**
       * FAILED! SSLCommerz didn't give us a URL.
       * This usually means wrong credentials or configuration.
       */
      console.error("SSLCommerz init failed:", apiResponse);
      return res.status(400).json({
        success: false,
        message: "Failed to initiate payment. Please try again.",
        error: apiResponse?.failedreason || "Unknown error",
      });
    }
  } catch (error) {
    console.error("initPayment error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while initiating payment",
    });
  }
}

// ============================================================================
// ✅ FUNCTION 2: paymentSuccess - User completed payment successfully
// ============================================================================

/**
 * SSLCommerz redirects user here AFTER successful payment.
 *
 * IMPORTANT: This is a POST request! SSLCommerz sends data in request body.
 *
 * WHAT WE DO:
 * 1. Get the transaction ID from SSLCommerz response
 * 2. Find our payment record
 * 3. Update status to "completed"
 * 4. Redirect user to frontend success page
 *
 * ⚠️ WARNING: Don't trust this 100%! Someone could fake this request.
 * The IPN (Instant Payment Notification) is more reliable.
 * But we still use this for a good user experience (immediate redirect).
 */
async function paymentSuccess(req, res) {
  try {
    const { tran_id } = req.body;

    // Use query params if body is empty (sometimes happens with GET redirects)
    const transactionId = tran_id || req.query.tran_id;

    console.log("Payment success redirect:", { transactionId, body: req.body, query: req.query });

    // IPN + validation is the only source of truth

    if (!transactionId) {
      return res.redirect(
        `${FRONTEND_URL}/payment/error?message=Invalid transaction`,
      );
    }

    // 🔐 SECURITY FIX: Removed database update logic from redirect handler.
    // The IPN (Instant Payment Notification) is the ONLY source of truth.
    // Transitioning state here allows users to forge payment completion requests.

    return res.redirect(
      `${FRONTEND_URL}/payment/success?transactionId=${transactionId}`,
    );
  } catch (error) {
    console.error("paymentSuccess error:", error);
    return res.redirect(`${FRONTEND_URL}/payment/error?message=Server error`);
  }
}

// ============================================================================
// ❌ FUNCTION 3: paymentFail - Payment failed
// ============================================================================

/**
 * SSLCommerz redirects user here if payment FAILED.
 *
 * REASONS FOR FAILURE:
 * - Credit card declined
 * - Wrong OTP entered
 * - Bank server error
 * - Insufficient balance
 */
async function paymentFail(req, res) {
  try {
    const { tran_id, error } = req.body;

    console.log("Payment failed callback received:", { tran_id, error });

    // 🔐 SECURITY FIX: Removed database update logic.
    // State transitions are handled exclusively via validated IPN requests.

    // Redirect to frontend failure page
    return res.redirect(
      `${FRONTEND_URL}/payment/failed?transactionId=${tran_id || ""}&error=${encodeURIComponent(error || "Payment failed")}`,
    );
  } catch (error) {
    console.error("paymentFail error:", error);
    return res.redirect(`${FRONTEND_URL}/payment/error?message=Server error`);
  }
}

// ============================================================================
// 🚫 FUNCTION 4: paymentCancel - User cancelled payment
// ============================================================================

/**
 * User clicked "Cancel" on the payment page.
 * They didn't enter any card details, just left.
 */
async function paymentCancel(req, res) {
  try {
    const { tran_id } = req.body;

    console.log("Payment cancelled callback received:", { tran_id });

    // 🔐 SECURITY FIX: Removed database update logic.
    // Prevents unverified client-side attempts to manipulate transaction state.

    // Redirect to frontend with cancellation message
    return res.redirect(
      `${FRONTEND_URL}/payment/cancelled?transactionId=${tran_id || ""}`,
    );
  } catch (error) {
    console.error("paymentCancel error:", error);
    return res.redirect(`${FRONTEND_URL}/payment/error?message=Server error`);
  }
}

// ============================================================================
// 🔔 FUNCTION 5: paymentIPN - Instant Payment Notification (MOST IMPORTANT!)
// ============================================================================

/**
 * IPN = Instant Payment Notification
 *
 * This is a SECRET callback from SSLCommerz to our server.
 * The user NEVER sees this - it's server-to-server communication.
 *
 * WHY IS THIS IMPORTANT?
 * ----------------------
 * Imagine user pays successfully, but their internet disconnects before
 * they reach our success page. Without IPN, we'd never know they paid!
 *
 * IPN is like SSLCommerz calling our shop directly to say
 * "Hey, this customer paid. Update your records!"
 *
 * This is the MOST RELIABLE way to confirm payment.
 */
async function paymentIPN(req, res) {
  try {
    const { tran_id, val_id } = req.body;

    console.log("IPN received:", { tran_id, val_id });

    if (!tran_id || !val_id) {
      return res.status(400).json({ message: "Invalid IPN payload" });
    }

    const paymentsCol = await paymentsCollection();
    const payment = await paymentsCol.findOne({ transactionId: tran_id });

    if (!payment) {
      console.error("IPN for unknown transaction:", tran_id);
      return res.status(404).json({ message: "Payment not found" });
    }

    // --------------------------------------------------------
    // 🔐 ALWAYS validate with SSLCommerz
    // --------------------------------------------------------
    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    const validateResponse = await sslcz.validate({ val_id });

    console.log("Validation response:", validateResponse);

    if (
      validateResponse.status !== "VALID" &&
      validateResponse.status !== "VALIDATED"
    ) {
      console.error("Validation failed:", validateResponse);
      return res.status(400).json({ message: "Invalid payment" });
    }

    // --------------------------------------------------------
    // 🔐 Cross-check critical fields
    // --------------------------------------------------------
    if (validateResponse.tran_id !== tran_id) {
      console.error("Transaction ID mismatch", {
        ipn: tran_id,
        validate: validateResponse.tran_id,
      });
      return res.status(400).json({ message: "Transaction mismatch" });
    }

    if (Number(validateResponse.amount) !== Number(payment.amount)) {
      console.error("Amount mismatch", {
        expected: payment.amount,
        got: validateResponse.amount,
      });
      return res.status(400).json({ message: "Amount mismatch" });
    }

    // --------------------------------------------------------
    // 🔒 ATOMIC idempotent update (PENDING → COMPLETED)
    // --------------------------------------------------------
    const result = await paymentsCol.updateOne(
      { transactionId: tran_id, status: "pending" },
      {
        $set: {
          status: "completed",
          validationId: val_id,
          gatewayTransactionId: validateResponse.bank_tran_id,
          sslResponse: validateResponse,
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      // Already processed — SAFE idempotent exit
      console.log(`Payment ${tran_id} already processed`);
      return res.status(200).json({ message: "Already processed" });
    }

    // --------------------------------------------------------
    // ✅ SIDE EFFECTS — RUN ONCE ONLY
    // --------------------------------------------------------
    const interestsCol = await interestsCollection();
    await interestsCol.updateOne(
      { _id: payment.interestId },
      {
        $set: {
          paymentStatus: "paid",
          transactionId: tran_id,
          updatedAt: new Date(),
        },
      },
    );

    console.log(`Payment ${tran_id} COMPLETED via IPN`);

    return res.status(200).json({ message: "IPN processed successfully" });
  } catch (error) {
    console.error("paymentIPN error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

// ============================================================================
// 📋 FUNCTION 6: getMyPayments - Get all payments for logged-in user
// ============================================================================

/**
 * This lets users see their payment history.
 * "Show me all the payments I've made."
 */
async function getMyPayments(req, res) {
  try {
    const userEmail = req.dbUser?.email;

    if (!userEmail) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    // 1. Pagination Params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10)); // Cap limit at 100
    const skip = (page - 1) * limit;

    const paymentsCol = await paymentsCollection();

    // 2. Fetch Total Count & Paginated Data
    const [payments, totalCount] = await Promise.all([
      paymentsCol
        .find({ userEmail })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      paymentsCol.countDocuments({ userEmail }),
    ]);

    return res.status(200).json({
      success: true,
      payments,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error("getMyPayments error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============================================================================
// 🔍 FUNCTION 7: getPaymentByTransaction - Get specific payment details
// ============================================================================

/**
 * Get details of a specific payment by its transaction ID.
 * Useful for showing receipt/confirmation page.
 */
async function getPaymentByTransaction(req, res) {
  try {
    const { transactionId } = req.params;

    const paymentsCol = await paymentsCollection();
    const payment = await paymentsCol.findOne({ transactionId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("getPaymentByTransaction error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============================================================================
// 📤 EXPORT ALL FUNCTIONS
// ============================================================================

module.exports = {
  initPayment,
  paymentSuccess,
  paymentFail,
  paymentCancel,
  paymentIPN,
  getMyPayments,
  getPaymentByTransaction,
};
