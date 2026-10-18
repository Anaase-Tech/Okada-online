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
const { parseEventDepositPercent } = require('./financialIntegrity');

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
  assert.ok(driver.includes('declinedRideIds.has(id)'));
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
  assert.ok(index.includes('Date.now() - lastUpdatedMs > 45000'));
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


test('passenger restores unresolved ride request key and route after reload', () => {
  const passenger = read('web-app/src/screens/PassengerApp.jsx');
  assert.ok(passenger.includes('localStorage.getItem("okada_pending_request")'));
  assert.ok(passenger.includes('Retry the restored route'));
  assert.ok(passenger.includes('requestId, pickup, dest, vehicle'));
});


test('driver completion keeps the real active ride on server/network failure', () => {
  const driver = read('web-app/src/screens/DriverApp.jsx');
  const finish = driver.slice(driver.indexOf('const finishRide = async'), driver.indexOf('const confirmCash'));
  assert.ok(finish.includes('let completionConfirmed = false'));
  assert.ok(finish.includes('completionConfirmed = true'));
  assert.ok(finish.includes('if (completionConfirmed) {'));
  assert.ok(finish.includes('setCashConfirm(null);') && finish.includes('setActiveRide(null);'));
  assert.ok(finish.indexOf('if (completionConfirmed)') > finish.indexOf('catch (e)'));
});

test('driver dispatch readiness expires when geolocation stops sending updates', () => {
  const driver = read('web-app/src/screens/DriverApp.jsx');
  const freshness = driver.slice(driver.indexOf('A browser may silently stop producing GPS samples'), driver.indexOf('// Keep the accepted ride state'));
  assert.ok(freshness.includes('Date.now() - updatedAtMs > 45000'));
  assert.ok(freshness.includes('setGpsReady(false)'));
  assert.ok(freshness.includes('setIncoming(null)'));
  assert.ok(driver.includes('api.updateLocation(user.id, lat, lng, position.coords.heading).then'));
});

test('passenger live payment state switches to failed whenever the server records a failed attempt', () => {
  const passenger = read('web-app/src/screens/PassengerApp.jsx');
  assert.ok(passenger.includes('["FAILED", "ABANDONED", "INITIALIZATION_FAILED"].includes(paymentStatus)'));
  assert.ok(passenger.includes('setPayStatus("failed")'));
  assert.ok(passenger.includes('api.verifyPayment(paymentReference)'));
});


test('Journey multi-leg transaction reads all trips, routes and active bookings before its first write', () => {
  const start = journeyRoutes.indexOf("router.post('/book', requireAuth");
  const end = journeyRoutes.indexOf("router.post('/:journeyId/confirm'", start);
  const route = journeyRoutes.slice(start, end);
  const writes = [route.indexOf('tx.update('), route.indexOf('tx.set(')].filter((value) => value >= 0);
  assert.ok(writes.length > 0, 'Journey booking has writes');
  const firstWrite = Math.min(...writes);
  const writePhase = route.slice(firstWrite);
  assert.equal(writePhase.includes('await tx.get('), false, 'transaction reads must not follow the first write');
  assert.ok(route.slice(0, firstWrite).includes('const bookingSnaps = await Promise.all('));
});


test('Journey multi-leg transaction reads trip, route, and booking state before its first write', () => {
  const start = journeyRoutes.indexOf("router.post('/book', requireAuth");
  const end = journeyRoutes.indexOf("router.post('/:journeyId/confirm'", start);
  const route = journeyRoutes.slice(start, end);
  const writes = [route.indexOf('tx.update('), route.indexOf('tx.set(')].filter((value) => value >= 0);
  assert.ok(writes.length > 0);
  const firstWrite = Math.min(...writes);
  assert.equal(route.slice(firstWrite).includes('await tx.get('), false);
  assert.ok(route.slice(0, firstWrite).includes('const bookingSnaps = await Promise.all('));
});


