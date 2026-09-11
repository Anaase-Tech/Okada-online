'use strict';

const { CORRIDORS } = require('./transitHub');
const { buildVipJourney, validateServiceClass } = require('./vipTransit');

function createVipTransitRouter({ express, db, admin, requireAuth, ok, fail, sanitize }) {
  const router = express.Router();
  const clean = (v, max = 180) => sanitize(String(v == null ? '' : v).trim()).slice(0, max);

  router.get('/vip/options', async (_req, res) => {
    return ok(res, {
      hub: { id: 'KOFORIDUA_HUB', name: 'Koforidua Hub', city: 'Koforidua', region: 'Eastern Region' },
      serviceClasses: ['VIP', 'EXECUTIVE', 'PRIVATE'],
      corridors: CORRIDORS,
      integratedPickup: true,
      integratedFinalMile: true,
    });
  });

  router.post('/vip/plan', requireAuth, async (req, res) => {
    try {
      const serviceClass = validateServiceClass(req.body?.serviceClass || 'VIP');
      if (!['VIP', 'EXECUTIVE', 'PRIVATE'].includes(serviceClass)) return fail(res, 400, 'VIP planner requires VIP, EXECUTIVE or PRIVATE');
      const tripId = clean(req.body?.transitTripId, 120);
      if (!tripId) return fail(res, 400, 'transitTripId is required');

      const tripSnap = await db.collection('transitTrips').doc(tripId).get();
      if (!tripSnap.exists) return fail(res, 404, 'Transit trip not found');
      const trip = tripSnap.data();
      if (!['SCHEDULED', 'BOARDING', 'DELAYED'].includes(trip.status)) return fail(res, 400, 'Transit trip is not available');
      const routeSnap = await db.collection('transitRoutes').doc(trip.routeId).get();
      if (!routeSnap.exists || routeSnap.data().active !== true) return fail(res, 404, 'Transit route not found');
      const route = routeSnap.data();

      const journey = buildVipJourney({
        origin: req.body?.origin,
        destination: req.body?.destination,
        transitTripId: tripId,
        transitOrigin: route.origin,
        transitDestination: route.destination,
        pickup: req.body?.pickup,
        finalMile: req.body?.finalMile,
        serviceClass,
        fares: {
          pickup: Number(req.body?.pickup?.fare || 0),
          transit: Number(req.body?.transitFare || 0),
          finalMile: Number(req.body?.finalMile?.fare || 0),
          transitProviderId: trip.operatorId || null,
        },
      });
      return ok(res, { journey });
    } catch (e) { return fail(res, 400, e.message); }
  });

  router.post('/vip/journeys', requireAuth, async (req, res) => {
    try {
      const journey = req.body?.journey;
      if (!journey?.origin || !journey?.destination || !Array.isArray(journey.legs) || !journey.legs.length) return fail(res, 400, 'Valid journey is required');
      const doc = await db.collection('journeys').add({
        userId: req.uid,
        type: 'OKADA_VIP_JOURNEY',
        serviceClass: validateServiceClass(journey.serviceClass || 'VIP'),
        origin: clean(journey.origin), destination: clean(journey.destination),
        hub: journey.hub || { id: 'KOFORIDUA_HUB', name: 'Koforidua Hub' },
        legs: journey.legs,
        totalFare: Number(journey.totalFare || 0),
        status: 'PENDING_PAYMENT',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ok(res, { journeyId: doc.id, status: 'PENDING_PAYMENT' }, 201);
    } catch (e) { return fail(res, 400, e.message); }
  });

  return router;
}

module.exports = { createVipTransitRouter };
