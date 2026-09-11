'use strict';

const { makeJourneyCode, validateConnectedLegs } = require('./journeyBookingEngine');

function createJourneyBookingRouter({ express, db, admin, requireAuth, fail, ok }) {
  const router = express.Router();
  const text = (v, max = 160) => String(v == null ? '' : v).trim().slice(0, max);

  router.post('/book', requireAuth, async (req, res) => {
    try {
      const legs = validateConnectedLegs(req.body?.legs);
      const origin = text(req.body?.origin);
      const destination = text(req.body?.destination);
      if (!origin || !destination) return fail(res, 400, 'origin and destination are required');
      const serviceClass = text(req.body?.serviceClass || 'STANDARD', 30).toUpperCase();
      const journeyRef = db.collection('journeys').doc();
      const journeyCode = makeJourneyCode(journeyRef.id);

      const result = await db.runTransaction(async (tx) => {
        const tripRefs = [...new Set(legs.map((l) => l.tripId).filter(Boolean))]
          .map((id) => db.collection('transitTrips').doc(id));
        const tripSnaps = await Promise.all(tripRefs.map((ref) => tx.get(ref)));
        const trips = new Map(tripSnaps.map((snap, i) => [tripRefs[i].id, snap]));

        for (const leg of legs) {
          if (!leg.tripId) continue;
          const snap = trips.get(leg.tripId);
          if (!snap?.exists) throw new Error(`Transit trip not found: ${leg.tripId}`);
          const trip = snap.data();
          if (!['SCHEDULED', 'BOARDING', 'DELAYED'].includes(trip.status) || trip.active === false) {
            throw new Error(`Transit trip ${leg.tripId} is not accepting bookings`);
          }
        }

        const bookingRefs = [];
        for (const leg of legs) {
          if (!leg.tripId) continue;
          const trip = trips.get(leg.tripId).data();
          const routeSnap = await tx.get(db.collection('transitRoutes').doc(trip.routeId));
          if (!routeSnap.exists) throw new Error(`Route not found for trip ${leg.tripId}`);
          const route = routeSnap.data();
          const stops = [route.origin, ...(route.stops || []), route.destination];
          const norm = (x) => text(x).toLowerCase();
          const from = stops.map(norm).indexOf(norm(leg.origin));
          const to = stops.map(norm).indexOf(norm(leg.destination));
          if (from < 0 || to < 0 || from >= to) throw new Error(`Invalid transit segment: ${leg.origin} → ${leg.destination}`);

          const active = await tx.get(db.collection('transitBookings')
            .where('tripId', '==', leg.tripId)
            .where('status', 'in', ['CONFIRMED', 'BOARDED']));
          const overlapping = active.docs.filter((d) => {
            const b = d.data();
            const bf = stops.map(norm).indexOf(norm(b.pickupStop));
            const bt = stops.map(norm).indexOf(norm(b.dropoffStop));
            return bf >= 0 && bt >= 0 && bf < to && from < bt;
          });
          const used = overlapping.reduce((sum, d) => sum + Number(d.data().seatCount || 0), 0);
          if (used + 1 > Number(trip.capacity || 0)) throw new Error(`No seat available on ${leg.origin} → ${leg.destination}`);

          const bookingRef = db.collection('transitBookings').doc();
          bookingRefs.push(bookingRef);
          tx.set(bookingRef, {
            passengerId: req.uid,
            tripId: leg.tripId,
            routeId: trip.routeId,
            pickupStop: leg.origin,
            dropoffStop: leg.destination,
            seatCount: 1,
            serviceClass: trip.serviceClass || serviceClass,
            fare: Number(leg.fare || 0),
            currency: 'GHS',
            status: 'CONFIRMED',
            journeyId: journeyRef.id,
            journeyCode,
            ticketCode: `OKV-${bookingRef.id.slice(0, 10).toUpperCase()}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        const totalFare = legs.reduce((sum, l) => sum + Number(l.fare || 0), 0)
          + Number(req.body?.pickup?.fare || 0)
          + Number(req.body?.finalMile?.fare || 0);
        tx.set(journeyRef, {
          passengerId: req.uid,
          journeyCode,
          origin,
          destination,
          serviceClass,
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          legs,
          pickup: req.body?.pickup || null,
          finalMile: req.body?.finalMile || null,
          totalFare: +totalFare.toFixed(2),
          currency: 'GHS',
          bookingIds: bookingRefs.map((r) => r.id),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { bookingIds: bookingRefs.map((r) => r.id), totalFare };
      });

      return ok(res, { journeyId: journeyRef.id, journeyCode, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', ...result }, 201);
    } catch (e) {
      return fail(res, 400, e.message || 'Unable to create journey booking');
    }
  });

  router.get('/:journeyId', requireAuth, async (req, res) => {
    const ref = db.collection('journeys').doc(text(req.params.journeyId, 120));
    const snap = await ref.get();
    if (!snap.exists) return fail(res, 404, 'Journey not found');
    const journey = snap.data();
    if (journey.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Access denied');
    return ok(res, { journey: { id: ref.id, ...journey } });
  });

  return router;
}

module.exports = { createJourneyBookingRouter };
