# Okada Online V4 — Production Audit & Stabilization V1

## Audit target

- Repository: Anaase-Tech/Okada-online
- Branch: v4-mobility-os
- Audited branch HEAD at the current documented verification snapshot: 3a5448c0f4cb3ff404aaefa0f73d1264c9c84ed6
- Baseline used for the stabilization pass: b856344c79e0a7141880bd053372f52cfaa3860c
- Current branch relation to main at audit close: ahead of main, 0 commits behind
- V4 remains an extension layer over the legacy Express application through v4Entry.js.

## Audit conclusion

The high-risk Journey payment, transit inventory, VIP Journey bypass, legacy identity/authorization, and stale deployment-document issues were found and patched. During the verification gate, the two latest frontend-only KYC fixes from main were also merged into V4 via PR #2, preserving the newer onboarding behavior.

The branch is **not certified as production-deployable yet** because Firebase deployment, a real Paystack transaction/webhook, production callback behavior, and a live Firestore-emulator contention test remain outstanding. GitHub Actions has now provided direct runner evidence for dependency installation, backend tests, deployment-structure checks, the forbidden-artifact check, and a CRA production build. The first successful frontend verification used a CI-generated synchronized lockfile; the repository lockfile was synchronized afterward and the workflow was restored to strict committed-lock verification.

A second deployment concern is now partially closed: the active API has been migrated from functions.config() to a bound Secret Manager secret named PAYSTACK_SECRET. The source migration is complete, but the actual secret value has not been set and the migrated Functions have not yet been deployed and exercised against Paystack.

## What was found correct

### Legacy preservation

- backend/functions/index.js remains the legacy application entrypoint and continues to hold the existing ride/driver/owner/KYC/fintech/MaaS functionality.
- v4Entry.js captures that Express app and mounts V4 routers before the legacy terminal 404.
- The active Functions package uses Node 20 and main=v4Entry.js.
- The active Functions package contains no Twilio dependency.
- Firestore rules deny direct client writes to sensitive collections used by the V4 backend.
- Existing frontend API default remains the deployed Firebase API endpoint.

### V4 router authority

Mounted by v4Entry.js:

- /trotro -> trotroRoutesV2.js
- /trotro-admin -> trotroAdminRoutes.js
- /transit -> transitRoutes.js
- /transit -> transitBookingRoutes.js
- /transit -> transitHubRoutes.js
- /transit -> vipTransitRoutes.js
- /journeys -> journeyBookingRoutes.js

trotroRoutesV2.js is authoritative for the deployed Trotro API. trotroRoutes.js is retained as an unmounted alternate/legacy implementation and was not deleted.

### Journey payment

The corrected Journey lifecycle is:

PENDING_PAYMENT + paymentStatus=PENDING
-> PENDING_PAYMENT + paymentStatus=PAYMENT_PENDING
-> CONFIRMED + paymentStatus=PAID

Failure:
PENDING_PAYMENT/PAYMENT_PENDING -> CANCELLED + paymentStatus=FAILED

Expiry:
PENDING_PAYMENT/PAYMENT_PENDING -> CANCELLED + paymentStatus=EXPIRED

A successful provider payment that arrives after the inventory hold has been released is retained as a paid transaction requiring refund review rather than being silently fulfilled.

Underlying Journey transit bookings are PAYMENT_PENDING until provider verification succeeds.

Journey Pass is returned only when paymentStatus is PAID.

The frontend cannot mark a Journey paid. Server-side Paystack verification and the signed webhook are the authoritative payment paths.

### Duplicate payment protection

Journey payment initialization is serialized on the Journey document.

A second payment-init request for the same pending attempt returns the previously stored authorization details rather than creating another Paystack transaction.

Successful settlement is transactionally idempotent when the payment record and Journey are already completed/paid.

Okada-generated Paystack references were corrected to use Paystack-supported characters. Current references use hyphens instead of underscores.

### Payment failure and expiry

Journey inventory holds carry paymentExpiresAt.

A scheduled Firebase function checks for expired pending Journey holds every five minutes and releases PAYMENT_PENDING bookings.

Paystack verification handles success, failed, and abandoned transaction states. Webhook processing remains focused on the successful charge event, consistent with Paystack's current webhook guidance.

