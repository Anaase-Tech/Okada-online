# Okada Online V4 — PASS 4.1 Independent Audit & Handoff

**Audit date:** 2026-10-17  
**Repository:** `Anaase-Tech/Okada-online`  
**Branch:** `v4-mobility-os`  
**Starting HEAD:** `273ecb50e4c4cbede10666da7e99b95804045cb4`  
**Status:** Runtime migration prepared in source/CI; payment/concurrency work remains open. No Firebase deployment authorized.

## Evidence standard

This document distinguishes direct source inspection, CI evidence, external provider/runtime documentation, and unverified assumptions. A green unit suite is not treated as proof of end-to-end financial correctness.

## Verified CI and preview evidence at starting HEAD

- GitHub Actions run #29: backend tests **50 passed / 0 failed**.
- Deprecated-config guard self-test passed, including normal and optional-chaining cases.
- Frontend production build compiled successfully.
- Vercel preview for commit `273ecb5` was recorded as READY.
- Not verified: Firebase deployment, Paystack sandbox round trip, live webhook-to-Firestore settlement, or Firestore Emulator concurrency.

## Runtime migration prepared by this commit

Google Cloud lists Node.js 20 decommissioning on 2026-10-30; Firebase documents Node.js 22 as a supported Functions runtime. This change updates:

- `backend/firebase.json`: `nodejs20` → `nodejs22`
- `backend/functions/package.json`: Node engine 20 → 22
- `backend/functions/package-lock.json`: root engine metadata 20 → 22
- `.github/workflows/okada-v4-verification.yml`: backend CI to Node 22 and matching assertions; frontend CI to Node 24 to match the web-app package/Vercel requirement.

This is **not a deployment**. The runtime change must pass CI, then be reviewed and separately authorized before any Firebase deploy.

## Direct-source findings to close

### P0 — Payment initialization persistence gap

The legacy `POST /payments/initialize` path calls Paystack before writing the Firestore `payments` record. If provider initialization succeeds but the Firestore write fails or races ride completion, the completion gate may not see the online attempt. Design durable attempt state/idempotency and cover provider-success/local-write-failure and concurrent-completion windows.

### P0 — Ride completion lifecycle gate

The completion transaction blocks a missing/already-completed ride and checks unsettled online payment state, but it does not require a specific permitted pre-completion status. Establish the existing product lifecycle and permitted transitions from source/client behavior before adding a stricter gate. Do not invent status names.

### P1 — Ride acceptance race

`POST /rides/:rideId/accept` checks `requested` and updates the ride outside a transaction. Two drivers can both pass the read-before-write check. Make acceptance atomic, preserve authorization and response contracts, and ensure notifications do not misrepresent the final assignment.

### P1 — Duplicate journey plan route

`POST /transit/journeys/plan` is defined in both `transitRoutes.js` and `transitHubRoutes.js`. The former is mounted first under `/transit`, normally shadowing the latter. Reconcile both contracts without silently dropping behavior.

### P1 — Booking idempotency and payment policy

Trotro and standalone Transit booking use transactions and shared trip inventory writes, but no emulator-backed contention test was found. Retried requests can create another booking. Confirm the intended payment policy before adding payment behavior; do not invent it.

### P1 — Pickup/final-mile input schema

The Journey attach handlers accept caller objects and spread fields into Firestore. Introduce an explicit allowlist and preserve server-authoritative fares. Test unexpected keys and client-supplied amounts.

### P1 — Emulator-backed tests

Required tests: concurrent Trotro/Transit segment booking, Journey/VIP hold contention, duplicate request retries, concurrent ride acceptance, concurrent ride completion, and Paystack initialization failure after provider success. If emulator setup is unavailable, report that blocker rather than claiming tests passed.

### P2 — Source hygiene and privacy

- Root `backend/index.js` / `backend/package.json` retain old Twilio and deprecated config references, but are outside the configured Functions source `backend/functions`; verify whether any separate legacy deployment uses them before changing.
- `backend/functions/index.js.bak2` is inside the configured Functions source and contains legacy references. Exclude backup artifacts from deployment packaging without deleting tracked backups.
- V4 collections inspected in Firestore rules fall to default deny. This is appropriate only if all relevant access is backend-mediated; audit web/mobile direct reads before changing rules.
- The legacy `rides` read rule permits any signed-in client to read ride documents; assess passenger/location/driver privacy.
- CI installation reported 63 dependency vulnerabilities (12 low, 21 moderate, 27 high, 3 critical). Triage dependency reachability and production impact; do not blindly apply force upgrades.

## Product decision required

What should happen when an online payment attempt fails or is abandoned and the passenger then pays cash? Do not implement an invented rule. Preserve existing cash behavior while making online attempts durable and visible to the completion gate.

