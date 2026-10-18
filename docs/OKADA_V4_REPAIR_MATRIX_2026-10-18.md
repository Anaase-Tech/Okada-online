# Okada Online V4 — Repair Verification Matrix
**Review date:** 2026-10-18  
**Repository:** `Anaase-Tech/Okada-online`  
**Base branch:** `v4-mobility-os`  
**Base HEAD:** `bb2a558c41f77ea71c6d08dcd6242719c62c04d7`  
**Repair branch:** `codex/okada-v4-p0-a-savings-deposit-guard`  
**Deployment status:** No deployment authorized or performed.

## Evidence rules
A risk is not marked resolved solely because source edits exist or a static unit suite passes. Every status below distinguishes current-source inspection from implemented code and execution evidence. The latest base branch commit is `bb2a558c41f77ea71c6d08dcd6242719c62c04d7`, whose message is `docs(audit): update production go/no-go risk register (2026-10-18)`. The remote branch metadata reports branch protection disabled. A local checkout was unavailable in this environment, so a local `git status` could not be executed; remote HEAD and source files were read directly from GitHub.

## P0 verification matrix

| ID | Current-source finding | Source inspection at base HEAD | Batch status | Evidence still required / risk |
|---|---|---|---|---|
| P0-A | Savings deposit credits caller-supplied amount without verified incoming funding | **Verified.** `backend/functions/index.js`, `POST /fintech/savings/deposit`: old handler wrote `manual_deposit` as completed and incremented `savings.balance` and `savings.totalDeposited`. | **Guard implemented in Batch 1; CI pending.** Handler validates user/amount then returns 409 without Firestore writes. Regression source-contract test added. | Deposit is intentionally unavailable until a verified provider flow or authorized auditable reconciliation is agreed and implemented. Must await CI and owner review. No claim of completed runtime verification. |
| P0-B | Pay Later repayment marks debt paid and releases limit without collecting funds | **Verified.** `backend/functions/index.js`, `POST /fintech/pay-later/repay`: both the specific-record and aggregate paths transition debts to `paid` and decrement `payLater.used` without checking a verified payment/reconciliation record. | **Not changed in Batch 1.** | Need a verified repayment source or explicitly authorized auditable reconciliation workflow. Do not invent collection or cash-repayment policy. Review P0-A batch before next batch. |
| P0-C | Event booking trusts invalid `depositPercent` and mutates the event and wallet in separate writes | **Verified.** `backend/functions/index.js`, `POST /maas/events/book`: `depositPercent || 0.30` allows negative non-zero percentages; event is written before wallet debit; wallet funds are checked from a stale pre-transaction profile snapshot. | **Not changed in Batch 1.** | Next financial batch should validate the existing fractional contract explicitly and transact the event record plus wallet available/pending updates atomically. Define regression and concurrent-balance tests. |
| P0-D | Expo project package versions and app source are inconsistent; mobile UI produces demo/simulated results | **Verified.** `mobile-app/App.js` imports web-only `lucide-react`, uses DOM tags (`div`, `button`), `className` and web utility classes, while `mobile-app/package.json` declares `lucide-react-native`, Expo SDK 54, React 19.0 and React Native 0.75. Source has API-error demo login and fabricated/demo identity. Workflow has no Expo native build. Expo SDK 54 docs specify React Native 0.81 and React 19.1. | **Not changed in Batch 1.** | A native rewrite is not safe to fold into the financial batch. Must either implement and successfully build/test a true native client, or explicitly document/mark the prototype unsupported for production distribution. Do not declare production-ready without a successful build. |

## Carried-forward P1 register
These were recorded by the 2026-10-18 production audit. They are **not resolved by Batch 1**; they must be source-rechecked as each later repair batch begins.

| Finding | Current status |
|---|---|
| Rental kilometre endpoint mutates before confirming ownership | Open; inspect and fix ownership authorization before mutation. |
| Delivery tracking exposes a full delivery record through a timestamp-derived code | Open; minimize tracking response and use unpredictable references. |
| Delivery status updates lack a strict server-enforced transition/proof contract | Open; define permitted transitions and actor/proof checks from existing behavior. |
| MaaS service purchases and wallet changes can partially commit | Open; cover atomic wallet/service operations with failure and concurrency tests. |
| Shared-ride joins may overbook under concurrent requests | Open; add emulator contention test and atomic capacity enforcement. |
| Profile phone identity is not bound to verified Firebase token identity | Open; inspect Auth claim and legacy profile migration implications. |
| Production UI can show fabricated success/demo data after failures | Open; remove false-success paths without deleting legitimate functionality. |
| Public USSD callback can return success without a persisted ride and without callback authentication | Open; inspect provider callback contract before fixing; do not fake success. |
| Duplicate `/transit/journeys/plan` route definitions | Open; reconcile contracts without silently dropping behavior. |
| Driver dispatch inspects a bounded newest-25 query before local proximity filtering | Open; address candidate truncation and preserve dispatch constraints. |
| Server fare/duration use straight-line distance while displayed route uses road geometry | Open; business/product policy required before changing fare contract. |
| Broad signed-in Firestore reads expose rides/drivers/shared-trip data | Open; do not tighten rules until direct-listener contract migration is designed. |
| Insurance, loan, delivery and admin/demo states can imply real settlement without provider proof | Open; source recheck in UI-truth batch. |
| Native, authenticated browser E2E, Paystack sandbox and full financial-race tests are absent from configured CI | Open; add checks only where infrastructure and credentials are safely available. |
| Branch protection is disabled | Open; branch protection is a repository administration decision and is not changed by this repair commit. |

## CI and execution record for Batch 1
- Code edit and regression test: present on repair branch after commit creation.
- Local `git status`, `npm test`, and emulator run: not executed in this environment (no repository checkout and outbound GitHub DNS access was unavailable).
- GitHub Actions for the repair commit: pending until a reviewable draft PR/CI trigger is created.
- Firebase deployment, Paystack sandbox round-trip, production operations, and real-money transactions: not performed.
- Claude independent review: availability is not established in this session; do not represent it as completed.

## Next action
Review Batch 1 diff and its CI result. Do not continue to P0-B until the project owner/independent reviewer accepts the fail-closed savings behavior or provides an approved funding/reconciliation contract. Do not merge or deploy.
