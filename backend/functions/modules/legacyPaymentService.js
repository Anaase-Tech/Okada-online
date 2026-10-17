'use strict';

function upper(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

async function findPaymentByReference(tx, db, reference) {
  const snap = await tx.get(
    db.collection('payments').where('reference', '==', String(reference || '')).limit(1)
  );
  return snap.empty ? null : snap.docs[0];
}

async function settleRidePayment({ db, admin, reference, providerData }) {
  if (!reference) throw new Error('Payment reference is required');

  return db.runTransaction(async (tx) => {
    const paymentDoc = await findPaymentByReference(tx, db, reference);
    if (!paymentDoc) throw new Error('Payment record not found');

    const payment = paymentDoc.data();
    const rideId = String(payment.rideId || '');
    if (!rideId) throw new Error('Payment is not linked to a ride');

    const rideRef = db.collection('rides').doc(rideId);
    const rideSnap = await tx.get(rideRef);
    if (!rideSnap.exists) throw new Error('Ride not found');
    const ride = rideSnap.data();
    const ridePaymentStatus = upper(ride.paymentStatus);
    const paymentStatus = upper(payment.status);
    const cashPaid = upper(ride.paymentMethod) === 'CASH'
      && ridePaymentStatus === 'CASH_PAID'
      && upper(ride.status) === 'COMPLETED';
    const anotherReferenceAlreadyPaid = ridePaymentStatus === 'PAID'
      && !!ride.paymentReference
      && String(ride.paymentReference) !== String(reference);

    if (paymentStatus === 'COMPLETED'
        && ridePaymentStatus === 'PAID'
        && String(ride.paymentReference || '') === String(reference)) {
      return { idempotent: true, rideId, paymentStatus: 'paid' };
    }
    if (paymentStatus === 'COMPLETED_REFUND_REVIEW' && (cashPaid || anotherReferenceAlreadyPaid)) {
      return { idempotent: true, rideId, paymentStatus: ridePaymentStatus.toLowerCase(), requiresRefundReview: true };
    }

    const expectedAmount = Number(ride.fare?.total);
    const storedAmount = Number(payment.amount);
    const receivedAmountMinor = Number(providerData?.amount);
    const expectedMinor = Math.round(storedAmount * 100);
    const rideMinor = Math.round(expectedAmount * 100);
    const receivedCurrency = upper(providerData?.currency);

    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      throw new Error('Ride does not have a valid stored fare');
    }
    if (!Number.isFinite(storedAmount) || storedAmount <= 0 || storedAmount !== expectedAmount) {
      throw new Error('Payment amount does not match the stored ride fare');
    }
    if (!Number.isInteger(receivedAmountMinor)
        || receivedAmountMinor !== expectedMinor
        || receivedAmountMinor !== rideMinor
        || receivedCurrency !== 'GHS') {
      throw new Error('Ride payment amount or currency mismatch');
    }

    // Never let a late Paystack success silently override a cash payment or
    // a different already-settled Paystack reference. Track the captured
    // transaction for manual refund reconciliation without changing ride
    // payment status or applying ride earnings a second time.
    if (cashPaid || anotherReferenceAlreadyPaid) {
      tx.update(paymentDoc.ref, {
        status: 'completed_refund_review',
        providerTransactionId: providerData?.id ? String(providerData.id) : null,
        channel: providerData?.channel ? String(providerData.channel).slice(0, 40) : null,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundStatus: 'REQUIRES_REVIEW',
        settlementConflict: cashPaid ? 'ONLINE_SUCCESS_AFTER_CASH_PAID' : 'MULTIPLE_ONLINE_SUCCESSES_FOR_RIDE',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(db.collection('notifications').doc(), {
        type: 'payment_refund_review',
        message: cashPaid
          ? 'A Paystack payment succeeded after this ride was recorded as cash-paid. Review for possible refund.'
          : 'More than one Paystack payment succeeded for the same ride. Review for possible refund.',
        rideId,
        paymentReference: String(reference),
        refundStatus: 'REQUIRES_REVIEW',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return {
        idempotent: false,
        rideId,
        paymentStatus: ridePaymentStatus.toLowerCase(),
        requiresRefundReview: true,
      };
    }

    const cashFallbackPending = upper(ride.paymentMethod) === 'CASH'
      && ridePaymentStatus === 'CASH_AWAITING_DRIVER';
    let cashPaymentDoc = null;
    if (cashFallbackPending && ride.cashPaymentReference) {
      cashPaymentDoc = await findPaymentByReference(tx, db, ride.cashPaymentReference);
    }

    tx.update(paymentDoc.ref, {
      status: 'completed',
      purpose: 'ride',
      providerTransactionId: providerData?.id ? String(providerData.id) : null,
      channel: providerData?.channel ? String(providerData.channel).slice(0, 40) : null,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.update(rideRef, {
      paymentStatus: 'paid',
      paymentMethod: 'paystack',
      payMethod: 'paystack',
      paymentReference: String(reference),
      ...(cashFallbackPending ? {
        cashFallbackStatus: 'CANCELLED_ONLINE_PAYMENT_SUCCEEDED',
      } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (cashPaymentDoc && upper(cashPaymentDoc.data().status) === 'CASH_PENDING_CONFIRMATION') {
      tx.update(cashPaymentDoc.ref, {
        status: 'cancelled_online_payment_succeeded',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (cashFallbackPending) {
      tx.set(db.collection('notifications').doc(), {
        userId: ride.userId,
        type: 'cash_fallback_cancelled',
        message: 'Your online payment was verified. Do not pay this ride in cash as well.',
        rideId,
        paymentReference: String(reference),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (ride.driverId) {
        tx.set(db.collection('notifications').doc(), {
          driverId: ride.driverId,
          type: 'cash_fallback_cancelled',
          message: 'Online payment was verified for this ride. Do not collect cash for the same fare.',
          rideId,
          paymentReference: String(reference),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    return { idempotent: false, rideId, paymentStatus: 'paid', cashFallbackCancelled: cashFallbackPending };
  });
}

async function markRidePaymentFailed({ db, admin, reference, reason, providerStatus }) {
  return db.runTransaction(async (tx) => {
    const paymentDoc = reference ? await findPaymentByReference(tx, db, reference) : null;
    if (!paymentDoc) throw new Error('Payment record not found');

    const payment = paymentDoc.data();
    const currentStatus = upper(payment.status);
    if (['COMPLETED', 'COMPLETED_REFUND_REVIEW'].includes(currentStatus)) {
      return { paymentStatus: currentStatus.toLowerCase(), idempotent: true };
    }

    const terminalStatus = upper(providerStatus) === 'ABANDONED' ? 'abandoned' : 'failed';
    const rideId = String(payment.rideId || '');
    const rideRef = rideId ? db.collection('rides').doc(rideId) : null;
    const rideSnap = rideRef ? await tx.get(rideRef) : null;

    tx.update(paymentDoc.ref, {
      status: terminalStatus,
      providerStatus: terminalStatus,
      failureReason: String(reason || 'Payment was not completed').slice(0, 300),
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (rideSnap?.exists) {
      const ride = rideSnap.data();
      if (String(ride.paymentReference || '') === String(reference)
          && upper(ride.paymentMethod) !== 'CASH'
          && upper(ride.paymentStatus) !== 'PAID') {
        tx.update(rideRef, {
          paymentStatus: terminalStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    return { paymentStatus: terminalStatus };
  });
}

module.exports = {
  findPaymentByReference,
  settleRidePayment,
  markRidePaymentFailed,
};
