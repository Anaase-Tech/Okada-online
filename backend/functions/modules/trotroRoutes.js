'use strict';

const {
  validateStops,
  calculateSegmentAvailability,
  checkSeatAvailability,
} = require('./trotroEngine');

function createTrotroRouter({ express, db, admin, requireAuth, fail, ok, sanitize }) {
  const router = express.Router();
  const clean = (v, max = 160) => sanitize(String(v == null ? '' : v).trim()).slice(0, max);

  router.get('/routes', async (_req, res) => {
    try {
      const snap = await db.collection('trotroRoutes').where('active', '==', true).limit(100).get();
      return ok(res, { routes: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
    } catch (e) { return fail(res, 500, 'Unable to load trotro routes', e); }
  });

  router.post('/routes', requireAuth, async (req, res) => {
    try {
      const name = clean(req.body?.name, 120);
      const origin = clean(req.body?.origin, 120);
      const destination = clean(req.body?.destination, 120);
      const stops = Array.isArray(req.body?.stops) ? req.body.stops.map((s) => clean(s, 120)) : [];
      if (!name || !origin || !destination || !Array.isArray(req.body?.stops)) return fail(res, 400, 'name, origin, destination and stops are required');
      const checked = validateStops([origin, ...stops, destination]);
      if (!checked.ok) return fail(res, 400, checked.error);
      const normalized = checked.stops;
      const requestedOperatorId = clean(req.body?.operatorId, 120);
      if (requestedOperatorId && requestedOperatorId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'operatorId must match your account');

      const ref = await db.collection('trotroRoutes').add({
        name,
        origin: normalized[0],
        destination: normalized[normalized.length - 1],
        stops: normalized.slice(1, -1),
        operatorId: requestedOperatorId || req.uid,
        estimatedDuration: Number.isFinite(Number(req.body?.estimatedDuration)) ? Number(req.body.estimatedDuration) : null,
        baseFareRules: req.body?.baseFareRules || null,
        active: true,
        createdBy: req.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ok(res, { routeId: ref.id }, 201);
    } catch (e) { return fail(res, 400, 'Unable to create route', e); }
  });

  router.post('/trips', requireAuth, async (req, res) => {
    try {
      const routeId = clean(req.body?.routeId, 120);
      const vehicleId = clean(req.body?.vehicleId, 120);
      const departureTime = req.body?.departureTime;
      const capacity = Number(req.body?.capacity);
      if (!routeId || !departureTime || !Number.isInteger(capacity) || capacity < 1 || capacity > 100) return fail(res, 400, 'routeId, departureTime and valid capacity are required');

      const routeSnap = await db.collection('trotroRoutes').doc(routeId).get();
      if (!routeSnap.exists || routeSnap.data().active !== true) return fail(res, 404, 'Route not found');
      const route = routeSnap.data();
      if (route.operatorId && route.operatorId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'You are not authorized to schedule trips on this route');

      const parsed = new Date(departureTime);
      if (Number.isNaN(parsed.getTime())) return fail(res, 400, 'Invalid departureTime');
      if (parsed.getTime() <= Date.now()) return fail(res, 400, 'departureTime must be in the future');

      const ref = await db.collection('trotroTrips').add({
        routeId, vehicleId: vehicleId || null, departureTime: parsed, capacity,
        currentStop: route.origin || route.stops?.[0] || null,
        status: 'SCHEDULED', currentLocation: null, active: true, createdBy: req.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ok(res, { tripId: ref.id, status: 'SCHEDULED' }, 201);
    } catch (e) { return fail(res, 400, 'Unable to create trip', e); }
  });

  router.get('/trips/:tripId', async (req, res) => {
    try {
      const trip = await db.collection('trotroTrips').doc(clean(req.params.tripId, 120)).get();
      if (!trip.exists) return fail(res, 404, 'Trip not found');
      const data = trip.data();
      const route = await db.collection('trotroRoutes').doc(data.routeId).get();
      if (!route.exists) return fail(res, 409, 'Trip route not found');
      const routeData = route.data();
      const stops = [routeData.origin, ...(routeData.stops || []), routeData.destination];
      const bookings = await db.collection('trotroBookings').where('tripId', '==', trip.id).where('status', 'in', ['CONFIRMED', 'BOARDED']).get();
      const segmentAvailability = calculateSegmentAvailability(stops, data.capacity, bookings.docs.map((d) => d.data()));
      return ok(res, { trip: { id: trip.id, ...data }, route: { id: route.id, ...routeData }, segmentAvailability });
    } catch (e) { return fail(res, 500, 'Unable to load trip', e); }
  });

  router.get('/search', async (req, res) => {
    try {
      const from = clean(req.query?.from).toLowerCase();
      const to = clean(req.query?.to).toLowerCase();
      const date = clean(req.query?.date, 20);
      if (!from || !to) return fail(res, 400, 'from and to are required');
      const snap = await db.collection('trotroRoutes').where('active', '==', true).limit(100).get();
      const results = [];

      for (const routeDoc of snap.docs) {
        const route = routeDoc.data();
        const stops = [route.origin, ...(route.stops || []), route.destination].map((s) => String(s).trim().toLowerCase());
        const fromI = stops.indexOf(from); const toI = stops.indexOf(to);
        if (fromI < 0 || toI <= fromI) continue;
        const trips = await db.collection('trotroTrips').where('routeId', '==', routeDoc.id).where('active', '==', true).where('status', 'in', ['SCHEDULED', 'BOARDING', 'DELAYED']).limit(50).get();

        for (const tripDoc of trips.docs) {
          const t = tripDoc.data();
          const departure = t.departureTime?.toDate ? t.departureTime.toDate() : new Date(t.departureTime);
          if (Number.isNaN(departure.getTime()) || departure.getTime() <= Date.now()) continue;
          if (date && departure.toISOString().slice(0, 10) !== date) continue;
          const bookings = await db.collection('trotroBookings').where('tripId', '==', tripDoc.id).where('status', 'in', ['CONFIRMED', 'BOARDED']).get();
          const availability = calculateSegmentAvailability([route.origin, ...(route.stops || []), route.destination], t.capacity, bookings.docs.map((d) => d.data()));
          const segmentSeats = availability.slice(fromI, toI);
          const seatsAvailable = segmentSeats.length ? Math.min(...segmentSeats.map((s) => s.available)) : 0;
          results.push({ tripId: tripDoc.id, routeId: routeDoc.id, route, trip: t, seatsAvailable, pickupStop: from, dropoffStop: to });
        }
      }
      results.sort((a, b) => {
        const da = a.trip.departureTime?.toDate ? a.trip.departureTime.toDate() : new Date(a.trip.departureTime);
        const dbb = b.trip.departureTime?.toDate ? b.trip.departureTime.toDate() : new Date(b.trip.departureTime);
        return da - dbb;
      });
      return ok(res, { results: results.slice(0, 100) });
    } catch (e) { return fail(res, 500, 'Unable to search trotro trips', e); }
  });

  router.post('/book', requireAuth, async (req, res) => {
    try {
      const tripId = clean(req.body?.tripId, 120);
      const pickupStop = clean(req.body?.pickupStop, 120).toLowerCase();
      const dropoffStop = clean(req.body?.dropoffStop, 120).toLowerCase();
      const seatCount = Number(req.body?.seatCount ?? 1);
      if (!tripId || !pickupStop || !dropoffStop || !Number.isInteger(seatCount) || seatCount < 1 || seatCount > 10) return fail(res, 400, 'tripId, pickupStop, dropoffStop and valid seatCount are required');
      if (req.body?.passengerId && clean(req.body.passengerId, 120) !== req.uid && req.isAdmin !== true) return fail(res, 403, 'passengerId must match the authenticated user');

      const tripRef = db.collection('trotroTrips').doc(tripId);
      const newBookingRef = db.collection('trotroBookings').doc();
      const result = await db.runTransaction(async (tx) => {
        const tripSnap = await tx.get(tripRef);
        if (!tripSnap.exists) throw new Error('Trip not found');
        const trip = tripSnap.data();
        if (!['SCHEDULED', 'BOARDING', 'DELAYED'].includes(trip.status) || trip.active === false) throw new Error('Trip is not accepting bookings');

        const routeRef = db.collection('trotroRoutes').doc(trip.routeId);
        const routeSnap = await tx.get(routeRef);
        if (!routeSnap.exists || routeSnap.data().active !== true) throw new Error('Route not found');
        const route = routeSnap.data();
        const stops = [route.origin, ...(route.stops || []), route.destination];
        const bookingSnap = await tx.get(db.collection('trotroBookings').where('tripId', '==', tripId).where('status', 'in', ['CONFIRMED', 'BOARDED']));
        const existing = bookingSnap.docs.map((d) => d.data());
        const candidate = { tripId, passengerId: req.uid, pickupStop, dropoffStop, seatCount };
        const check = checkSeatAvailability(stops, trip.capacity, existing, candidate);
        if (!check.canBook) throw new Error(`Not enough seats for ${pickupStop} → ${dropoffStop}`);

        const bookingCode = `OKT-${newBookingRef.id.slice(0, 8).toUpperCase()}`;
        tx.set(newBookingRef, { ...candidate, status: 'CONFIRMED', bookingCode, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return check;
      });
      return ok(res, { bookingId: newBookingRef.id, bookingCode: `OKT-${newBookingRef.id.slice(0, 8).toUpperCase()}`, status: 'CONFIRMED', capacityCheck: result }, 201);
    } catch (e) { return fail(res, 400, e.message); }
  });

  router.post('/cancel/:bookingId', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('trotroBookings').doc(clean(req.params.bookingId, 120));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Booking not found');
      const booking = snap.data();
      if (booking.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'You cannot cancel this booking');
      if (!['CONFIRMED', 'BOARDED'].includes(booking.status)) return fail(res, 400, 'Booking cannot be cancelled');
      await ref.update({ status: 'CANCELLED', cancelledAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return ok(res, { bookingId: ref.id, status: 'CANCELLED' });
    } catch (e) { return fail(res, 500, 'Unable to cancel booking', e); }
  });

  router.get('/track/:tripId', async (req, res) => {
    try {
      const ref = db.collection('trotroTrips').doc(clean(req.params.tripId, 120));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Trip not found');
      const data = snap.data();
      return ok(res, { tripId: ref.id, status: data.status, currentStop: data.currentStop || null, currentLocation: data.currentLocation || null, updatedAt: data.updatedAt || null });
    } catch (e) { return fail(res, 500, 'Unable to track trip', e); }
  });

  return router;
}

module.exports = { createTrotroRouter };
