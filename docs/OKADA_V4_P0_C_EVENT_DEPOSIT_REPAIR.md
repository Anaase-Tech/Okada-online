# Okada Online V4 — P0-C Event Deposit Integrity Repair

**Date:** 2026-10-18  
**Repository:** `Anaase-Tech/Okada-online`  
**Base:** `v4-mobility-os` at `bb2a558c41f77ea71c6d08dcd6242719c62c04d7`  
**Repair branch:** `codex/okada-v4-p0-c-event-deposit-atomicity`  
**Draft PR:** [#17 — P0-C event-deposit integrity](https://github.com/Anaase-Tech/Okada-online/pull/17)  
**Code commit:** `e8d12c8a9fadb513ecf2fb5660671d608c0522f8`  
**Emulator-test commit:** `22152013afcffd16fb04cc40fbb08f2ec137d3f7`

## Finding at the base revision

The existing `POST /maas/events/book` path used caller-controlled `depositPercent` directly in the deposit calculation. A negative value created a negative deposit, passed the balance check, and increased `wallet.available` while creating an event ride. Event document creation and wallet movements were separate Firestore operations, so failures or concurrent requests could leave inconsistent state or overdraw the available wallet balance.

## Change in this draft

- The field is treated as a fraction: `0.30` means 30%, matching the existing multiplication contract.
- When the field is omitted or `null`, the existing 30% default is preserved.
- When supplied, values must be numeric/numeric-string, finite, greater than 0, and at most 1. Invalid values return HTTP 400 before resolving the user or entering a financial transaction. This rejects zero, negative values, values greater than 1, `30`, empty strings, non-finite values, and non-numeric types.
- The current profile is read inside the transaction. Insufficient balance or a profile missing at transaction start results in no event or wallet writes.
- The event record creation, `wallet.available` debit, and `wallet.pending` increment are committed through the same Firestore transaction.
- The existing scheduled fare estimate, route path, event schema/status, 30% default, and response contract are retained as far as practical; this batch does not redesign event pricing or introduce a payment provider.

## Verification evidence

### GitHub Actions run #127 — initial functional code
- Run ID: `39117030423` — [workflow run](https://github.com/Anaase-Tech/Okada-online/actions/runs/39117030423)
- Commit: `e8d12c8a9fadb513ecf2fb5660671d608c0522f8`
- Backend `npm test`: **107 tests, 103 passed, 0 failed, 4 skipped**.
- Existing Firestore Emulator suite: **4 passed, 0 failed, 0 skipped**; at this point it covered existing Trotro/Transit/Journey cases, not event booking.
- Web production build: **compiled successfully**.
- All three configured GitHub Actions jobs passed.

### GitHub Actions run #128 — functional tests including event Firestore Emulator coverage
- Run ID: `39117146577` — [workflow run](https://github.com/Anaase-Tech/Okada-online/actions/runs/39117146577)
- Commit: `22152013afcffd16fb04cc40fbb08f2ec137d3f7`
- Backend `npm test`: **109 tests, 103 passed, 0 failed, 6 skipped**. The six skips are the emulator-only tests skipped in the ordinary backend job.
- Firestore Emulator suite: **6 passed, 0 failed, 0 skipped**.
  - Existing Trotro/Transit/Journey concurrency coverage: 4 tests.
  - New event test: negative `depositPercent` returns HTTP 400 and leaves the profile wallet and event collection unchanged.
  - New event test: two concurrent event bookings against one wallet result in one accepted booking, one insufficient-balance rejection, one event document, and matching wallet.available/wallet.pending movements without overdrawing.
- Web production build: **compiled successfully**.
- All three configured GitHub Actions jobs passed.

### Regression coverage added
- `backend/functions/modules/eventBookingGuard.test.js`: defaulting and range validation, invalid input rejection before profile/transaction work, valid deposit calculation, atomic transaction grouping, current-balance insufficiency, and missing profile handling.
- `backend/functions/modules/productionSecurityAudit.test.js`: active route delegation, transaction balance-read-before-write ordering, and presence of both atomic wallet movements.
- `backend/functions/modules/firestoreConcurrency.emulator.test.js`: Firestore-backed invalid-deposit and concurrent-wallet integration checks against the shared production handler using test authentication.

## Limits and release gate

- PR #17 is **open, draft, and unmerged**. The fix is not present in `v4-mobility-os` until reviewed and merged; the base remains exposed meanwhile.
- No Firebase production deployment, production operation, secret change, live payment-provider call, or real-money transaction was performed.
- Emulator coverage tests the production handler factory with test authentication and the Firestore Emulator; it does not validate deployed Cloud Function routing, Firebase ID-token verification, or live financial settlement.
- The scope does not add a durable financial ledger, request idempotency key, or end-to-end payment collection. Broader MaaS audit findings remain separate. P0-D is untouched.
- Do not merge or deploy this draft until independent review and the release gate are satisfied.


## Independent-review follow-up — stored wallet type integrity (2026-10-18)

A follow-up review identified an edge case inside the new atomic booking: Cloud Firestore `FieldValue.increment()` sets an existing non-numeric field to the increment operand instead of performing arithmetic ([Firebase reference](https://firebase.google.com/docs/reference/node/firebase.firestore.FieldValue)). Coercing a stored value such as `wallet.available: "100"` to a number for the balance check could therefore pass validation and then overwrite the string field with a negative debit. A malformed `wallet.pending` value could similarly be overwritten.

Commit `5851e58e499504253c4e4600b60b45d239c50b0b` now checks the fresh transactional `wallet.available` and `wallet.pending` values without coercion. Present values must be finite, non-negative JavaScript numbers; malformed values fail with HTTP 409 before the event or wallet is written. Only truly absent balance fields are treated as missing. A present `null`, non-numeric, non-finite, or negative balance is rejected; an absent `available` balance behaves as zero (and cannot cover the deposit), while an absent `pending` balance may be initialized by the atomic increment. Regression tests cover numeric-string available/pending fields.

GitHub Actions run #130 ([run ID 39118164527](https://github.com/Anaase-Tech/Okada-online/actions/runs/39118164527)) passed all three jobs on commit `5851e58e499504253c4e4600b60b45d239c50b0b`:
- Backend `npm test`: **112 total, 105 passed, 0 failed, 7 skipped** (the emulator-only tests skip in the ordinary test job).
- Firestore Emulator concurrency suite: **7 passed, 0 failed, 0 skipped**, including the new malformed-wallet-types test, which verifies both stored values and event collection remain unchanged.
- Web production build: **compiled successfully**.

The emulator suite exercises the handler factory with test authentication; it does not validate deployed Cloud Function routing, live payment collection, a durable ledger, or real-money settlement. PR #17 remains open/draft/unmerged. No Firebase production deployment or real-money operation occurred.


## Independent review closeout — 2026-10-18

**Verdict: PASS for the scoped P0-C event-deposit integrity repair after the follow-up findings below were corrected. This is not a production-readiness certification or a formal GitHub approval.**

### Latest PR state inspected
- PR #17: open, draft, unmerged; base `v4-mobility-os` at `bb2a558c41f77ea71c6d08dcd6242719c62c04d7`.
- Latest code under review: `a0a89329d79d875e0d1f8d6d8bcd7dcec9d5a6bd` on `codex/okada-v4-p0-c-event-deposit-atomicity`.
- Eight changed paths: active backend route, event handler, unit tests, Firestore Emulator tests, security source-contract tests, and the event-specific/independent/production audit docs.
- At the review check, GitHub had no formal review submissions or inline review threads. Existing PR conversation comments were CI/bot and implementation-status updates; they are not an independent approval.

### Findings discovered during source review and repaired
1. **Stale profile ownership across the transaction boundary.** The original ref lookup verified `firebaseUid` before the transaction, but only the wallet was re-read transactionally. If profile ownership changed between those operations, a stale caller could potentially debit the profile's wallet. Commit `c7c282cc31d0c12c1fea77421355d744de81b164` rechecks the current `firebaseUid`/document-ID binding from the transaction snapshot before any event or wallet write and returns HTTP 403 on a changed owner. Regression coverage simulates the changed-owner snapshot and verifies zero writes.
2. **A tiny positive percentage could round to a zero-money deposit.** The parsed fraction could be positive yet the two-decimal calculated deposit become 0. The existing calculated-deposit guard rejects it before profile lookup. A test now proves no profile resolution, transaction, event or wallet write occurs.
3. **Explicit null wallet values were treated as absent.** Firestore's increment transform replaces a present non-number with its operand rather than performing arithmetic; a present `wallet.pending: null` could thus be silently initialized during a booking. Commit `a0a89329d79d875e0d1f8d6d8bcd7dcec9d5a6bd` distinguishes absent fields from present fields. Null, non-numeric, non-finite, negative values, and a null/non-object wallet container are rejected with HTTP 409. Truly absent `pending` remains supported and is safely initialized by the booking transaction. Unit and emulator tests verify invalid values stay unchanged and no event is created.
4. **Fresh transaction and atomic-write guarantees confirmed.** The event handler reads current profile/ownership/balances in the transaction. It performs the event document creation plus `wallet.available` debit and `wallet.pending` increment in that same transaction, after all reads. The Firestore Emulator concurrency test proves two simultaneous bookings against the same limited wallet produce one successful booking, one insufficient-balance response, one event, and matching wallet values without an overdraw.

### Run #133 — actual CI evidence for latest code commit
[GitHub Actions run #133 / ID 39120234899](https://github.com/Anaase-Tech/Okada-online/actions/runs/39120234899) passed all three jobs on `a0a89329d79d875e0d1f8d6d8bcd7dcec9d5a6bd`.

- Backend: `npm test` in `backend/functions` — **121 tests, 113 passed, 0 failed, 8 skipped**. The eight emulator-only tests are skipped in the ordinary backend job because the Firestore Emulator is run in a separate job.
- Firestore Emulator: the workflow command runs `npx --yes firebase-tools@latest emulators:exec --only firestore --project demo-okada-stress --config backend/firebase.json "cd backend/functions && OKADA_FIRESTORE_EMULATOR=1 node --test modules/firestoreConcurrency.emulator.test.js"` — **8 passed, 0 failed, 0 skipped**. This includes invalid percentage, concurrent wallet contention, malformed stored values (including explicit null), and absent-pending initialization.
- Web: `npm run build` in `web-app` — **Compiled successfully**.
- Frontend dependency installation reported **106 vulnerabilities (5 low, 23 moderate, 74 high, 4 critical)**. This run did not attempt unrelated or blind dependency upgrades; this remains a separate dependency-triage task.

### Scope and remaining risks
- Route `POST /maas/events/book`, 30% default when omitted/null `depositPercent`, fractional percentage interpretation (`0.30 = 30%`), estimated fare calculation, event record shape/status, and response field names remain in place. Supplied percentages must be finite and in `(0, 1]`; calculated deposits must still be positive and no greater than fare.
- No event request-idempotency key or durable financial ledger was introduced. A caller that intentionally/repeatedly submits a new booking request can still create another event/debit; the API currently has no stable client request identity to distinguish a retry from a second booking. This is a residual release risk that needs its own API/product decision before production, not something inferred or invented in this narrow repair.
- Emulator coverage uses test authentication and the shared production booking handler; it does not validate deployed Cloud Function routing, real Firebase ID-token middleware, or real collection/settlement behavior. No Firebase production deployment, production database mutation, live provider call, secret change, or real-money transaction occurred.
- P0-D remains a separate branch/PR. PR #17 was not merged or closed.