### Inventory

Transit and Journey booking inventory is segment-aware.

For A -> B -> C -> D:

- A -> C consumes A-B and B-C.
- C -> D consumes C-D.
- Non-overlapping downstream segments remain independently available.

Transit search and Journey booking include unexpired PAYMENT_PENDING holds in occupancy calculations.

Concurrent Transit, Journey, and Trotro booking transactions touch the shared trip document through inventoryVersion. This creates a Firestore transaction conflict/retry point instead of allowing independent read-only inventory checks to commit concurrently.

### Fare authority

Transit/Journey fares are derived from configured trip fare or route fare.

Client-supplied Journey leg fares are not trusted for the payable total.

Direct Transit booking was similarly changed to derive the fare from configured server data.

Pickup/final-mile non-zero client fares remain intentionally rejected until a trusted backend quotation source exists.

### Journey state

The operational state engine uses stored Journey/trip state and recorded operations only.

Supported progression includes:

- BOARDING -> BOARDING
- DEPARTED / DEPARTED_STATION -> IN_TRANSIT
- intermediate STATION_ARRIVAL -> CONNECTION_PENDING
- next-leg BOARDING -> BOARDING
- next-leg departure -> IN_TRANSIT
- final transit COMPLETED -> COMPLETED
- completed transit with pending final-mile work -> FINAL_MILE

Unpaid Journeys cannot progress from operational events.

Terminal Journeys are protected from later event rewrites.

Stale events from earlier segments cannot regress a Journey that has already advanced.

### Connection monitoring

Connection monitoring returns FEASIBLE (safe buffer), AT_RISK, MISSED, UNKNOWN, CANCELLED, or BLOCKED according to the available data.

Recorded, estimated, and planned timing are explicitly distinguished.

When timing is unavailable the engine returns UNKNOWN and does not invent an ETA.

### Operational events

The Transit Operations endpoint is admin-only.

Operational events can record:

BOARDING
DEPARTED
STOPPED
TRAFFIC_DELAY
ACCIDENT_REPORTED
ROAD_CLOSURE
MECHANICAL_DELAY
STATION_ARRIVAL
DEPARTED_STATION
ARRIVING
COMPLETED
CANCELLED

Current stop/location is only updated when supplied by an operational user. No GPS or ETA is generated by this event layer.

### VIP flow

The previous VIP Journey route could create a Journey using client-supplied pricing outside the canonical reservation lifecycle.

That path is now stabilized:

- configured transit fare only
- segment inventory checks
- PAYMENT_PENDING transit holds
- payment expiry
- server-owned passenger identity
- parent Journey PENDING_PAYMENT
- canonical Journey payment route is used for payment

## Security stabilization

The legacy API was audited for identity parameters and protected against client-side principal substitution.

Patched areas include:

- profile access
- profile creation firebaseUid
- admin self-provisioning
- KYC
- license
- vehicle submissions
- ride creation
- ride acceptance
- ride completion
- ride history
- driver status
- driver location
- driver profile
- owner dashboard
- Drive to Own
- fuel code redemption
- savings
- wallet withdrawal
- Pay Later
- insurance
- scheduled trips
- rentals
- shared trips
- delivery
- corporate stats

Sensitive routes now rely on the authenticated Firebase UID and/or admin authorization rather than trusting arbitrary client userId/driverId/ownerId values.

The frontend also blocks an admin demo session when Firebase phone verification has not actually succeeded.

## Money-integrity stabilization

The audit found negative/NaN amount risks in legacy balance mutations.

Patched:

- savings deposits
- savings withdrawals
- savings rate
- wallet withdrawals
- Pay Later requests
- Pay Later repayments
- loan request amount validation

Savings and wallet withdrawals now re-check current balances inside Firestore transactions.

Pay Later now derives the deferred amount from the stored ride fare rather than trusting a client amount, verifies the ride belongs to the caller, prevents duplicate active Pay Later for a ride, and repays atomically.

## Firebase deployment structure

Current checked-in structure:

backend/firebase.json
  functions.source = functions
  runtime = nodejs20
  predeploy = npm --prefix functions install
  firestore rules = firestore.rules
  firestore indexes = firestore.indexes.json

backend/.firebaserc
  default project = okada-online-ghana

