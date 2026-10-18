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


### Transit route activation consistency — 2026-10-17

The emulator fixture initially failed standalone Transit because its route lacked `active: true`, which the actual standalone Transit router intentionally requires. The fixture has been corrected to match the real creation contract. Review of that mismatch exposed a related gap: Journey booking checked that route documents existed but did not reject routes explicitly marked inactive. Journey now rejects `active: false` while retaining compatibility with older records where `active` is absent; an emulator regression test covers the explicitly inactive case.


## Final source/CI snapshot verified — 2026-10-17

The source snapshot audited for this handoff is a3841461ed8925198b94637193685749cc937f6d. GitHub Actions run https://github.com/Anaase-Tech/Okada-online/actions/runs/39074794848 completed successfully across all three jobs: backend/structure checks (86 tests, 82 passed, zero failed, four skipped; Node.js 22), Firestore Emulator concurrency suite (4 passed, zero failed), and frontend production build (Node.js 24). The four emulator cases were Trotro contention, standalone Transit contention, two-leg Journey contention, and inactive-route rejection. This does not prove all end-to-end payment/ride races or production navigation.

Source inspection confirms the map uses browser GPS, Firestore listeners, Google Maps markers and a DirectionsService road-route overlay. It is not turn-by-turn or voice navigation. Production Google Maps rendering, authenticated browser E2E, Paystack sandbox behavior, ride acceptance/completion contention and exactly-once financial effects remain unverified.

The latest frontend dependency install log reported 106 vulnerabilities (5 low, 23 moderate, 74 high, 4 critical); triage production dependency paths rather than blindly forcing upgrades. The main branch still declares web-app Node 20.x while v4-mobility-os uses Node 24.x. Backup packaging, broad signed-in reads of rides/drivers, duplicate /transit/journeys/plan route definitions, payment-channel selection contract, and bounded latest-25 driver dispatch query remain open.

Slack #okada-v4-team was checked by the actual member list and had only @africanaihq; Claude/Anthropic membership is not verified. An hourly condition watch was configured to notify only when a Claude integration appears in the actual member list. No Firebase production deployment was performed.


## Independent cross-layer source audit addendum — 2026-10-18

### Snapshot and verification evidence

- Repository/branch: Anaase-Tech/Okada-online, v4-mobility-os.
- Current HEAD observed before this documentation update: bd28f679c9fd526019a5290d0a277eae4c0d4c81. The preceding application-source commit is a3841461ed8925198b94637193685749cc937f6d; the audited HEAD adds documentation over that application snapshot.
- Latest successful GitHub Actions run for that HEAD: run 39079118420, https://github.com/Anaase-Tech/Okada-online/actions/runs/39079118420. All three configured jobs concluded success.
- Backend test job: 86 tests, 82 passed, 0 failed, 4 skipped, Node 22.23.3. The package/structure checks passed.
- Firestore Emulator job: 4 passed, 0 failed, 0 skipped on Firestore Emulator 1.22.0. Coverage is Trotro contention, standalone Transit contention, two-leg Journey contention, and inactive-route rejection.
- Frontend job: web-app production build compiled successfully under Node 24; the output was approximately 234.39 kB JavaScript and 2.93 kB CSS.
- Dependency audit warnings from the install logs: backend functions dependency tree reported 62 findings (3 low, 16 moderate, 40 high, 3 critical); web-app reported 106 (5 low, 23 moderate, 74 high, 4 critical). These totals require dependency-path triage; they are not, by themselves, proof that every finding is exploitable in production.
- The workflow does not build the Expo mobile-app, run browser end-to-end tests, or exercise the real Paystack sandbox/live provider. No Firebase production deployment, production database test, production GPS test, or real-money payment test was performed.

### Confirmed source findings — highest priority

1. **P0 — Savings deposits can create account value without funding.** In backend/functions/index.js, POST /fintech/savings/deposit writes a savings_transactions entry with status completed and increments the caller's savings.balance and savings.totalDeposited. The path does not debit a wallet, verify an external payment, or require an admin/agent reconciliation. The profile-ownership helper restricts whose profile is credited, but it does not establish that money was received. This can falsify balances, saving history, and any decisions based on deposited amounts. Require verified funding or keep deposits pending until reconciled; do not treat a client-call as proof of cash received.

