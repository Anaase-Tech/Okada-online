'use strict';

const {
  validateServiceClass,
  validateSegment,
  isConnectionFeasible,
} = require('./transitEngine');

function createTransitBookingRouter({ express, db, admin, requireAuth, fail, ok, sanitize }) {
  const router = express.Router();
  const clean = (v, max = 160) => sanitize(String(v == null ? '' : v).trim()).slice(0, max);
  const ACTIVE_STATUSES = ['PAYMENT_PENDING', 'CONFIRMED', 'BOARDED'];

  function isActivePaymentHold(booking) {
    if (String(booking?.status || '').toUpperCase() !== 'PAYMENT_PENDING') return true;
    const expiry = booking?.paymentExpiresAt?.toDate
      ? booking.paymentExpiresAt.toDate()
      : new Date(booking?.paymentExpiresAt || 0);
    return !Number.isNaN(expiry.getTime()) && expiry.getTime() > Date.now();
  }

  function ticketCode(id) {
    return `OKV-${id.slice(0, 10).toUpperCase()}`;
  }

  async function loadTripAndRoute(tx, tripId) {
    const tripRef = db.collection('transitTrips').doc(clean(tripId, 120));
    const tripSnap = await tx.get(tripRef);
    if (!tripSnap.exists) throw new Error('Transit trip not found');
    const trip = tripSnap.data();
    const routeRef = db.collection('transitRoutes').doc(clean(trip.routeId, 120));
    const routeSnap = await tx.get(routeRef);
    if (!routeSnap.exists || routeSnap.data().active !== true) throw new Error('Transit route not found');
    return { tripRef, tripSnap, trip, routeRef, routeSnap, route: routeSnap.data() };
  }

  router.post('/trips/:tripId/book', requireAuth, async (req, res) => {
    try {
      const pickupStop = clean(req.body?.pickupStop, 160).toLowerCase();
      const dropoffStop = clean(req.body?.dropoffStop, 160).toLowerCase();
      const seatCount = Number(req.body?.seatCount ?? 1);
      const requestedClass = validateServiceClass(req.body?.serviceClass || 'STANDARD');
      if (!pickupStop || !dropoffStop || !Number.isInteger(seatCount) || seatCount < 1 || seatCount > 10) {
        return fail(res, 400, 'pickupStop, dropoffStop and valid seatCount are required');
      }

      const bookingRef = db.collection('transitBookings').doc();
      const result = await db.runTransaction(async (tx) => {
        const { tripRef, trip, route } = await loadTripAndRoute(tx, req.params.tripId);
        const tripClass = validateServiceClass(trip.serviceClass || route.serviceClass || 'STANDARD');
        if (requestedClass !== tripClass) throw new Error('Requested service class is not available on this trip');
        if (!['SCHEDULED', 'BOARDING', 'DELAYED'].includes(trip.status) || trip.active === false) {
          throw new Error('Transit trip is not accepting bookings');
        }

        const stops = [route.origin, ...(route.stops || []), route.destination];
        const segment = validateSegment(stops, pickupStop, dropoffStop);
        const bookingSnap = await tx.get(
          db.collection('transitBookings')
            .where('tripId', '==', tripRef.id)
            .where('status', 'in', ACTIVE_STATUSES)
        );
        const overlapping = bookingSnap.docs.map((d) => d.data()).filter((b) => {
          if (!isActivePaymentHold(b)) return false;
          const bSeg = validateSegment(stops, b.pickupStop, b.dropoffStop);
          return bSeg.fromIndex < segment.toIndex && segment.fromIndex < bSeg.toIndex;
        });
        const usedSeats = overlapping.reduce((sum, b) => sum + Number(b.seatCount || 0), 0);
        if (usedSeats + seatCount > Number(trip.capacity || 0)) {
          throw new Error(`Not enough seats for ${pickupStop} → ${dropoffStop}`);
        }

        const configuredFare = Number.isFinite(Number(trip.fare))
          ? Number(trip.fare)
          : Number(route.fare);
        if (!Number.isFinite(configuredFare) || configuredFare < 0) {
          throw new Error('Transit trip has no configured fare');
        }
        const totalFare = +(configuredFare * seatCount).toFixed(2);
        const code = ticketCode(bookingRef.id);
        tx.update(tripRef, {
          inventoryVersion: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(bookingRef, {
          tripId: tripRef.id,
          routeId: route.id || trip.routeId,
          passengerId: req.uid,
          pickupStop,
          dropoffStop,
          seatCount,
          serviceClass: tripClass,
          fare: totalFare,
          currency: 'GHS',
          status: 'CONFIRMED',
          ticketCode: code,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { usedSeats, seatsRemaining: Number(trip.capacity || 0) - usedSeats - seatCount, segment };
      });

      return ok(res, {
        bookingId: bookingRef.id,
        ticketCode: ticketCode(bookingRef.id),
        status: 'CONFIRMED',
        capacity: result,
      }, 201);
    } catch (e) {
      return fail(res, 400, e.message || 'Unable to book transit seat');
    }
  });

  router.get('/bookings/:bookingId', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('transitBookings').doc(clean(req.params.bookingId, 120));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Transit booking not found');
      const booking = snap.data();
      if (booking.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'You cannot view this booking');
      const trip = await db.collection('transitTrips').doc(booking.tripId).get();
      const route = trip.exists ? await db.collection('transitRoutes').doc(trip.data().routeId).get() : null;
      return ok(res, {
        booking: { id: ref.id, ...booking },
        trip: trip?.exists ? { id: trip.id, ...trip.data() } : null,
        route: route?.exists ? { id: route.id, ...route.data() } : null,
      });
    } catch (_e) { return fail(res, 500, 'Unable to load transit booking'); }
  });

  router.get('/bookings/user/:userId', requireAuth, async (req, res) => {
    try {
      const userId = clean(req.params.userId, 120);
      if (userId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'You cannot view these bookings');
      const snap = await db.collection('transitBookings').where('passengerId', '==', userId).limit(100).get();
      return ok(res, { bookings: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (_e) { return fail(res, 500, 'Unable to load transit bookings'); }
  });

  router.post('/bookings/:bookingId/cancel', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('transitBookings').doc(clean(req.params.bookingId, 120));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Transit booking not found');
      const booking = snap.data();
      if (booking.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'You cannot cancel this booking');
      if (!['CONFIRMED'].includes(booking.status)) return fail(res, 400, 'Booking cannot be cancelled after boarding');
      await ref.update({ status: 'CANCELLED', cancelledAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return ok(res, { bookingId: ref.id, status: 'CANCELLED' });
    } catch (_e) { return fail(res, 500, 'Unable to cancel transit booking'); }
  });

  router.post('/bookings/:bookingId/board', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('transitBookings').doc(clean(req.params.bookingId, 120));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Transit booking not found');
      const booking = snap.data();
      if (booking.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Boarding access denied');
      if (booking.status !== 'CONFIRMED') return fail(res, 400, 'Booking is not ready for boarding');
      await ref.update({ status: 'BOARDED', boardedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return ok(res, { bookingId: ref.id, status: 'BOARDED', ticketCode: booking.ticketCode });
    } catch (_e) { return fail(res, 500, 'Unable to board passenger'); }
  });

  router.get('/bookings/:bookingId/ticket', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('transitBookings').doc(clean(req.params.bookingId, 120));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Transit booking not found');
      const booking = snap.data();
      if (booking.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'You cannot view this ticket');
      return ok(res, {
        ticket: {
          bookingId: ref.id,
          ticketCode: booking.ticketCode,
          qrPayload: `okada://transit/ticket/${ref.id}`,
          status: booking.status,
          pickupStop: booking.pickupStop,
          dropoffStop: booking.dropoffStop,
          serviceClass: booking.serviceClass,
          fare: booking.fare,
          currency: booking.currency || 'GHS',
        },
      });
    } catch (_e) { return fail(res, 500, 'Unable to load ticket'); }
  });

  router.get('/trips/:tripId/availability', async (req, res) => {
    try {
      const tripSnap = await db.collection('transitTrips').doc(clean(req.params.tripId, 120)).get();
      if (!tripSnap.exists) return fail(res, 404, 'Transit trip not found');
      const trip = tripSnap.data();
      const routeSnap = await db.collection('transitRoutes').doc(clean(trip.routeId, 120)).get();
      if (!routeSnap.exists) return fail(res, 404, 'Transit route not found');
      const route = routeSnap.data();
      const stops = [route.origin, ...(route.stops || []), route.destination];
      const bookingSnap = await db.collection('transitBookings').where('tripId', '==', tripSnap.id).where('status', 'in', ACTIVE_STATUSES).get();
      const activeBookings = bookingSnap.docs
        .map((d) => d.data())
        .filter(isActivePaymentHold);
      return ok(res, {
        tripId: tripSnap.id,
        capacity: Number(trip.capacity || 0),
        bookings: activeBookings.map((b) => ({ pickupStop: b.pickupStop, dropoffStop: b.dropoffStop, seatCount: b.seatCount, status: b.status })),

        routeStops: stops,
      });
    } catch (_e) { return fail(res, 500, 'Unable to load transit availability'); }
  });

  return router;
}

module.exports = { createTransitBookingRouter };
