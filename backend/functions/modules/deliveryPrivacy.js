'use strict';

const crypto = require('crypto');

function createDeliveryTrackingCode() {
  // 128 bits of cryptographically secure randomness; never derived from time or IDs.
  return 'DLV-' + crypto.randomBytes(16).toString('hex').toUpperCase();
}

// This endpoint is public by design: the code is a bearer capability. Return
// only progress fields needed by the tracking screen, never the full Firestore
// record (which also contains sender/recipient contacts, driver IDs, fare and
// package/payment metadata).
function toPublicDeliveryTrackingDto(record = {}) {
  return {
    trackingCode: typeof record.trackingCode === 'string' ? record.trackingCode : '',
    status: typeof record.status === 'string' ? record.status : 'unknown',
    pickupAddress: typeof record.pickupAddress === 'string' ? record.pickupAddress : '',
    deliveryAddress: typeof record.deliveryAddress === 'string' ? record.deliveryAddress : '',
    vehicleType: typeof record.vehicleType === 'string' ? record.vehicleType : '',
    pickedUpAt: record.pickedUpAt ?? null,
    deliveredAt: record.deliveredAt ?? null,
  };
}

module.exports = { createDeliveryTrackingCode, toPublicDeliveryTrackingDto };