2. **P0 — Pay Later repayment settles the receivable without collecting money.** POST /fintech/pay-later/repay transactionally marks a chosen or matching deferred record as paid and decrements payLater.used, but the inspected path does not debit a wallet, create/verify a payment, or check external settlement. An authenticated borrower can therefore remove debt from the ledger without paying. Keep debt open until a verified payment or an authorized, audited manual reconciliation settles it.

3. **P0 — Negative event deposit can credit the caller's wallet.** POST /maas/events/book computes the deposit from caller-supplied depositPercent without enforcing a positive percentage or a maximum. The wallet check compares the available balance to that value; the subsequent wallet mutation increments available by the negative of the deposit. A negative percentage therefore passes the balance check and increases wallet.available while creating an event record. Validate the percentage server-side (and ideally accept a fixed enumerated plan) before any write, and execute the event/wallet ledger mutation atomically.

4. **P1 — Rental kilometre logging writes before checking access.** POST /maas/rental/:id/log-km reads a rental, calculates kmUsed/extraKmCharges, and calls ref.update before resolving/authorizing the rental owner. For a known rental ID, a different authenticated user can cause the rental data to be mutated and only then receive a 403. It also lacks robust finite/non-negative kilometre validation and a single transaction across kilometre state and fee debit. Authorize before mutation, validate input, and transactionally compute/update both the rental and its ledger effect.

5. **P1 — Delivery tracking can disclose personal information.** GET /delivery/track/:code is unauthenticated and returns the complete delivery document, which contains recipient name/phone, route addresses, sender and driver identifiers, fare, and operational fields. The tracking code is created from Date.now converted to base 36 rather than an unpredictable secret, making enumeration more practical. Return a minimal tracking DTO only, use a cryptographically unpredictable code, rate-limit attempts, and avoid disclosing personal data before authenticated/authorized access.

6. **P1 — Delivery state transitions are not enforced.** PUT /delivery/:id/status authorizes the sender for updates but does not enforce a transition matrix. As written, a sender can submit a status such as delivered without a verified driver hand-off or proof workflow. Restrict each actor to permitted transitions, require an assigned-driver/admin action for operational transitions, validate proof references, and write the transition plus timestamps/notifications atomically.

7. **P1 — Several money-backed MaaS flows have non-atomic balance checks and writes.** Subscription creation, rental booking, and event booking read a wallet balance, create the service document, then mutate wallet values separately. Concurrent requests may both pass the same balance check; partial failure may leave a service record without its corresponding debit or a debit without a consistent service record. Use a Firestore transaction and an immutable financial ledger/idempotency key for each logical purchase.

8. **P1 — Shared-ride seats can be oversubscribed under concurrent joins.** POST /maas/share/:shareId/join performs read/check/update of passengers and status outside a transaction. Simultaneous joiners can both observe free capacity and both write their arrays. Move capacity validation and passenger addition into one transaction against the shared trip document; add concurrent emulator tests.

9. **P1 — Account phone is not bound to the authenticated Firebase phone claim.** POST /auth/create-profile accepts the request-body phone value and stores it in the profile; the active auth middleware verifies the ID token and records UID, but the inspected path does not compare the body phone against the phone_number claim in the decoded token. This enables a user authenticated with one Firebase identity to put a different phone into their profile/contact data. Derive it from the verified token or explicitly compare it, with a carefully controlled change-phone verification flow.

10. **P1 — Delivery, insurance, loans, and wallet-facing services are not yet verified as real-money products.** Delivery request stores a fare and requested payMethod but does not collect/debit the fare in that path. Insurance purchase immediately creates an active policy with provider label “Hollard Ghana” without an observed premium debit or insurer API/certificate exchange; claim evidence is reduced to a boolean rather than persisted evidence/reference. Loan requests of up to GH₵500 become active, but the inspected handler does not disburse funds. These are operational/product blockers unless explicitly labelled as prototypes and backed by a real audited settlement/partner workflow.

11. **P1 — The USSD callback reports a booking that it does not create.** POST /ussd/callback is public; the booking branch returns “Okada booked!” with a Math.random fare, but the inspected handler does not write a ride or dispatch record. No callback signature/authentication is visible. Authenticate the gateway and make booking a durable idempotent operation, or return a clearly non-production/not-supported response.

