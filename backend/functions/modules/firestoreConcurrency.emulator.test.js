'use strict';

// These tests run against Firestore Emulator in a separate CI job. They are
// skipped in the normal fast suite unless explicitly enabled.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const admin = require('firebase-admin');

const enabled = process.env.OKADA_FIRESTORE_EMULATOR === '1';
const emulatorTest = enabled ? test : test.skip;

const { createTrotroRouter } = require('./trotroRoutesV2');
const { createTransitBookingRouter } = require('./transitBookingRoutes');
const { createJourneyBookingRouter } = require('./journeyBookingRoutes');
const { createEventBookingHandler } = require('./eventBookingGuard');

if (enabled) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('OKADA_FIRESTORE_EMULATOR=1 requires FIRESTORE_EMULATOR_HOST');
  }
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-okada-stress' });
  }
}
const db = enabled ? admin.firestore() : null;
const clean = (value) => String(value == null ? '' : value).trim().slice(0, 500);
const fail = (res, code, message) => res.status(code).json({ error: message });
const ok = (res, data, code = 200) => res.status(code).json({ ok: true, ...data });

// This injected auth middleware tests booking business logic, not production
// Firebase ID-token verification (which has separate tests).
function testAuth(req, res, next) {
  const uid = req.header('x-test-uid');
  if (!uid) return res.status(401).json({ error: 'Missing test identity' });
  req.uid = uid;
  req.isAdmin = false;
  return next();
}
async function resolveEventBookingUserRef(userId, req) {
  for (const collectionName of ['users', 'drivers', 'owners']) {
    const ref = db.collection(collectionName).doc(clean(userId));
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data();
    if (req.isAdmin !== true && data?.firebaseUid !== req.uid && ref.id !== req.uid) return null;
    return { ref, col: collectionName, data };
  }
  return null;
}

async function startApp() {
  const app = express();
  app.use(express.json());
  const deps = { express, db, admin, requireAuth: testAuth, fail, ok, sanitize: clean };
  app.use('/trotro', createTrotroRouter(deps));
  app.use('/transit', createTransitBookingRouter(deps));
  app.use('/journeys', createJourneyBookingRouter(deps));
  app.post('/events/book', testAuth, createEventBookingHandler({
    resolveUserRef: resolveEventBookingUserRef,
    db,
    admin,
    fail,
    ok,
    sanitize: clean,
    scheduledPricing: { car: { flag: 3.50, perKm: 4.50 } },
  }));
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.once('error', reject);
  });
  return {
    baseUrl: 'http://127.0.0.1:' + server.address().port,
    close: () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
}
async function postJson(baseUrl, path, uid, body) {
  const response = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-uid': uid },
    body: JSON.stringify(body),
  });
  let result = {};
  try { result = await response.json(); } catch (_) {}
  return { status: response.status, body: result };
}
function unique(prefix) {
  return prefix + '_' + Date.now() + '_' + crypto.randomBytes(5).toString('hex');
}
async function sendConcurrent(baseUrl, path, bodyFactory, count) {
  return Promise.all(Array.from({ length: count }, (_, index) =>
    postJson(baseUrl, path, 'stress-passenger-' + index, bodyFactory(index))
  ));
}
function successful(results) {
  return results.filter((result) => result.status === 201);
}

emulatorTest('Firestore Emulator: concurrent Trotro bookings never oversell segment capacity', { timeout: 60000 }, async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const routeId = unique('trotro_route');
  const tripId = unique('trotro_trip');
  await db.collection('trotroRoutes').doc(routeId).set({
    origin: 'Akosombo', stops: ['Atimpoku', 'Kpong'], destination: 'Koforidua',
    active: true, operatorId: 'emulator-operator',
  });
  await db.collection('trotroTrips').doc(tripId).set({ routeId, status: 'SCHEDULED', active: true, capacity: 2 });

  const results = await sendConcurrent(app.baseUrl, '/trotro/book', () => ({
    tripId, pickupStop: 'Akosombo', dropoffStop: 'Koforidua', seatCount: 1,
  }), 4);
  const stored = await db.collection('trotroBookings').where('tripId', '==', tripId).get();
  const seats = stored.docs
    .filter((doc) => ['CONFIRMED', 'BOARDED'].includes(String(doc.data().status || '').toUpperCase()))
    .reduce((sum, doc) => sum + Number(doc.data().seatCount || 0), 0);
  assert.equal(successful(results).length, 2, JSON.stringify(results));
  assert.equal(seats, 2, JSON.stringify(results));
});

