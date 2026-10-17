'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const v4Entry = read('backend/functions/v4Entry.js');
const journeyRoutes = read('backend/functions/modules/journeyBookingRoutes.js');
const transitRoutes = read('backend/functions/modules/transitRoutes.js');
const transitBooking = read('backend/functions/modules/transitBookingRoutes.js');
const trotro = read('backend/functions/modules/trotroRoutesV2.js');
const vip = read('backend/functions/modules/vipTransitRoutes.js');
const index = read('backend/functions/index.js');
const api = read('web-app/src/api.js');
const authScreen = read('web-app/src/screens/AuthScreen.jsx');
const functionsPackage = JSON.parse(read('backend/functions/package.json'));

test('V4 entrypoint mounts Journey, Transit, and Trotro routers and preserves legacy app', () => {
  assert.match(v4Entry, /require\('\.\/index'\)/);
  assert.match(v4Entry, /v4\.use\('\/trotro', trotroRouter\)/);
  assert.match(v4Entry, /v4\.use\('\/transit', transitRouter\)/);
  assert.match(v4Entry, /v4\.use\('\/journeys', journeyBookingRouter\)/);
  assert.equal(functionsPackage.main, 'v4Entry.js');
});

test('Journey booking holds inventory as PAYMENT_PENDING rather than CONFIRMED', () => {
  assert.match(journeyRoutes, /status: 'PAYMENT_PENDING'/);
  assert.match(journeyRoutes, /paymentExpiresAt/);
  assert.doesNotMatch(journeyRoutes, /status: 'CONFIRMED', journeyId: journeyRef\.id/);
});

test('Journey payment can only become paid through server-side provider verification', () => {
  assert.match(journeyRoutes, /router\.post\('\/\:journeyId\/payment\/verify', requireAuth/);
  assert.match(journeyRoutes, /https:\/\/api\.paystack\.co\/transaction\/verify\//);
  assert.match(index, /x-paystack-signature/);
  assert.match(index, /settleSuccessfulJourneyPayment/);
});

test('Journey Pass is protected and requires verified payment', () => {
  assert.match(journeyRoutes, /router\.get\('\/\:journeyId\/pass', requireAuth/);
  assert.match(journeyRoutes, /Journey Pass is available after verified payment/);
});

test('Transit inventory is transaction-serialized and server-priced', () => {
  assert.match(transitBooking, /tx\.update\(tripRef/);
  assert.match(transitBooking, /configuredFare/);
  assert.match(transitBooking, /const totalFare = \+\(configuredFare \* seatCount\)\.toFixed\(2\)/);
  assert.doesNotMatch(transitBooking, /const totalFare = Number\(req\.body\?\.fare\)/);
});

test('Trotro segment booking touches the trip document inside its transaction', () => {
  assert.match(trotro, /tx\.update\(tripRef/);
  assert.match(trotro, /inventoryVersion: admin\.firestore\.FieldValue\.increment\(1\)/);
  assert.match(trotro, /passengerId: req\.uid/);
});

test('Transit operational events require authenticated admin access', () => {
  assert.match(transitRoutes, /router\.post\('\/trips\/\:tripId\/events', requireAuth/);
  assert.match(transitRoutes, /req\.isAdmin !== true/);
});

test('VIP Journey creation uses the canonical payment-pending lifecycle', () => {
  assert.match(vip, /status: 'PAYMENT_PENDING'/);
  assert.match(vip, /paymentStatus: 'PENDING'/);
  assert.match(vip, /paymentFlow: 'USE_POST_JOURNEYS_JOURNEYID_PAY'/);
  assert.match(vip, /configuredFare/);
});

test('frontend payment verification helper matches the mounted Journey route', () => {
  assert.match(api, /verifyJourneyPayment\(journeyId/);
  assert.match(api, /\/journeys\/\$\{journeyId\}\/payment\/verify/);
});

test('Paystack secret uses Secret Manager and not deprecated Runtime Config', () => {
  assert.match(index, /defineSecret\('PAYSTACK_SECRET'\)/);
  assert.match(index, /runWith\(\{ secrets: \[PAYSTACK_SECRET\] \}\)/);
  assert.match(index, /PAYSTACK_SECRET\.value\(\)/);
  assert.doesNotMatch(index, /functions\.config\(\)/);
});

test('admin cannot fall back to a manufactured demo session', () => {
  assert.match(authScreen, /if \(role === "admin"\)/);
  assert.match(authScreen, /Admin login requires successful Firebase phone verification/);
});


test('legacy ride acceptance performs the ride state transition and notification in one transaction', () => {
  const start = index.indexOf("app.post('/rides/:rideId/accept'");
  const end = index.indexOf("app.post('/rides/:rideId/start'", start);
  assert.ok(start >= 0 && end > start, 'ride acceptance handler boundaries exist');
  const handler = index.slice(start, end);
  assert.match(handler, /db\.runTransaction/);
  assert.match(handler, /tx\.get\(rideRef\)/);
  assert.match(handler, /tx\.get\(driverRef\)/);
  assert.match(handler, /tx\.update\(rideRef/);
  assert.match(handler, /tx\.set\(notificationRef/);
  assert.doesNotMatch(handler, /await rideRef\.get\(/);
  assert.doesNotMatch(handler, /await rideRef\.update\(/);
});


test('ride payment initialization reserves the attempt before contacting Paystack', () => {
  const init = index.slice(index.indexOf("app.post('/payments/initialize'"), index.indexOf("app.get('/payments/verify/:ref'"));
  assert.ok(init.indexOf("status: 'initializing'") >= 0);
  assert.ok(init.indexOf("tx.set(attemptRef") < init.indexOf("axios.post("));
  assert.match(init, /initialization_unknown/);
  assert.match(init, /reference,\s*$/m);
});

test('cash fallback requires terminal online outcomes and a durable driver-confirmation record', () => {
  const methodRoute = index.slice(index.indexOf("app.post('/rides/:rideId/payment-method'"), index.indexOf("app.post('/rides/:rideId/complete'"));
  assert.match(methodRoute, /online-payment-unresolved/);
  assert.match(methodRoute, /CASH_AWAITING_DRIVER/);
  assert.match(methodRoute, /cash_pending_confirmation/);
  const complete = index.slice(index.indexOf("app.post('/rides/:rideId/complete'"), index.indexOf("function calcFareSplits"));
  assert.match(complete, /req\.body\?\.confirmCash !== true/);
  assert.match(complete, /paymentStatus: 'CASH_PAID'/);
});

test('ride start is an authenticated atomic accepted-to-in-progress transition', () => {
  const start = index.slice(index.indexOf("app.post('/rides/:rideId/start'"), index.indexOf("app.post('/rides/:rideId/payment-method'"));
  assert.match(start, /db\.runTransaction/);
  assert.match(start, /status: 'in_progress'/);
  assert.match(start, /ride\.status.*accepted/s);
});
