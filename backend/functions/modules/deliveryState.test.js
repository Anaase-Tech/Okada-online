'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDeliveryTransition } = require('./deliveryState');

test('delivery permits only documented progress and retry transitions', () => {
  for (const [from,to] of [
    ['pending','assigned'],
    ['pending','failed'],
    ['assigned','picked_up'],
    ['assigned','failed'],
    ['picked_up','in_transit'],
    ['picked_up','failed'],
    ['in_transit','delivered'],
    ['in_transit','failed'],
    ['failed','assigned'],
  ]) assert.equal(validateDeliveryTransition(from,to), null, from+' -> '+to);
});

test('delivery rejects skipped/reversed transitions and terminal rewrites', () => {
  for (const [from,to] of [
    ['pending','delivered'],
    ['assigned','in_transit'],
    ['in_transit','picked_up'],
    ['delivered','assigned'],
    ['delivered','failed'],
  ]) assert.equal(validateDeliveryTransition(from,to), 'invalid-transition', from+' -> '+to);
});

test('unknown current or next statuses fail closed', () => {
  assert.equal(validateDeliveryTransition('mystery','failed'), 'invalid-transition');
  assert.equal(validateDeliveryTransition('pending','cancelled'), 'unsupported-status');
});
