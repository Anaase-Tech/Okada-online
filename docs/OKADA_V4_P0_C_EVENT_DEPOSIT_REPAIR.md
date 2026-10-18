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
