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
const passengerSource = read('web-app/src/screens/PassengerApp.jsx');
const paymentService = read('backend/functions/modules/legacyPaymentService.js');
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


test('passenger online payment opens provider authorization and verifies callback instead of showing timer success', () => {
  const passenger = fs.readFileSync(path.resolve(__dirname, '../../../web-app/src/screens/PassengerApp.jsx'), 'utf8');
  assert.match(passenger, /window\.location\.assign\(result\.authorizationUrl\)/);
  assert.match(passenger, /api\.verifyPayment\(reference\)/);
  assert.doesNotMatch(passenger, /setTimeout\(\(\)=>\{setPayStatus\("paid"\)/);
});

test('passenger real ride request does not manufacture a driver match', () => {
  const passenger = fs.readFileSync(path.resolve(__dirname, '../../../web-app/src/screens/PassengerApp.jsx'), 'utf8');
  assert.match(passenger, /const result = await api\.requestRide/);
  assert.match(passenger, /onSnapshot\(rideRef/);
  assert.doesNotMatch(passenger, /Kwame Asante|drv_001|Math\.random\(\)\*20/);
});

test('driver location publishing uses browser geolocation, not generated coordinates', () => {
  const driver = fs.readFileSync(path.resolve(__dirname, '../../../web-app/src/screens/DriverApp.jsx'), 'utf8');
  assert.match(driver, /navigator\.geolocation\.watchPosition/);
  assert.doesNotMatch(driver, /Math\.random\(\)-0\.5/);
});


test('Pay Later authorization is linked to the ride and is protected against retries and active online attempts', () => {
  const route = index.slice(index.indexOf("app.post('/fintech/pay-later/request'"), index.indexOf("// GET /fintech/pay-later/history"));
  assert.match(route, /db\.runTransaction/);
  assert.match(route, /paymentMethod: 'pay_later'/);
  assert.match(route, /paymentStatus: 'DEFERRED'/);
  assert.match(route, /payLaterTxId: payLaterRef\.id/);
  assert.match(route, /online-payment-unresolved/);
  assert.match(route, /online-payment-review/);
  assert.match(route, /idempotent: true/);
});

test('ride completion validates the stored Pay Later record before authorizing deferred settlement', () => {
  const complete = index.slice(index.indexOf("app.post('/rides/:rideId/complete'"), index.indexOf('function calcFareSplits'));
  assert.match(complete, /payLaterCreditRequired/);
  assert.match(complete, /pay-later-record-missing/);
  assert.match(complete, /pay-later-record-invalid/);
  assert.match(complete, /payLaterCreditAuthorized/);
});

test('late Paystack success cancels an unpaid deferral or flags an already-repaid deferral for refund review', () => {
  assert.match(paymentService, /ONLINE_SUCCESS_AFTER_PAY_LATER_REPAID/);
  assert.match(paymentService, /cancelled_online_payment_succeeded/);
  assert.match(paymentService, /payLater\.used/);
  assert.match(paymentService, /REQUIRES_REVIEW/);
});

test('ride payment verification exposes ride ID and manual refund review state', () => {
  const verify = index.slice(index.indexOf("app.get('/payments/verify/:ref'"), index.indexOf("app.post('/payments/webhook'"));
  assert.match(verify, /rideId: payment\.rideId/);
  assert.match(verify, /REQUIRES_REFUND_REVIEW/);
});

test('passenger ride history uses server data rather than generated examples', () => {
  assert.match(passengerSource, /api\.getHistory\(user\.id\)/);
  assert.match(passengerSource, /pickupLocation\?\.address/);
  assert.doesNotMatch(passengerSource, /Math\.random\(\)\s*\*\s*20|Kwame A\./);
});


test('unknown provider initialization returns the reserved reference for status recovery', () => {
  const init = index.slice(index.indexOf("app.post('/payments/initialize'"), index.indexOf("app.get('/payments/verify/:ref'"));
  assert.match(init, /outcome: 'INITIALIZATION_UNKNOWN'/);
  assert.match(init, /requiresStatusCheck: true/);
  assert.match(init, /reference,\s*$/m);
  assert.match(passengerSource, /result\.outcome==="INITIALIZATION_UNKNOWN"/);
  assert.match(passengerSource, /api\.verifyPayment\(paymentReference\)/);
});


test('Map distinguishes missing/stale GPS from fresh GPS and reports missing Google Maps configuration', () => {
  const map = read('web-app/src/components/Map.jsx');
  assert.ok(map.includes('GPS unavailable'));
  assert.ok(map.includes('GPS stale'));
  assert.ok(map.includes('updatedAtMs'));
  assert.ok(map.includes('Google Maps is not configured'));
  assert.ok(!map.includes('GPS Live'));
});

test('driver live dispatch is vehicle-scoped, skips declined requests, and distance-filters pending rides', () => {
  const driver = read('web-app/src/screens/DriverApp.jsx');
  assert.ok(driver.includes('where("rideType", "==", driverVehicleType)'));
  assert.ok(driver.includes('declinedRideIds.has(candidate.id)'));
  assert.ok(driver.includes('distanceKm(currentPoint, { lat: pickupLat, lng: pickupLng }) <= 5'));
  assert.ok(driver.includes('(error) => {'));
  const statusRoute = index.slice(index.indexOf("app.put('/drivers/:id/status'"), index.indexOf("app.put('/drivers/:id/location'"));
  assert.ok(!statusRoute.includes('vehicleType: sanitize(req.body.vehicleType'));
});

test('driver GPS publisher uses browser geolocation, timestamps and a throttled heartbeat', () => {
  const driver = read('web-app/src/screens/DriverApp.jsx');
  assert.ok(driver.includes('navigator.geolocation.watchPosition'));
  assert.ok(driver.includes('now - Number(previous.lastPublishedAt || 0) >= 15000'));
  assert.ok(driver.includes('position.coords.heading'));
  assert.ok(!driver.includes('Math.random()-0.5'));
});

test('backend ride dispatch validates coordinates, vehicle match, fresh location and acceptance radius', () => {
  assert.ok(index.includes('function normalizeVehicleType'));
  assert.ok(index.includes('Unsupported ride vehicle type'));
  assert.ok(index.includes('requestedVehicleType !== driverVehicleType'));
  assert.ok(index.includes('Date.now() - lastUpdatedMs > 60000'));
  assert.ok(index.includes("return { blocked: 'driver-too-far' }"));
});

test('driver map receives a real next-stop navigation target and bounded reroute policy', () => {
  const driver = read('web-app/src/screens/DriverApp.jsx');
  const map = read('web-app/src/components/Map.jsx');
  assert.ok(driver.includes('navigationTarget={activeRide ?'));
  assert.ok(driver.includes('driverPos={driverSelfPos}'));
  assert.ok(map.includes('Date.now() - lastDriverRoute.current.requestedAt >= 30000'));
  assert.ok(map.includes('This is not turn-by-turn or voice navigation.'));
});


test('driver ride queue has the required Firestore composite index', () => {
  const indexConfig = JSON.parse(read('backend/firestore.indexes.json'));
  const found = indexConfig.indexes.some((item) => item.collectionGroup === 'rides'
    && item.queryScope === 'COLLECTION'
    && item.fields.length === 3
    && item.fields[0].fieldPath === 'status' && item.fields[0].order === 'ASCENDING'
    && item.fields[1].fieldPath === 'rideType' && item.fields[1].order === 'ASCENDING'
    && item.fields[2].fieldPath === 'createdAt' && item.fields[2].order === 'DESCENDING');
  assert.ok(found, 'driver queue query needs status + rideType + createdAt composite index');
});

test('driver dispatch is not ready until server accepts a GPS write', () => {
  const driver = read('web-app/src/screens/DriverApp.jsx');
  const gps = driver.slice(driver.indexOf('// Real browser GPS only.'), driver.indexOf('// Keep the accepted ride state'));
  assert.match(gps, /api\.updateLocation\(user\.id, lat, lng, position\.coords\.heading\)\.then/);
  assert.match(gps, /setGpsReady\(true\)/);
  assert.match(gps, /setGpsReady\(false\)/);
  assert.doesNotMatch(gps, /driverSelfPosRef\.current = next;\s*setGpsReady\(true\);/);
});


test('ride request endpoint includes transactional idempotency and stable notification IDs', () => {
  const request = index.slice(index.indexOf("app.post('/rides/request'"), index.indexOf("app.post('/rides/:rideId/cancel'"));
  assert.ok(request.includes('ride_request_idempotency'));
  assert.ok(request.includes('db.runTransaction'));
  assert.ok(request.includes('tx.create(idempotencyRef'));
  assert.ok(request.includes('record.fingerprint !== fingerprint'));
  assert.ok(request.includes('notificationId = crypto.createHash'));
  assert.ok(request.includes('dispatchWarnings'));
});

test('passenger cancellation is server-backed and only cancels unassigned requests', () => {
  const cancel = index.slice(index.indexOf("app.post('/rides/:rideId/cancel'"), index.indexOf("app.post('/rides/:rideId/accept'"));
  assert.ok(cancel.includes('db.runTransaction'));
  assert.ok(cancel.includes("status !== 'requested'"));
  assert.ok(cancel.includes("status: 'cancelled'"));
  const passenger = read('web-app/src/screens/PassengerApp.jsx');
  const api = read('web-app/src/api.js');
  assert.ok(api.includes('cancelRide(rideId)'));
  assert.ok(passenger.includes('await api.cancelRide(rideId)'));
  assert.ok(!passenger.includes('onClick={()=>setStatus("idle")}'));
});


test('an idempotent retry of an accepted/cancelled/completed ride does not redispatch it', () => {
  const request = index.slice(index.indexOf("app.post('/rides/request'"), index.indexOf("app.post('/rides/:rideId/cancel'"));
  assert.ok(request.includes("String(created.ride.status || '').toLowerCase() !== 'requested'"));
  assert.ok(request.indexOf("String(created.ride.status || '').toLowerCase() !== 'requested'")
    < request.indexOf("const drivers = await db.collection('drivers')"));
});
