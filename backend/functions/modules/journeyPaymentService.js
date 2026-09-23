'use strict';

const {
  resolvePaymentOutcome,
  toDate,
} = require('./journeyPaymentEngine');

function asUpper(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function holdExpiryTimestamp(admin, minutes = 15) {
  const expiry = new Date(Date.now() + Math.max(1, Number(minutes) || 15) * 60000);
  return admin.firestore.Timestamp.fromDate(expiry);
}

async function findPaymentByReference(tx, db, reference) {
  const snap = await tx.get(
    db.collection('payments').where('reference', '==', String(reference || '')).limit(1)
  );
  return snap.empty ? null : snap.docs[0];
}

async function settleSuccessfulJourneyPayment({
  db,
  admin,
  journeyId,
  reference,
  providerData,
}) {
  if (!journeyId || !reference) throw new Error('Journey payment reference is required');

  return db.runTransaction(async (tx) => {
    const journeyRef = db.collection('journeys').doc(String(journeyId));
    const journeySnap = await tx.get(journeyRef);
    if (!journeySnap.exists) throw new Error('Journey not found');

    const paymentDoc = await findPaymentByReference(tx, db, reference);
    if (!paymentDoc) throw new Error('Journey payment record not found');

    const journey = journeySnap.data();
    const payment = paymentDoc.data();

    if (payment.purpose !== 'journey' || String(payment.journeyId) !== String(journeyId)) {
      throw new Error('Payment does not belong to this Journey');
    }

    const expectedAmountMinor = Math.round(Number(payment.amount || 0) * 100);
    const receivedAmountMinor = Number(providerData?.amount);
    const receivedCurrency = asUpper(providerData?.currency);

    if (!Number.isInteger(receivedAmountMinor) || receivedAmountMinor !== expectedAmountMinor || receivedCurrency !== 'GHS') {
      throw new Error('Journey payment amount or currency mismatch');
    }

    if (asUpper(payment.status) === 'COMPLETED' && asUpper(journey.paymentStatus) === 'PAID') {
      return {
        idempotent: true,
        journeyStatus: journey.status,
        paymentStatus: journey.paymentStatus,
        bookingIds: journey.bookingIds || [],
      };
    }

    const bookingIds = Array.isArray(journey.bookingIds) ? journey.bookingIds : [];
    const bookingRefs = bookingIds.map((id) => db.collection('transitBookings').doc(String(id)));
    const bookingSnaps = await Promise.all(bookingRefs.map((ref) => tx.get(ref)));
    const expiry = toDate(journey.paymentExpiresAt);

    const outcome = resolvePaymentOutcome({
      journeyStatus: journey.status,
      paymentStatus: journey.paymentStatus,
      providerStatus: 'success',
      bookingStatuses: bookingSnaps.map((snap) => snap.exists ? snap.data().status : 'MISSING'),
      paymentExpiresAt: expiry,
    });

    const tripRefsById = new Map();
    for (let i = 0; i < bookingSnaps.length; i += 1) {
      const snap = bookingSnaps[i];
      if (!snap.exists) continue;
      const booking = snap.data();
      if (booking.tripId) tripRefsById.set(String(booking.tripId), db.collection('transitTrips').doc(String(booking.tripId)));
    }

    const tripRefs = [...tripRefsById.values()];
    const tripSnaps = await Promise.all(tripRefs.map((ref) => tx.get(ref)));

    for (const snap of bookingSnaps) {
      if (!snap.exists) continue;
      const booking = snap.data();
      const status = asUpper(booking.status);

      if (outcome.releaseInventory && status === 'PAYMENT_PENDING') {
        tx.update(snap.ref, {
          status: outcome.bookingStatus,
          releasedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else if (!outcome.releaseInventory && status === 'PAYMENT_PENDING') {
        tx.update(snap.ref, {
          status: 'CONFIRMED',
          paymentConfirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    if (outcome.releaseInventory) {
      for (const tripSnap of tripSnaps) {
        if (tripSnap.exists) {
          tx.update(tripSnap.ref, {
            inventoryVersion: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }

    tx.update(paymentDoc.ref, {
      status: 'completed',
      providerTransactionId: providerData?.id ? String(providerData.id) : null,
      channel: providerData?.channel ? String(providerData.channel).slice(0, 40) : null,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const journeyUpdate = {
      paymentStatus: outcome.paymentStatus,
      paymentReference: String(reference),
      paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (outcome.journeyStatus) journeyUpdate.status = outcome.journeyStatus;
    if (outcome.refundStatus) journeyUpdate.refundStatus = outcome.refundStatus;
    if (outcome.outcome === 'LATE_SUCCESS_AFTER_RELEASE') {
      journeyUpdate.paymentOutcome = outcome.outcome;
      journeyUpdate.paymentFailureReason = 'Payment succeeded after the Journey inventory hold was released';
    }

    tx.update(journeyRef, journeyUpdate);

    return {
      idempotent: false,
      outcome: outcome.outcome,
      journeyStatus: outcome.journeyStatus,
      paymentStatus: outcome.paymentStatus,
      refundStatus: outcome.refundStatus,
      bookingIds,
    };
  });
}

async function settleFailedJourneyPayment({
  db,
  admin,
  journeyId,
  reference,
  failureReason = 'Payment was not completed',
  paymentStatus = 'FAILED',
}) {
  return db.runTransaction(async (tx) => {
    const journeyRef = db.collection('journeys').doc(String(journeyId));
    const journeySnap = await tx.get(journeyRef);
    if (!journeySnap.exists) throw new Error('Journey not found');

    const paymentDoc = reference
      ? await findPaymentByReference(tx, db, reference)
      : null;

    const journey = journeySnap.data();
    const bookingIds = Array.isArray(journey.bookingIds) ? journey.bookingIds : [];
    const bookingRefs = bookingIds.map((id) => db.collection('transitBookings').doc(String(id)));
    const bookingSnaps = await Promise.all(bookingRefs.map((ref) => tx.get(ref)));

    const tripRefById = new Map();
    for (const snap of bookingSnaps) {
      if (snap.exists && snap.data().tripId) {
        tripRefById.set(String(snap.data().tripId), db.collection('transitTrips').doc(String(snap.data().tripId)));
      }
    }
    const tripRefs = [...tripRefById.values()];
    const tripSnaps = await Promise.all(tripRefs.map((ref) => tx.get(ref)));

    for (const snap of bookingSnaps) {
      if (snap.exists && asUpper(snap.data().status) === 'PAYMENT_PENDING') {
        tx.update(snap.ref, {
          status: paymentStatus === 'EXPIRED' ? 'EXPIRED' : 'PAYMENT_FAILED',
          releasedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    for (const tripSnap of tripSnaps) {
      if (tripSnap.exists) {
        tx.update(tripSnap.ref, {
          inventoryVersion: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    if (paymentDoc) {
      const existingStatus = asUpper(paymentDoc.data().status);
      if (existingStatus !== 'COMPLETED') {
        tx.update(paymentDoc.ref, {
          status: paymentStatus === 'EXPIRED' ? 'expired' : 'failed',
          failureReason: String(failureReason).slice(0, 300),
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    tx.update(journeyRef, {
      status: 'CANCELLED',
      paymentStatus,
      paymentFailureReason: String(failureReason).slice(0, 300),
      refundStatus: paymentStatus === 'FAILED' ? 'NOT_APPLICABLE' : 'NOT_APPLICABLE',
      expiredAt: paymentStatus === 'EXPIRED' ? admin.firestore.FieldValue.serverTimestamp() : null,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      journeyStatus: 'CANCELLED',
      paymentStatus,
      releasedBookingCount: bookingSnaps.filter((snap) => snap.exists && asUpper(snap.data().status) === 'PAYMENT_PENDING').length,
    };
  });
}

module.exports = {
  holdExpiryTimestamp,
  findPaymentByReference,
  settleSuccessfulJourneyPayment,
  settleFailedJourneyPayment,
};
