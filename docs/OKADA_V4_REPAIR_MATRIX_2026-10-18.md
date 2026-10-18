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
| P0-A | Savings deposit credits caller-supplied amount without verified incoming funding | **Verified at base HEAD** `bb2a558c41f77ea71c6d08dcd6242719c62c04d7`. Original `POST /fintech/savings/deposit` wrote `manual_deposit` as completed and incremented `savings.balance` and `savings.totalDeposited` without funding proof. | **Interim guard implemented and CI verified.** The route returns 409 without Firestore writes; the regression source-contract test passed in run #117. | Savings deposits remain unavailable until an approved verified-provider funding or authorized auditable reconciliation flow is implemented. This is not endpoint/emulator integration coverage or a completed savings feature. Independent review still required. |
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
- Code edit and regression test: present in commit `5bb50e32f73421d8cd88640d82f4284c33ccae5e`.
- GitHub Actions run #116 (`39109560121`; [run details](https://github.com/Anaase-Tech/Okada-online/actions/runs/39109560121)): backend job **success**. The exact command `npm test` ran in `backend/functions` and reported **87 tests, 83 passed, 0 failed, 4 skipped**. The new savings guard regression test passed as subtest 70.
- In the same run, Functions package/runtime validation, Firebase deployment-structure JSON checks, the deprecated-config guard self-test, and the forbidden legacy payment/auth artifact check passed.
- Follow-up GitHub Actions run #117 (`39109644361`; [run details](https://github.com/Anaase-Tech/Okada-online/actions/runs/39109644361)) completed successfully across all three jobs: backend tests **87 tests, 83 passed, 0 failed, 4 skipped**; Firestore Emulator concurrency suite **4 passed, 0 failed, 0 skipped**; web production build **compiled successfully**. These results do not certify the savings endpoint through emulator integration, real-money settlement, or native app build.
- Local `git status` and local test commands were not executed because no repository checkout was available in this environment (the read-only GitHub clone attempt failed DNS resolution).
- Vercel automatically created a **Ready Preview deployment** for the PR branch. This is a preview deployment only, not a Vercel Production deployment or Firebase deployment; no Firebase production operation or real-money transaction was performed.
- Claude independent review: availability is not established in this session; do not represent it as completed.

## Next action
Review Batch 1 diff and its CI result. Do not continue to P0-B until the project owner/independent reviewer accepts the fail-closed savings behavior or provides an approved funding/reconciliation contract. Do not merge or deploy.
