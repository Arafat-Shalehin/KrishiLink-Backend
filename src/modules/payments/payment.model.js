/**
 * ============================================================================
 * 📦 PAYMENT MODEL - What is this file?
 * ============================================================================
 *
 * Think of this file like a "recipe book" for our Payments collection.
 *
 * WHAT IS A "COLLECTION"?
 * -----------------------
 * Imagine MongoDB is like a big filing cabinet. Inside this cabinet, we have
 * different folders (called "collections"). Each folder contains papers
 * (called "documents"). We already have folders like:
 *   - "allCrops" (stores all the crops)
 *   - "users" (stores all the users)
 *   - "interests" (stores all the buying interests)
 *
 * Now we're creating a new folder called "payments" to store all payment records!
 *
 * WHY DO WE NEED TO STORE PAYMENTS?
 * ---------------------------------
 * 1. To know if someone already paid for something
 * 2. To show payment history to users
 * 3. To match SSLCommerz's response with our orders
 * 4. To handle cases where payment fails and user wants to retry
 *
 * ============================================================================
 */

const { getCollection } = require("../../config/db");

/**
 * Get the "payments" collection from our database
 *
 * This is like saying: "Give me the 'payments' folder from the filing cabinet"
 */
async function paymentsCollection() {
  return getCollection("payments");
}

/**
 * CREATE INDEXES - What are indexes?
 *
 * Imagine you have a phone book with 1 million names. Without an index (A-Z tabs),
 * you'd have to check EVERY single page to find "Arafat". With indexes, you jump
 * straight to "A" section!
 *
 * We create indexes on fields we'll search by often:
 * - transactionId (the unique ID for each payment)
 * - userEmail (to find all payments by one user)
 * - interestId (to link payment to the crop interest)
 */
let ensured = false;
async function ensurePaymentIndexes() {
  if (ensured) return; // Only create indexes once

  const col = await paymentsCollection();

  // transactionId should be unique - no two payments can have same ID
  await col.createIndex({ transactionId: 1 }, { unique: true });

  // Find payments by user quickly
  await col.createIndex({ userEmail: 1, createdAt: -1 });

  // Find payment for a specific interest
  await col.createIndex({ interestId: 1 });

  // Find payments by status (pending, completed, failed)
  await col.createIndex({ status: 1 });

  ensured = true;
}

module.exports = { paymentsCollection, ensurePaymentIndexes };