### Frontend / mobile production-contract findings

12. **P1 — User-visible demo fallbacks can claim that failed operations succeeded.** Verified examples in active web-app source:
   - ShareRide.jsx displays hardcoded sample trips on an empty/error snapshot; a failed create can insert a local demo trip, and a failed join still displays “Joined”.
   - DeliveryApp.jsx tells the user a delivery was booked with a random tracking code after API failure; tracking failure fabricates an in-transit delivery from Akosombo to Kpong with recipient “Test”.
   - ScheduledTrips.jsx substitutes sample schedules on fetch failure, reports “Schedule saved (demo mode)” after create failure, and toggles pause/resume locally even if the API call fails.
   - RentalHub.jsx reports a rental booked in demo mode after the server call fails.
   - DriverPickups.jsx renders hardcoded assignments on empty/error API results.
   - AdminApp.jsx begins with hardcoded ride/driver/revenue counts and catches stats failure without clearing or labelling those numbers. DriveToOwn.jsx can activate a demo and locally simulate payment/ownership progress after API failure.
   These behaviours conflict with the project's no-invented-live-data rule. Production mode should show an empty, unavailable, or retry state; demo data must be isolated behind an explicit development/demo flag and labelled on-screen.

13. **P0 release blocker for native app — Expo source/package mismatch plus simulation.** mobile-app/package.json defines an Expo/React Native app but declares lucide-react-native, while mobile-app/App.js imports lucide-react (not declared in that package) and uses DOM elements and web Tailwind/className styling instead of React Native components. No Expo build runs in CI, so the native build result is not verified; the dependency/component mismatch is a likely build/runtime blocker. The same App.js uses random fare/distance/ETA, fabricates an incoming rider, broadcasts random Accra-area coordinates rather than device GPS, and lets acceptance/completion update local state/earnings after swallowing backend errors. Its AuthScreen uses /auth/send-otp and /auth/verify-otp and explicitly falls through to a demo user on failures; those routes were not found in the active Express backend route inventory. Do not distribute this as a production native client until it is rebuilt/verified against Firebase Phone Auth and real device GPS/API responses.

14. **P1 — The PWA fare model and road route can diverge.** /rides/request calculates distance with Haversine between submitted coordinates, and estimatedDuration as distance × 3. The map overlay uses Google DirectionsService road routing. The server fare is therefore based on straight-line distance, not the road route the user sees; rural/river/indirect routes in Eastern Region may diverge materially. Confirm the product fare rule, then use an authoritative road-distance provider server-side or label the fare/duration as a straight-line estimate. Do not trust a browser-calculated fare for settlement.

15. **P1 — Driver dispatch can miss valid nearby rides at scale.** DriverApp.jsx watches only the newest 25 requested rides for the driver's vehicle type, then filters those 25 by local 5 km distance. Older, still-requested nearby rides disappear from the candidate set when more than 25 newer requests exist, even when those newer requests are far away. Replace this with server-side spatial dispatch/fan-out or a query design that does not discard candidates before proximity filtering.

16. **P1 — A duplicate transit planning endpoint is mounted twice.** POST /transit/journeys/plan exists in both transitRoutes.js and transitHubRoutes.js, and v4Entry.js mounts transitRoutes before transitHubRoutes under the same /transit prefix. The first matching handler can shadow the second, leaving ambiguous response shape/logic. Select one canonical contract and test the returned payload used by JourneyApp.

17. **P1 privacy — Firestore permits broad signed-in reads of driver, ride, and shared-trip records.** backend/firestore.rules allows any signed-in client to read each driver document, ride document, and shared trip. These documents include driver GPS/profile/contact data and passenger phone/address/coordinate fields. The rule comments explain this was chosen to support realtime listeners, but it exposes more than the client needs. Move dispatch and tracking reads through scoped server queries or use ownership/role-aware rules with suitable query predicates; do not simply tighten rules without adapting listeners and testing their contracts.

### Strengths verified in source, and scope limits

