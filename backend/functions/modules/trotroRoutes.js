'use strict';

const {
  validateStops,
  calculateSegmentAvailability,
  checkSeatAvailability,
} = require('./trotroEngine');

/**
 * Create the V4 Trotro API router.
 * Dependencies are injected so the legacy monolithic index.js remains untouched
 * until the integration pass. This router owns only the Trotro domain.
 */
function createTrotroRouter({ express, db, admin, requireAuth, fail, ok, sanitize }) {
  const router = express.Router();

  router.get('/routes', async (_req, res) => {
    try {
      const snap = await db.collection('trotroRoutes')
        .where('active', '==', true).limit(100).get();
      return ok(res, {
        routes: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      });
    } catch (e) {
      return fail(res, 500, e.message);
    }
  });

  router.post('/routes', requireAuth, async (req, res) => {
    try {
      const { name, origin, destination, stops, operatorId, estimatedDuration, baseFareRules } = req.body;
      if (!name || !origin || !destination || !Array.isArray(stops)) {
        return fail(res, 400, 'name, origin, destination and stops are required');
      }
      const cleanStops = validateStops(stops);
      const ref = await db.collection('trotroRoutes').add({
        name: sanitize(name),
        origin: sanitize(origin),
        destination: sanitize(destination),
        stops: cleanStops,
        operatorId: sanitize(operatorId || req.uid),
        estimatedDuration: Number.isFinite(Number(estimatedDuration)) ? Number(estimatedDuration) : null,
        baseFareRules: baseFareRules || null,
        active: true,
        createdBy: req.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ok(res, { routeId: ref.id });
    } catch (e) {
      return fail(res, 400, e.message);
    }
  });

  router.post('/trips', requireAuth, async (req, res) => {
    try {
      const { routeId, vehicleId, departureTime, capacity, currentStop } = req.body;
      if (!routeId || !departureTime || !capacity) {
        return fail(res, 400, 'routeId, departureTime and capacity are required');
      }
      const route = await db.collection('trotroRoutes').doc(sanitize(routeId)).get();
      if (!route.exists || route.data().active !== true) return fail(res, 404, 'Route not found');
      const vehicleCapacity = Number(capacity);
      if (!Number.isInteger(vehicleCapacity) || vehicleCapacity < 1) {
        return fail(res, 400, 'capacity must be a positive integer');
      }
      const ref = await db.collection('trotroTrips').add({
        routeId: route.id,
        vehicleId: sanitize(vehicleId || ''),
        departureTime: new Date(departureTime),
        capacity: vehicleCapacity,
        currentStop: sanitize(currentStop || route.data().stops[0]),
        status: 'SCHEDULED',
        currentLocation: null,
        createdBy: req.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ok(res, { tripId: ref.id, status: 'SCHEDULED' });
    } catch (e) {
      return fail(res, 400, e.message);
    }
  });

  router.get('/trips/:tripId', async (req, res) => {
    try {
      const trip = await db.collection('trotroTrips').doc(sanitize(req.params.tripId)).get();
      if (!trip.exists) return fail(res, 404, 'Trip not found');
      const data = trip.data();
      const route = await db.collection('trotroRoutes').doc(data.routeId).get();
      if (!route.exists) return fail(res, 409, 'Trip route not found');
      const bookings = await db.collection('trotroBookings')
        .where('tripId', '==', trip.id)
        .where('status', 'in', ['CONFIRMED', 'BOARDED'])
        .get();
      const segmentAvailability = calculateSegmentAvailability(
        route.data().stops,
        data.capacity,
        bookings.docs.map((d) => d.data())
      );
      return ok(res, {
        trip: { id: trip.id, ...data },
        route: { id: route.id, ...route.data() },
        segmentAvailability,
      });
    } catch (e) {
      return fail(res, 500, e.message);
    }
  });

  router.get('/search', async (req, res) => {
    try {
      const from = sanitize(req.query.from || '');
      const to = sanitize(req.query.to || '');
      if (!from || !to) return fail(res, 400, 'from and to are required');

      const snap = await db.collection('trotroRoutes')
        .where('active', '==', true).limit(100).get();
      const matches = snap.docs.filter((doc) => {
        const stops = validateStops(doc.data().stops);
        return stops.includes(from.toLowerCase()) && stops.includes(to.toLowerCase())
          && stops.indexOf(from.toLowerCase()) < stops.indexOf(to.toLowerCase());
      });

      const results = [];
      for (const routeDoc of matches) {
        const tripSnap = await db.collection('trotroTrips')
          .where('routeId', '==', routeDoc.id)
          .where('status', 'in', ['SCHEDULED', 'BOARDING', 'DELAYED'])
          .limit(20).get();
        for (const tripDoc of tripSnap.docs) {
          const t = tripDoc.data();
          const bookings = await db.collection('trotroBookings')
            .where('tripId', '==', tripDoc.id)
            .where('status', 'in', ['CONFIRMED', 'BOARDED'])
            .get();
          const availability = calculateSegmentAvailability(
            routeDoc.data().stops,
            t.capacity,
            bookings.docs.map((d) => d.data())
          );
          const fromI = validateStops(routeDoc.data().stops).indexOf(from.toLowerCase());
          const toI = validateStops(routeDoc.data().stops).indexOf(to.toLowerCase());
          const segmentSeats = availability.slice(fromI, toI);
          const seatsAvailable = segmentSeats.length
            ? Math.min(...segmentSeats.map((s) => s.available))
            : 0;
          results.push({
            tripId: tripDoc.id,
            routeId: routeDoc.id,
            route: routeDoc.data(),
            trip: t,
            seatsAvailable,
            pickupStop: from.toLowerCase(),
            dropoffStop: to.toLowerCase(),
          });
        }
      }
      return ok(res, { results });
    } catch (e) {
      return fail(res, 500, e.message);
    }
  });

  router.post('/book', requireAuth, async (req, res) => {
    try {
      const { tripId, pickupStop, dropoffStop, seatCount, passengerId } = req.body;
      const userId = sanitize(passengerId || req.uid);
      if (!tripId || !pickupStop || !dropoffStop || !seatCount) {
        return fail(res, 400, 'tripId, pickupStop, dropoffStop and seatCount are required');
      }

      const tripRef = db.collection('trotroTrips').doc(sanitize(tripId));
      const newBookingRef = db.collection('trotroBookings').doc();
      const result = await db.runTransaction(async (tx) => {
        const tripSnap = await tx.get(tripRef);
        if (!tripSnap.exists) throw new Error('Trip not found');
        const trip = tripSnap.data();
        if (!['SCHEDULED', 'BOARDING', 'DELAYED'].includes(trip.status)) {
          throw new Error('Trip is not accepting bookings');
        }

        const routeSnap = await tx.get(db.collection('trotroRoutes').doc(trip.routeId));
        if (!routeSnap.exists) throw new Error('Route not found');
        const route = routeSnap.data();

        const bookingSnap = await db.collection('trotroBookings')
          .where('tripId', '==', tripId)
          .where('status', 'in', ['CONFIRMED', 'BOARDED'])
          .get();
        const existing = bookingSnap.docs.map((d) => d.data());
        const candidate = {
          tripId,
          passengerId: userId,
          pickupStop: sanitize(pickupStop).toLowerCase(),
          dropoffStop: sanitize(dropoffStop).toLowerCase(),
          seatCount: Number(seatCount),
        };
        const check = checkSeatAvailability(route.stops, trip.capacity, existing, candidate);
        if (!check.canBook) throw new Error(`Not enough seats for ${candidate.pickupStop} → ${candidate.dropoffStop}`);

        tx.set(newBookingRef, {
          ...candidate,
          status: 'CONFIRMED',
          bookingCode: `OKT-${newBookingRef.id.slice(0, 8).toUpperCase()}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return check;
      });

      return ok(res, { bookingId: newBookingRef.id, status: 'CONFIRMED', capacityCheck: result });
    } catch (e) {
      return fail(res, 400, e.message);
    }
  });

  router.post('/cancel/:bookingId', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('trotroBookings').doc(sanitize(req.params.bookingId));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Booking not found');
      const booking = snap.data();
      if (booking.passengerId !== req.uid) return fail(res, 403, 'You cannot cancel this booking');
      if (!['CONFIRMED', 'BOARDED'].includes(booking.status)) return fail(res, 400, 'Booking cannot be cancelled');
      await ref.update({ status: 'CANCELLED', cancelledAt: admin.firestore.FieldValue.serverTimestamp() });
      return ok(res, { bookingId: ref.id, status: 'CANCELLED' });
    } catch (e) {
      return fail(res, 500, e.message);
    }
  });

  router.get('/track/:tripId', async (req, res) => {
    try {
      const ref = db.collection('trotroTrips').doc(sanitize(req.params.tripId));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Trip not found');
      const data = snap.data();
      return ok(res, {
        tripId: ref.id,
        status: data.status,
        currentStop: data.currentStop || null,
        currentLocation: data.currentLocation || null,
        updatedAt: data.updatedAt || null,
      });
    } catch (e) {
      return fail(res, 500, e.message);
    }
  });

  return router;
}

module.exports = { createTrotroRouter };
