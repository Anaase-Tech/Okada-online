'use strict';

const {
  validateStops,
  calculateSegmentAvailability,
  checkSeatAvailability,
} = require('./trotroEngine');

function createTrotroRouter({ express, db, admin, requireAuth, fail, ok, sanitize }) {
  const router = express.Router();
  const clean = (v, max = 160) => sanitize(String(v == null ? '' : v).trim()).slice(0, max);
  const STATUSES = ['SCHEDULED', 'BOARDING', 'DEPARTED', 'IN_TRANSIT', 'ARRIVING', 'COMPLETED', 'DELAYED', 'CANCELLED'];

  async function canManageTrip(req, routeId) {
    if (req.isAdmin === true) return true;
    const routeSnap = await db.collection('trotroRoutes').doc(routeId).get();
    return routeSnap.exists && routeSnap.data().operatorId === req.uid;
  }

  router.get('/routes', async (_req, res) => {
    try {
      const snap = await db.collection('trotroRoutes').where('active', '==', true).limit(100).get();
      return ok(res, { routes: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
    } catch (_e) { return fail(res, 500, 'Unable to load trotro routes'); }
  });

  router.post('/routes', requireAuth, async (req, res) => {
    try {
      const name = clean(req.body?.name, 120);
      const origin = clean(req.body?.origin, 120);
      const destination = clean(req.body?.destination, 120);
      const stops = Array.isArray(req.body?.stops) ? req.body.stops.map((s) => clean(s, 120)) : [];
      if (!name || !origin || !destination || !Array.isArray(req.body?.stops)) return fail(res, 400, 'name, origin, destination and stops are required');
      const normalized = validateStops([origin, ...stops, destination]);
      const requestedOperatorId = clean(req.body?.operatorId, 120);
      if (requestedOperatorId && requestedOperatorId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'operatorId must match your account');
      const ref = await db.collection('trotroRoutes').add({
        name, origin: normalized[0], destination: normalized[normalized.length - 1], stops: normalized.slice(1, -1),
        operatorId: requestedOperatorId || req.uid,
        estimatedDuration: Number.isFinite(Number(req.body?.estimatedDuration)) ? Number(req.body.estimatedDuration) : null,
        baseFareRules: req.body?.baseFareRules || null, active: true, createdBy: req.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ok(res, { routeId: ref.id }, 201);
    } catch (_e) { return fail(res, 400, 'Unable to create route'); }
  });

  router.post('/trips', requireAuth, async (req, res) => {
    try {
      const routeId = clean(req.body?.routeId, 120);
      const vehicleId = clean(req.body?.vehicleId, 120);
      const capacity = Number(req.body?.capacity);
      const parsed = new Date(req.body?.departureTime);
      if (!routeId || Number.isNaN(parsed.getTime()) || !Number.isInteger(capacity) || capacity < 1 || capacity > 100) return fail(res, 400, 'routeId, departureTime and valid capacity are required');
      if (parsed.getTime() <= Date.now()) return fail(res, 400, 'departureTime must be in the future');
      const routeSnap = await db.collection('trotroRoutes').doc(routeId).get();
      if (!routeSnap.exists || routeSnap.data().active !== true) return fail(res, 404, 'Route not found');
      const route = routeSnap.data();
      if (route.operatorId && route.operatorId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'You are not authorized to schedule trips on this route');
      const ref = await db.collection('trotroTrips').add({
        routeId, vehicleId: vehicleId || null, departureTime: parsed, capacity,
        currentStop: route.origin || route.stops?.[0] || null, status: 'SCHEDULED', currentLocation: null,
        active: true, createdBy: req.uid, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ok(res, { tripId: ref.id, status: 'SCHEDULED' }, 201);
    } catch (_e) { return fail(res, 400, 'Unable to create trip'); }
  });

  router.post('/trips/:tripId/status', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('trotroTrips').doc(clean(req.params.tripId, 120));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Trip not found');
      if (!(await canManageTrip(req, snap.data().routeId))) return fail(res, 403, 'You are not authorized to update this trip');
      const status = clean(req.body?.status, 30).toUpperCase();
      if (!STATUSES.includes(status)) return fail(res, 400, 'Invalid trip status');
      const updates = { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (req.body?.currentStop !== undefined) updates.currentStop = clean(req.body.currentStop, 120);
      if (req.body?.currentLocation) {
        const lat = Number(req.body.currentLocation.latitude); const lng = Number(req.body.currentLocation.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return fail(res, 400, 'Invalid currentLocation');
        updates.currentLocation = { latitude: lat, longitude: lng, recordedAt: admin.firestore.Timestamp.now() };
      }
      await ref.update(updates);
      return ok(res, { tripId: ref.id, status });
    } catch (_e) { return fail(res, 500, 'Unable to update trip status'); }
  });

  router.get('/trips/:tripId', async (req, res) => {
    try {
      const trip = await db.collection('trotroTrips').doc(clean(req.params.tripId, 120)).get();
      if (!trip.exists) return fail(res, 404, 'Trip not found');
      const data = trip.data(); const route = await db.collection('trotroRoutes').doc(data.routeId).get();
      if (!route.exists) return fail(res, 409, 'Trip route not found');
      const r = route.data(); const stops = [r.origin, ...(r.stops || []), r.destination];
      const bookings = await db.collection('trotroBookings').where('tripId', '==', trip.id).where('status', 'in', ['CONFIRMED', 'BOARDED']).get();
      return ok(res, { trip: { id: trip.id, ...data }, route: { id: route.id, ...r }, segmentAvailability: calculateSegmentAvailability(stops, data.capacity, bookings.docs.map((d) => d.data())) });
    } catch (_e) { return fail(res, 500, 'Unable to load trip'); }
  });

  router.get('/search', async (req, res) => {
    try {
      const from = clean(req.query?.from).toLowerCase(); const to = clean(req.query?.to).toLowerCase(); const date = clean(req.query?.date, 20);
      if (!from || !to) return fail(res, 400, 'from and to are required');
      const routeSnap = await db.collection('trotroRoutes').where('active', '==', true).limit(100).get();
      const results = [];
      for (const routeDoc of routeSnap.docs) {
        const route = routeDoc.data(); const stops = [route.origin, ...(route.stops || []), route.destination].map((s) => String(s).trim().toLowerCase());
        const fromI = stops.indexOf(from); const toI = stops.indexOf(to); if (fromI < 0 || toI <= fromI) continue;
        const tripSnap = await db.collection('trotroTrips').where('routeId', '==', routeDoc.id).where('active', '==', true).where('status', 'in', ['SCHEDULED', 'BOARDING', 'DELAYED']).limit(50).get();
        for (const tripDoc of tripSnap.docs) {
          const trip = tripDoc.data(); const departure = trip.departureTime?.toDate ? trip.departureTime.toDate() : new Date(trip.departureTime);
          if (Number.isNaN(departure.getTime()) || departure.getTime() <= Date.now()) continue;
          if (date && departure.toISOString().slice(0, 10) !== date) continue;
          const bookings = await db.collection('trotroBookings').where('tripId', '==', tripDoc.id).where('status', 'in', ['CONFIRMED', 'BOARDED']).get();
          const availability = calculateSegmentAvailability([route.origin, ...(route.stops || []), route.destination], trip.capacity, bookings.docs.map((d) => d.data()));
          const seats = availability.slice(fromI, toI); const seatsAvailable = seats.length ? Math.min(...seats.map((s) => s.available)) : 0;
          results.push({ tripId: tripDoc.id, routeId: routeDoc.id, route, trip, seatsAvailable, pickupStop: from, dropoffStop: to });
        }
      }
      results.sort((a, b) => (a.trip.departureTime?.toDate ? a.trip.departureTime.toDate() : new Date(a.trip.departureTime)) - (b.trip.departureTime?.toDate ? b.trip.departureTime.toDate() : new Date(b.trip.departureTime)));
      return ok(res, { results: results.slice(0, 100) });
    } catch (_e) { return fail(res, 500, 'Unable to search trotro trips'); }
  });

  router.post('/book', requireAuth, async (req, res) => {
    try {
      const tripId = clean(req.body?.tripId, 120); const pickupStop = clean(req.body?.pickupStop, 120).toLowerCase(); const dropoffStop = clean(req.body?.dropoffStop, 120).toLowerCase(); const seatCount = Number(req.body?.seatCount ?? 1);
      if (!tripId || !pickupStop || !dropoffStop || !Number.isInteger(seatCount) || seatCount < 1 || seatCount > 10) return fail(res, 400, 'tripId, pickupStop, dropoffStop and valid seatCount are required');
      if (req.body?.passengerId && clean(req.body.passengerId, 120) !== req.uid && req.isAdmin !== true) return fail(res, 403, 'passengerId must match the authenticated user');
      const tripRef = db.collection('trotroTrips').doc(tripId); const newBookingRef = db.collection('trotroBookings').doc();
      const result = await db.runTransaction(async (tx) => {
        const tripSnap = await tx.get(tripRef); if (!tripSnap.exists) throw new Error('Trip not found'); const trip = tripSnap.data();
        if (!['SCHEDULED', 'BOARDING', 'DELAYED'].includes(trip.status) || trip.active === false) throw new Error('Trip is not accepting bookings');
        const routeSnap = await tx.get(db.collection('trotroRoutes').doc(trip.routeId)); if (!routeSnap.exists || routeSnap.data().active !== true) throw new Error('Route not found');
        const route = routeSnap.data(); const stops = [route.origin, ...(route.stops || []), route.destination];
        const bookingSnap = await tx.get(db.collection('trotroBookings').where('tripId', '==', tripId).where('status', 'in', ['CONFIRMED', 'BOARDED']));
        const candidate = { tripId, passengerId: req.uid, pickupStop, dropoffStop, seatCount }; const check = checkSeatAvailability(stops, trip.capacity, bookingSnap.docs.map((d) => d.data()), candidate);
        if (!check.canBook) throw new Error(`Not enough seats for ${pickupStop} → ${dropoffStop}`);
        const bookingCode = `OKT-${newBookingRef.id.slice(0, 8).toUpperCase()}`;
        // Touch the shared trip document inside the same transaction as the
        // inventory check. Concurrent bookings on this trip therefore conflict
        // and Firestore retries the transaction instead of overselling.
        tx.update(tripRef, {
          inventoryVersion: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.set(newBookingRef, { ...candidate, status: 'CONFIRMED', bookingCode, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return check;
      });
      return ok(res, { bookingId: newBookingRef.id, bookingCode: `OKT-${newBookingRef.id.slice(0, 8).toUpperCase()}`, status: 'CONFIRMED', capacityCheck: result }, 201);
    } catch (e) { return fail(res, 400, e.message || 'Unable to book seat'); }
  });

  router.get('/bookings/:bookingId', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('trotroBookings').doc(clean(req.params.bookingId, 120)); const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Booking not found'); const booking = snap.data();
      if (booking.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'You cannot view this booking');
      const trip = await db.collection('trotroTrips').doc(booking.tripId).get();
      return ok(res, { booking: { id: ref.id, ...booking }, trip: trip.exists ? { id: trip.id, ...trip.data() } : null });
    } catch (_e) { return fail(res, 500, 'Unable to load booking'); }
  });

  router.get('/bookings/user/:userId', requireAuth, async (req, res) => {
    try {
      const userId = clean(req.params.userId, 120); if (userId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'You cannot view these bookings');
      const snap = await db.collection('trotroBookings').where('passengerId', '==', userId).limit(50).get();
      return ok(res, { bookings: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (_e) { return fail(res, 500, 'Unable to load bookings'); }
  });

  router.post('/cancel/:bookingId', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('trotroBookings').doc(clean(req.params.bookingId, 120)); const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Booking not found'); const booking = snap.data();
      if (booking.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'You cannot cancel this booking');
      if (!['CONFIRMED', 'BOARDED'].includes(booking.status)) return fail(res, 400, 'Booking cannot be cancelled');
      await ref.update({ status: 'CANCELLED', cancelledAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return ok(res, { bookingId: ref.id, status: 'CANCELLED' });
    } catch (_e) { return fail(res, 500, 'Unable to cancel booking'); }
  });

  router.get('/track/:tripId', async (req, res) => {
    try {
      const ref = db.collection('trotroTrips').doc(clean(req.params.tripId, 120)); const snap = await ref.get(); if (!snap.exists) return fail(res, 404, 'Trip not found');
      const data = snap.data(); return ok(res, { tripId: ref.id, status: data.status, currentStop: data.currentStop || null, currentLocation: data.currentLocation || null, updatedAt: data.updatedAt || null });
    } catch (_e) { return fail(res, 500, 'Unable to track trip'); }
  });

  return router;
}

module.exports = { createTrotroRouter };