- The PWA driver GPS path uses navigator.geolocation.watchPosition and sends actual device coordinates; passenger ride/driver views use Firestore snapshots. Map.jsx uses Google Maps markers and DirectionsService for a road-route overlay. This is not turn-by-turn/voice navigation, and a live production API key/billing/referrer configuration was not tested.
- Ride-request creation has a requestId/fingerprint transaction for idempotent clients; driver acceptance validates ride state, authenticated driver identity, verified/online status, vehicle type, recent GPS timestamp and 5 km proximity in a transaction. Start, cancellation, and completion include server-side state/identity checks.
- Paystack initialization reserves a persisted attempt before provider contact; the ride payment settlement helper checks provider amount/currency, applies settlement transactionally, and routes late-success conflicts after cancellation/cash/Pay Later into refund review. The webhook checks the Paystack HMAC signature. These are useful controls; they do not offset the unverified money-movement paths above.
- The PWA location picker currently submits configured coordinates for named preset locations, not a fresh passenger device position or manually pinned doorstep point. Clarify this in the user experience or provide precise pickup-pin/current-location capture.

### Not tested / remaining gates

No live Paystack sandbox/webhook replay, authenticated browser E2E, real-phone-auth flow, mobile Expo build, rules emulator abuse tests, ride-accept concurrency test, ride-completion/paystack race stress test, unknown-payment network-drop test, delivery state-machine test, MaaS wallet race test, privacy enumeration test, device background/resume GPS test, or production Google Maps check ran in this audit. The latest CI green status means only that its configured backend tests, four booking-emulator tests, structural checks, and web-app build passed. It does not mean production is safe.

### Recommended repair order (no code changes or deployment made by this audit addendum)

1. Block the three direct financial-integrity issues above (unfunded savings credits, uncollected Pay Later repayment, negative event-deposit wallet credit), with regression tests proving balances cannot be created/cleared without verified settlement.
2. Repair authorization-before-write for rental kilometre logging, enforce delivery transitions, protect tracking personal data, and validate/authorize every financial and logistics state change.
3. Remove false-success demo fallbacks from production-mode web screens; put demo data behind a deliberate development-only switch.
4. Decide whether mobile-app is supported production scope. If yes, implement real React Native components, Firebase Phone Auth, device GPS and API integration, then add a native build job; if no, prominently retire/label the prototype rather than representing it as a live app.
5. Fix duplicated journey-plan routing, fare/distance truth, and dispatch candidate truncation; design least-privilege Firestore reads without breaking realtime flows.
6. Add transaction/race tests and Paystack contract/sandbox tests; triage the 168 combined npm install audit findings by production dependency path, not a blind force-upgrade.
7. Protect v4-mobility-os with required reviews/status checks before risky changes.

No Firebase production deployment was performed.

## Repair branch verification — 2026-10-18 (CI verified for commit 7821f956)

### Starting point and working-tree limitation
- Repair branch: repair/p0-financial-integrity-2026-10-18
- Base ref: v4-mobility-os at bb2a558c41f77ea71c6d08dcd6242719c62c04d7 (remote branch commit observed through GitHub).
- The GitHub connector exposes committed repository state but not a local checkout, so a local git status / uncommitted working-tree state could not be inspected. No local changes are inferred.
- No Firebase deploy, production service call, or real-money transaction was performed.

### P0 verification matrix (source inspected at base HEAD)
| Finding | Source evidence at base HEAD | Initial validity verdict | Repair state |
|---|---|---|---|
| P0-A Savings deposits | backend/functions/index.js, POST /fintech/savings/deposit: caller-supplied positive amount was written as manual_deposit/completed and incremented savings balance without a funding reference | Valid | Changed to fail closed with HTTP 409 until verified funding or an authorized, auditable reconciliation workflow exists; no savings balance/ledger is changed by this endpoint |
| P0-B Pay Later repayment | POST /fintech/pay-later/repay: request amount or record ID caused debt status to become paid and used credit limit to decrement without a verified receipt/payment record | Valid | Changed to fail closed with HTTP 409; no debt record or credit limit is changed by this endpoint. An actual verified repayment collection workflow remains required |
| P0-C Event deposit | POST /maas/events/book: depositPercent was not range-checked and service write/wallet movements were separate operations | Valid | Added percentage validation (fractional ratio contract, e.g. 0.30 = 30%) and a single Firestore transaction for authoritative wallet reads, event record creation, available debit and pending credit |
| P0-D Native Expo app | mobile-app/App.js imports web lucide-react, uses DOM/Tailwind elements, simulated authentication/location/fare/earnings; package declares lucide-react-native and Node entry points at index.js | Valid | Not repaired in this batch. A genuine native port is larger than a dependency tweak; prototype remains unsupported for production until native architecture and real backend/device integration are implemented and a build succeeds |

