'use strict';

const REPAYMENT_UNAVAILABLE_MESSAGE =
  'Pay Later repayment is temporarily unavailable: this endpoint cannot verify an incoming payment or an explicitly authorized reconciliation. No debt records or Pay Later limit were changed. Repayments will remain unavailable until an approved funding or reconciliation flow is connected.';

/**
 * Builds the temporary fail-closed Pay Later repayment handler.
 *
 * Deliberately receives no Firestore/database writer. Neither legacy request
 * shape ({ userId, payLaterTxId } or { userId, amount }) is proof of collection.
 * Keep the outstanding debt and used limit unchanged until verified collection
 * or a project-approved, auditable reconciliation contract exists.
 */
function createPayLaterRepaymentHandler({ resolveUserRef, fail }) {
  if (typeof resolveUserRef !== 'function' || typeof fail !== 'function') {
    throw new TypeError('resolveUserRef and fail dependencies are required');
  }

  return async function rejectUnverifiedPayLaterRepayment(req, res) {
    try {
      const { userId, payLaterTxId, amount } = req.body || {};
      const user = await resolveUserRef(userId, req);
      if (!user) return fail(res, 404, 'User not found');

      // Preserve the existing aggregate-call validation while failing closed
      // before any debt read/write or limit mutation.
      if (!payLaterTxId) {
        const repaymentAmount = Number(amount);
        if (!Number.isFinite(repaymentAmount) || repaymentAmount <= 0) {
          return fail(res, 400, 'A positive repayment amount is required');
        }
      }

      return fail(res, 409, REPAYMENT_UNAVAILABLE_MESSAGE);
    } catch (error) {
      return fail(res, 500, error.message);
    }
  };
}

module.exports = {
  createPayLaterRepaymentHandler,
  REPAYMENT_UNAVAILABLE_MESSAGE,
};