backend/functions/package.json
  main = v4Entry.js
  node engine = 20
  test = node --test modules/*.test.js

## Firestore indexes

The audit added indexes for the V4 queries used by:

- transitBookings tripId/status
- transitBookings journeyId/tripId/passengerId
- transitTripEvents tripId/recordedAt
- transitTrips routeId/status
- trotroBookings tripId/status
- trotroTrips routeId/active/status
- journeys status/paymentExpiresAt

## Frontend/API consistency

The frontend API wrapper now maps to the mounted backend routes, including:

- Journey payment initialization
- Journey provider verification
- Journey confirmation
- Journey Pass
- Journey status
- Journey events
- Journey connections
- Journey cancellation
- Transit operations event recording/history

The only unmatched frontend wrappers are sendOtp and verifyOtp. They are retained for compatibility, but the production authentication path is Firebase client-side phone verification, not those backend routes.

A complete generated route matrix is in:
docs/OKADA_V4_ENDPOINT_MATRIX.md

## Documentation corrections

The stale root production guides were corrected so they no longer instruct the operator to configure Twilio.

Updated:

- PRODUCTION_SETUP.txt
- QUICK_START.txt

They now describe:

- Firebase Phone Auth
- V4 entrypoint
- Paystack
- backend deployment path
- Journey payment flow
- Trotro/Transit inventory behavior
- current limitations

## Tests executed

### Pure V4 functional test corpus

Current exact test files on the branch:

- journeyConnectionEngine.test.js — 4
- journeyPaymentEngine.test.js — 6
- journeyStateEngine.test.js — 9
- trotroEngine.test.js — 7

Total: 26 test cases.

All 26 were executed through a Node-compatible audit harness against the current source contents.

Result:
- 26 passed
- 0 failed

### Security regression checks

The productionSecurityAudit.test.js regression assertions were also evaluated against the current branch source.

Result:
- 10 passed
- 0 failed

### Source parse

All 20 V4 CommonJS source files inspected for the stabilization pass, including v4Entry.js, parsed successfully.

Result:
- 20/20 syntax OK

## Test limitation

A literal npm test invocation against a checked-out repository could not be performed in this environment because the repository checkout and dependency tree are not available locally and outbound package installation is unavailable.

The executed 26-case harness used the current GitHub branch source and the same test files' assertions. It is therefore evidence about the checked-in source, but it is not a substitute for a local/emulator npm test run.

## Verification automation

### GitHub Actions evidence

- Run #1 — commit 9db278b3b4fd0d102ec34400e5a053a2d15a26d9 — failed on the over-broad forbidden-artifact scan and frontend lockfile synchronization.
- Run #3 — commit ddc62168b75b10ff25c6e9fe7f1474a0167c5b70 — same two CI defects.
- Run #4 — commit 138d64fc8b8da4974e570ae4f1d9827e4526b64a — backend install/tests/package/Firebase checks passed; artifact scan failed only because comments and a retained backup contained the word Twilio; frontend npm ci failed because the committed lockfile was stale.
- Run #5 — commit c48faf435552ac733cd1adb548ccf4066d1cb19a — successful backend verification and successful CRA production build using a temporary CI-generated lockfile reconciliation.
- Run #6 — commit 352169e1559cb9679bc172f0b8e416725b1ba700 — successful repeat of the same bridge verification.
- The frontend package lock was then synchronized in source control by c7e1440f97efaa2b9111c7005c57f2bc9aff093c.
- The workflow was restored to strict committed-lock verification by 5e254ff34c6ee06ada17cc992d405a2a3cab679a.
- Strict Run #8 on that commit passed end-to-end: backend verification and the CRA production build both completed successfully.

### Still not executed here

- Firebase deploy
- Firestore emulator contention test
- real Paystack sandbox/live payment
- Firebase deploy
- Firestore emulator contention test
- real Paystack sandbox/live payment
- real Paystack webhook delivery
- production callback/browser return test

These need to be run from the actual deployment environment.

## Known production limitations

1. Paystack configuration is now sourced from the Secret Manager parameter PAYSTACK_SECRET; the active JavaScript source contains no functions.config() calls. The remaining gate is to set the secret in the Firebase project, deploy the Functions, and verify real Paystack flows before retiring the old Runtime Config value.

2. The rate limiter is in-memory and instance-local. It is not a distributed/global abuse-control layer.

3. No automatic refund executor was invented. Paid Journey cancellation records refundStatus=REQUIRES_REVIEW.

4. Pickup/final-mile paid pricing is blocked without a trusted server-side quote.

5. Trotro operator creation/trip scheduling now requires an approved active operator account for non-admin production resource creation.

6. A real Firestore emulator contention test remains outstanding.

7. A complete production Paystack payment/webhook transaction remains outstanding.

## Verification-gate commits

- 9db278b3b4fd0d102ec34400e5a053a2d15a26d9 — add V4 verification workflow
- ddc62168b75b10ff25c6e9fe7f1474a0167c5b70 — merge latest main KYC onboarding fixes into V4
- 352169e1559cb9679bc172f0b8e416725b1ba700 — add chronological V4 verification log
- c48faf435552ac733cd1adb548ccf4066d1cb19a — refine artifact scan and temporary lockfile bridge
- c7e1440f97efaa2b9111c7005c57f2bc9aff093c — synchronize frontend package lock
- 5e254ff34c6ee06ada17cc992d405a2a3cab679a — restore strict committed-lock CI verification

## Stabilization commits

Key commits from the stabilization pass include:

- 706ac531b9777b6cdaafca80d20100981c2c20dd — Journey payment engine
- b891037cad02d9e5d0d63e12d69427e858560bf1 — transactional Journey payment settlement
- 3b0dacfccc0b516624903ab19b24afac64f67884 — Journey payment-pending inventory lifecycle
- e0bce06ff9f954a49ee445736933aa97678ee7b2 — webhook settlement integration
- 4c1aea4e9f70a08942e23ac836583a8c934b786b — legacy payment verification/settlement
- 8cafaef90922fa03dc10cfee1001c89a17d4b80a — expired Journey hold release
- a1b2907280d1733b8e1d599bfe1bfe1db1a6d011 — Transit inventory/fare hardening
- e66fe24d492605e64aaf4cff87c858394591e2d9 — Trotro concurrency hardening
- 5e1232022909074ef3a8018ed8a686392cb5fd42 — legacy identity binding
- ede2d47b7ad4a4851a2cb62f242135620e12409f — ride/driver/owner authorization
- 233ab1a35aed915637c239a0886c8f487b3d311d — VIP canonical Journey lifecycle
- 0301fba39ef53717419615969e844e24fcc2ef1a — Firestore indexes
- cb05661665a05590ab61574543a6f96568f4ad86 — fuel-code authentication
- 676abeb2311a4e58a5f77b138cc6ffa0d5d3d0d6 — money input/withdrawal hardening
- 50539d7882a4cac49b16410e296efbfc927e18c4 — Pay Later server pricing
- b57550e0055099c987ee0e05aecc2c358abfdd87 — Pay Later atomic repayment
- 216fa0c045ecd14e9ed822e90817d2047bbcffb9 — Trotro operator authorization
- bc62456c85e684683cea04261cd5ff28f7b91a57 — Journey Paystack-safe reference
- 40d26057b59654ce125f4f881501511ac786e249 — legacy Paystack-safe reference
- 843202648000ce3362ac6ee1dbb1e94251803bf3 — duplicate-success idempotency test
- 6954485f78323ad432066ff32ba5a071030b6eed — security regression tests
- 7f069e2cff5b1e73daaf82a23eb34eaf1f9603f2 — Journey callback recovery
- a1a546533be6729bfbf1a27841dc28e9c6211c71 — endpoint matrix
- de8f9c8eb022d2b515880583e0e7575929c30181 — final audited documentation count correction

## Final audit status

**Stabilized in source control and passed the strict repository CI verification gate; external production certification is still pending.**

The next gate is not another subsystem. The strict committed-lock CI gate is now passed; the remaining gate is the real deployment and live-service verification pass:

1. install dependencies from the actual repository checkout
2. run literal npm test
3. run CRA build
4. run Firestore emulator concurrency tests
5. configure/verify Paystack sandbox webhook
6. execute a real end-to-end Journey payment
7. deploy Functions and verify the deployed /api behavior

No new major Mobility OS subsystem should be treated as production-ready until those external checks pass.


## Current verification snapshot — 2026-09-24

- Current branch tip: 6f4e60a5055a01e6a12fbc5b611ada0545937a80.
- Branch relation to `main`: 138 commits ahead, 0 behind.
- GitHub Actions run #10 (verification of documentation parent commit d5bd240b24e99f95109c746389fa2a725d6a65bc): **success**.
- GitHub Actions run #11 (verification of documentation parent commit b8788545f7ce6d1ada816caf5fcaa42217df3104): **success**.
- The commit chain from the strict verified application snapshot through the current tip consists only of documentation/audit-log reconciliation commits after the runtime verification gate.
- Current combined GitHub commit status for the current tip reports **Vercel: success**.
- Therefore the source-control CI and current Vercel status are green. Firebase deployment, deployed API smoke tests, Firestore concurrency/emulator testing, live Paystack payment/webhook testing, and production callback testing remain external gates.



## Paystack Secret Manager migration — 2026-09-24

The deprecated Firebase Runtime Config dependency for Paystack was removed from the active API.

Source changes:
- `defineSecret('PAYSTACK_SECRET')` is declared in `backend/functions/index.js`.
- `PAYSTACK_SECRET` is bound to the `api` HTTP function.
- Paystack initialization, verification, and webhook signature validation read `PAYSTACK_SECRET.value()`.
- The active JavaScript source no longer uses `functions.config()`.

Verification hardening:
- The GitHub Actions workflow now fails if active JavaScript source contains `functions.config()`.
- Retained backup files are excluded from this specific source guard, so historical backup text does not create a false failure.

Source-control commits:
- `34710602e08a406d50cce0ab8d19584dd26b1b1b` — runtime Secret Manager migration.
- `35c1a8dceabf211354ceb5550c27f7b16ecac07b` — CI guard against deprecated Runtime Config.
- `a200aacb8a56b3ee8572934c6cc43ce2fe3f9389` — migration documentation.

External work still required:
- set `PAYSTACK_SECRET` in the Firebase project;
- deploy Functions;
- run Paystack initialization/verification/webhook tests;
- confirm production callback/recovery behavior;
- retire the old Paystack Runtime Config only after the migrated deployment is confirmed.

No new Mobility OS feature was added by this migration.


## Independent PASS 4.1 audit and runtime addendum — 2026-10-17

This addendum supersedes the older verification snapshot dates above for the current branch state. It does not erase historical findings or certify production readiness.

### Independently inspected source-control snapshot

- Branch: `v4-mobility-os`
- Parent HEAD before this addendum: `273ecb50e4c4cbede10666da7e99b95804045cb4`
- GitHub Actions run #29 for that source snapshot: backend suite **50 passed / 0 failed**, deprecated-config guard self-test passed, and frontend build compiled.
- A Vercel preview record exists for `273ecb50e4c4cbede10666da7e99b95804045cb4} (commit prefix `273ecb5`) and was marked READY. This is not a Firebase deployment or a production end-to-end test.
- No Firebase production deployment, real Paystack sandbox round trip, or Firestore emulator concurrency test was performed as part of this independent audit.

### Runtime migration

Google Cloud's runtime schedule lists Node.js 20 decommissioning on 2026-10-30. Firebase's current Functions documentation lists Node.js 22 as supported. The active Functions configuration and package engine were still Node 20 at the audited snapshot. This change updates the Functions runtime declaration, package engine, lockfile root engine metadata, and CI validation to Node 22. The web frontend CI runtime is aligned to Node 24 to match `web-app/package.json` and the Vercel preview build requirement.

This is a source/CI change only. It does **not** deploy Firebase Functions or prove the target project has been migrated. CI must pass on the new runtimes before a separately authorized deployment plan is prepared.

### PASS 4 correction verification

- Trotro admin approval route: `requireAuth` is now chained before `requireAdmin`; test coverage uses injected/test-double dependencies and does not prove live Firebase token verification.
- Journey Paystack secret: active Journey router uses the shared `PAYSTACK_SECRET` Secret Manager parameter; no real Paystack sandbox round trip was verified.
- Paystack webhook: global JSON middleware captures original bytes in `req.rawBody`; HMAC logic tests exist, but deployed Cloud Function → Firestore settlement integration remains unverified.
- Ride completion: handler now runs a Firestore transaction and checks for unsettled online payment records. Its logic test uses a reduced handler copy and does not exercise all DTO, owner, loan, savings, and referral side effects.
- Deprecated-config guard: GitHub Actions log shows self-test cases for normal and optional-chaining `functions.config` references passed. Guard scope remains active JavaScript under `backend/functions`, not a comprehensive repository-wide historical-source audit.

### Newly confirmed risks from direct source inspection

1. **Payment initialization persistence gap:** legacy `/payments/initialize` contacts Paystack before writing the Firestore payment record. If provider initialization succeeds and the later write fails or races ride completion, the completion gate may not see the online attempt. This needs durable attempt-state/idempotency design and failure-window tests.
2. **Ride acceptance race:** `POST /rides/:rideId/accept` reads `requested` and updates to `accepted` outside a Firestore transaction. Concurrent drivers can both pass the initial check.
3. **Ride completion state gate:** the transaction rejects already-completed/missing rides, but the inspected gate does not enforce a specific permitted pre-completion lifecycle state. Define the existing intended lifecycle before tightening it; do not invent a new status without product/source evidence.
4. **Duplicate journey planning route:** `POST /transit/journeys/plan` appears in both `transitRoutes.js` and `transitHubRoutes.js`; the former is mounted first and normally handles the matching request, shadowing the latter.
5. **Standalone booking idempotency/payment policy:** Trotro and Transit booking transactions protect inventory via shared-trip writes, but no emulator-backed contention test was found and booking retries can create additional booking records. Their payment behavior requires an explicit product decision.
6. **Pickup/final-mile payload schema:** attach-pickup and attach-final-mile handlers accept caller objects and spread their fields into the stored Journey. Establish an allowlist and ensure all payable amounts remain server-authoritative.
7. **Historical files:** root `backend/index.js` and `backend/package.json` retain legacy Twilio/config references outside the configured Firebase Functions source. `backend/functions/index.js.bak2` is inside the configured source directory and contains old references; deployment packaging should explicitly exclude backups without deleting them.
8. **Firestore access contract:** V4 collection names inspected in the rules fall to the default deny. This is safe for backend-only access, but any direct client reads need explicit, ownership-scoped rules. The broad signed-in read of legacy `rides` remains a privacy concern.
9. **Dependency audit:** CI installation reported 63 dependency vulnerabilities (12 low, 21 moderate, 27 high, 3 critical). This is not a finding that all are exploitable; triage production dependency reachability before targeted upgrades.

### Current decision and next actions

- PASS 4.1 order: (1) Node 22 runtime/CI migration and tests; (2) durable payment-attempt persistence and idempotency; (3) atomic ride acceptance; (4) explicit ride lifecycle gate; (5) resolve duplicate journey planning route without silently dropping behavior; (6) emulator-backed booking and completion concurrency tests; (7) input allowlists, backup packaging, Firestore access contract, dependency triage.
- Product decision still required: when an online payment attempt fails or is abandoned and a passenger then pays cash, what is the intended resolution policy? Do not implement an invented answer.
- No Firebase production deployment is authorized by this addendum.
- Preserve all existing features and historical backups. No fake operational data or exposed secrets.

### Team coordination

A public Slack channel `#okada-v4-team` was created for human-led engineering coordination: https://anaase-tech.slack.com/archives/C0CAW0BGK3J. The kickoff message records branch, verification state, rules, and PASS 4.1 order. A Slack channel is not, by itself, an autonomous bridge between AI assistants: each assistant must actually have access to the workspace/channel and be prompted to read and respond. A Claude bot/user was not found by the current Slack user search, so automated AI-to-AI participation is not yet verified.

### Official runtime references checked 2026-10-17

- Firebase Functions runtime selection: https://firebase.google.com/docs/functions/manage-functions
- Google Cloud Functions runtime lifecycle: https://docs.cloud.google.com/run/docs/runtimes/function-runtimes


## PASS 4.1 update — atomic ride acceptance — 2026-10-17

Direct inspection of the active legacy handler confirmed a read-then-update race in `POST /rides/:rideId/accept`. The route now reads the ride and driver inside a Firestore transaction, re-checks that the ride is still `requested`, verifies the assigned driver's existing authorization/verification conditions, and writes both the ride assignment and passenger notification inside the same winning transaction. The existing success response and error meanings are preserved. A source-level regression test verifies the transactional wiring; this is not a substitute for an emulator-backed concurrent two-driver test.

The runtime/CI migration to Node 22 (Functions) and Node 24 (frontend CI) is being validated by GitHub Actions. No Firebase production deployment was performed or authorized.

Still open: durable Paystack attempt persistence/idempotency, ride completion lifecycle state policy, duplicate journey plan route, emulator contention tests, pickup/final-mile allowlists, backup packaging, Firestore access contract, dependency triage, and the cash-after-failed-online-payment product decision.


## PASS 4.1 CI correction — 2026-10-17

The first Node 22 CI run after adding the ride-acceptance source-level regression test failed because the new test's regex literals were over-escaped and could not be parsed. This was a test-source syntax error, not an application runtime failure. The test literals have been corrected; CI must be rerun and its result recorded before this pass is considered green.


## PASS 4.1 runtime and atomic-acceptance verification result — 2026-10-17

- Verified source/test commit: `fc1c136ef662bd5359a7bcec27a1f81921566476`.
- GitHub Actions run #32: https://github.com/Anaase-Tech/Okada-online/actions/runs/39037327115 — **success**.
- Backend ran on Node.js 22.23.3: **51 tests passed, 0 failed**.
- Runtime structure assertions passed: Functions package engine `22`, Firebase runtime `nodejs22`, main entrypoint `v4Entry.js`.
- Deprecated-config guard self-test passed.
- Frontend CI used Node.js 24 and production build succeeded.
- An earlier run for commit `5fdadd4` failed due over-escaped regex syntax in the newly added static test. This was corrected in `fc1c136`; the later run above is green.
- No Firebase production deployment, Paystack sandbox transaction, or Firestore Emulator concurrency test was performed.
- Ride acceptance is now transaction-wired in source; emulator-backed concurrent-driver proof remains open.


## PASS 4.1 payment/cash policy and implementation — 2026-10-17

### Recommended policy adopted in source

A passenger can switch a ride to cash only after the backend has verified that every Paystack attempt for that ride is terminally failed/abandoned (or no online attempt exists). Pending, processing, queued, initializing, or unknown provider outcomes block cash fallback. Cash selection creates a durable `cash_pending_confirmation` payment record and marks the ride `CASH_AWAITING_DRIVER`. The ride is not considered cash-paid until the assigned driver submits explicit confirmation through ride completion. No timer or client toast constitutes payment proof.

If Paystack succeeds after the passenger has selected cash but before the driver confirms cash, the server restores the ride's payment method to Paystack and tells both passenger/driver not to collect cash as well. If Paystack succeeds after the ride has been confirmed cash-paid (or another online reference already settled it), the payment is marked `completed_refund_review` / `REQUIRES_REVIEW`; the ride is not settled again and financial side effects are not repeated. This is a reconciliation alert, not an automatic refund.

### Implementation added in PASS 4.1 continuation

- Legacy ride payment initialization now reserves a durable `payments` record and payment reference inside a Firestore transaction before calling Paystack.
- Repeated initialization reuses an existing pending authorization URL, or fails closed if an attempt's outcome remains unknown; it does not silently create a second attempt.
- Provider failures distinguish confirmed initialization rejection from an unknown network outcome.
- Added `POST /rides/:rideId/payment-method` for passenger cash selection, with online-attempt terminal-state checks and a stored cash confirmation record.
- Added `POST /rides/:rideId/start` as a real, authenticated transition from accepted to in-progress so the passenger UI need not pretend a ride has started.
- The ride completion transaction now examines every payment attempt and requires explicit driver confirmation for the new cash fallback path.
- Legacy payment settlement detects a Paystack success arriving after cash payment or another successful online reference, and flags refund review without changing the already-settled ride or crediting earnings again.

### Verification status at time of this addendum

These changes are source edits awaiting the CI result. Unit/source regression coverage is being added. No live Paystack sandbox, Firebase Emulator contention test, refund execution, or Firebase production deployment has been performed. Do not call this production-ready until those gaps are closed.


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
