'use strict';

const functions = require('firebase-functions');
const axios = require('axios');
const { makeJourneyCode, validateConnectedLegs } = require('./journeyBookingEngine');
const { buildConnectionMonitor } = require('./journeyConnectionEngine');
const {
  holdExpiryTimestamp,
  settleSuccessfulJourneyPayment,
  settleFailedJourneyPayment,
} = require('./journeyPaymentService');

function createJourneyBookingRouter({ express, db, admin, requireAuth, fail, ok }) {
  const router = express.Router();
  const text = (v, max = 160) => String(v == null ? '' : v).trim().slice(0, max);
  const PAYMENT_HOLD_MINUTES = 15;

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
        const tripRefs = [...new Set(legs.map((l) => l.tripId).filter(Boolean))].map((id) => db.collection('transitTrips').doc(id));
        const tripSnaps = await Promise.all(tripRefs.map((ref) => tx.get(ref)));
        const trips = new Map(tripSnaps.map((snap, i) => [tripRefs[i].id, snap]));
        for (const leg of legs) {
          if (!leg.tripId) continue;
          const snap = trips.get(leg.tripId);
          if (!snap?.exists) throw new Error(`Transit trip not found: ${leg.tripId}`);
          const trip = snap.data();
          if (!['SCHEDULED', 'BOARDING', 'DELAYED'].includes(trip.status) || trip.active === false) throw new Error(`Transit trip ${leg.tripId} is not accepting bookings`);
        }
        const bookingRefs = [];
        const trustedLegFares = [];
        const routeSnapshots = new Map();
        for (const leg of legs) {
          if (!leg.tripId) continue;
          const trip = trips.get(leg.tripId).data();
          const routeSnap = routeSnapshots.get(trip.routeId) || await tx.get(db.collection('transitRoutes').doc(trip.routeId));
          if (!routeSnap.exists) throw new Error(`Route not found for trip ${leg.tripId}`);
          routeSnapshots.set(trip.routeId, routeSnap);
          const route = routeSnap.data();
          const configuredFare = Number.isFinite(Number(trip.fare)) ? Number(trip.fare) : Number(route.fare);
          if (!Number.isFinite(configuredFare) || configuredFare < 0) {
            throw new Error(`Transit trip ${leg.tripId} has no configured fare`);
          }
          const stops = [route.origin, ...(route.stops || []), route.destination];
          const norm = (x) => text(x).toLowerCase();
          const from = stops.map(norm).indexOf(norm(leg.origin));
          const to = stops.map(norm).indexOf(norm(leg.destination));
          if (from < 0 || to < 0 || from >= to) throw new Error(`Invalid transit segment: ${leg.origin} → ${leg.destination}`);
          const active = await tx.get(
            db.collection('transitBookings')
              .where('tripId', '==', leg.tripId)
              .where('status', 'in', ['PAYMENT_PENDING', 'CONFIRMED', 'BOARDED'])
          );
          const now = new Date();
          const overlapping = active.docs.filter((d) => {
            const b = d.data();
            if (String(b.status || '').toUpperCase() === 'PAYMENT_PENDING') {
              const expiry = b.paymentExpiresAt?.toDate ? b.paymentExpiresAt.toDate() : new Date(b.paymentExpiresAt || 0);
              if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime()) return false;
            }
            const bf = stops.map(norm).indexOf(norm(b.pickupStop));
            const bt = stops.map(norm).indexOf(norm(b.dropoffStop));
            return bf >= 0 && bt >= 0 && bf < to && from < bt;
          });
          const used = overlapping.reduce((sum, d) => sum + Number(d.data().seatCount || 0), 0);
          const seatCount = Number(req.body?.seatCount || 1);
          if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 10) throw new Error('seatCount must be between 1 and 10');
          if (used + seatCount > Number(trip.capacity || 0)) throw new Error(`No seats available on ${leg.origin} → ${leg.destination}`);
          const bookingRef = db.collection('transitBookings').doc();
          bookingRefs.push(bookingRef);
          const chargedFare = +(configuredFare * seatCount).toFixed(2);
          trustedLegFares.push(chargedFare);
          const paymentExpiresAt = holdExpiryTimestamp(admin, PAYMENT_HOLD_MINUTES);
          tx.update(
            db.collection('transitTrips').doc(leg.tripId),
            {
              inventoryVersion: admin.firestore.FieldValue.increment(1),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }
          );
          tx.set(bookingRef, { passengerId: req.uid, tripId: leg.tripId, routeId: trip.routeId, pickupStop: leg.origin, dropoffStop: leg.destination, seatCount, serviceClass: trip.serviceClass || serviceClass, fare: chargedFare, currency: 'GHS', status: 'PAYMENT_PENDING', paymentStatus: 'PENDING', paymentExpiresAt, journeyId: journeyRef.id, journeyCode, ticketCode: `OKV-${bookingRef.id.slice(0, 10).toUpperCase()}`, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        const pickupFare = Number(req.body?.pickup?.fare || 0);
        const finalMileFare = Number(req.body?.finalMile?.fare || 0);
        if ((Number.isFinite(pickupFare) && pickupFare !== 0) || (Number.isFinite(finalMileFare) && finalMileFare !== 0)) {
          throw new Error('Pickup and final-mile fares must be priced by a trusted backend quote before charging');
        }
        const totalFare = trustedLegFares.reduce((sum, fare) => sum + Number(fare || 0), 0);
        const paymentExpiresAt = holdExpiryTimestamp(admin, PAYMENT_HOLD_MINUTES);
        tx.set(journeyRef, { passengerId: req.uid, journeyCode, origin, destination, serviceClass, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', paymentExpiresAt, legs, pickup: req.body?.pickup || null, finalMile: req.body?.finalMile || null, totalFare: +totalFare.toFixed(2), currency: 'GHS', bookingIds: bookingRefs.map((r) => r.id), createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { bookingIds: bookingRefs.map((r) => r.id), totalFare: +totalFare.toFixed(2), paymentExpiresAt };
      });
      return ok(res, { journeyId: journeyRef.id, journeyCode, status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', ...result }, 201);
    } catch (e) { return fail(res, 400, e.message || 'Unable to create journey booking'); }
  });

  router.post('/:journeyId/confirm', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('journeys').doc(text(req.params.journeyId, 120));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Journey not found');
      const journey = snap.data();
      if (journey.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Access denied');
      if (journey.paymentStatus !== 'PAID') {
        return fail(res, 409, 'Journey payment has not been verified');
      }
      if (journey.status === 'PENDING_PAYMENT') {
        await ref.update({
          status: 'CONFIRMED',
          confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      const fresh = await ref.get();
      return ok(res, { journey: { id: ref.id, ...fresh.data() } });
    } catch (_e) {
      return fail(res, 500, 'Unable to confirm journey');
    }
  });

  router.post('/:journeyId/confirm-payment', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('journeys').doc(text(req.params.journeyId, 120));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Journey not found');
      const journey = snap.data();
      if (journey.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Access denied');
      if (journey.paymentStatus !== 'PAID') return fail(res, 409, 'Journey payment has not been verified');
      if (journey.status === 'PENDING_PAYMENT') {
        await ref.update({
          status: 'CONFIRMED',
          confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      const fresh = await ref.get();
      return ok(res, { journey: { id: ref.id, ...fresh.data() } });
    } catch (_e) {
      return fail(res, 500, 'Unable to confirm journey');
    }
  });

  router.post('/:journeyId/pay', requireAuth, async (req, res) => {
    let journeyId = null;
    try {
      journeyId = text(req.params.journeyId, 120);
      const ref = db.collection('journeys').doc(journeyId);

      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Journey not found');
      let journey = snap.data();
      if (journey.passengerId !== req.uid) return fail(res, 403, 'Payment access denied');

      if (journey.paymentStatus === 'PAID') {
        return ok(res, {
          journeyId,
          journeyCode: journey.journeyCode || null,
          status: journey.status,
          paymentStatus: 'PAID',
          alreadyPaid: true,
        });
      }

      if (journey.status !== 'PENDING_PAYMENT') {
        return fail(res, 409, 'Journey is not awaiting payment');
      }

      const configuredSecret = typeof functions !== 'undefined' ? functions.config?.().paystack?.secret : null;
      if (!configuredSecret) return fail(res, 503, 'Journey payments are not configured');

      const amount = Number(journey.totalFare || 0);
      if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'Journey has no payable amount');

      const existingExpiry = journey.paymentExpiresAt?.toDate ? journey.paymentExpiresAt.toDate() : new Date(journey.paymentExpiresAt || 0);
      if (Number.isFinite(existingExpiry.getTime()) && existingExpiry.getTime() <= Date.now()) {
        await settleFailedJourneyPayment({
          db, admin, journeyId,
          failureReason: 'Journey payment hold expired before payment initialization',
          paymentStatus: 'EXPIRED',
        });
        return fail(res, 409, 'Journey payment window has expired. Please create a new Journey.');
      }

      // Serialize payment initialization on the Journey document. The reference
      // is written before contacting Paystack so concurrent /pay requests cannot
      // create multiple provider transactions for the same payment attempt.
      let init = null;
      await db.runTransaction(async (tx) => {
        const freshSnap = await tx.get(ref);
        if (!freshSnap.exists) throw new Error('Journey not found');
        const fresh = freshSnap.data();

        if (fresh.passengerId !== req.uid) throw new Error('Payment access denied');
        if (fresh.paymentStatus === 'PAID') return;

        if (fresh.paymentStatus === 'PAYMENT_PENDING') {
          if (fresh.paymentReference && fresh.paymentAuthorizationUrl) {
            init = {
              existing: true,
              reference: fresh.paymentReference,
              authorizationUrl: fresh.paymentAuthorizationUrl,
              accessCode: fresh.paymentAccessCode || null,
            };
            return;
          }
          throw new Error('Payment initialization already in progress');
        }

        if (fresh.status !== 'PENDING_PAYMENT') throw new Error('Journey is not awaiting payment');

        const expiry = fresh.paymentExpiresAt?.toDate ? fresh.paymentExpiresAt.toDate() : new Date(fresh.paymentExpiresAt || 0);
        if (Number.isFinite(expiry.getTime()) && expiry.getTime() <= Date.now()) {
          throw new Error('Journey payment window has expired');
        }

        const attempt = Number(fresh.paymentAttempt || 0) + 1;
        const reference = `journey_${journeyId}_${attempt}`;
        const paymentRef = db.collection('payments').doc();
        const paymentExpiresAt = holdExpiryTimestamp(admin, PAYMENT_HOLD_MINUTES);

        // Refresh the Journey hold from the moment payment is initialized.
        const bookingIds = Array.isArray(fresh.bookingIds) ? fresh.bookingIds : [];
        const bookingRefs = bookingIds.map((id) => db.collection('transitBookings').doc(String(id)));
        const bookingSnaps = await Promise.all(bookingRefs.map((bookingRef) => tx.get(bookingRef)));

        for (const bookingSnap of bookingSnaps) {
          if (!bookingSnap.exists) throw new Error('Journey inventory hold is missing');
          const booking = bookingSnap.data();
          if (!['PAYMENT_PENDING', 'CONFIRMED'].includes(String(booking.status || '').toUpperCase())) {
            throw new Error('Journey inventory hold is no longer available');
          }
          if (String(booking.status || '').toUpperCase() === 'CONFIRMED' && fresh.paymentStatus !== 'PAID') {
            throw new Error('Journey inventory is in an invalid unpaid state');
          }
          if (String(booking.status || '').toUpperCase() === 'PAYMENT_PENDING') {
            tx.update(bookingSnap.ref, {
              paymentExpiresAt,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        tx.update(ref, {
          paymentStatus: 'PAYMENT_PENDING',
          paymentAttempt: attempt,
          paymentReference: reference,
          paymentStartedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentExpiresAt,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        tx.set(paymentRef, {
          journeyId,
          passengerId: req.uid,
          amount: +amount.toFixed(2),
          currency: 'GHS',
          provider: 'paystack',
          reference,
          status: 'initializing',
          purpose: 'journey',
          paymentAttempt: attempt,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        init = { existing: false, reference, paymentDocId: paymentRef.id, attempt };
      });

      if (init?.existing) {
        return ok(res, {
          journeyId,
          journeyCode: journey.journeyCode || null,
          amount: +amount.toFixed(2),
          currency: 'GHS',
          paymentProvider: 'paystack',
          paymentStatus: 'PAYMENT_PENDING',
          reference: init.reference,
          authorizationUrl: init.authorizationUrl,
          accessCode: init.accessCode,
          alreadyInitialized: true,
        });
      }

      const email = text(req.body?.email, 160);
      const phone = text(req.body?.phone, 40);
      const fallbackEmail = phone ? `${phone.replace(/[^0-9]/g, '')}@okadaonline.com` : `${req.uid}@okadaonline.com`;

      try {
        const response = await axios.post(
          'https://api.paystack.co/transaction/initialize',
          {
            email: email || fallbackEmail,
            amount: Math.round(amount * 100),
            currency: 'GHS',
            reference: init.reference,
            callback_url: 'https://okada-online.vercel.app/payment/callback',
            metadata: {
              journeyId,
              journeyCode: text(journey.journeyCode, 80),
              passengerId: req.uid,
            },
          },
          { headers: { Authorization: `Bearer ${configuredSecret}` } }
        );

        const data = response.data?.data || {};
        if (!data.authorization_url) throw new Error('Paystack did not return an authorization URL');

        await db.collection('payments').doc(init.paymentDocId).update({
          status: 'pending',
          authorizationUrl: data.authorization_url,
          accessCode: data.access_code || null,
          providerResponse: {
            status: response.data?.status === true,
            message: text(response.data?.message, 200) || null,
          },
          initializedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await ref.update({
          paymentAuthorizationUrl: data.authorization_url,
          paymentAccessCode: data.access_code || null,
          paymentStatus: 'PAYMENT_PENDING',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return ok(res, {
          journeyId,
          journeyCode: journey.journeyCode || null,
          amount: +amount.toFixed(2),
          currency: 'GHS',
          paymentProvider: 'paystack',
          paymentStatus: 'PAYMENT_PENDING',
          reference: init.reference,
          authorizationUrl: data.authorization_url,
          accessCode: data.access_code || null,
        });
      } catch (e) {
        await settleFailedJourneyPayment({
          db, admin, journeyId, reference: init.reference,
          failureReason: e.response?.data?.message || e.message || 'Unable to initialize payment',
          paymentStatus: 'FAILED',
        });
        throw e;
      }
    } catch (e) {
      return fail(res, 502, e.response?.data?.message || e.message || 'Unable to initialize journey payment');
    }
  });

  router.post('/:journeyId/payment/verify', requireAuth, async (req, res) => {
    const journeyId = text(req.params.journeyId, 120);
    try {
      const journeyRef = db.collection('journeys').doc(journeyId);
      const snap = await journeyRef.get();
      if (!snap.exists) return fail(res, 404, 'Journey not found');
      const journey = snap.data();
      if (journey.passengerId !== req.uid) return fail(res, 403, 'Payment access denied');

      if (journey.paymentStatus === 'PAID') {
        return ok(res, {
          journeyId,
          paymentStatus: 'PAID',
          journeyStatus: journey.status,
          verified: true,
        });
      }

      const configuredSecret = typeof functions !== 'undefined' ? functions.config?.().paystack?.secret : null;
      if (!configuredSecret) return fail(res, 503, 'Journey payments are not configured');

      const storedReference = text(journey.paymentReference, 160);
      const suppliedReference = text(req.body?.reference, 160);
      if (!storedReference || (suppliedReference && suppliedReference !== storedReference)) {
        return fail(res, 400, 'Payment reference does not match this Journey');
      }

      const response = await axios.get(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(storedReference)}`,
        { headers: { Authorization: `Bearer ${configuredSecret}` } }
      );

      const providerData = response.data?.data || {};
      const providerStatus = String(providerData.status || '').toLowerCase();

      if (providerStatus === 'success') {
        const settled = await settleSuccessfulJourneyPayment({
          db, admin, journeyId,
          reference: storedReference,
          providerData,
        });
        const fresh = await journeyRef.get();
        return ok(res, {
          journeyId,
          verified: true,
          outcome: settled.outcome || 'SUCCESS',
          journeyStatus: fresh.data()?.status || null,
          paymentStatus: fresh.data()?.paymentStatus || null,
        });
      }

      if (['failed', 'abandoned'].includes(providerStatus)) {
        const settled = await settleFailedJourneyPayment({
          db, admin, journeyId,
          reference: storedReference,
          failureReason: `Paystack transaction status: ${providerStatus}`,
          paymentStatus: 'FAILED',
        });
        return ok(res, {
          journeyId,
          verified: false,
          outcome: 'FAILED',
          journeyStatus: settled.journeyStatus,
          paymentStatus: settled.paymentStatus,
        });
      }

      return ok(res, {
        journeyId,
        verified: false,
        outcome: 'PENDING',
        journeyStatus: journey.status,
        paymentStatus: journey.paymentStatus,
        providerStatus: providerStatus || 'unknown',
      });
    } catch (e) {
      return fail(res, 502, e.response?.data?.message || e.message || 'Unable to verify journey payment');
    }
  });

  router.get('/:journeyId/pass', requireAuth, async (req, res) => {
    try {
      const journeyId = text(req.params.journeyId, 120);
      const journeyRef = db.collection('journeys').doc(journeyId);
      const journeySnap = await journeyRef.get();
      if (!journeySnap.exists) return fail(res, 404, 'Journey not found');
      const journey = journeySnap.data();
      if (journey.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Access denied');
      if (journey.paymentStatus !== 'PAID') return fail(res, 409, 'Journey Pass is available after verified payment');

      const bookingIds = Array.isArray(journey.bookingIds) ? journey.bookingIds : [];
      const bookings = [];
      for (const bookingId of bookingIds) {
        const b = await db.collection('transitBookings').doc(text(bookingId, 120)).get();
        if (b.exists) bookings.push({ id: b.id, ...b.data() });
      }

      const bookingById = new Map(bookings.map((b) => [b.id, b]));
      const legs = Array.isArray(journey.legs) ? journey.legs : [];
      const segments = [];
      for (let i = 0; i < legs.length; i += 1) {
        const leg = legs[i];
        const booking = leg.tripId ? bookings.find((b) => b.tripId === leg.tripId && b.pickupStop === leg.origin && b.dropoffStop === leg.destination) : null;
        let trip = null;
        let route = null;
        if (leg.tripId) {
          const tripSnap = await db.collection('transitTrips').doc(text(leg.tripId, 120)).get();
          if (tripSnap.exists) {
            trip = { id: tripSnap.id, ...tripSnap.data() };
            if (trip.routeId) {
              const routeSnap = await db.collection('transitRoutes').doc(text(trip.routeId, 120)).get();
              if (routeSnap.exists) route = { id: routeSnap.id, ...routeSnap.data() };
            }
          }
        }
        segments.push({
          sequence: i + 1,
          mode: text(leg.mode || (booking?.serviceClass === 'VIP' ? 'VIP_TRANSIT' : 'TRANSIT'), 40).toUpperCase(),
          origin: text(leg.origin, 160),
          destination: text(leg.destination, 160),
          tripId: leg.tripId || null,
          ticketCode: booking?.ticketCode || null,
          qrPayload: booking ? `okada://transit/ticket/${booking.id}` : null,
          bookingStatus: booking?.status || null,
          tripStatus: trip?.status || null,
          departureAt: trip?.departureAt || null,
          estimatedDurationMinutes: route?.estimatedDurationMinutes ?? null,
          vehicleId: trip?.vehicleId || null,
          operatorId: trip?.operatorId || route?.operatorId || null,
        });
      }

      let passenger = null;
      const userSnap = await db.collection('users').where('firebaseUid', '==', journey.passengerId).limit(1).get();
      if (!userSnap.empty) {
        const u = userSnap.docs[0].data();
        passenger = { name: text(u.name, 160) || null, phone: text(u.phone, 40) || null };
      }

      return ok(res, {
        pass: {
          journeyId,
          journeyCode: journey.journeyCode,
          passenger,
          origin: journey.origin,
          destination: journey.destination,
          serviceClass: journey.serviceClass,
          pickup: journey.pickup || null,
          transitLegs: segments,
          finalMile: journey.finalMile || null,
          paymentStatus: journey.paymentStatus,
          journeyStatus: journey.status,
          paymentExpiresAt: journey.paymentExpiresAt || null,
          currentSegmentSequence: journey.currentSegmentSequence || null,
          nextSegmentSequence: journey.nextSegmentSequence || null,
          nextAction: journey.nextAction || null,
          operationalIssue: journey.operationalIssue || null,
          lastOperationalEventType: journey.lastOperationalEventType || null,
          lastOperationalEventTripId: journey.lastOperationalEventTripId || null,
          paymentReference: journey.paymentReference || null,
          qrPayload: `okada://journey/${journey.journeyCode}`,
          issuedAt: journey.confirmedAt || journey.updatedAt || journey.createdAt || null,
        },
      });
    } catch (_e) {
      return fail(res, 500, 'Unable to generate Journey Pass');
    }
  });

  router.get('/:journeyId/events', requireAuth, async (req, res) => {
    try {
      const journeyId = text(req.params.journeyId, 120);
      const journeySnap = await db.collection('journeys').doc(journeyId).get();
      if (!journeySnap.exists) return fail(res, 404, 'Journey not found');

      const journey = journeySnap.data();
      if (journey.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Access denied');

      const legs = Array.isArray(journey.legs) ? journey.legs : [];
      const events = [];

      for (let i = 0; i < legs.length; i += 1) {
        const leg = legs[i];
        if (!leg?.tripId) continue;

        const snap = await db.collection('transitTripEvents')
          .where('tripId', '==', text(leg.tripId, 120))
          .orderBy('recordedAt', 'desc')
          .limit(50)
          .get();

        for (const doc of snap.docs) {
          events.push({
            id: doc.id,
            sequence: i + 1,
            origin: text(leg.origin, 160),
            destination: text(leg.destination, 160),
            ...doc.data(),
          });
        }
      }

      events.sort((a, b) => {
        const ta = a.recordedAt?.toDate ? a.recordedAt.toDate().getTime() : new Date(a.recordedAt || 0).getTime();
        const tb = b.recordedAt?.toDate ? b.recordedAt.toDate().getTime() : new Date(b.recordedAt || 0).getTime();
        return tb - ta;
      });

      return ok(res, {
        journeyId,
        journeyCode: journey.journeyCode || null,
        events: events.slice(0, 100),
        source: 'RECORDED_OPERATIONAL_EVENTS',
      });
    } catch (_e) {
      return fail(res, 500, 'Unable to load journey events');
    }
  });

  router.get('/:journeyId/connections', requireAuth, async (req, res) => {
    try {
      const journeyId = text(req.params.journeyId, 120);
      const snap = await db.collection('journeys').doc(journeyId).get();
      if (!snap.exists) return fail(res, 404, 'Journey not found');
      const journey = snap.data();
      if (journey.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Access denied');

      const legs = Array.isArray(journey.legs) ? journey.legs : [];
      const trips = [];
      for (const leg of legs) {
        if (!leg?.tripId) continue;
        const tripSnap = await db.collection('transitTrips').doc(text(leg.tripId, 120)).get();
        if (tripSnap.exists) trips.push({ id: tripSnap.id, ...tripSnap.data() });
      }

      const monitor = buildConnectionMonitor({
        legs,
        trips,
        minimumBufferMinutes: Number(journey.minimumConnectionBufferMinutes || 30),
      });

      return ok(res, {
        journeyId,
        journeyCode: journey.journeyCode || null,
        journeyStatus: journey.status,
        connections: monitor.connections,
        timingCoverage: monitor.timingCoverage,
        liveDataAvailable: monitor.operationalTimeDataAvailable,
        note: 'Connection state is based only on recorded operational times. Unknown timing is reported as UNKNOWN.',
      });
    } catch (_e) {
      return fail(res, 500, 'Unable to monitor journey connections');
    }
  });

  router.get('/:journeyId/status', requireAuth, async (req, res) => {
    try {
      const journeyId = text(req.params.journeyId, 120);
      const journeyRef = db.collection('journeys').doc(journeyId);
      const snap = await journeyRef.get();
      if (!snap.exists) return fail(res, 404, 'Journey not found');
      const journey = snap.data();
      if (journey.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Access denied');

      const legs = Array.isArray(journey.legs) ? journey.legs : [];
      const segments = [];
      const monitorTrips = [];
      let activeSequence = null;
      let nextSequence = null;

      for (let i = 0; i < legs.length; i += 1) {
        const leg = legs[i];
        let trip = null;
        let booking = null;

        if (leg.tripId) {
          const tripSnap = await db.collection('transitTrips').doc(text(leg.tripId, 120)).get();
          if (tripSnap.exists) trip = { id: tripSnap.id, ...tripSnap.data() };
          if (trip) monitorTrips.push(trip);
          const bookingSnap = await db.collection('transitBookings')
            .where('journeyId', '==', journeyId)
            .where('tripId', '==', leg.tripId)
            .where('passengerId', '==', journey.passengerId)
            .limit(1)
            .get();
          if (!bookingSnap.empty) booking = { id: bookingSnap.docs[0].id, ...bookingSnap.docs[0].data() };
        }

        const bookingStatus = booking?.status || null;
        const tripStatus = trip?.status || null;
        let segmentStatus = 'PLANNING';
        if (bookingStatus === 'CANCELLED') segmentStatus = 'CANCELLED';
        else if (bookingStatus === 'BOARDED') segmentStatus = 'IN_TRANSIT';
        else if (tripStatus === 'DEPARTED' || tripStatus === 'IN_TRANSIT') segmentStatus = 'IN_TRANSIT';
        else if (tripStatus === 'ARRIVING') segmentStatus = 'ARRIVING';
        else if (tripStatus === 'BOARDING') segmentStatus = 'BOARDING';
        else if (tripStatus === 'DELAYED') segmentStatus = 'DELAYED';
        else if (tripStatus === 'COMPLETED') segmentStatus = 'COMPLETED';
        else if (tripStatus === 'SCHEDULED') segmentStatus = 'SCHEDULED';

        if (!activeSequence && ['SCHEDULED', 'BOARDING', 'DELAYED', 'IN_TRANSIT', 'ARRIVING'].includes(segmentStatus)) activeSequence = i + 1;
        if (!nextSequence && activeSequence && i + 1 > activeSequence && segmentStatus === 'SCHEDULED') nextSequence = i + 1;

        segments.push({
          sequence: i + 1,
          mode: text(leg.mode || 'TRANSIT', 40).toUpperCase(),
          origin: text(leg.origin, 160),
          destination: text(leg.destination, 160),
          tripId: leg.tripId || null,
          bookingId: booking?.id || null,
          bookingStatus,
          tripStatus,
          segmentStatus,
          currentStop: trip?.currentStop || null,
          currentLocation: trip?.currentLocation || null,
          departureAt: trip?.departureAt || null,
          liveLocationAvailable: !!trip?.currentLocation,
        });
      }

      if (journey.status === 'CONFIRMED' && activeSequence === null && segments.length) nextSequence = 1;
      if (journey.status === 'COMPLETED') activeSequence = null;

      const connectionMonitor = buildConnectionMonitor({
        legs,
        trips: monitorTrips,
        minimumBufferMinutes: Number(journey.minimumConnectionBufferMinutes || 30),
      });

      return ok(res, {
        status: {
          journeyId,
          journeyCode: journey.journeyCode || null,
          journeyStatus: journey.status,
          paymentStatus: journey.paymentStatus,
          paymentExpiresAt: journey.paymentExpiresAt || null,
          currentSegmentSequence: journey.currentSegmentSequence || activeSequence,
          nextSegmentSequence: journey.nextSegmentSequence || nextSequence,
          nextAction: journey.nextAction || null,
          operationalIssue: journey.operationalIssue || null,
          lastOperationalEventType: journey.lastOperationalEventType || null,
          lastOperationalEventTripId: journey.lastOperationalEventTripId || null,
          activeSequence,
          nextSequence,
          liveDataAvailable: segments.some((s) => s.liveLocationAvailable),
          etaAvailable: false,
          note: 'Status reflects recorded booking/trip data. ETA is not guaranteed unless supported by live operational data.',
          segments,
          connections: connectionMonitor.connections,
          connectionTimingCoverage: connectionMonitor.timingCoverage,
          updatedAt: journey.updatedAt || null,
        },
      });
    } catch (_e) {
      return fail(res, 500, 'Unable to load journey status');
    }
  });

  router.post('/:journeyId/cancel', requireAuth, async (req, res) => {
    try {
      const journeyId = text(req.params.journeyId, 120);
      const journeyRef = db.collection('journeys').doc(journeyId);
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(journeyRef);
        if (!snap.exists) throw new Error('Journey not found');
        const journey = snap.data();
        if (journey.passengerId !== req.uid && req.isAdmin !== true) throw new Error('Access denied');
        if (journey.status === 'CANCELLED') return { status: 'CANCELLED', paymentStatus: journey.paymentStatus, alreadyCancelled: true };
        if (['BOARDING', 'IN_TRANSIT', 'FINAL_MILE', 'COMPLETED'].includes(journey.status)) {
          throw new Error('Journey cannot be cancelled at this stage');
        }

        const bookingIds = Array.isArray(journey.bookingIds) ? journey.bookingIds : [];
        const bookingRefs = bookingIds.map((id) => db.collection('transitBookings').doc(text(id, 120)));
        const bookingSnaps = await Promise.all(bookingRefs.map((ref) => tx.get(ref)));

        for (let i = 0; i < bookingSnaps.length; i += 1) {
          const bSnap = bookingSnaps[i];
          if (!bSnap.exists) continue;
          const b = bSnap.data();
          if (b.status === 'BOARDED') throw new Error('A journey segment has already boarded');
          if (b.status === 'CONFIRMED') {
            tx.update(bookingRefs[i], {
              status: 'CANCELLED',
              cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        const cancellationReason = text(req.body?.reason, 240) || 'Passenger requested cancellation';
        const refundStatus = journey.paymentStatus === 'PAID' ? 'REQUIRES_REVIEW' : 'NOT_APPLICABLE';
        tx.update(journeyRef, {
          status: 'CANCELLED',
          cancellationReason,
          refundStatus,
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { status: 'CANCELLED', paymentStatus: journey.paymentStatus, refundStatus, alreadyCancelled: false };
      });

      return ok(res, { journeyId, ...result });
    } catch (e) {
      return fail(res, 400, e.message || 'Unable to cancel journey');
    }
  });

  router.get('/:journeyId', requireAuth, async (req, res) => {
    try {
      const ref = db.collection('journeys').doc(text(req.params.journeyId, 120));
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Journey not found');
      const journey = snap.data();
      if (journey.passengerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Access denied');
      return ok(res, { journey: { id: ref.id, ...journey } });
    } catch (_e) { return fail(res, 500, 'Unable to load journey'); }
  });

  return router;
}

module.exports = { createJourneyBookingRouter };
