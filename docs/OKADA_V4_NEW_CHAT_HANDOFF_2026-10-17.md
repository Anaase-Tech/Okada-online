# Okada Online V4 — New Chat Handoff

Prepared: 2026-10-17, Ghana time  
Repository: Anaase-Tech/Okada-online  
Branch: v4-mobility-os  
Source snapshot independently verified: a3841461ed8925198b94637193685749cc937f6d  
Latest green GitHub Actions run for that source: https://github.com/Anaase-Tech/Okada-online/actions/runs/39074794848  
Slack coordination room: https://anaase-tech.slack.com/archives/C0CAW0BGK3J

## Non-negotiable rules
Do not delete, simplify, or replace existing functionality. Do not fake live drivers, GPS, status, fares, payments, capacity, or availability. Inspect actual GitHub source and logs before trusting a report. No Firebase/Vercel production deploy, secret exposure, or broad refactor without explicit authorization. Preserve existing behavior; record files changed, tests actually run, and remaining risks.

## Verified CI state
The last green run for source snapshot a3841461ed8925198b94637193685749cc937f6d completed all three jobs:
- Backend/structure job: 86 tests, 82 passed, 0 failed, 4 skipped; Node.js 22; runtime/package checks and deprecated-config guard passed.
- Firestore Emulator stress job: 4 passed, 0 failed.
- Frontend production build: passed on Node.js 24.

The emulator scenarios ran against the actual Firestore Emulator: four simultaneous Trotro bookings against capacity two; four simultaneous standalone Transit bookings against capacity two; four simultaneous two-leg Journey bookings against capacity two on each leg; and Journey rejection for a route explicitly marked inactive. Each passed. Emulator test auth is injected, so it does not replace production Firebase ID-token tests. These tests do not cover all payment, acceptance, cancellation, completion, refund or ledger races.

No Firebase production deploy, Paystack sandbox transaction, authenticated browser E2E, or live Production map smoke test was performed. Do not call this production-ready.

## PASS 4.1 already present on branch
- Functions runtime prepared for Node.js 22; frontend CI uses Node.js 24.
- Trotro admin authorization, Journey Paystack Secret Manager wiring and webhook raw-body HMAC handling were corrected.
- Ride acceptance uses a Firestore transaction; ride assignment and passenger notification are one winning transition.
- Ride start is a server-backed state transition.
- Paystack initialization reserves a durable attempt before contacting the provider and refuses to start a duplicate while an outcome is unresolved.
- Cash fallback is a backend operation, only allowed after online attempts are terminally failed/abandoned; driver must explicitly confirm physical cash receipt.
- Late online success after cash or another settled reference is flagged for REQUIRES_REVIEW. Automatic refund execution is not implemented.
- Pay Later has a persisted ride/payment state and completion validation.
- Passenger payment UI opens the returned Paystack authorization URL and verifies the reference; driver GPS uses browser geolocation and Firestore listeners, not generated live coordinates.
- Driver completion retains the active ride when the server call fails.
- Journey multi-leg booking reads all transactional state before writes and rejects routes explicitly marked inactive.

Read the canonical audits:  
https://github.com/Anaase-Tech/Okada-online/blob/v4-mobility-os/docs/OKADA_V4_PASS4_1_INDEPENDENT_AUDIT.md  
https://github.com/Anaase-Tech/Okada-online/blob/v4-mobility-os/docs/OKADA_V4_PRODUCTION_AUDIT_V1.md

## Navigation and map — source verified, browser E2E still open
DriverApp uses navigator.geolocation.watchPosition. It publishes location after roughly 25 metres movement or a 15-second heartbeat and locally refreshes the map marker around every 5 metres/5 seconds. A 45-second watchdog disables dispatch readiness on stale GPS. Backend acceptance independently checks driver online/verified status, vehicle compatibility, GPS timestamp freshness (45 seconds), and proximity (5 km).

Passenger and driver screens use Firestore listeners for live ride/driver state. The map uses Google Maps markers and DirectionsService/DirectionsRenderer. Driver navigation target is pickup before in_progress and destination after start; road routing refreshes on target change, around 250 metres movement, or 30 seconds.

