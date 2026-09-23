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

async function settleRidePayment({
  db,
  admin,
  reference,
  providerData,
}) {
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
    if (upper(payment.status) === 'COMPLETED' && upper(ride.paymentStatus) === 'PAID') {
      return { idempotent: true, rideId, paymentStatus: 'paid' };
    }

    const expectedAmount = Number(ride.fare?.total);
    const storedAmount = Number(payment.amount);
    const receivedAmountMinor = Number(providerData?.amount);
    const expectedMinor = Math.round(storedAmount * 100);
    const rideMinor = Math.round(expectedAmount * 100);
    const receivedCurrency = upper(providerData?.currency);

    if (!Number.isFinite(expectedAmount) || expectedAmount < 0) {
      throw new Error('Ride does not have a valid stored fare');
    }
    if (!Number.isFinite(storedAmount) || storedAmount < 0 || storedAmount !== expectedAmount) {
      throw new Error('Payment amount does not match the stored ride fare');
    }
    if (!Number.isInteger(receivedAmountMinor) || receivedAmountMinor !== expectedMinor || receivedAmountMinor !== rideMinor || receivedCurrency !== 'GHS') {
      throw new Error('Ride payment amount or currency mismatch');
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
      paymentReference: String(reference),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { idempotent: false, rideId, paymentStatus: 'paid' };
  });
}

async function markRidePaymentFailed({ db, admin, reference, reason }) {
  return db.runTransaction(async (tx) => {
    const paymentDoc = reference ? await findPaymentByReference(tx, db, reference) : null;
    if (!paymentDoc) throw new Error('Payment record not found');

    if (upper(paymentDoc.data().status) !== 'COMPLETED') {
      tx.update(paymentDoc.ref, {
        status: 'failed',
        failureReason: String(reason || 'Payment was not completed').slice(0, 300),
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { paymentStatus: 'failed' };
  });
}

module.exports = {
  findPaymentByReference,
  settleRidePayment,
  markRidePaymentFailed,
};
