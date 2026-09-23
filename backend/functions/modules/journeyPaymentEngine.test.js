'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isActiveHold, resolvePaymentOutcome } = require('./journeyPaymentEngine');

const expiry = '2026-09-23T19:00:00Z';
const now = '2026-09-23T18:45:00Z';

test('active payment holds remain inventory-protected only before expiry', () => {
  assert.equal(isActiveHold({ status: 'PAYMENT_PENDING', expiresAt: expiry, now }), true);
  assert.equal(isActiveHold({ status: 'PAYMENT_PENDING', expiresAt: '2026-09-23T18:45:00Z', now }), false);
  assert.equal(isActiveHold({ status: 'CONFIRMED', expiresAt: expiry, now }), false);
});

test('verified success confirms active journey holds', () => {
  const result = resolvePaymentOutcome({
    journeyStatus: 'PENDING_PAYMENT',
    paymentStatus: 'PAYMENT_PENDING',
    providerStatus: 'success',
    bookingStatuses: ['PAYMENT_PENDING', 'PAYMENT_PENDING'],
    paymentExpiresAt: expiry,
    now,
  });
  assert.equal(result.journeyStatus, 'CONFIRMED');
  assert.equal(result.paymentStatus, 'PAID');
  assert.equal(result.bookingStatus, 'CONFIRMED');
  assert.equal(result.releaseInventory, false);
});

test('failed payment releases held inventory', () => {
  const result = resolvePaymentOutcome({
    journeyStatus: 'PENDING_PAYMENT',
    paymentStatus: 'PAYMENT_PENDING',
    providerStatus: 'failed',
    bookingStatuses: ['PAYMENT_PENDING'],
    paymentExpiresAt: expiry,
    now,
  });
  assert.equal(result.journeyStatus, 'CANCELLED');
  assert.equal(result.paymentStatus, 'FAILED');
  assert.equal(result.releaseInventory, true);
});

test('expired payment releases held inventory', () => {
  const result = resolvePaymentOutcome({
    journeyStatus: 'PENDING_PAYMENT',
    paymentStatus: 'PAYMENT_PENDING',
    providerStatus: 'pending',
    bookingStatuses: ['PAYMENT_PENDING'],
    paymentExpiresAt: '2026-09-23T18:44:59Z',
    now,
  });
  assert.equal(result.paymentStatus, 'EXPIRED');
  assert.equal(result.releaseInventory, true);
});

test('late successful payment becomes paid but requires refund review after hold release', () => {
  const result = resolvePaymentOutcome({
    journeyStatus: 'CANCELLED',
    paymentStatus: 'PENDING',
    providerStatus: 'success',
    bookingStatuses: ['PAYMENT_FAILED'],
    paymentExpiresAt: '2026-09-23T18:30:00Z',
    now,
  });
  assert.equal(result.outcome, 'LATE_SUCCESS_AFTER_RELEASE');
  assert.equal(result.paymentStatus, 'PAID');
  assert.equal(result.journeyStatus, 'CANCELLED');
  assert.equal(result.refundStatus, 'REQUIRES_REVIEW');
});
