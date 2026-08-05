const SSLCommerzPayment = require("sslcommerz-lts");
const { ObjectId } = require("../../config/db");
const { paymentsCollection, ensurePaymentIndexes } = require("./payment.model");
const { interestsCollection } = require("../interests/interest.model");
const { cropsCollection } = require("../crops/crop.model");
const { buyerCropLocksCollection } = require("../interests/buyerCropLock.model");

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

    const interest = await interestsCol.findOne({
      _id: new ObjectId(interestId),
    });

    if (!interest) {
      return res.status(404).json({
        success: false,
        message: "Interest not found",
      });
    }

    // --------------------------------------------------------
    // 🔁 CHECK ATTEMPT LIMIT (Max 3 retries)
    // attemptCount is stored directly on the interest document
    // and is reset to 0 when admin approves a re-attempt request.
    // --------------------------------------------------------
    const currentAttemptCount = interest.attemptCount || 0;

    if (currentAttemptCount >= 3) {
      return res.status(403).json({
        success: false,
        message: "Maximum payment attempts reached. Contact support.",
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
    // STEP 5b: Increment attemptCount on the interest document
    // This is the authoritative counter — reset to 0 on re-attempt approval
    // --------------------------------------------------------
    await interestsCol.updateOne(
      { _id: new ObjectId(interestId) },
      { $inc: { attemptCount: 1 }, $set: { updatedAt: new Date() } }
    );

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
      ...(process.env.NODE_ENV === "production" && {
        ipn_url: `${BACKEND_URL}/payment/ipn`, // Server-to-server notification
      }),

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
// 🔒 INTERNAL HELPER: verifyAndCompletePayment
// ============================================================================
async function verifyAndCompletePayment(transactionId, valId) {
  const paymentsCol = await paymentsCollection();
  const payment = await paymentsCol.findOne({ transactionId });

  if (!payment) {
    console.error("Verification failed: payment not found for", transactionId);
    return { success: false, status: 404, message: "Payment not found" };
  }

  // Safe idempotent check - if already completed, return success
  if (payment.status === "completed") {
    console.log(`Payment ${transactionId} already completed.`);
    return { success: true, message: "Already processed" };
  }

  // 1. Validate with SSLCommerz using val_id
  const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
  const validateResponse = await sslcz.validate({ val_id: valId });

  console.log("Validation response for", transactionId, ":", validateResponse);

  if (
    validateResponse.status !== "VALID" &&
    validateResponse.status !== "VALIDATED"
  ) {
    console.error("Validation failed with SSLCommerz status:", validateResponse.status);
    return { success: false, status: 400, message: "Invalid payment status" };
  }

  // 2. Cross-check transaction ID
  if (validateResponse.tran_id !== transactionId) {
    console.error("Transaction ID mismatch", {
      expected: transactionId,
      got: validateResponse.tran_id,
    });
    return { success: false, status: 400, message: "Transaction ID mismatch" };
  }

  // 3. Cross-check amount
  if (Number(validateResponse.amount) !== Number(payment.amount)) {
    console.error("Amount mismatch", {
      expected: payment.amount,
      got: validateResponse.amount,
    });
    return { success: false, status: 400, message: "Amount mismatch" };
  }

  // 4. Update payments collection atomically
  const result = await paymentsCol.updateOne(
    { transactionId, status: "pending" },
    {
      $set: {
        status: "completed",
        validationId: valId,
        gatewayTransactionId: validateResponse.bank_tran_id,
        sslResponse: validateResponse,
        updatedAt: new Date(),
      },
    }
  );

  if (result.matchedCount === 0) {
    // Already updated by another callback (e.g. race condition between success redirect and IPN)
    console.log(`Payment ${transactionId} status change bypassed (already updated).`);
    return { success: true, message: "Already processed" };
  }

  // 5. Update interests collection
  const interestsCol = await interestsCollection();
  await interestsCol.updateOne(
    { _id: payment.interestId },
    {
      $set: {
        paymentStatus: "paid",
        transactionId,
        updatedAt: new Date(),
      },
    }
  );

  // 6. Reset failedCycleCount to 0 — successful payment clears the slate
  try {
    const locksCol = await buyerCropLocksCollection();
    const now = new Date();
    await locksCol.updateOne(
      { cropId: payment.cropId, buyerEmail: payment.userEmail },
      {
        $set: { failedCycleCount: 0, updatedAt: now },
        $setOnInsert: { createdAt: now, lockedAt: null },
      },
      { upsert: true }
    );
  } catch (lockErr) {
    console.error("verifyAndCompletePayment: buyerCropLocks reset failed:", {
      transactionId,
      cropId: payment.cropId,
      buyerEmail: payment.userEmail,
      error: lockErr.message,
    });
    // Non-fatal — payment is still considered completed
  }

  console.log(`Payment ${transactionId} successfully verified and completed.`);
  return { success: true, message: "Payment completed successfully" };
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
  // Use query params if body is empty (sometimes happens with GET redirects)
  const tran_id = req.body?.tran_id || req.query.tran_id;
  const val_id = req.body?.val_id || req.query.val_id;

  console.log("Payment success redirect:", { tran_id, val_id, body: req.body, query: req.query });

  if (!tran_id) {
    return res.redirect(`${FRONTEND_URL}/payment/error?message=Invalid+transaction`);
  }

  // Best-effort verification — never let this crash the redirect
  if (val_id) {
    try {
      await verifyAndCompletePayment(tran_id, val_id);
    } catch (err) {
      // Log but don't fail — IPN will handle verification server-side
      console.error("Verification failed in success redirect (non-fatal):", err.message);
    }
  }

  return res.redirect(`${FRONTEND_URL}/payment/success?transactionId=${tran_id}`);
}

// ============================================================================
// 🔒 INTERNAL HELPER: recordFailedCycleIfNeeded
// Called after a payment fails or is cancelled.
// Checks if the associated interest has now exhausted all 3 attempts,
// and if so increments failedCycleCount on the buyerCropLocks document.
// Uses a two-phase write: $inc first, then conditionally set lockedAt.
// ============================================================================
async function recordFailedCycleIfNeeded(tran_id) {
  try {
    const paymentsCol = await paymentsCollection();
    const payment = await paymentsCol.findOne({ transactionId: tran_id });
    if (!payment) return;

    const interestsCol = await interestsCollection();
    const interest = await interestsCol.findOne({ _id: payment.interestId });
    if (!interest) return;

    // Only record a failed cycle when attempts are exhausted and not yet paid
    if ((interest.attemptCount || 0) < 3) return;
    if (interest.paymentStatus === "paid") return;

    const locksCol = await buyerCropLocksCollection();
    const now = new Date();

    // Phase 1: increment failedCycleCount
    const updateResult = await locksCol.findOneAndUpdate(
      { cropId: interest.cropId, buyerEmail: interest.buyerEmail },
      {
        $inc: { failedCycleCount: 1 },
        $set: { updatedAt: now },
        $setOnInsert: { createdAt: now, lockedAt: null },
      },
      { upsert: true, returnDocument: "after" }
    );

    const updatedDoc = updateResult;

    // Phase 2: set lockedAt exactly once when failedCycleCount first reaches 3
    if (updatedDoc && updatedDoc.failedCycleCount >= 3 && !updatedDoc.lockedAt) {
      await locksCol.updateOne(
        { cropId: interest.cropId, buyerEmail: interest.buyerEmail, lockedAt: null },
        { $set: { lockedAt: now, updatedAt: now } }
      );
      console.log(
        `Buyer ${interest.buyerEmail} permanently locked from crop ${interest.cropId}`
      );
    }

    console.log(
      `Failed cycle recorded for ${interest.buyerEmail} / crop ${interest.cropId}: count=${updatedDoc?.failedCycleCount}`
    );
  } catch (err) {
    console.error("recordFailedCycleIfNeeded error:", {
      tran_id,
      error: err.message,
    });
    // Never throw — the redirect has already happened
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
  const tran_id = req.body?.tran_id || req.query.tran_id || "";
  const errorMsg = req.body?.error || req.query.error || "Payment failed";

  console.log("Payment failed callback received:", { tran_id, error: errorMsg });

  // Fire-and-forget: check if this failure completes a cycle
  if (tran_id) {
    recordFailedCycleIfNeeded(tran_id).catch((err) =>
      console.error("paymentFail: recordFailedCycleIfNeeded error:", err.message)
    );
  }

  return res.redirect(
    `${FRONTEND_URL}/payment/failed?transactionId=${tran_id}&error=${encodeURIComponent(errorMsg)}`,
  );
}

// ============================================================================
// 🚫 FUNCTION 4: paymentCancel - User cancelled payment
// ============================================================================

/**
 * User clicked "Cancel" on the payment page.
 * They didn't enter any card details, just left.
 */
async function paymentCancel(req, res) {
  const tran_id = req.body?.tran_id || req.query.tran_id || "";

  console.log("Payment cancelled callback received:", { tran_id });

  // Fire-and-forget: check if this cancellation completes a cycle
  if (tran_id) {
    recordFailedCycleIfNeeded(tran_id).catch((err) =>
      console.error("paymentCancel: recordFailedCycleIfNeeded error:", err.message)
    );
  }

  return res.redirect(
    `${FRONTEND_URL}/payment/cancelled?transactionId=${tran_id}`,
  );
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

    const verification = await verifyAndCompletePayment(tran_id, val_id);

    if (!verification.success) {
      return res.status(verification.status).json({ message: verification.message });
    }

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
