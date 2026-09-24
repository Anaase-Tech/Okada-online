# Okada Online V4 — Production Audit & Stabilization V1

## Audit target

- Repository: Anaase-Tech/Okada-online
- Branch: v4-mobility-os
- Audited branch HEAD after stabilization: ddc62168b75b10ff25c6e9fe7f1474a0167c5b70
- Baseline used for the stabilization pass: b856344c79e0a7141880bd053372f52cfaa3860c
- Current branch relation to main at audit close: ahead of main, 0 commits behind
- V4 remains an extension layer over the legacy Express application through v4Entry.js.

## Audit conclusion

The high-risk Journey payment, transit inventory, VIP Journey bypass, legacy identity/authorization, and stale deployment-document issues were found and patched. During the verification gate, the two latest frontend-only KYC fixes from main were also merged into V4 via PR #2, preserving the newer onboarding behavior.

The branch is **not certified as production-deployable yet** because this environment could not execute a real Firebase deployment, a real Paystack transaction/webhook, a full CRA production build, or a live Firestore-emulator contention test. The code and configuration are prepared for those final external verification steps.

A second deployment concern is configuration technology: the active functions package still uses functions.config(). Firebase currently documents that interface as deprecated and says new deployments using it will fail after March 2027. This was intentionally documented rather than silently migrating the entire production configuration during the audit.

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

Not executed here:

- CRA production build
- Firebase deploy
- Firestore emulator contention test
- real Paystack sandbox/live payment
- real Paystack webhook delivery
- production callback/browser return test

These need to be run from the actual deployment environment.

## Known production limitations

1. functions.config() is still used for Paystack configuration. Firebase currently marks functions.config() deprecated and says new deployments using it will fail after March 2027. Migrate to parameterized configuration / Secret Manager before that deadline.

2. The rate limiter is in-memory and instance-local. It is not a distributed/global abuse-control layer.

3. No automatic refund executor was invented. Paid Journey cancellation records refundStatus=REQUIRES_REVIEW.

4. Pickup/final-mile paid pricing is blocked without a trusted server-side quote.

5. Trotro operator creation/trip scheduling now requires an approved active operator account for non-admin production resource creation.

6. A real Firestore emulator contention test remains outstanding.

7. A complete production Paystack payment/webhook transaction remains outstanding.

## Verification-gate commits

- 9db278b3b4fd0d102ec34400e5a053a2d15a26d9 — add V4 verification workflow
- ddc62168b75b10ff25c6e9fe7f1474a0167c5b70 — merge latest main KYC onboarding fixes into V4

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

**Stabilized in source control, but not yet externally production-certified.**

The next gate is not another subsystem. It is the real deployment verification pass:

1. install dependencies from the actual repository checkout
2. run literal npm test
3. run CRA build
4. run Firestore emulator concurrency tests
5. configure/verify Paystack sandbox webhook
6. execute a real end-to-end Journey payment
7. deploy Functions and verify the deployed /api behavior

No new major Mobility OS subsystem should be treated as production-ready until those external checks pass.
