# Okada Online V4 — Navigation, Map, and Stress Audit

**Date:** 2026-10-17  
**Repository:** `Anaase-Tech/Okada-online`  
**Branch:** `v4-mobility-os`  
**Starting HEAD:** `893fc81e2aa3a85d3f9e30fdf6f6b52e4b93a028`  
**Scope:** passenger/driver navigation, live GPS, Maps route overlay, dispatch, payment recovery, hidden lifecycle defects, and available test evidence. No Firebase production deployment.

## Executive result

Source and CI checks on the starting snapshot are green, but full integration/stress testing is incomplete. The navigation path is source-wired to Firestore real-time listeners and browser geolocation. The map draws a Google Maps road-route overlay when the key/API configuration allows it. It is not full turn-by-turn or voice navigation.

## Verified CI evidence at starting HEAD

GitHub Actions run #39045001526:
- Backend Node test suite: **77 passed, 0 failed**
- Frontend production build: **success**
- Run: https://github.com/Anaase-Tech/Okada-online/actions/runs/39045001526

These tests do not prove live Firestore or Google Maps integration.

## Real-time navigation behavior

### Passenger
- Real ride creation returns the server ride ID and server fare.
- A Firestore listener tracks `requested` → `accepted` → `in_progress` → terminal ride/payment states.
- A separate listener tracks the assigned driver's stored location and server update timestamp.
- Cancellation calls the backend and only clears UI state after the server confirms the cancellation.
- Paystack callback and uncertain-payment recovery use server verification, not a timer/redirect as proof of payment.

### Driver
- Live ride requests are received from a Firestore query bounded to the latest 25 requests for the verified vehicle type, then filtered by current local GPS proximity and locally declined IDs.
- Browser GPS comes from `navigator.geolocation.watchPosition`. Local map rendering is throttled to around 5 seconds / 5 metres, and server writes to significant movement or a 15-second heartbeat.
- The backend filters dispatch candidates by verified/on-line status, vehicle type, GPS timestamp ≤60 seconds, and distance ≤5 km. Acceptance repeats the verification and freshness/distance checks inside a transaction.
- The active ride listener synchronizes ride state and payment method/status.

### Map
- The driver road-route overlay follows current GPS to the pickup, and to the destination after the ride enters `in_progress`.
- Route recalculation is throttled by a 250-metre movement threshold or 30 seconds.
- The map labels GPS as fresh, stale, or unavailable.
- It is a route overlay, **not turn-by-turn/voice navigation**.
- Vercel has `REACT_APP_GOOGLE_MAPS_KEY` for Production only; current Preview deployments do not receive it and are expected to show the map-configuration fallback. Production rendering still needs a live browser smoke test for API enablement, referrer restrictions, and billing.

## Defects corrected in this continuation

1. Driver completion used to clear the active ride even if the server rejected completion or the request timed out. It now retains the active ride and cash-confirmation UI until success is returned; the Firestore ride listener remains authoritative if a response is lost.
2. Dispatch readiness could remain true if browser GPS silently stopped producing samples. A 5-second watchdog now marks readiness false after 45 seconds without a GPS sample. Backend acceptance keeps its independent 60-second server-time check.
3. Passenger payment state could remain visually pending when the live ride document changed to a terminal failure. FAILED/ABANDONED/INITIALIZATION_FAILED are now reflected directly in the UI.

## Verified risks and gaps

- The CI suite has no authenticated browser E2E and no Firestore Emulator contention tests.
- Dispatch queries only the newest 25 requested rides for a vehicle type, then filters by radius. A burst of over 25 newer out-of-radius rides can hide an older nearby ride. This needs a per-driver dispatch queue/geospatial design before scaling.
- Firestore rules allow all signed-in clients to read all ride and driver documents for current direct listeners. That exposes excess passenger/driver data. Migrate dispatch/tracking to scoped collections/endpoints before tightening rules.
- Latest frontend install reported 62 dependency vulnerabilities (3 low, 16 moderate, 40 high, 3 critical); triage production reachability before changing versions.
- Web frontend uses a hand-maintained road-distance table or town-center approximation for fare display, but server fare is based on straight-line Haversine distance. Passenger receives the server's price, yet mismatch against actual road distance may affect fare fairness/unit economics. This needs an explicit pricing/routing decision, not an unreviewed tariff change.

## Required stress-test matrix

1. Two drivers concurrently accept one ride; exactly one wins.
2. Driver GPS stops, becomes stale, permission is denied, and then resumes.
3. The 25-result dispatch window under high volume; nearby rides must not be starved.
4. Request-idempotency retries across lost HTTP responses, cancellation races, accepted/cancelled/completed retries.
5. Trotro/Transit/Journey inventory concurrency (no overbooking).
6. Provider initialization succeeds while its response/Firestore update fails; verify exact-reference recovery.
7. Failed online → cash fallback, late Paystack success, duplicate charge/refund review.
8. Payment expiry vs ride completion and duplicate/concurrent completion; financial side effects exactly once.
9. Browser E2E: Google Maps key restriction/API/billing; current GPS movement, pickup→destination reroute, stale/offline state, route API failure, tab/background/resume, and poor network.

The emulator and browser tests above have not yet run or passed. Do not claim full stress completion or production readiness until they actually do.


## GPS freshness alignment hardening — 2026-10-17

A second navigation-state review found a race between local GPS expiry and backend acceptance: the driver UI could retain an already-rendered incoming ride after its 45-second local GPS watchdog disabled dispatch, and the server still allowed acceptance up to 60 seconds after its last persisted location. Updated both server dispatch notifications and transactional ride acceptance to the same 45-second maximum, and clear any already-visible incoming offer when the local watchdog expires. GPS marker is shown stale from 35 seconds, local dispatch readiness expires at 45 seconds, and backend remains authoritative at 45 seconds.

This is source-level hardened and regression-tested; actual GPS silence/recovery and two-driver acceptance still require browser/Firestore Emulator tests.
