'use strict';

const DEFAULT_EVENT_DEPOSIT_PERCENT = 0.30;
const EVENT_DEPOSIT_PERCENT_ERROR =
  'depositPercent must be greater than 0 and no greater than 1; omit it to use the default 30% deposit.';

function parseEventDepositPercent(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return { valid: true, value: DEFAULT_EVENT_DEPOSIT_PERCENT, usesDefault: true };
  }

  if (typeof rawValue !== 'number' && typeof rawValue !== 'string') {
    return { valid: false, value: null, usesDefault: false };
  }
  if (typeof rawValue === 'string' && rawValue.trim() === '') {
    return { valid: false, value: null, usesDefault: false };
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    return { valid: false, value: null, usesDefault: false };
  }

  return { valid: true, value, usesDefault: false };
}

/**
 * Creates the MaaS event-booking endpoint handler.
 *
 * The deposit percentage is a fraction (for example, 0.30 = 30%).
 * Omitted/null percentages retain the existing 30% default; supplied values
 * must be finite and inside (0, 1]. Event creation and wallet accounting are
 * committed in one Firestore transaction so a partial booking/debit cannot
 * occur, and the current wallet balance is checked inside that transaction.
 */
function createEventBookingHandler({
  resolveUserRef,
  db,
  admin,
  ok,
  fail,
  sanitize,
  scheduledPricing,
}) {
  if (
    typeof resolveUserRef !== 'function' ||
    !db ||
    typeof db.runTransaction !== 'function' ||
    !admin?.firestore?.FieldValue ||
    typeof ok !== 'function' ||
    typeof fail !== 'function' ||
    typeof sanitize !== 'function' ||
    !scheduledPricing
  ) {
    throw new TypeError('Event booking handler dependencies are required');
  }

  return async function bookEventRide(req, res) {
    try {
      const {
        userId,
        eventName,
        eventDate,
        pickupAddress,
        destAddress,
        vehicleType,
        passengers,
        notes,
        depositPercent,
      } = req.body || {};

      if (!userId) return fail(res, 400, 'userId is required');

      const parsedPercent = parseEventDepositPercent(depositPercent);
      if (!parsedPercent.valid) {
        return fail(res, 400, EVENT_DEPOSIT_PERCENT_ERROR);
      }

      const pricing = scheduledPricing[sanitize(vehicleType)] || scheduledPricing.car;
      if (
        !pricing ||
        !Number.isFinite(Number(pricing.flag)) ||
        !Number.isFinite(Number(pricing.perKm))
      ) {
        return fail(res, 500, 'Event booking pricing configuration is invalid');
      }

      const estimatedFare = +(Number(pricing.flag) + 15 * Number(pricing.perKm)).toFixed(2);
      if (!Number.isFinite(estimatedFare) || estimatedFare <= 0) {
        return fail(res, 500, 'Event booking estimated fare is invalid');
      }

      const deposit = +(estimatedFare * parsedPercent.value).toFixed(2);
      if (!Number.isFinite(deposit) || deposit <= 0 || deposit > estimatedFare) {
        return fail(res, 400, 'Calculated event deposit is invalid');
      }

      const user = await resolveUserRef(userId, req);
      if (!user) return fail(res, 404, 'User not found');

      // Generate the record reference without writing. The event record and
      // wallet debit/pending credit are committed together below.
      const eventRef = db.collection('event_rides').doc();
      const safeEventName = sanitize(eventName);
      const safeEventDate = sanitize(eventDate);
      const eventRecord = {
        userId: sanitize(userId),
        eventName: safeEventName,
        eventDate: safeEventDate,
        pickupAddress: sanitize(pickupAddress),
        destAddress: sanitize(destAddress),
        vehicleType: sanitize(vehicleType),
        passengers: parseInt(passengers, 10) || 1,
        notes: sanitize(notes || ''),
        estimatedFare,
        deposit,
        balanceDue: +(estimatedFare - deposit).toFixed(2),
        status: 'confirmed',
        driverId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const result = await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(user.ref);
        if (!userSnap.exists) return { blocked: 'user-not-found' };

        // Profile ownership was resolved before the transaction to find the
        // document. Recheck it against the fresh transactional snapshot so
        // a reassignment between lookup and debit cannot authorize stale access.
        const freshProfile = userSnap.data() || {};
        if (
          req.isAdmin !== true &&
          freshProfile.firebaseUid !== req.uid &&
          user.ref.id !== req.uid
        ) {
          return { blocked: 'not-authorized' };
        }

        const wallet = freshProfile.wallet || {};
        const rawAvailable = wallet.available;
        const rawPending = wallet.pending;
        const availableMissing = rawAvailable === undefined || rawAvailable === null;
        const pendingMissing = rawPending === undefined || rawPending === null;

        // Firestore FieldValue.increment() replaces a non-numeric field with
        // the increment operand. Never coerce stored balances such as "100":
        // doing so could turn an existing string balance into a negative
        // numeric value during the atomic wallet movement.
        if (
          (!availableMissing &&
            (typeof rawAvailable !== 'number' || !Number.isFinite(rawAvailable) || rawAvailable < 0)) ||
          (!pendingMissing &&
            (typeof rawPending !== 'number' || !Number.isFinite(rawPending) || rawPending < 0))
        ) {
          return { blocked: 'invalid-wallet-balance' };
        }

        const available = availableMissing ? 0 : rawAvailable;
        if (available < deposit) {
          return { blocked: 'insufficient-balance' };
        }

        // These writes are atomic: either the event record and both wallet
        // balance movements commit, or none of them do.
        tx.create(eventRef, eventRecord);
        tx.update(user.ref, {
          'wallet.available': admin.firestore.FieldValue.increment(-deposit),
          'wallet.pending': admin.firestore.FieldValue.increment(deposit),
        });
        return { created: true };
      });

      if (result?.blocked === 'user-not-found') {
        return fail(res, 404, 'User not found');
      }
      if (result?.blocked === 'not-authorized') {
        return fail(res, 403, 'Profile ownership changed; event booking is not authorized');
      }
      if (result?.blocked === 'invalid-wallet-balance') {
        return fail(res, 409, 'Wallet balance is invalid; event booking cannot be processed');
      }
      if (result?.blocked === 'insufficient-balance') {
        return fail(res, 400, `Deposit required: GH₵${deposit}`);
      }

      return ok(res, {
        eventRideId: eventRef.id,
        eventName: safeEventName,
        eventDate: safeEventDate,
        estimatedFare,
        deposit,
        balanceDue: eventRecord.balanceDue,
        message: `Event ride confirmed for ${safeEventDate}. Driver assigned 24hrs before event.`,
      });
    } catch (error) {
      return fail(res, 500, error.message);
    }
  };
}

module.exports = {
  DEFAULT_EVENT_DEPOSIT_PERCENT,
  EVENT_DEPOSIT_PERCENT_ERROR,
  parseEventDepositPercent,
  createEventBookingHandler,
};
