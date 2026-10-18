'use strict';

const PAY_LATER_ORIGINATION_UNAVAILABLE_MESSAGE =
  'New Pay Later requests are temporarily unavailable. Existing deferred rides and outstanding balances are unchanged. Choose another available payment method.';

function createPayLaterOriginationSuspension({ fail }) {
  if (typeof fail !== 'function') throw new TypeError('fail dependency is required');
  // Intentionally has no database dependency and never calls next().
  return function rejectNewPayLaterOrigination(req, res) {
    return fail(res, 409, PAY_LATER_ORIGINATION_UNAVAILABLE_MESSAGE);
  };
}

module.exports = { createPayLaterOriginationSuspension, PAY_LATER_ORIGINATION_UNAVAILABLE_MESSAGE };
