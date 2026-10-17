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
