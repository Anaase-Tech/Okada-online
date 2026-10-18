'use strict';

const DELIVERY_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['assigned','failed']),
  assigned: Object.freeze(['picked_up','failed']),
  picked_up: Object.freeze(['in_transit','failed']),
  in_transit: Object.freeze(['delivered','failed']),
  failed: Object.freeze(['assigned']),
  delivered: Object.freeze([]),
});

const DELIVERY_STATUSES = Object.freeze(Object.keys(DELIVERY_TRANSITIONS));

function validateDeliveryTransition(currentStatus, nextStatus) {
  if (!DELIVERY_STATUSES.includes(nextStatus)) return 'unsupported-status';
  const allowed = DELIVERY_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) return 'invalid-transition';
  return null;
}

module.exports = { DELIVERY_STATUSES, DELIVERY_TRANSITIONS, validateDeliveryTransition };
