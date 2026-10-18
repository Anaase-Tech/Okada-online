'use strict';

const PAY_LATER_ORIGINATION_UNAVAILABLE_MESSAGE =
  'New Pay Later requests are temporarily unavailable. Existing deferred rides and outstanding balances are unchanged. Choose another available payment method.';

// Deliberate temporary feature flag. Change only after the owner-approved,
// auditable, server-verifiable repayment/reconciliation path is implemented.
function isPayLaterOriginationSuspended() {
  return true;
}

module.exports = { isPayLaterOriginationSuspended, PAY_LATER_ORIGINATION_UNAVAILABLE_MESSAGE };