This is live GPS plus a road-route overlay, **not turn-by-turn or voice navigation**. Production map rendering, browser permission/background/resume, route rerouting, connectivity recovery and map-key restrictions have not been E2E tested. Audit notes say the Google Maps key is configured in Vercel Production only, so Preview shows the key-missing fallback.

Scale risk: DriverApp queries only the newest 25 requested rides for a vehicle type then filters within 5 km. A large burst of out-of-radius requests can hide an older nearby request. Design scalable dispatch selection rather than blindly increasing the query limit.

## Important remaining risks
1. Stress Paystack initialization failure windows, webhook/callback races, payment expiry, cash switch, late online success, cancellation/completion races, duplicate references and exactly-once driver/owner/platform/fuel/maintenance/DTO/loan/savings/referral effects.
2. Add Emulator contention tests for two drivers accepting one ride, cancel-vs-accept, duplicate request retries, duplicate completion and payment races.
3. Passenger UI has MTN/Vodafone/Airtel/card choices, but the current initPayment API sends ride ID/amount/email/phone, not the selected channel. Confirm whether selection is merely a preference; wire a supported server-validated preference or make the hosted-checkout behavior explicit.
4. POST /transit/journeys/plan still appears in both transitRoutes.js and transitHubRoutes.js. Reconcile after inspecting mount order and both contracts; do not silently remove capabilities.
5. Firestore rules allow any signed-in client to read entire rides and drivers documents for direct listeners. Design scoped read models/endpoints before tightening rules.
6. The main branch still declares frontend Node 20.x while v4-mobility-os uses Node 24.x. Apply/merge the production configuration before the next main deployment.
7. Tracked backups remain: backend/functions/index.js.bak2 and web-app/src/App.js backup copies. Preserve them in Git, but verify backups are excluded from deployment inputs. No dedicated .firebaseignore was found at the expected backend paths.
8. Latest frontend install log reported 106 dependency vulnerabilities (5 low, 23 moderate, 74 high, 4 critical). Triage actual production dependency paths; do not run npm audit fix --force blindly.
9. Verify root legacy backend/index.js and backend/package.json Twilio references are not used by a separate deployment before changing them.
10. Run authenticated browser E2E with a correctly restricted Google Maps key. No Production map smoke test exists yet.

## Slack and Claude
Channel #okada-v4-team exists. Last actual member-list check showed only @africanaihq; no Claude/Anthropic user or bot was present. An hourly condition-watch automation was created to notify only if a Claude/Claude Code/Anthropic integration actually appears in the channel member list. Do not claim Claude joined or read messages until verified.

## Personal Memory clarification
The user meant ChatGPT's saved personal Memory, not just project documents. This session did not expose a direct Memory-write tool, so do not falsely claim that the Memory summary was manually changed. This handoff and the repository audits are the durable engineering continuity record. The user prefers CTO-style, source-first incremental work, copy/paste-ready help, preserving all features, no invented live data, auditing before broad changes, and keeping documentation in sync.

## Starter prompt for a new ChatGPT conversation
Continue Okada Online V4 using this handoff. First re-check actual GitHub branch HEAD, latest workflow runs and logs, then read both canonical audit documents. The verified source snapshot was a3841461ed8925198b94637193685749cc937f6d and run 39074794848 was green: backend 86 tests (82 pass, 0 fail, 4 skip), Firestore Emulator 4/4 pass, frontend build pass. Reverify because the repo may have advanced. Continue deep debugging and stress testing for live GPS/map browser E2E, payment channel contract, Pay Later, Paystack unknown/failure/late-success and cash fallback races, acceptance/cancellation/completion concurrency and exactly-once ledger effects. The current map is live GPS plus a road-route overlay, not turn-by-turn guidance. No production deployment. Never delete/simplify/replace features, invent live data, or expose secrets. Update this handoff and audits with actual commit/test evidence. Claude has not been verified as a Slack member; check the actual member list before assuming cross-assistant communication.
