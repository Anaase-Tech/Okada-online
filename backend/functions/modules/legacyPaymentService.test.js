'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { settleRidePayment } = require('./legacyPaymentService');

function createHarness({ ride, payment, payLater = [] }) {
  const state = {
    rides: { ride1: { ...ride } },
    payments: { payment1: { ...payment } },
    pay_later: Object.fromEntries(payLater.map((item, n) => ['pl' + n, { ...item }])),
    notifications: {},
  };
  let nextId = 0;
  const ref = (collection, id) => ({ collection, id });
  const query = (collection, filters = [], max = Infinity) => ({
    __query: true,
    collection,
    filters,
    max,
    where(field, op, value) { return query(collection, filters.concat([[field, op, value]]), max); },
    limit(value) { return query(collection, filters, value); },
  });
  const db = {
    collection(collection) {
      return {
        doc(id) { return ref(collection, id || ('auto' + (++nextId))); },
        where(field, op, value) { return query(collection, [[field, op, value]]); },
      };
    },
    runTransaction(callback) { return callback(tx); },
  };
  const tx = {
    async get(target) {
      if (target.__query) {
        let docs = Object.entries(state[target.collection] || {}).filter(([, data]) =>
          target.filters.every(([field, op, value]) => op === '==' && data[field] === value)
        );
        docs = docs.slice(0, target.max);
        return {
          empty: docs.length === 0,
          docs: docs.map(([id, data]) => ({ id, ref: ref(target.collection, id), data: () => data })),
        };
      }
      const data = state[target.collection]?.[target.id];
      return { exists: !!data, data: () => data, ref: target };
    },
    update(target, patch) { Object.assign(state[target.collection][target.id], patch); },
    set(target, data) { state[target.collection][target.id] = { ...data }; },
  };
  const admin = { firestore: { FieldValue: { serverTimestamp: () => 'TEST_TIMESTAMP', increment: (amount) => amount } } };
  return { db, admin, state };
}

test('late Paystack success after ride cancellation is flagged for refund review without resurrecting ride', async () => {
  const h = createHarness({
    ride: {
      status: 'cancelled',
      paymentStatus: 'failed',
      paymentMethod: 'paystack',
      paymentReference: 'pay-ref',
      userId: 'user1',
      fare: { total: 12.5 },
    },
    payment: {
      rideId: 'ride1',
      passengerId: 'user1',
      amount: 12.5,
      currency: 'GHS',
      provider: 'paystack',
      purpose: 'ride',
      reference: 'pay-ref',
      status: 'pending',
    },
  });
  const first = await settleRidePayment({
    db: h.db, admin: h.admin, reference: 'pay-ref',
    providerData: { amount: 1250, currency: 'GHS', status: 'success', id: 44, channel: 'card' },
  });
  assert.equal(first.requiresRefundReview, true);
  assert.equal(h.state.rides.ride1.status, 'cancelled');
  assert.equal(h.state.rides.ride1.paymentStatus, 'failed');
  assert.equal(h.state.payments.payment1.status, 'completed_refund_review');
  assert.equal(h.state.payments.payment1.settlementConflict, 'ONLINE_SUCCESS_AFTER_RIDE_CANCELLED');
  assert.equal(Object.keys(h.state.notifications).length, 1);

  const second = await settleRidePayment({
    db: h.db, admin: h.admin, reference: 'pay-ref',
    providerData: { amount: 1250, currency: 'GHS', status: 'success', id: 44, channel: 'card' },
  });
  assert.equal(second.idempotent, true);
  assert.equal(h.state.rides.ride1.status, 'cancelled');
  assert.equal(Object.keys(h.state.notifications).length, 1);
});

test('verified Paystack success on an active ride still marks payment paid', async () => {
  const h = createHarness({
    ride: {
      status: 'in_progress',
      paymentStatus: 'pending',
      paymentMethod: 'paystack',
      paymentReference: 'pay-ref',
      userId: 'user1',
      fare: { total: 12.5 },
    },
    payment: {
      rideId: 'ride1', passengerId: 'user1', amount: 12.5,
      currency: 'GHS', provider: 'paystack', purpose: 'ride',
      reference: 'pay-ref', status: 'pending',
    },
  });
  const result = await settleRidePayment({
    db: h.db, admin: h.admin, reference: 'pay-ref',
    providerData: { amount: 1250, currency: 'GHS', status: 'success', id: 44, channel: 'card' },
  });
  assert.equal(result.paymentStatus, 'paid');
  assert.equal(h.state.rides.ride1.status, 'in_progress');
  assert.equal(h.state.rides.ride1.paymentStatus, 'paid');
  assert.equal(h.state.payments.payment1.status, 'completed');
});
