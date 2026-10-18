'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeliveryTrackingCode, toPublicDeliveryTrackingDto } = require('./deliveryPrivacy');

test('delivery tracking code uses a 128-bit uppercase random bearer reference', () => {
  const a = createDeliveryTrackingCode();
  const b = createDeliveryTrackingCode();
  assert.match(a, /^DLV-[A-F0-9]{32}$/);
  assert.match(b, /^DLV-[A-F0-9]{32}$/);
  assert.notEqual(a, b);
});

test('public tracking DTO includes progress fields only, not personal or internal delivery data', () => {
  const dto = toPublicDeliveryTrackingDto({
    id: 'internal-id',
    trackingCode: 'DLV-123',
    status: 'picked_up',
    pickupAddress: 'Town Centre',
    deliveryAddress: 'Station Road',
    vehicleType: 'motorcycle',
    pickedUpAt: 'time1',
    deliveredAt: null,
    senderId: 'sender-user-id',
    recipientName: 'Private Person',
    recipientPhone: '+233000000000',
    driverId: 'driver-id',
    proofOfDelivery: 'photo-reference',
    fare: 99,
    payMethod: 'wallet',
    packageDesc: 'Sensitive contents',
    weightKg: 12,
  });
  assert.deepEqual(dto, {
    trackingCode: 'DLV-123',
    status: 'picked_up',
    pickupAddress: 'Town Centre',
    deliveryAddress: 'Station Road',
    vehicleType: 'motorcycle',
    pickedUpAt: 'time1',
    deliveredAt: null,
  });
  for (const forbidden of ['id','senderId','recipientName','recipientPhone','driverId','proofOfDelivery','fare','payMethod','packageDesc','weightKg']) {
    assert.equal(Object.hasOwn(dto, forbidden), false, forbidden);
  }
});
