'use strict';

const { CORRIDORS } = require('./transitHub');
const { buildVipJourney, validateServiceClass } = require('./vipTransit');
const { validateConnectedLegs, makeJourneyCode } = require('./journeyBookingEngine');
const { holdExpiryTimestamp } = require('./journeyPaymentService');

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

      const configuredFare = Number.isFinite(Number(trip.fare)) ? Number(trip.fare) : Number(route.fare);
      if (!Number.isFinite(configuredFare) || configuredFare < 0) return fail(res,400,'VIP transit trip has no configured fare');
      const pickupFare = Number(req.body?.pickup?.fare || 0);
      const finalMileFare = Number(req.body?.finalMile?.fare || 0);
      if ((Number.isFinite(pickupFare) && pickupFare !== 0) || (Number.isFinite(finalMileFare) && finalMileFare !== 0)) {
        return fail(res,400,'Pickup and final-mile fares require a trusted quote before charging');
      }

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
          pickup: 0,
          transit: configuredFare,
          finalMile: 0,
          transitProviderId: trip.operatorId || null,
        },
      });
      return ok(res, { journey });
    } catch (e) { return fail(res, 400, e.message); }
  });

  router.post('/vip/journeys', requireAuth, async (req, res) => {
    try {
      const requested = req.body?.journey;
      if (!requested?.origin || !requested?.destination || !Array.isArray(requested.legs) || !requested.legs.length) {
        return fail(res, 400, 'Valid journey is required');
      }

      const serviceClass = validateServiceClass(requested.serviceClass || 'VIP');
      if (!['VIP', 'EXECUTIVE', 'PRIVATE'].includes(serviceClass)) {
        return fail(res,400,'VIP Journey requires VIP, EXECUTIVE or PRIVATE');
      }

      const seatCount = Number(req.body?.seatCount ?? requested.seatCount ?? 1);
      if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 10) {
        return fail(res,400,'seatCount must be between 1 and 10');
      }

      const legs = validateConnectedLegs(requested.legs);
      const journeyRef = db.collection('journeys').doc();
      const journeyCode = makeJourneyCode(journeyRef.id);

      const result = await db.runTransaction(async (tx) => {
        const bookingRefs = [];
        const safeLegs = [];
        const trustedLegFares = [];
        const routeSnapshots = new Map();
        const tripRefs = [...new Set(legs.map((leg) => leg.tripId).filter(Boolean))]
          .map((id) => db.collection('transitTrips').doc(id));
        const tripSnaps = await Promise.all(tripRefs.map((ref) => tx.get(ref)));
        const trips = new Map(tripSnaps.map((snap, i) => [tripRefs[i].id, snap]));
        const paymentExpiresAt = holdExpiryTimestamp(admin, 15);

        let transitLegCount = 0;
        for (const leg of legs) {
          if (!leg.tripId) {
            if (Number(leg.fare || 0) !== 0) {
              throw new Error('Non-transit VIP legs require a trusted quote before charging');
            }
            safeLegs.push({ ...leg, fare: 0 });
            continue;
          }

          transitLegCount += 1;
          const tripSnap = trips.get(leg.tripId);
          if (!tripSnap?.exists) throw new Error(`Transit trip not found: ${leg.tripId}`);
          const trip = tripSnap.data();
          if (!['SCHEDULED','BOARDING','DELAYED'].includes(trip.status) || trip.active === false) {
            throw new Error('Transit trip is not accepting bookings');
          }

          const routeSnap = routeSnapshots.get(trip.routeId) || await tx.get(db.collection('transitRoutes').doc(trip.routeId));
          if (!routeSnap.exists) throw new Error('Transit route not found');
          routeSnapshots.set(trip.routeId, routeSnap);
          const route = routeSnap.data();
          if (!route.active) throw new Error('Transit route is not active');

          const tripClass = validateServiceClass(trip.serviceClass || route.serviceClass || serviceClass);
          if (tripClass !== serviceClass) throw new Error('Requested VIP service class is not available on this trip');

          const configuredFare = Number.isFinite(Number(trip.fare)) ? Number(trip.fare) : Number(route.fare);
          if (!Number.isFinite(configuredFare) || configuredFare < 0) throw new Error('Transit trip has no configured fare');

          const stops = [route.origin, ...(route.stops || []), route.destination];
          const norm = (x) => String(x || '').trim().toLowerCase();
          const from = stops.map(norm).indexOf(norm(leg.origin));
          const to = stops.map(norm).indexOf(norm(leg.destination));
          if (from < 0 || to < 0 || from >= to) throw new Error('Invalid VIP transit segment');

          const active = await tx.get(
            db.collection('transitBookings')
              .where('tripId','==',leg.tripId)
              .where('status','in',['PAYMENT_PENDING','CONFIRMED','BOARDED'])
          );
          const now = new Date();
          const overlapping = active.docs.filter((d) => {
            const booking = d.data();
            if (String(booking.status || '').toUpperCase() === 'PAYMENT_PENDING') {
              const expiry = booking.paymentExpiresAt?.toDate
                ? booking.paymentExpiresAt.toDate()
                : new Date(booking.paymentExpiresAt || 0);
              if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime()) return false;
            }
            const bf = stops.map(norm).indexOf(norm(booking.pickupStop));
            const bt = stops.map(norm).indexOf(norm(booking.dropoffStop));
            return bf >= 0 && bt >= 0 && bf < to && from < bt;
          });
          const used = overlapping.reduce((sum,d) => sum + Number(d.data().seatCount || 0),0);
          if (used + seatCount > Number(trip.capacity || 0)) throw new Error(`No VIP seats available: ${leg.origin} → ${leg.destination}`);

          const bookingRef = db.collection('transitBookings').doc();
          bookingRefs.push(bookingRef);
          const chargedFare = +(configuredFare * seatCount).toFixed(2);
          trustedLegFares.push(chargedFare);
          safeLegs.push({
            ...leg,
            serviceClass,
            fare: configuredFare,
          });

          tx.update(db.collection('transitTrips').doc(leg.tripId), {
            inventoryVersion: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          tx.set(bookingRef, {
            passengerId: req.uid,
            tripId: leg.tripId,
            routeId: trip.routeId,
            pickupStop: leg.origin,
            dropoffStop: leg.destination,
            seatCount,
            serviceClass: tripClass,
            fare: chargedFare,
            currency: 'GHS',
            status: 'PAYMENT_PENDING',
            paymentStatus: 'PENDING',
            paymentExpiresAt,
            journeyId: journeyRef.id,
            journeyCode,
            ticketCode: `OKV-${bookingRef.id.slice(0,10).toUpperCase()}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        if (!transitLegCount) throw new Error('VIP Journey must include at least one transit trip');
        const totalFare = trustedLegFares.reduce((sum,fare) => sum + fare, 0);

        tx.set(journeyRef, {
          passengerId: req.uid,
          journeyCode,
          type: 'OKADA_VIP_JOURNEY',
          serviceClass,
          origin: String(requested.origin).trim().slice(0,180),
          destination: String(requested.destination).trim().slice(0,180),
          hub: requested.hub || { id:'KOFORIDUA_HUB', name:'Koforidua Hub' },
          legs: safeLegs,
          totalFare: +totalFare.toFixed(2),
          currency: 'GHS',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          paymentExpiresAt,
          bookingIds: bookingRefs.map((ref) => ref.id),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return { journeyId: journeyRef.id, journeyCode, totalFare: +totalFare.toFixed(2), bookingIds: bookingRefs.map((ref) => ref.id), paymentExpiresAt };
      });

      return ok(res, {
        ...result,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        paymentFlow: 'USE_POST_JOURNEYS_JOURNEYID_PAY',
      }, 201);
    } catch (e) {
      return fail(res, 400, e.message || 'Unable to create VIP Journey');
    }
  });

  return router;
}

module.exports = { createVipTransitRouter };