emulatorTest('Firestore Emulator: concurrent standalone Transit bookings never oversell a segment', { timeout: 60000 }, async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const routeId = unique('transit_route');
  const tripId = unique('transit_trip');
  await db.collection('transitRoutes').doc(routeId).set({
    origin: 'Akosombo', stops: ['Atimpoku', 'Kpong'], destination: 'Koforidua',
    serviceClass: 'STANDARD', fare: 20, active: true,
  });
  await db.collection('transitTrips').doc(tripId).set({
    routeId, status: 'SCHEDULED', active: true, capacity: 2, serviceClass: 'STANDARD', fare: 20,
  });

  const results = await sendConcurrent(app.baseUrl, '/transit/trips/' + tripId + '/book', () => ({
    pickupStop: 'Akosombo', dropoffStop: 'Koforidua', seatCount: 1, serviceClass: 'STANDARD',
  }), 4);
  const stored = await db.collection('transitBookings').where('tripId', '==', tripId).get();
  const seats = stored.docs
    .filter((doc) => ['PAYMENT_PENDING', 'CONFIRMED', 'BOARDED'].includes(String(doc.data().status || '').toUpperCase()))
    .reduce((sum, doc) => sum + Number(doc.data().seatCount || 0), 0);
  assert.equal(successful(results).length, 2, JSON.stringify(results));
  assert.equal(seats, 2, JSON.stringify(results));
});

emulatorTest('Firestore Emulator: multi-leg Journey reads before writes and cannot oversell either leg', { timeout: 60000 }, async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const routeOneId = unique('journey_route_one');
  const routeTwoId = unique('journey_route_two');
  const tripOneId = unique('journey_trip_one');
  const tripTwoId = unique('journey_trip_two');
  await Promise.all([
    db.collection('transitRoutes').doc(routeOneId).set({
      origin: 'Akosombo', stops: [], destination: 'Koforidua', serviceClass: 'STANDARD', fare: 25, active: true,
    }),
    db.collection('transitRoutes').doc(routeTwoId).set({
      origin: 'Koforidua', stops: [], destination: 'Kumasi', serviceClass: 'STANDARD', fare: 45, active: true,
    }),
    db.collection('transitTrips').doc(tripOneId).set({
      routeId: routeOneId, status: 'SCHEDULED', active: true, capacity: 2, serviceClass: 'STANDARD', fare: 25,
    }),
    db.collection('transitTrips').doc(tripTwoId).set({
      routeId: routeTwoId, status: 'SCHEDULED', active: true, capacity: 2, serviceClass: 'STANDARD', fare: 45,
    }),
  ]);

  const results = await sendConcurrent(app.baseUrl, '/journeys/book', () => ({
    origin: 'Akosombo', destination: 'Kumasi', serviceClass: 'STANDARD', seatCount: 1,
    legs: [
      { mode: 'TRANSIT', tripId: tripOneId, origin: 'Akosombo', destination: 'Koforidua' },
      { mode: 'TRANSIT', tripId: tripTwoId, origin: 'Koforidua', destination: 'Kumasi' },
    ],
  }), 4);

  const [one, two] = await Promise.all([
    db.collection('transitBookings').where('tripId', '==', tripOneId).get(),
    db.collection('transitBookings').where('tripId', '==', tripTwoId).get(),
  ]);
  const seatsOne = one.docs
    .filter((doc) => ['PAYMENT_PENDING', 'CONFIRMED', 'BOARDED'].includes(String(doc.data().status || '').toUpperCase()))
    .reduce((sum, doc) => sum + Number(doc.data().seatCount || 0), 0);
  const seatsTwo = two.docs
    .filter((doc) => ['PAYMENT_PENDING', 'CONFIRMED', 'BOARDED'].includes(String(doc.data().status || '').toUpperCase()))
    .reduce((sum, doc) => sum + Number(doc.data().seatCount || 0), 0);

  assert.equal(successful(results).length, 2, JSON.stringify(results));
  assert.equal(seatsOne, 2, JSON.stringify(results));
  assert.equal(seatsTwo, 2, JSON.stringify(results));
  assert.equal(one.docs.filter((doc) => doc.data().journeyId).length, 2);
  assert.equal(two.docs.filter((doc) => doc.data().journeyId).length, 2);
});

