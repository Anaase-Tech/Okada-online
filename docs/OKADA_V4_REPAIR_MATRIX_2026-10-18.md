# Okada Online V4 — Repair Verification Matrix (P0-B batch)
**Date:** 2026-10-18  
**Repository:** `Anaase-Tech/Okada-online`  
**Base:** `v4-mobility-os` at `bb2a558c41f77ea71c6d08dcd6242719c62c04d7`  
**Repair branch:** `codex/okada-v4-p0-b-paylater-repayment-guard`  
**Deployment status:** No Firebase deployment or production operation performed.

## P0 findings

| ID | Source-verified defect at base HEAD | P0-B batch outcome | Remaining risk / gate |
|---|---|---|---|
| P0-A | Savings deposits credited caller amount as completed without verified funding. | Covered by separate draft [PR #15](https://github.com/Anaase-Tech/Okada-online/pull/15), which remains open and unmerged. Owner accepts the 409/no-write guard as interim. GitHub Actions run #118 (ID `39111126075`, commit `8639fb36365bb984fbbb8e8c2aacc9a919bf7ee4`) passed all three configured jobs. Vercel status was success for a **Preview** deployment only. | PR #15 is not merged into `v4-mobility-os`; no real funding/reconciliation flow exists. Preview is not Production or Firebase deployment. |
| P0-B | Repayment could mark debts paid and release `payLater.used` without verified collection/reconciliation; the origination path could also create new `pay_later` debt, increment `payLater.used`, and set the ride to `DEFERRED` while repayment was unavailable. | **Both origination and repayment now fail closed for new actions.** Repayment code/test commit `5f9e932666996484679ffa015a8bc627cb0a4579` (run #119); documentation follow-up commit `09ac67766781ebea60a304c627d34b8ae9ef4815` (run #120). Follow-up guard is in commit `2bae9bbe9d724be7e4ed63a584535c69bcf8b405` (Actions run #123 / ID `39113305119`). The final copy/test refinement is in latest code commit `b0f363aa6e1beff78985b1387e4d6010ef1d0e09` (Actions run #125 / ID `39113501449`). | New originations and repayments remain unavailable. Existing debt, `payLater.used`, history, and prior deferred rides are preserved. Re-enable only after an owner-approved, auditable, server-verifiable repayment/reconciliation flow and end-to-end review. No merge or deployment. |
| P0-C | Event deposit percentage can be negative; event record and wallet mutations are separate. | Unchanged. | Separate batch after P0-B review; preserve fractional percent contract and use atomic transaction. |
| P0-D | Expo package/native compatibility mismatch and simulated production behavior. | Unchanged. | Separate mobile investigation/build batch; do not claim production readiness until a real build succeeds. |

## P0-B source-path inspection record
- `POST /fintech/pay-later/request` in `backend/functions/index.js` is the active origination write path located in this audit: it creates a `pay_later` record, increments `payLater.used`, and sets the ride to `DEFERRED` in one transaction. The same file has the repayment route and overdue-state update. The active web caller is `web-app/src/screens/PassengerApp.jsx` via `web-app/src/api.js`; `FintechHub.jsx` is the repayment-facing UI. `legacyPaymentService.js` reads/cancels an existing deferred record when a separate online payment is verified; that is settlement/cancellation behavior, not a new-debt origination path. Existing ride completion validates linked `PAY_LATER`/`DEFERRED` records. No other active route creating new Pay Later debt was found in the reviewed repository source.
- Read the repayment handler and both supported payload branches at base HEAD.
- Reviewed `web-app/src/api.js`: `repayLater(userId, amountOrTxId)` constructs both payload shapes.
- Reviewed `web-app/src/screens/FintechHub.jsx`: UI used the aggregate amount, displayed a success toast on a 2xx response, and claimed automatic MoMo charging. No mobile-app Pay Later repayment caller was found.
- Neither backend path verified a payment provider status, wallet debit/settlement, cash receipt, or authorized reconciliation proof before debt/limit writes.

## Exact tests and results
- P0-A PR #15: run #118 ([run details](https://github.com/Anaase-Tech/Okada-online/actions/runs/39111126075), commit `8639fb36365bb984fbbb8e8c2aacc9a919bf7ee4`) passed all configured jobs; Vercel reported success for a Preview deployment.
- P0-B repayment guard: run #119 ([run details](https://github.com/Anaase-Tech/Okada-online/actions/runs/39111344551), commit `5f9e932666996484679ffa015a8bc627cb0a4579`) passed all three jobs. Documentation follow-up run #120 ([run details](https://github.com/Anaase-Tech/Okada-online/actions/runs/39111472099), commit `09ac67766781ebea60a304c627d34b8ae9ef4815`) also passed all three jobs. Those runs predate the origination suspension and do not verify it.
- Exact backend CI command: `npm test` in `backend/functions` — **91 tests, 87 passed, 0 failed, 4 skipped**. The aggregate repayment path test passed as subtest 26; specific debt-record path passed as subtest 27; malformed amount and missing-profile tests passed as subtests 28–29; route/guard/UI source-contract test passed as subtest 74.
- Firestore Emulator concurrency command: the workflow's `npx --yes firebase-tools@latest emulators:exec --only firestore --project demo-okada-stress --config backend/firebase.json "cd backend/functions && OKADA_FIRESTORE_EMULATOR=1 node --test modules/firestoreConcurrency.emulator.test.js"` — **4 passed, 0 failed, 0 skipped**. These tests cover existing Trotro/Transit/Journey contention, not Pay Later collection/settlement.
- Web production build: `npm run build` in `web-app` under Node 24 — **Compiled successfully; build folder ready**.
- Runtime/deployment structure checks, deprecated-config self-test, and forbidden legacy payment/auth artifact checks passed in the backend job.
- These CI tests do not verify incoming Pay Later funds, a reconciliation workflow, live Paystack settlement, or a native-app build. No live payment or money movement was performed.
- No local `git status` or local test command was executed; work was committed remotely through GitHub tooling because a local checkout was unavailable.
- No secrets accessed or rotated; no dependency upgrades; no merge; no Firebase/production deployment; no real-money transaction.

## Origination suspension follow-up and current evidence
- Functional guard commit `2bae9bbe9d724be7e4ed63a584535c69bcf8b405`: Actions run #123 (`39113305119`) passed all three configured jobs. Latest code commit `b0f363aa6e1beff78985b1387e4d6010ef1d0e09`: Actions run #125 (`39113501449`) also passed all three jobs.
- Latest backend `npm test`: **94 tests, 90 passed, 0 failed, 4 skipped**. The origination suspension unit test passed as subtest 26; route source-contract test passed as subtest 77. This includes the copy assertion that FintechHub does not imply another in-app repayment pathway.
- Firestore Emulator concurrency suite in run #125: **4 passed, 0 failed, 0 skipped**; tests cover Trotro/Transit/Journey concurrency, not Pay Later originations/repayments.
- Web `npm run build` under Node 24 in run #125: **Compiled successfully**; build folder ready.
- Documentation-only run #124 (`39113463456`, commit `2a66ade70906dacf023281977c8bc9310ec2ee4e`) also completed successfully in all three jobs.
- Server guard is placed inside the existing origination transaction after the idempotent-existing-DEFERRED branch and before any new debt, `payLater.used`, or ride DEFERRED writes. The single existing route returns HTTP 409 for new origination attempts. This preserves idempotent retries for already-accepted deferred rides. PassengerApp disables the new Pay Later option and shows an explicit pause notice.
- This is an interim suspension, not a repayment implementation. Unit/source-contract coverage is not a Pay Later Firestore Emulator integration test. No Firebase deployment, live payment, or real-money transaction occurred.

## Required next gate
Review P0-B diff and actual CI results. Do not proceed to P0-C or P0-D until the owner/independent reviewer accepts this batch. Repayment must remain visibly unavailable and debts/limits unchanged until the approved funding/reconciliation contract is implemented.


## Final P0-B follow-up — 2026-10-18
Latest code commit `b0f363aa6e1beff78985b1387e4d6010ef1d0e09` was verified by GitHub Actions run #125 (`39113501449`): backend test job passed (94 total; 90 pass, 0 fail, 4 skipped), Firestore Emulator job passed 4/4 existing Trotro/Transit/Journey tests, and web production build compiled successfully under Node 24. The Vercel check for this code commit was `pending` at the latest check, with a Preview deployment URL; no Production or Firebase deployment was reported.