test('P0-A: savings deposits fail closed without verified funding and cannot credit balances', () => {
  const start = index.indexOf("app.post('/fintech/savings/deposit'");
  const end = index.indexOf("app.post('/fintech/savings/withdraw'", start);
  assert.ok(start >= 0 && end > start, 'savings deposit handler boundaries exist');
  const route = index.slice(start, end);
  assert.match(route, /verified funding or an authorized, auditable reconciliation/);
  assert.match(route, /return fail\(\s*res,\s*409/);
  assert.doesNotMatch(route, /savings_transactions|manual_deposit|savings\.balance.*increment|savings\.totalDeposited.*increment/);
});

test('P0-B: Pay Later repayments fail closed without payment verification', () => {
  const start = index.indexOf("app.post('/fintech/pay-later/repay'");
  const end = index.indexOf('// ════════════════════════════════════════════════════════════\n// J. WALLET', start);
  assert.ok(start >= 0 && end > start, 'repayment handler boundaries exist');
  const route = index.slice(start, end);
  assert.match(route, /verified incoming payment or authorized, auditable reconciliation/);
  assert.match(route, /return fail\(\s*res,\s*409/);
  assert.doesNotMatch(route, /status:\s*'paid'|payLater\.used.*increment|trx\.update\(txRef/);
});

test('P0-C: event deposit percentage parser rejects invalid ratios', () => {
  assert.equal(parseEventDepositPercent(undefined), 0.30);
  assert.equal(parseEventDepositPercent(null), 0.30);
  assert.equal(parseEventDepositPercent(0.30), 0.30);
  assert.equal(parseEventDepositPercent('0.75'), 0.75);
  for (const value of [-0.01, 0, 1.01, NaN, Infinity, -Infinity, '', ' ', 'not-a-number', true, false, [], {}]) {
    assert.equal(parseEventDepositPercent(value), null, String(value));
  }
});

test('P0-C: event booking validates deposit and atomically records booking with wallet movement', () => {
  const start = index.indexOf("app.post('/maas/events/book'");
  const end = index.indexOf('// ── G. DELIVERY', start);
  assert.ok(start >= 0 && end > start, 'event booking handler boundaries exist');
  const route = index.slice(start, end);
  assert.match(route, /parseEventDepositPercent\(depositPercent\)/);
  assert.match(route, /trx\.get\(u\.ref\)/);
  assert.match(route, /trx\.create\(ref/);
  assert.match(route, /trx\.update\(u\.ref/);
  assert.match(route, /wallet\.available.*increment\(-deposit\)/s);
  assert.match(route, /wallet\.pending.*increment\(deposit\)/s);
  assert.doesNotMatch(route, /event_rides'\)\.add|await u\.ref\.update/);
});


test('rental kilometre logging authorizes the rental owner before any mutation', () => {
  const start = index.indexOf("app.post('/maas/rental/:id/log-km'");
  const end = index.indexOf("app.get('/maas/rental/active/:userId'", start);
  assert.ok(start >= 0 && end > start, 'rental km route boundaries exist');
  const route = index.slice(start, end);
  const authorize = route.indexOf('resolveUserRef(r.userId, req)');
  const firstMutation = Math.min(
    ...[route.indexOf('await ref.update('), route.indexOf("'wallet.available':admin.firestore.FieldValue.increment(")]
      .filter(i => i >= 0)
  );
  assert.ok(authorize >= 0 && firstMutation > authorize, 'owner authorization must precede rental/wallet writes');
  assert.match(route, /if \(!u && req\.isAdmin !== true\) return fail\(res,403,'Rental access denied'\)/);
  assert.match(route, /Number\.isFinite\(kmDelta\) \|\| kmDelta <= 0/);
  assert.match(route, /Rental kilometre or charge data is invalid/);
});


test('delivery tracking references are random and public tracking returns an explicit minimal DTO', () => {
  const requestStart = index.indexOf("app.post('/delivery/request'");
  const requestEnd = index.indexOf("app.put('/delivery/:id/status'", requestStart);
  const requestRoute = index.slice(requestStart, requestEnd);
  assert.ok(requestStart >= 0 && requestEnd > requestStart, 'delivery request route boundaries exist');
  assert.match(requestRoute, /createDeliveryTrackingCode\(\)/);
  assert.doesNotMatch(requestRoute, /Date\.now\(\)\.toString\(36\)/);

  const trackStart = index.indexOf("app.get('/delivery/track/:code'");
  const trackEnd = index.indexOf("app.get('/delivery/history/:userId'", trackStart);
  const trackRoute = index.slice(trackStart, trackEnd);
  assert.ok(trackStart >= 0 && trackEnd > trackStart, 'delivery tracking route boundaries exist');
  assert.match(trackRoute, /toPublicDeliveryTrackingDto\(snap\.docs\[0\]\.data\(\)\)/);
  assert.doesNotMatch(trackRoute, /\\.\\.\\.snap\\.docs\[0\]\.data\(\)|id:snap\.docs\[0\]\.id/);
});


test('delivery status updates authorize assigned driver/admin and enforce proof + transition validation', () => {
  const start = index.indexOf("app.put('/delivery/:id/status'");
  const end = index.indexOf("app.get('/delivery/track/:code'", start);
  assert.ok(start >= 0 && end > start, 'delivery status route boundaries exist');
  const route = index.slice(start, end);
  assert.match(route, /if \(nextStatus === 'assigned' && !isAdmin\)/);
  assert.match(route, /assignedDriver\.firebaseUid !== req\.uid/);
  assert.match(route, /Proof of delivery is required before marking delivered/);
  assert.match(route, /db\.runTransaction/);
  assert.match(route, /validateDeliveryTransition\(current\.status, nextStatus\)/);
  assert.doesNotMatch(route, /const senderProfile = await resolveUserRef\(delivery\.senderId/);
});

test('delivery state machine rejects unsupported, skipped, reversed and terminal-state changes', () => {
  const { validateDeliveryTransition } = require('./deliveryState');
  assert.equal(validateDeliveryTransition('pending','assigned'), null);
  assert.equal(validateDeliveryTransition('assigned','picked_up'), null);
  assert.equal(validateDeliveryTransition('picked_up','in_transit'), null);
  assert.equal(validateDeliveryTransition('in_transit','delivered'), null);
  assert.equal(validateDeliveryTransition('failed','assigned'), null);
  assert.equal(validateDeliveryTransition('delivered','assigned'), 'invalid-transition');
  assert.equal(validateDeliveryTransition('pending','delivered'), 'invalid-transition');
  assert.equal(validateDeliveryTransition('assigned','in_transit'), 'invalid-transition');
  assert.equal(validateDeliveryTransition('unknown','failed'), 'invalid-transition');
  assert.equal(validateDeliveryTransition('picked_up','cancelled'), 'unsupported-status');
});


test('rental booking creates service and debits the authoritative wallet inside one transaction helper', () => {
  const start = index.indexOf("app.post('/maas/rental/book'");
  const end = index.indexOf("app.post('/maas/rental/:id/log-km'", start);
  assert.ok(start >= 0 && end > start, 'rental booking route boundaries exist');
  const route = index.slice(start, end);
  assert.match(route, /createWalletBackedBooking\(\{/);
  assert.match(route, /serviceRef: ref/);
  assert.match(route, /amount: totalPrice/);
  assert.doesNotMatch(route, /db\.collection\('rentals'\)\.add|u\.data\?\.wallet\?\.available/);
});

test('subscription booking creates service, debits wallet, updates active pointer and notification atomically', () => {
  const start = index.indexOf("app.post('/maas/subscription/create'");
  const end = index.indexOf("app.get('/maas/subscription/status/:userId'", start);
  assert.ok(start >= 0 && end > start, 'subscription route boundaries exist');
  const route = index.slice(start, end);
  assert.match(route, /createWalletBackedBooking\(\{/);
  assert.match(route, /activeSubscriptionId:ref\.id/);
  assert.match(route, /additionalWrites: notificationWrites/);
  assert.doesNotMatch(route, /db\.collection\('subscriptions'\)\.add|u\.data\?\.wallet\?\.available|await u\.ref\.update/);
});


test('shared-trip join uses a transaction to enforce current capacity and reject duplicate passengers', () => {
  const start = index.indexOf("app.post('/maas/share/:shareId/join'");
  const end = index.indexOf('// ── E. CORPORATE', start);
  assert.ok(start >= 0 && end > start, 'shared-trip join route boundaries exist');
  const route = index.slice(start, end);
  assert.match(route, /joinSharedTripTransaction\(\{ db, tripRef, joinerId:joiner\.ref\.id \}\)/);
  assert.doesNotMatch(route, /const snap\s*=\s*await ref\.get\(\)|await ref\.update\(\{ passengers:newP/);
});


test('Firebase token phone claim is captured and create-profile binds only to the verified phone', () => {
  assert.match(index, /req\.phoneNumber = typeof decoded\.phone_number === 'string' \? decoded\.phone_number : null/);
  const start = index.indexOf("app.post('/auth/create-profile'");
  const end = index.indexOf('// GET /auth/profile/:uid', start);
  assert.ok(start >= 0 && end > start, 'create-profile route boundaries exist');
  const route = index.slice(start, end);
  assert.match(route, /validateRequestedPhoneAgainstClaim\(phone, req\.phoneNumber\)/);
  assert.match(route, /existingProfile\.firebaseUid !== req\.uid/);
  assert.match(route, /Account recovery is required; no profile was changed/);
  assert.match(route, /phone:\s+phoneIdentity\.phone/);
  assert.doesNotMatch(route, /return ok\(res, \{ user: \{ id: existing\.docs\[0\]\.id/);
});

test('create-profile does not trust a caller-supplied Firebase UID', () => {
  const start = index.indexOf("app.post('/auth/create-profile'");
  const end = index.indexOf('// GET /auth/profile/:uid', start);
  const route = index.slice(start, end);
  assert.match(route, /firebaseUid:\s*req\.uid/);
  assert.doesNotMatch(route, /firebaseUid:\s*sanitize\(firebaseUid\)/);
});


test('ShareRide never substitutes sample trips or reports failed create/join operations as success', () => {
  const source = read('web-app/src/screens/ShareRide.jsx');
  assert.doesNotMatch(source, /const DEMO\s*=/);
  assert.doesNotMatch(source, /setTrips\(DEMO\)/);
  assert.doesNotMatch(source, /Shared trip created! \(demo\)/);
  assert.match(source, /No trip was confirmed/);
  assert.match(source, /No seat was reserved/);
});

test('ScheduledTrips shows unavailable state instead of sample data or demo success after errors', () => {
  const source = read('web-app/src/screens/ScheduledTrips.jsx');
  assert.doesNotMatch(source, /Schedule saved \(demo mode\)|Work Commute|Church Run/);
  assert.match(source, /scheduleLoadError/);
  assert.match(source, /No change was confirmed/);
  assert.match(source, /Could not create the schedule/);
});

test('RentalHub does not claim a booking succeeded after API failure or hide fetch failures as empty', () => {
  const source = read('web-app/src/screens/RentalHub.jsx');
  assert.doesNotMatch(source, /rental booked \(demo\)/);
  assert.match(source, /rentalsLoadError/);
  assert.match(source, /No rental was confirmed/);
});

test('DeliveryApp never fabricates a tracking reference or live tracking object', () => {
  const source = read('web-app/src/screens/DeliveryApp.jsx');
  assert.doesNotMatch(source, /Math\.random\(\)\.toString\(36\).*tracking/i);
  assert.doesNotMatch(source, /status:\s*"in_transit",pickupAddress:"Akosombo"/);
  assert.match(source, /No tracking reference was issued/);
  assert.match(source, /No live status is available/);
  assert.match(source, /historyError/);
});


test('mobile sign-in fails closed when the OTP API is unavailable and never fabricates a session', () => {
  const source = read('mobile-app/App.js');
  const sendStart = source.indexOf('const sendOtp = async');
  const verifyStart = source.indexOf('const verifyOtp = async', sendStart);
  const authEnd = source.indexOf('  return (', verifyStart);
  assert.ok(sendStart >= 0 && verifyStart > sendStart && authEnd > verifyStart, 'mobile auth handler boundaries exist');
  const auth = source.slice(sendStart, authEnd);
  assert.match(auth, /Could not send an OTP/);
  assert.match(auth, /OTP verification failed/);
  assert.match(auth, /Authentication service returned an incomplete session/);
  assert.doesNotMatch(auth, /demo_token|demoUser|Demo mode/);
  assert.doesNotMatch(auth, /catch\s*\([^)]*\)\s*\{[\s\S]{0,180}setStep\("otp"\)/);
  assert.doesNotMatch(source, /Demo: tap Get OTP/);
});

test('mobile app readiness audit guards known Expo-native incompatibilities from being mislabeled ready', () => {
  const source = read('mobile-app/App.js');
  const mobilePackage = JSON.parse(read('mobile-app/package.json'));
  assert.match(source, /from "lucide-react"/);
  assert.ok(mobilePackage.dependencies["lucide-react-native"], 'native icon dependency declared');
  assert.equal(mobilePackage.dependencies["lucide-react"], undefined, 'web icon package absent');
  assert.match(source, /<div\b/);
  assert.match(source, /className=/);
});


test('transit journey planner routes have distinct mounted paths and preserve both response handlers', () => {
  const express = {
    Router() {
      const routes = [];
      const router = { routes };
      for (const method of ['get','post','put','patch','delete']) {
        router[method] = (path, ...handlers) => {
          routes.push({ method: method.toUpperCase(), path, handlers });
          return router;
        };
      }
      return router;
    },
  };
  const { createTransitRouter } = require('./transitRoutes');
  const { createTransitHubRouter } = require('./transitHubRoutes');
  const dependencies = {
    express,
    db: {},
    admin: { firestore: { FieldValue: { serverTimestamp: () => 'server-timestamp' } } },
    requireAuth: (_req,_res,next) => next && next(),
    fail: () => {},
    ok: () => {},
    sanitize: (value) => String(value ?? '').trim(),
  };
  const transit = createTransitRouter(dependencies);
  const hub = createTransitHubRouter(dependencies);
  const transitPlannerRoutes = transit.routes.filter(r => r.method === 'POST' && r.path === '/journeys/plan');
  const hubPlannerRoutes = hub.routes.filter(r => r.method === 'POST' && r.path === '/hub/journeys/plan');
  assert.equal(transitPlannerRoutes.length, 1, 'canonical transit planner remains mounted once');
  assert.equal(hubPlannerRoutes.length, 1, 'hub planner remains available on its own path');
  assert.equal(hub.routes.filter(r => r.method === 'POST' && r.path === '/journeys/plan').length, 0,
    'hub route must not shadow canonical planner');
  const mounted = [...transit.routes, ...hub.routes].map(r => r.method + ' /transit' + r.path);
  assert.equal(new Set(mounted).size, mounted.length, 'no duplicate same-method mounted paths remain');
});


test('driver dispatch consumes backend fan-out notifications rather than relying only on the newest 25 rides', () => {
  const driver = read('web-app/src/screens/DriverApp.jsx');
  const backend = index;
  const rules = read('backend/firestore.rules');
  const source = read('backend/firestore.indexes.json');
  assert.match(driver, /where\("driverUid", "==", driverUid\)/);
  assert.match(driver, /where\("type", "==", "new_ride"\)/);
  assert.match(driver, /limit\(100\)/);
  assert.match(driver, /Targeted driver dispatch listener failed/);
  assert.match(backend, /driverUid: driverData\.firebaseUid \|\| d\.id/);
  assert.match(rules, /resource\.data\.driverUid == request\.auth\.uid/);
  assert.match(source, /"fieldPath": "driverUid"/);
  assert.match(driver, /limit\(25\)/, 'bounded compatibility/backfill queue remains');
});

test('ride fan-out notifications include the verified UID target while preserving the driver profile ID', () => {
  const start = index.indexOf("app.post('/rides/request'");
  const end = index.indexOf("app.post('/rides/", start + 20);
  const route = index.slice(start, end);
  assert.match(route, /driverUid: driverData\.firebaseUid \|\| d\.id/);
  assert.match(route, /driverId: d\.id, driverUid:/);
});