## PASS 4.1 execution order

1. Verify Node 22 backend runtime + Node 24 frontend CI on this branch; no deployment.
2. **Completed in source, awaiting CI result:** make ride acceptance atomic and write its notification in the winning transaction; a source-level regression test was added. Emulator-backed two-driver contention testing remains required.
3. Design and implement durable payment-attempt persistence/idempotency, with regression tests.
4. Enforce a validated ride completion lifecycle without changing legitimate behavior.
5. Reconcile duplicate journey-plan route behavior.
6. Add emulator-backed contention and retry tests.
7. Validate pickup/final-mile fields, exclude backup files from deploy input, audit Firestore access contracts, and triage dependency vulnerabilities.
8. Update this document and `OKADA_V4_PRODUCTION_AUDIT_V1.md` with actual commit/test evidence after every pass.

## Team coordination

Public Slack channel: https://anaase-tech.slack.com/archives/C0CAW0BGK3J  
Channel: `#okada-v4-team`

The kickoff message contains current branch state and team rules. Slack does not automatically make the AI assistants communicate autonomously. Each assistant must have actual workspace/channel access and be asked to read/respond. A Claude Slack user/bot was not found by the current user search; integration remains unverified.

## Official references checked 2026-10-17

- Firebase Functions runtime selection: https://firebase.google.com/docs/functions/manage-functions
- Google Cloud Functions runtime lifecycle: https://docs.cloud.google.com/run/docs/runtimes/function-runtimes


### CI note — 2026-10-17
The first run after the atomic ride-acceptance change exposed a syntax error in the newly added static regression test (over-escaped regex literals). The test has been corrected in source. Do not mark PASS 4.1 green until a subsequent GitHub Actions run for the corrected commit passes both jobs.


## PASS 4.1 verified result — 2026-10-17

GitHub Actions run #32 for source/test commit `fc1c136ef662bd5359a7bcec27a1f81921566476` completed successfully: backend tests **51 passed / 0 failed** on Node.js 22.23.3, Functions/Firebase runtime assertions passed, the deprecated-config guard self-test passed, and the Node.js 24 frontend production build succeeded. The earlier test syntax failure on `5fdadd4` was corrected in `fc1c136`.

This confirms the source and CI migration gate only. It does not certify Firebase production deployment, live Paystack behavior, or Firestore Emulator contention. Atomic ride acceptance has source-level regression coverage but still requires an emulator-backed concurrent-driver test.


## PASS 4.1 continued — cash fallback rule and implementation — 2026-10-17

Decision: allow cash fallback only after every online payment attempt is conclusively failed/abandoned, and only count cash as paid after explicit assigned-driver confirmation. If the provider status is pending/ongoing/unknown, hold the ride/payment state and do not permit cash fallback. A late Paystack success after cash has been confirmed is flagged for refund review; it does not trigger a second ride payout or silently overwrite the cash settlement.

Source changes added: durable Paystack attempt reservation before provider call; fail-closed handling of uncertain provider result; explicit cash selection record; authenticated atomic start endpoint; completion gate checking all payment attempts; late-success/refund-review reconciliation. These source edits require CI and emulator-backed verification; no production Firebase deployment was performed.

The product rule minimizes double collection and prevents "abandoned" frontend redirects from being treated as proof that the provider charge definitively failed. An unknown/pending provider state must be reconciled before taking cash.


### Payment gate/acceptance regression verification note — 2026-10-17
The first CI run for the payment/cash continuation passed 53 of 54 tests. The failure was a source-level acceptance test whose handler slice extended into the new routes and therefore incorrectly detected the new route's legitimate pre-transaction read. The assertion boundary was narrowed to the end of the actual acceptance handler. The same patch hardens ride-start authorization by checking the assigned driver's Firebase UID through the driver document rather than assuming the Firestore document ID always equals the Firebase UID. A subsequent CI run is required to confirm the correction.


## Frontend payment-truth hardening — 2026-10-17

The Passenger and Driver PWA paths are being aligned with the server-backed payment and ride states:

- Passenger ride creation now retains the real server ride ID, uses configured town-centre coordinates rather than fixed coordinates, and waits for the Firestore ride status to show a real acceptance/start.
- Online payment redirects to Paystack's returned authorization URL and verifies the returned reference with the backend. It no longer displays success merely after a timeout or after swallowing an API error.
- Cash selection calls the backend payment-method endpoint and remains waiting until server state records the driver's cash confirmation.
- Driver acceptance no longer reports success after a failed API call; the active ride listens for actual payment method/status changes.
- Driver GPS publishing uses browser-provided geolocation; random coordinates and synthetic ETA/driver matches are no longer used in these paths.
- The Pay Later frontend call uses the real ride ID and displays deferred status only after the server accepts the request. The following PASS 4.1 payment-policy addendum records the later server-side ride-state integration and still-open end-to-end verification.