### Regression tests added (not yet executed here)
- backend/functions/modules/financialIntegrity.test.js: event deposit percentage range/default tests.
- productionSecurityAudit.test.js: source-contract tests for fail-closed savings/Pay Later routes and event transaction atomicity.
- The GitHub connector cannot provide a local checkout for git status, but the GitHub Actions runner did execute the configured Node/backend, Firestore Emulator and web-build jobs. Exact results are recorded below.

### CI evidence for commit `7821f956cf6b8071ced5ecbc35196e0d6fe5514c`
- GitHub Actions run #65 completed successfully: https://github.com/Anaase-Tech/Okada-online/actions/runs/39089076536
- Backend tests + deployment structure: **93 tests, 89 passed, 0 failed, 4 skipped**. The four skips are existing fast-suite skips; the separate emulator job ran independently.
- Firestore Emulator concurrency suite: **4 passed, 0 failed, 0 skipped** (Trotro contention, standalone Transit contention, two-leg Journey contention, inactive-route rejection). These do not exercise the new P0 event/savings/repayment endpoints.
- Web production build: `npm run build` completed with “Compiled successfully” under Node.js 24.
- Regression assertions for P0-A, P0-B and P0-C passed in the backend suite. These include source-contract checks and the event-ratio helper unit tests; they are not a live provider test nor a full Firestore wallet-race test.
- The Expo/native app was **not built** by this workflow and remains an open P0 release blocker.
- No Firebase deploy, Paystack sandbox/live transaction, production service call, or real-money movement was run.

### Remaining risks after this batch
- Existing historical savings transactions and Pay Later records are not migrated or retroactively reclassified; doing so may alter financial records and requires a separate reconciliation review.
- Manual savings funding and Pay Later repayment are intentionally unavailable until a verified provider or authorized/auditable reconciliation path is specified.
- Event booking retries are not yet assigned an idempotency contract.
- P0-D and P1/P2 findings remain open pending further repair batches.


## Repair batch — rental kilometre authorization ordering (2026-10-18; CI pending)

### Finding and evidence
The source at base commit 239c2700bbfa8a582ef7abbd47b5b9b81dd658d9 confirms `POST /maas/rental/:id/log-km` updated rental kilometre/charge fields before resolving the rental owner. An authenticated non-owner could therefore cause a mutation and then receive HTTP 403.

### Change
- Validate the requested kilometre delta as finite and positive.
- Resolve/authorize the rental owner (or admin) before any rental or wallet mutation.
- Reject corrupt stored kilometre/charge operands before writes.
- Preserve the current pricing formula and wallet charging behavior; the separate atomic wallet/rental-write concern remains in the later atomic-wallet batch.

### Regression coverage and limits
A source-contract regression check asserts authorization is ordered before any rental/wallet mutation and invalid deltas are rejected. No live Firestore test or production operation was performed. CI is pending for this stacked review branch.


## Repair batch — delivery tracking privacy (2026-10-18; CI pending)

### Finding and source verification
At the base source, `POST /delivery/request` generated `DLV-` plus a base-36 timestamp, making tracking references guessable, and public `GET /delivery/track/:code` returned the entire delivery document including sender/recipient data, driver ID, proof and fare/payment metadata. The finding remains valid at the audited base.

### Change
- Tracking codes now use a 128-bit cryptographically random reference.
- Public tracking now returns an explicit allowlist DTO with the tracking code, status, pickup/delivery labels, vehicle type and pickup/delivery timestamps; internal IDs, sender/recipient identifiers/contact fields, proof, fares, package metadata and payment fields are excluded.
- Added unit tests for the code format and DTO allowlist, plus route-contract regression checks.
- The existing UI-required pickup/delivery strings remain present. The tracking code is a bearer capability; do not share it in public logs/posts.

### Limits
No authenticated end-to-end test or live delivery record was used. Delivery status-transition authorization remains a separate repair batch.
