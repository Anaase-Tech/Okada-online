# Okada Online V4 — Repair Verification Matrix (P0-B batch)
**Date:** 2026-10-18  
**Repository:** `Anaase-Tech/Okada-online`  
**Base:** `v4-mobility-os` at `bb2a558c41f77ea71c6d08dcd6242719c62c04d7`  
**Repair branch:** `codex/okada-v4-p0-b-paylater-repayment-guard`  
**Deployment status:** No Firebase deployment or production operation performed.

## P0 findings

| ID | Source-verified defect at base HEAD | P0-B batch outcome | Remaining risk / gate |
|---|---|---|---|
| P0-A | Savings deposits credited caller amount as completed without verified funding. | Covered by separate draft [PR #15](https://github.com/Anaase-Tech/Okada-online/pull/15), which remains open and unmerged. Owner accepts the 409/no-write guard as interim. Run #117 passed backend (87: 83 pass, 0 fail, 4 skipped), Firestore Emulator suite (4 pass), and web build. Vercel created a Ready **Preview** deployment only. | PR #15 is not merged into `v4-mobility-os`; no real funding/reconciliation flow exists. Preview is not Production or Firebase deployment. |
| P0-B | Both `payLaterTxId` and aggregate `amount` paths marked `pay_later` records paid and decremented `payLater.used` without proof of collection/reconciliation. | **Guard implemented in this batch; CI pending.** Both paths now return 409 after profile authorization/aggregate amount validation, using a handler without Firestore writer access. UI explicitly says repayment is unavailable and does not claim success or automatic MoMo charging. Unit and source-contract regression tests added. | Repayment remains unavailable until approved, server-verifiable payment or authorized auditable reconciliation is implemented. No payment-provider or cash-receipt policy assumed. Await PR #16 CI and independent review. |
| P0-C | Event deposit percentage can be negative; event record and wallet mutations are separate. | Unchanged. | Separate batch after P0-B review; preserve fractional percent contract and use atomic transaction. |
| P0-D | Expo package/native compatibility mismatch and simulated production behavior. | Unchanged. | Separate mobile investigation/build batch; do not claim production readiness until a real build succeeds. |

## P0-B inspection record
- Read the repayment handler and both supported payload branches at base HEAD.
- Reviewed `web-app/src/api.js`: `repayLater(userId, amountOrTxId)` constructs both payload shapes.
- Reviewed `web-app/src/screens/FintechHub.jsx`: UI used the aggregate amount, displayed a success toast on a 2xx response, and claimed automatic MoMo charging. No mobile-app Pay Later repayment caller was found.
- Neither backend path verified a payment provider status, wallet debit/settlement, cash receipt, or authorized reconciliation proof before debt/limit writes.

## Exact tests and results
- New tests added but **not yet reported as passed** before CI.
- Expected CI workflow: backend `npm test`, Firestore Emulator concurrency suite, web production build. The existing emulator suite does not simulate real Pay Later funding/settlement; no live Paystack or money movement test is authorized.
- No local `git status` or local tests run; work was committed remotely through GitHub tooling because a local checkout was unavailable.
- No secrets accessed or rotated; no dependency upgrades; no merge; no Firebase/production deployment; no real-money transaction.

## Required next gate
Review P0-B diff and actual CI results. Do not proceed to P0-C or P0-D until the owner/independent reviewer accepts this batch. Repayment must remain visibly unavailable and debts/limits unchanged until the approved funding/reconciliation contract is implemented.
