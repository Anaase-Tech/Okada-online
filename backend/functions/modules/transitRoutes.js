'use strict';

const {
  validateStops,
  validateServiceClass,
  validateSegment,
  isConnectionFeasible,
  buildJourney,
} = require('./transitEngine');

function createTransitRouter({ express, db, admin, requireAuth, fail, ok, sanitize }) {
  const router = express.Router();
  const clean = (value, max = 160) => sanitize(String(value == null ? '' : value).trim()).slice(0, max);
  const publicStatuses = ['SCHEDULED', 'BOARDING', 'DELAYED'];

  async function loadRoute(routeId) {
    const snap = await db.collection('transitRoutes').doc(clean(routeId, 120)).get();
    if (!snap.exists || snap.data().active !== true) return null;
    return { id: snap.id, ...snap.data() };
  }

  function routeStops(route) {
    return [route.origin, ...(route.stops || []), route.destination];
  }

  router.get('/stations', async (_req, res) => {
    try {
      const snap = await db.collection('stations').where('active', '==', true).limit(100).get();
      return ok(res, { stations: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (_e) { return fail(res, 500, 'Unable to load transit stations'); }
  });

  router.post('/stations', requireAuth, async (req, res) => {
    try {
      if (req.isAdmin !== true) return fail(res, 403, 'Admin access required');
      const name = clean(req.body?.name, 120);
      const city = clean(req.body?.city, 120);
      if (!name || !city) return fail(res, 400, 'name and city are required');
      const ref = await db.collection('stations').add({
        name, city, region: clean(req.body?.region, 120) || null,
        address: clean(req.body?.address, 220) || null,
        landmark: clean(req.body?.landmark, 220) || null,
        coordinates: req.body?.coordinates || null,
        active: true,
        createdBy: req.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ok(res, { stationId: ref.id }, 201);
    } catch (_e) { return fail(res, 400, 'Unable to create station'); }
  });

  router.get('/routes', async (_req, res) => {
    try {
      const snap = await db.collection('transitRoutes').where('active', '==', true).limit(100).get();
      return ok(res, { routes: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (_e) { return fail(res, 500, 'Unable to load transit routes'); }
  });

  router.post('/routes', requireAuth, async (req, res) => {
    try {
      if (req.isAdmin !== true) return fail(res, 403, 'Admin access required');
      const origin = clean(req.body?.origin, 120);
      const destination = clean(req.body?.destination, 120);
      const middleStops = Array.isArray(req.body?.stops) ? req.body.stops.map((s) => clean(s, 120)) : [];
      const stops = validateStops([origin, ...middleStops, destination]);
      const serviceClass = validateServiceClass(req.body?.serviceClass || 'STANDARD');
      const fare = Number(req.body?.fare);
      if (!Number.isFinite(fare) || fare < 0) return fail(res, 400, 'Configured route fare is required');
      const ref = await db.collection('transitRoutes').add({
        name: clean(req.body?.name, 160) || `${stops[0]} → ${stops[stops.length - 1]}`,
        origin: stops[0], destination: stops[stops.length - 1], stops: stops.slice(1, -1),
        serviceClass, hubStationId: clean(req.body?.hubStationId, 120) || null,
        operatorId: clean(req.body?.operatorId, 120) || null,
        active: true, createdBy: req.uid,
        estimatedDurationMinutes: Number.isInteger(Number(req.body?.estimatedDurationMinutes)) ? Number(req.body.estimatedDurationMinutes) : null,
        fare: +fare.toFixed(2),
        fareRules: req.body?.fareRules || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ok(res, { routeId: ref.id }, 201);
    } catch (_e) { return fail(res, 400, 'Unable to create transit route'); }
  });

  router.get('/trips', async (req, res) => {
    try {
      const routeId = clean(req.query?.routeId, 120);
      let query = db.collection('transitTrips').where('status', 'in', publicStatuses).limit(100);
      if (routeId) query = query.where('routeId', '==', routeId);
      const snap = await query.get();
      return ok(res, { trips: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (_e) { return fail(res, 500, 'Unable to load transit trips'); }
  });

  router.post('/trips', requireAuth, async (req, res) => {
    try {
      if (req.isAdmin !== true) return fail(res, 403, 'Admin access required');
      const routeId = clean(req.body?.routeId, 120);
      const route = await loadRoute(routeId);
      if (!route) return fail(res, 404, 'Transit route not found');
      const departure = new Date(req.body?.departureAt);
      const capacity = Number(req.body?.capacity);
      const requestedFare = Number(req.body?.fare);
      const fare = Number.isFinite(requestedFare) ? requestedFare : Number(route.fare);
      const serviceClass = validateServiceClass(req.body?.serviceClass || route.serviceClass || 'STANDARD');
      if (Number.isNaN(departure.getTime()) || departure.getTime() <= Date.now()) return fail(res, 400, 'Valid future departureAt is required');
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return fail(res, 400, 'Valid capacity is required');
      if (!Number.isFinite(fare) || fare < 0) return fail(res, 400, 'Configured trip fare is required');
      const ref = await db.collection('transitTrips').add({
        routeId, operatorId: route.operatorId || null, vehicleId: clean(req.body?.vehicleId, 120) || null,
        departureAt: departure, capacity, fare: +fare.toFixed(2), serviceClass, status: 'SCHEDULED', active: true,
        currentStop: route.origin, currentLocation: null,
        createdBy: req.uid, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ok(res, { tripId: ref.id, status: 'SCHEDULED' }, 201);
    } catch (_e) { return fail(res, 400, 'Unable to create transit trip'); }
  });

  const EVENT_TYPES = new Set([
    'BOARDING', 'DEPARTED', 'STOPPED', 'TRAFFIC_DELAY', 'ACCIDENT_REPORTED',
    'ROAD_CLOSURE', 'MECHANICAL_DELAY', 'STATION_ARRIVAL', 'DEPARTED_STATION',
    'ARRIVING', 'COMPLETED', 'CANCELLED',
  ]);

  router.post('/trips/:tripId/events', requireAuth, async (req, res) => {
    try {
      if (req.isAdmin !== true) return fail(res, 403, 'Admin access required');

      const tripId = clean(req.params.tripId, 120);
      const type = clean(req.body?.type, 40).toUpperCase();
      if (!EVENT_TYPES.has(type)) return fail(res, 400, 'Unsupported transit event type');

      const tripRef = db.collection('transitTrips').doc(tripId);
      const eventRef = db.collection('transitTripEvents').doc();

      const latitude = Number(req.body?.latitude);
      const longitude = Number(req.body?.longitude);
      const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
      if (hasLocation && (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
        return fail(res, 400, 'Invalid event coordinates');
      }

      const currentStop = clean(req.body?.currentStop, 160) || null;
      const note = clean(req.body?.note, 500) || null;

      const result = await db.runTransaction(async (tx) => {
        const tripSnap = await tx.get(tripRef);
        if (!tripSnap.exists) throw new Error('Transit trip not found');

        const trip = tripSnap.data();
        const tripUpdates = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastOperationalEventType: type,
          lastOperationalEventAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (currentStop) tripUpdates.currentStop = currentStop;
        if (hasLocation) {
          tripUpdates.currentLocation = {
            latitude,
            longitude,
            source: 'OPERATIONAL_EVENT',
            recordedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
        }

        if (type === 'BOARDING') tripUpdates.status = 'BOARDING';
        if (type === 'DEPARTED') {
          tripUpdates.status = 'DEPARTED';
          tripUpdates.departedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        if (type === 'STATION_ARRIVAL') {
          tripUpdates.status = 'ARRIVING';
          tripUpdates.stationArrivalAt = admin.firestore.FieldValue.serverTimestamp();
        }
        if (type === 'DEPARTED_STATION') {
          tripUpdates.status = 'IN_TRANSIT';
          tripUpdates.departedStationAt = admin.firestore.FieldValue.serverTimestamp();
        }
        if (type === 'ARRIVING') tripUpdates.status = 'ARRIVING';
        if (['TRAFFIC_DELAY', 'ACCIDENT_REPORTED', 'ROAD_CLOSURE', 'MECHANICAL_DELAY'].includes(type)) {
          tripUpdates.status = 'DELAYED';
          tripUpdates.delayReason = note || type;
          tripUpdates.delayReportedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        if (type === 'COMPLETED') {
          tripUpdates.status = 'COMPLETED';
          tripUpdates.completedAt = admin.firestore.FieldValue.serverTimestamp();
        }
        if (type === 'CANCELLED') {
          tripUpdates.status = 'CANCELLED';
          tripUpdates.cancelledAt = admin.firestore.FieldValue.serverTimestamp();
        }

        tx.update(tripRef, tripUpdates);
        tx.set(eventRef, {
          tripId,
          type,
          currentStop,
          location: hasLocation ? { latitude, longitude } : null,
          note,
          recordedBy: req.uid,
          source: 'ADMIN_OPERATIONAL_EVENT',
          recordedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { tripId, eventId: eventRef.id, type, status: tripUpdates.status || trip.status };
      });

      return ok(res, { event: result }, 201);
    } catch (e) {
      return fail(res, 400, e.message || 'Unable to record transit event');
    }
  });

  router.get('/trips/:tripId/events', requireAuth, async (req, res) => {
    try {
      if (req.isAdmin !== true) return fail(res, 403, 'Admin access required');
      const tripId = clean(req.params.tripId, 120);
      const snap = await db.collection('transitTripEvents')
        .where('tripId', '==', tripId)
        .orderBy('recordedAt', 'desc')
        .limit(100)
        .get();
      return ok(res, {
        tripId,
        events: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      });
    } catch (_e) {
      return fail(res, 500, 'Unable to load transit events');
    }
  });

  router.get('/search', async (req, res) => {
    try {
      const from = clean(req.query?.from).toLowerCase();
      const to = clean(req.query?.to).toLowerCase();
      const serviceClass = req.query?.serviceClass ? validateServiceClass(req.query.serviceClass) : null;
      if (!from || !to) return fail(res, 400, 'from and to are required');
      const routeSnap = await db.collection('transitRoutes').where('active', '==', true).limit(100).get();
      const results = [];
      for (const routeDoc of routeSnap.docs) {
        const route = routeDoc.data();
        const stops = routeStops(route);
        const segment = validateSegment(stops, from, to);
        if (segment.fromIndex < 0 || segment.toIndex < 0) continue;
        if (serviceClass && String(route.serviceClass || 'STANDARD').toUpperCase() !== serviceClass) continue;
        const tripSnap = await db.collection('transitTrips').where('routeId', '==', routeDoc.id).where('status', 'in', publicStatuses).limit(50).get();
        for (const tripDoc of tripSnap.docs) {
          const trip = tripDoc.data();
          if (serviceClass && String(trip.serviceClass || route.serviceClass || 'STANDARD').toUpperCase() !== serviceClass) continue;
          const departure = trip.departureAt?.toDate ? trip.departureAt.toDate() : new Date(trip.departureAt);
          if (Number.isNaN(departure.getTime()) || departure.getTime() <= Date.now()) continue;

          const capacity = Number(trip.capacity || 0);
          const configuredFare = Number.isFinite(Number(trip.fare)) ? Number(trip.fare) : Number(route.fare);
          const bookingSnap = await db.collection('transitBookings')
            .where('tripId', '==', tripDoc.id)
            .where('status', 'in', ['CONFIRMED', 'BOARDED'])
            .get();
          const used = bookingSnap.docs.reduce((sum, bookingDoc) => {
            const b = bookingDoc.data();
            const bf = stops.map(norm).indexOf(norm(b.pickupStop));
            const bt = stops.map(norm).indexOf(norm(b.dropoffStop));
            return bf >= 0 && bt >= 0 && bf < segment.toIndex && segment.fromIndex < bt
              ? sum + Number(b.seatCount || 0)
              : sum;
          }, 0);

          results.push({
            tripId: tripDoc.id, routeId: routeDoc.id, route, trip,
            pickupStop: from, dropoffStop: to,
            segmentStops: segment.stops,
            seatsAvailable: Math.max(0, capacity - used),
            fare: Number.isFinite(configuredFare) ? +configuredFare.toFixed(2) : null,
            fareConfigured: Number.isFinite(configuredFare),
          });
        }
      }
      results.sort((a, b) => {
        const da = a.trip.departureAt?.toDate ? a.trip.departureAt.toDate() : new Date(a.trip.departureAt);
        const dbb = b.trip.departureAt?.toDate ? b.trip.departureAt.toDate() : new Date(b.trip.departureAt);
        return da - dbb;
      });
      return ok(res, { results: results.slice(0, 100) });
    } catch (_e) { return fail(res, 500, 'Unable to search transit'); }
  });

  router.post('/journeys/plan', requireAuth, async (req, res) => {
    try {
      const origin = clean(req.body?.origin, 180);
      const destination = clean(req.body?.destination, 180);
      const serviceClass = validateServiceClass(req.body?.serviceClass || 'STANDARD');
      const legs = Array.isArray(req.body?.legs) ? req.body.legs : [];
      if (!origin || !destination || !legs.length) return fail(res, 400, 'origin, destination and at least one leg are required');

      const normalizedLegs = legs.map((leg) => ({
        ...leg,
        origin: clean(leg.origin, 180),
        destination: clean(leg.destination, 180),
        mode: clean(leg.mode || 'PARTNER_RIDE', 40).toUpperCase(),
        providerId: clean(leg.providerId, 120) || null,
        tripId: clean(leg.tripId, 120) || null,
        serviceClass: leg.serviceClass || serviceClass,
      }));
      const journey = buildJourney({
        origin, destination, legs: normalizedLegs,
        pickup: req.body?.pickup || null,
        finalMile: req.body?.finalMile || null,
        serviceClass,
      });
      return ok(res, { journey });
    } catch (e) { return fail(res, 400, e.message); }
  });

  router.post('/journeys/check-connections', requireAuth, async (req, res) => {
    try {
      const legs = Array.isArray(req.body?.legs) ? req.body.legs : [];
      const checks = [];
      for (let i = 1; i < legs.length; i += 1) {
        checks.push({
          fromLeg: i - 1,
          toLeg: i,
          ...isConnectionFeasible({ arrivalAt: legs[i - 1]?.arrivalAt, nextDepartureAt: legs[i]?.departureAt, minimumBufferMinutes: Number(req.body?.minimumBufferMinutes || 30), disruptionBufferMinutes: Number(req.body?.disruptionBufferMinutes || 0) }),
        });
      }
      return ok(res, { feasible: checks.every((c) => c.feasible), checks });
    } catch (e) { return fail(res, 400, e.message); }
  });

  return router;
}

module.exports = { createTransitRouter };
