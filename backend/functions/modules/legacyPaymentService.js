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

    const payLaterSnap = await tx.get(db.collection('pay_later').where('rideId', '==', rideId));
    const payLaterRecords = payLaterSnap.docs.map((doc) => ({ ref: doc.ref, data: doc.data() }));
    const activePayLater = payLaterRecords.find((item) => ['DEFERRED', 'OVERDUE'].includes(upper(item.data.status)));
    const repaidPayLater = payLaterRecords.find((item) => upper(item.data.status) === 'PAID');

    if (paymentStatus === 'COMPLETED'
        && ridePaymentStatus === 'PAID'
        && String(ride.paymentReference || '') === String(reference)) {
      return { idempotent: true, rideId, paymentStatus: 'paid' };
    }
    if (paymentStatus === 'COMPLETED_REFUND_REVIEW'
        && (cashPaid || anotherReferenceAlreadyPaid || repaidPayLater)) {
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

    // If another method has already settled this ride, don't rewrite the ride
    // or apply financial side effects again. The additional successful charge
    // is a reconciliation case for an administrator, not an automatic refund.
    if (cashPaid || anotherReferenceAlreadyPaid || repaidPayLater) {
      const conflict = cashPaid
        ? 'ONLINE_SUCCESS_AFTER_CASH_PAID'
        : anotherReferenceAlreadyPaid
          ? 'MULTIPLE_ONLINE_SUCCESSES_FOR_RIDE'
          : 'ONLINE_SUCCESS_AFTER_PAY_LATER_REPAID';
      tx.update(paymentDoc.ref, {
        status: 'completed_refund_review',
        providerTransactionId: providerData?.id ? String(providerData.id) : null,
        channel: providerData?.channel ? String(providerData.channel).slice(0, 40) : null,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundStatus: 'REQUIRES_REVIEW',
        settlementConflict: conflict,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(db.collection('notifications').doc(), {
        type: 'payment_refund_review',
        message: cashPaid
          ? 'A Paystack payment succeeded after this ride was recorded as cash-paid. Review for possible refund.'
          : anotherReferenceAlreadyPaid
            ? 'More than one Paystack payment succeeded for the same ride. Review for possible refund.'
            : 'A Paystack payment succeeded after the Pay Later balance was already repaid. Review for possible refund.',
        rideId,
        paymentReference: String(reference),
        refundStatus: 'REQUIRES_REVIEW',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { idempotent: false, rideId, paymentStatus: ridePaymentStatus.toLowerCase(), requiresRefundReview: true };
    }

    const cashFallbackPending = upper(ride.paymentMethod) === 'CASH'
      && ridePaymentStatus === 'CASH_AWAITING_DRIVER';
    const payLaterPending = !!activePayLater
      && upper(ride.paymentMethod) === 'PAY_LATER'
      && ridePaymentStatus === 'DEFERRED';
    let cashPaymentDoc = null;
    if (cashFallbackPending && ride.cashPaymentReference) {
      cashPaymentDoc = await findPaymentByReference(tx, db, ride.cashPaymentReference);
    }

    let payLaterUserRef = null;
    if (payLaterPending) {
      const profileCollection = String(activePayLater.data.userCollection || 'users');
      if (!activePayLater.data.userId || Number(activePayLater.data.amount) <= 0) {
        throw new Error('Pay Later record is inconsistent');
      }
      payLaterUserRef = db.collection(profileCollection).doc(String(activePayLater.data.userId));
      const payLaterUserSnap = await tx.get(payLaterUserRef);
      if (!payLaterUserSnap.exists) throw new Error('Pay Later passenger profile not found');
      const used = Number(payLaterUserSnap.data()?.payLater?.used || 0);
      const owed = Number(activePayLater.data.amount);
      if (!Number.isFinite(used) || used < owed) throw new Error('Pay Later limit ledger is inconsistent');
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
      ...(cashFallbackPending ? { cashFallbackStatus: 'CANCELLED_ONLINE_PAYMENT_SUCCEEDED' } : {}),
      ...(payLaterPending ? { payLaterStatus: 'CANCELLED_ONLINE_PAYMENT_SUCCEEDED' } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (cashPaymentDoc && upper(cashPaymentDoc.data().status) === 'CASH_PENDING_CONFIRMATION') {
      tx.update(cashPaymentDoc.ref, {
        status: 'cancelled_online_payment_succeeded',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (payLaterPending) {
      tx.update(activePayLater.ref, {
        status: 'cancelled_online_payment_succeeded',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancellationReason: 'Online payment verified before Pay Later repayment',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(payLaterUserRef, {
        'payLater.used': admin.firestore.FieldValue.increment(-Number(activePayLater.data.amount)),
      });
    }

    if (cashFallbackPending || payLaterPending) {
      tx.set(db.collection('notifications').doc(), {
        userId: ride.userId,
        type: cashFallbackPending ? 'cash_fallback_cancelled' : 'pay_later_cancelled',
        message: cashFallbackPending
          ? 'Your online payment was verified. Do not pay this ride in cash as well.'
          : 'Your online payment was verified. The Pay Later balance for this ride has been cancelled.',
        rideId,
        paymentReference: String(reference),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (ride.driverId) {
        tx.set(db.collection('notifications').doc(), {
          driverId: ride.driverId,
          type: 'online_payment_verified',
          message: 'Online payment was verified for this ride. Do not collect cash or expect a Pay Later charge for the same fare.',
          rideId,
          paymentReference: String(reference),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    return {
      idempotent: false,
      rideId,
      paymentStatus: 'paid',
      cashFallbackCancelled: cashFallbackPending,
      payLaterCancelled: payLaterPending,
    };
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
          && !['CASH', 'PAY_LATER'].includes(upper(ride.paymentMethod))
          && !['PAID', 'DEFERRED'].includes(upper(ride.paymentStatus))) {
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