No production deployment was performed. Source changes require CI review before the next step.


## PASS 4.1 correction note — real history and single completion control — 2026-10-17

The latest CI run for commit `6c4501e` compiled the frontend but failed one backend source-contract test because the Passenger screen still contained a fabricated sample-history fallback (random fares and a hard-coded example driver). This was a real no-fake-data violation, so the fix removes the fallback instead of weakening the test. Ride history now maps server records to the screen and shows an explicit error if the request fails. Unknown ratings are no longer displayed as five stars. The same patch removes the duplicate driver Complete button for an in-progress ride. CI must be green after the next commit before this state is marked verified.


## PASS 4.1 payment-policy implementation snapshot — 2026-10-17

- Pay Later request is transactional and idempotent for an already-active deferral. It rejects unknown/pending online attempts and provider successes/review states, checks available credit, stores the debit in the user's Pay Later ledger, and links the ride with `paymentMethod=pay_later`, `paymentStatus=DEFERRED`, and `payLaterTxId`.
- Starting another Paystack attempt or selecting cash is blocked after Pay Later has been authorized.
- Ride completion verifies the linked Pay Later record, ride/passenger identity, status, and amount. It will not complete a deferred ride if that record is missing or inconsistent, or if an online attempt remains unresolved.
- If an online payment is later verified before the deferred balance is repaid, the settlement transaction cancels the outstanding Pay Later record and releases the used limit. If the deferred balance was already repaid, the online transaction is marked `REQUIRES_REVIEW` and the ride's earlier settlement/earnings are not repeated. This is manual refund reconciliation, not an automatic refund.
- The ride verification route now returns the ride ID and explicit `REQUIRES_REFUND_REVIEW` outcome so the browser callback can avoid reporting a conflicted capture as a normal payment success.
- Passenger ride history uses actual backend records; the former randomized sample-history fallback is removed. The driver active ride panel has one Complete action for an in-progress ride rather than two.
- This is still source-level implementation. CI, Paystack sandbox handling, emulator-based contention, and full Pay Later repayment race tests must pass before it can be declared verified. No production deployment occurred.


## Payment recovery clarification — 2026-10-17

When the server cannot determine whether Paystack initialization succeeded, it now returns the already-reserved reference with `outcome=INITIALIZATION_UNKNOWN` and `requiresStatusCheck=true`. The passenger PWA stores that reference and offers status verification rather than making another attempt or hiding the reference behind an HTTP error. A confirmed provider rejection remains a failure response; an uncertain outcome stays fail-closed for cash and Pay Later until verification resolves it. The Pay Later copy no longer promises automatic MoMo charging, which is not implemented by this flow.


## Navigation, live-map, and stress audit — 2026-10-17

### Source-verified navigation behavior

- Passenger ride state follows the actual Firestore ride document through `onSnapshot`; the passenger's driver marker follows the assigned driver's Firestore `location` document.
- Driver location is acquired through browser `navigator.geolocation.watchPosition`. The UI renders local GPS samples approximately every 5 seconds / 5 metres, and server writes are throttled to meaningful movement or a 15-second heartbeat.
- Backend dispatch only notifies online, verified, vehicle-matched drivers with stored GPS no older than 60 seconds and within 5 km of pickup. The acceptance endpoint repeats online, vehicle, timestamp, and proximity checks inside the ride-accept transaction.
- The Map component draws a Google Maps road-route overlay. An active driver ride targets pickup until status becomes `in_progress`, then targets the destination. Route requests are debounced and refreshed after approximately 250 metres of driver movement or 30 seconds.
- This is **a live-GPS marker plus a road-route overlay, not turn-by-turn or voice navigation**. Spoken instructions, lane guidance, and a dedicated navigation session are not implemented.
- `REACT_APP_GOOGLE_MAPS_KEY` is configured in Vercel for Production only. Current Preview deployments do not receive it, so Preview builds show the “Google Maps is not configured” fallback. Actual Production browser rendering still requires a smoke test for Google API/referrer/billing restrictions.

### Additional defects addressed in this continuation

1. Driver ride completion previously cleared `activeRide` and the cash-confirmation sheet after either success or failure. This could strand a still-open ride when payment was unresolved or a request timed out. The driver now clears those UI states only after completion returns success; failure retains the ride for retry/reconciliation.
2. If the driver's browser silently stops emitting GPS samples, dispatch readiness could remain true from an earlier successful write. A 5-second watchdog now expires readiness when the last local sample is older than 45 seconds. Server-side 60-second freshness remains authoritative.
3. Passenger payment UI previously updated to failed only if the current local state was `processing`. It now reflects FAILED/ABANDONED/INITIALIZATION_FAILED whenever the live ride document reports that state.