emulatorTest('Firestore Emulator: Journey booking rejects a route explicitly marked inactive', { timeout: 30000 }, async (t) => {
  const app = await startApp();
  t.after(() => app.close());
  const routeId = unique('inactive_journey_route');
  const tripId = unique('inactive_journey_trip');
  await db.collection('transitRoutes').doc(routeId).set({
    origin: 'Akosombo', stops: [], destination: 'Koforidua', serviceClass: 'STANDARD', fare: 25, active: false,
  });
  await db.collection('transitTrips').doc(tripId).set({
    routeId, status: 'SCHEDULED', active: true, capacity: 2, serviceClass: 'STANDARD', fare: 25,
  });
  const response = await postJson(app.baseUrl, '/journeys/book', 'inactive-route-passenger', {
    origin: 'Akosombo', destination: 'Koforidua', serviceClass: 'STANDARD', seatCount: 1,
    legs: [{ mode: 'TRANSIT', tripId, origin: 'Akosombo', destination: 'Koforidua' }],
  });
  assert.equal(response.status, 400);
  assert.match(response.body.error || '', /route is inactive/i);
  const bookings = await db.collection('transitBookings').where('tripId', '==', tripId).get();
  assert.equal(bookings.size, 0);
});

emulatorTest('Firestore Emulator: invalid event deposit percent causes no event or wallet mutation', { timeout: 30000 }, async (t) => {
  const app = await startApp();
  t.after(() => app.close());

  const userId = unique('event_user_invalid');
  const uid = unique('event_auth_invalid');
  const userRef = db.collection('users').doc(userId);
  await userRef.set({ firebaseUid: uid, wallet: { available: 100, pending: 0 } });

  const response = await postJson(app.baseUrl, '/events/book', uid, {
    userId,
    eventName: 'Invalid deposit test',
    eventDate: '2026-11-15',
    pickupAddress: 'Akosombo',
    destAddress: 'Atimpoku',
    vehicleType: 'car',
    depositPercent: -0.5,
  });

  assert.equal(response.status, 400, JSON.stringify(response));
  assert.match(response.body.error || '', /depositPercent must be greater than 0/);
  const [userSnap, eventSnap] = await Promise.all([
    userRef.get(),
    db.collection('event_rides').where('userId', '==', userId).get(),
  ]);
  assert.equal(eventSnap.size, 0);
  assert.equal(userSnap.data().wallet.available, 100);
  assert.equal(userSnap.data().wallet.pending, 0);
});

emulatorTest('Firestore Emulator: concurrent event bookings cannot overdraw the wallet or split event/wallet state', { timeout: 60000 }, async (t) => {
  const app = await startApp();
  t.after(() => app.close());

  const userId = unique('event_user_concurrent');
  const uid = unique('event_auth_concurrent');
  const userRef = db.collection('users').doc(userId);
  await userRef.set({ firebaseUid: uid, wallet: { available: 30, pending: 0 } });

  const request = (eventName) => postJson(app.baseUrl, '/events/book', uid, {
    userId,
    eventName,
    eventDate: '2026-11-15',
    pickupAddress: 'Akosombo',
    destAddress: 'Atimpoku',
    vehicleType: 'car',
  });
  const results = await Promise.all([request('Concurrent event A'), request('Concurrent event B')]);

  assert.equal(results.filter((result) => result.status === 200).length, 1, JSON.stringify(results));
  assert.equal(results.filter((result) => result.status === 400).length, 1, JSON.stringify(results));

  const [userSnap, eventSnap] = await Promise.all([
    userRef.get(),
    db.collection('event_rides').where('userId', '==', userId).get(),
  ]);
  const wallet = userSnap.data().wallet;
  assert.equal(eventSnap.size, 1);
  assert.ok(Math.abs(wallet.available - 8.7) < 0.001, JSON.stringify(wallet));
  assert.ok(Math.abs(wallet.pending - 21.3) < 0.001, JSON.stringify(wallet));
  assert.ok(wallet.available >= 0, JSON.stringify(wallet));
  assert.equal(eventSnap.docs[0].data().deposit, 21.3);
});

