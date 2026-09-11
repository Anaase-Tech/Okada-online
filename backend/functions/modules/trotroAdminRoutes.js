'use strict';

const { cleanText, buildVehicle, buildOperator } = require('./trotroModel');

function createTrotroAdminRouter({ express, db, admin, requireAuth, ok, fail, requireAdmin }) {
  const router = express.Router();
  const writeNow = admin.firestore.FieldValue.serverTimestamp();

  async function canManageRoute(req, routeId) {
    if (req.isAdmin === true) return true;
    const route = await db.collection('trotroRoutes').doc(cleanText(routeId, 120)).get();
    return route.exists && route.data().operatorId === req.uid;
  }

  async function canManageTrip(req, tripId) {
    if (req.isAdmin === true) return true;
    const trip = await db.collection('trotroTrips').doc(cleanText(tripId, 120)).get();
    if (!trip.exists) return false;
    return canManageRoute(req, trip.data().routeId);
  }

  router.post('/operators', requireAuth, async (req, res) => {
    try {
      const data = buildOperator(req.body, req.uid, writeNow);
      const ref = await db.collection('trotroOperators').add(data);
      return ok(res, { operatorId: ref.id, status: data.verificationStatus }, 201);
    } catch (e) { return fail(res, 400, e.message); }
  });

  router.post('/vehicles', requireAuth, async (req, res) => {
    try {
      const operatorId = cleanText(req.body?.operatorId, 120) || req.uid;
      if (operatorId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Only the operator or admin can add this vehicle');
      const data = buildVehicle(req.body, req.uid, writeNow);
      data.operatorId = operatorId;
      const ref = await db.collection('trotroVehicles').add(data);
      return ok(res, { vehicleId: ref.id, verificationStatus: data.verificationStatus }, 201);
    } catch (e) { return fail(res, 400, e.message); }
  });

  router.get('/operators', async (_req, res) => {
    try {
      const snap = await db.collection('trotroOperators').where('active', '==', true).limit(100).get();
      return ok(res, { operators: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (e) { return fail(res, 500, 'Unable to load operators'); }
  });

  router.get('/vehicles', async (req, res) => {
    try {
      let query = db.collection('trotroVehicles').where('status', '==', 'ACTIVE').limit(100);
      const operatorId = cleanText(req.query?.operatorId, 120);
      if (operatorId) query = query.where('operatorId', '==', operatorId);
      const snap = await query.get();
      return ok(res, { vehicles: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (e) { return fail(res, 500, 'Unable to load vehicles'); }
  });

  router.get('/trips/:tripId/manifest', requireAuth, async (req, res) => {
    try {
      const tripId = cleanText(req.params.tripId, 120);
      const trip = await db.collection('trotroTrips').doc(tripId).get();
      if (!trip.exists) return fail(res, 404, 'Trip not found');
      if (!(await canManageTrip(req, tripId))) return fail(res, 403, 'Manifest access denied');

      const bookings = await db.collection('trotroBookings')
        .where('tripId', '==', tripId)
        .where('status', 'in', ['CONFIRMED', 'BOARDED'])
        .get();

      const manifest = bookings.docs.map((d, index) => ({ sequence: index + 1, bookingId: d.id, ...d.data() }));
      return ok(res, {
        tripId,
        manifest,
        passengerCount: manifest.reduce((sum, b) => sum + Number(b.seatCount || 0), 0),
      });
    } catch (_e) { return fail(res, 500, 'Unable to load manifest'); }
  });

  router.post('/trips/:tripId/board/:bookingId', requireAuth, async (req, res) => {
    try {
      const tripId = cleanText(req.params.tripId, 120);
      if (!(await canManageTrip(req, tripId))) return fail(res, 403, 'Boarding access denied');
      const bookingRef = db.collection('trotroBookings').doc(cleanText(req.params.bookingId, 120));
      const snap = await bookingRef.get();
      if (!snap.exists) return fail(res, 404, 'Booking not found');
      const booking = snap.data();
      if (booking.tripId !== tripId) return fail(res, 400, 'Booking does not belong to this trip');
      if (booking.status !== 'CONFIRMED') return fail(res, 400, 'Booking is not awaiting boarding');
      await bookingRef.update({ status: 'BOARDED', boardedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return ok(res, { bookingId: bookingRef.id, status: 'BOARDED' });
    } catch (_e) { return fail(res, 500, 'Unable to board passenger'); }
  });

  router.post('/trips/:tripId/status', requireAuth, async (req, res) => {
    try {
      const tripId = cleanText(req.params.tripId, 120);
      if (!(await canManageTrip(req, tripId))) return fail(res, 403, 'Trip status access denied');
      const allowed = ['SCHEDULED', 'BOARDING', 'DEPARTED', 'IN_TRANSIT', 'ARRIVING', 'COMPLETED', 'DELAYED', 'CANCELLED'];
      const status = cleanText(req.body?.status, 40).toUpperCase();
      if (!allowed.includes(status)) return fail(res, 400, 'Invalid trip status');
      const ref = db.collection('trotroTrips').doc(tripId);
      const update = { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (status === 'DEPARTED') update.departedAt = admin.firestore.FieldValue.serverTimestamp();
      if (status === 'COMPLETED') update.completedAt = admin.firestore.FieldValue.serverTimestamp();
      if (status === 'CANCELLED') update.cancelledAt = admin.firestore.FieldValue.serverTimestamp();
      if (req.body?.currentStop !== undefined) update.currentStop = cleanText(req.body.currentStop, 120).toLowerCase();
      if (req.body?.currentLocation) {
        const lat = Number(req.body.currentLocation.latitude);
        const lng = Number(req.body.currentLocation.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return fail(res, 400, 'Invalid currentLocation');
        update.currentLocation = { latitude: lat, longitude: lng, recordedAt: admin.firestore.Timestamp.now() };
      }
      await ref.update(update);
      return ok(res, { tripId, status });
    } catch (_e) { return fail(res, 500, 'Unable to update trip status'); }
  });

  router.post('/verify/:type/:id/approve', requireAdmin, async (req, res) => {
    try {
      const { type, id } = req.params;
      const collection = { operator: 'trotroOperators', vehicle: 'trotroVehicles' }[type];
      if (!collection) return fail(res, 400, 'Invalid verification type');
      const ref = db.collection(collection).doc(cleanText(id, 120));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Record not found');
      await ref.update({ verificationStatus: 'APPROVED', verifiedAt: admin.firestore.FieldValue.serverTimestamp(), verifiedBy: req.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return ok(res, { id, type, verificationStatus: 'APPROVED' });
    } catch (_e) { return fail(res, 500, 'Unable to approve verification'); }
  });

  return router;
}

module.exports = { createTrotroAdminRouter };