### CI / stress-test evidence

- Audited starting source: `893fc81e2aa3a85d3f9e30fdf6f6b52e4b93a028`.
- GitHub Actions run #39045001526: backend suite **77 passed / 0 failed**; frontend production build succeeded. Link: https://github.com/Anaase-Tech/Okada-online/actions/runs/39045001526
- Those are unit/source regression checks, **not** authenticated browser E2E or live Firestore Emulator contention tests. The source edits in this continuation require a new CI run.
- CI install reports **62 frontend dependency vulnerabilities: 3 low, 16 moderate, 40 high, 3 critical**. This is a triage signal, not proof all are exploitable.
- Driver dispatch currently queries only the newest 25 requested rides of a vehicle type, then filters by the driver's local 5 km proximity. Under a burst of more than 25 newer requests outside the driver's radius, an older nearby ride can fall outside the query window. The backend writes per-driver nearby ride notifications, but DriverApp currently uses the bounded rides query rather than consuming those notifications. This is a scale/load risk.
- Firestore rules still allow any signed-in client to read ride and driver documents to support the current direct listeners. That exposes more passenger/driver information than a least-privilege production design should. Do not tighten these rules until the direct dispatch/tracking paths migrate to scoped collections/endpoints.

### Next stress-test stage

Run Firebase Emulator-backed tests for two-driver acceptance contention; Trotro/Transit/Journey inventory contention; duplicate/cancelled ride-request retries; payment initialization with provider success followed by Firestore failure; cash fallback vs late Paystack success; payment expiry vs ride completion; and exactly-once financial side effects. Run authenticated browser E2E with a correctly restricted Google Maps key for location permissions, marker updates, route rerouting, map-load failure, background/resume, poor connectivity and cancellation/payment races. These tests have not yet passed and must not be represented as completed.


### Follow-up CI note — 2026-10-17
The first CI run for the navigation/completion hardening commit failed while parsing the new source-level test regex (over-escaped regex literals). The application frontend build passed; backend test process stopped before the remainder of the pipeline. The tests have been rewritten with direct string assertions to avoid regex escaping. A fresh full CI run is required before these changes are marked verified.


## GPS freshness alignment hardening — 2026-10-17

A second navigation-state review found a race between local GPS expiry and backend acceptance: the driver UI could retain an already-rendered incoming ride after its 45-second local GPS watchdog disabled dispatch, and the server still allowed acceptance up to 60 seconds after its last persisted location. Updated both server dispatch notifications and transactional ride acceptance to the same 45-second maximum, and clear any already-visible incoming offer when the local watchdog expires. GPS marker is shown stale from 35 seconds, local dispatch readiness expires at 45 seconds, and backend remains authoritative at 45 seconds.

This is source-level hardened and regression-tested; actual GPS silence/recovery and two-driver acceptance still require browser/Firestore Emulator tests.


## Journey multi-leg transaction correction — 2026-10-17

Direct source inspection found a real Firestore transaction-order defect in `createJourneyBookingRouter`: the multi-leg loop could queue writes for leg one and then execute a route or active-booking `tx.get()` for leg two. Firestore requires every transaction read before the first write; a multi-leg booking could fail despite pure journey-state tests passing.

The route now separates read and compute phases from the write phase: reads all unique trips, referenced routes and active-booking queries first; validates all segment capacity including overlapping legs within the same Journey; only then updates each trip inventory counter, writes per-leg payment holds and writes the parent Journey. A source-level regression guard now verifies there are no transaction reads after the first write. This does not replace the Firestore Emulator contention tests added in the separate CI job.


## Firestore Emulator stress suite — 2026-10-17

Added a dedicated GitHub Actions job to start Firestore Emulator and exercise the actual Trotro, standalone Transit, and Journey booking router factories with concurrent HTTP requests. Each case submits four simultaneous one-seat requests against capacity two and asserts exactly two accepted bookings and no seat over-allocation. The Journey case uses two legs and covers the multi-leg read-before-write defect.

The emulator suite is opt-in (`OKADA_FIRESTORE_EMULATOR=1`) and skips in the ordinary fast unit suite. Its dedicated CI result must be checked independently; no emulator result is claimed until that job runs green. The injected test-auth middleware isolates transactional booking logic and does not replace Firebase ID-token verification tests.


### Follow-up CI finding — 2026-10-17

The first run after adding the Firestore Emulator suite caught a duplicate declaration of `seatCount` caused by the Journey route refactor. The backend test job failed at module parse time before other tests executed. The duplicate input-validation block has been removed; a fresh GitHub Actions run must pass before the transaction fix is considered verified.
