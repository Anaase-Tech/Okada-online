'use strict';

const PAYMENT_STATUSES = new Set([
  'PENDING',
  'PAYMENT_PENDING',
  'PAID',
  'FAILED',
  'EXPIRED',
]);

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isActiveHold({ status, expiresAt, now = new Date() }) {
  const normalized = String(status || '').toUpperCase();
  if (normalized !== 'PAYMENT_PENDING') return false;
  const expiry = toDate(expiresAt);
  const current = toDate(now) || new Date();
  return !!expiry && expiry.getTime() > current.getTime();
}

function resolvePaymentOutcome({
  journeyStatus,
  paymentStatus,
  providerStatus,
  bookingStatuses = [],
  paymentExpiresAt = null,
  now = new Date(),
}) {
  const journey = String(journeyStatus || '').toUpperCase();
  const currentPayment = String(paymentStatus || '').toUpperCase();
  const provider = String(providerStatus || '').toLowerCase();
  const holdsActive = bookingStatuses.length > 0
    && bookingStatuses.every((status) => isActiveHold({ status, expiresAt: paymentExpiresAt, now }));

  if (currentPayment === 'PAID') {
    return {
      journeyStatus: journey,
      paymentStatus: 'PAID',
      bookingStatus: 'CONFIRMED',
      releaseInventory: false,
      refundStatus: journey === 'CANCELLED' ? 'REQUIRES_REVIEW' : null,
      outcome: 'ALREADY_PAID',
    };
  }

  if (provider === 'success') {
    if (journey === 'CANCELLED' || !holdsActive) {
      return {
        journeyStatus: 'CANCELLED',
        paymentStatus: 'PAID',
        bookingStatus: 'REQUIRES_REVIEW',
        releaseInventory: true,
        refundStatus: 'REQUIRES_REVIEW',
        outcome: 'LATE_SUCCESS_AFTER_RELEASE',
      };
    }
    return {
      journeyStatus: journey === 'PENDING_PAYMENT' ? 'CONFIRMED' : journey,
      paymentStatus: 'PAID',
      bookingStatus: 'CONFIRMED',
      releaseInventory: false,
      refundStatus: null,
      outcome: 'SUCCESS',
    };
  }

  if (provider === 'failed' || provider === 'abandoned') {
    return {
      journeyStatus: 'CANCELLED',
      paymentStatus: 'FAILED',
      bookingStatus: 'PAYMENT_FAILED',
      releaseInventory: true,
      refundStatus: 'NOT_APPLICABLE',
      outcome: 'FAILED',
    };
  }

  const expiry = toDate(paymentExpiresAt);
  const current = toDate(now) || new Date();
  if (
    ['PENDING', 'PAYMENT_PENDING'].includes(currentPayment)
    && expiry
    && expiry.getTime() <= current.getTime()
  ) {
    return {
      journeyStatus: 'CANCELLED',
      paymentStatus: 'EXPIRED',
      bookingStatus: 'EXPIRED',
      releaseInventory: true,
      refundStatus: 'NOT_APPLICABLE',
      outcome: 'EXPIRED',
    };
  }

  return {
    journeyStatus: journey,
    paymentStatus: currentPayment,
    bookingStatus: 'PAYMENT_PENDING',
    releaseInventory: false,
    refundStatus: null,
    outcome: 'PENDING',
  };
}

module.exports = {
  PAYMENT_STATUSES,
  toDate,
  isActiveHold,
  resolvePaymentOutcome,
};
