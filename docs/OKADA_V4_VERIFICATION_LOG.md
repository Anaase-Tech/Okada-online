# Okada Online V4 — Verification Log

## Purpose

This log records external verification results separately from the production audit so that source-control changes, CI outcomes, failures, fixes, and remaining gates are preserved chronologically.

## 2026-09-24 — GitHub Actions verification

### Run #1
- Workflow: Okada Online V4 Verification
- Commit: 9db278b3b4fd0d102ec34400e5a053a2d15a26d9
- Result: failed
- Backend failure: forbidden legacy payment/auth artifact scan
- Frontend failure: `npm ci --legacy-peer-deps` rejected an out-of-sync `web-app/package-lock.json`

### Run #3
- Workflow: Okada Online V4 Verification
- Commit: ddc62168b75b10ff25c6e9fe7f1474a0167c5b70
- Result: failed
- Backend failure: same forbidden-artifact scan
- Frontend failure: same frontend lockfile synchronization error

### Run #4
- Workflow: Okada Online V4 Verification
- Commit: 138d64fc8b8da4974e570ae4f1d9827e4526b64a
- Result: failed
- Backend steps passed through:
  - dependency installation
  - `npm test`
  - Functions package validation
  - Firebase deployment structure validation
- Backend failure was isolated to the artifact scan. The scan matched the words "Twilio" in comments stating that Firebase Phone Auth is used and in the retained `index.js.bak2` backup. No Twilio dependency or runtime import was identified.
- Frontend failure occurred before the build during `npm ci --legacy-peer-deps`.
- npm reported that `web-app/package.json` and `web-app/package-lock.json` were out of sync. Missing lock entries reported by the runner were:
  - `@react-google-maps/api@2.20.8`
  - `@googlemaps/js-api-loader@1.16.8`
  - `@googlemaps/markerclusterer@2.5.3`
  - `@react-google-maps/infobox@2.20.0`
  - `@react-google-maps/marker-clusterer@2.20.0`
  - `@types/google.maps@3.58.1`
  - `invariant@2.2.4`
  - `supercluster@8.0.1`
  - `kdbush@4.1.0`
- The build step was skipped because dependency installation failed.

### Fix commit for run #5
- Commit: c48faf435552ac733cd1adb548ccf4066d1cb19a
- Purpose:
  1. Narrow the forbidden-artifact scan to actual Twilio runtime imports, provider environment assignments, secret-key literals, and package dependencies instead of matching explanatory comments.
  2. Generate a synchronized frontend lockfile during the verification run, upload that generated lockfile as an artifact, then install from the generated lockfile.
- This is a verification bridge, not the final repository state. The intended final state is a committed synchronized `web-app/package-lock.json` and strict `npm ci --legacy-peer-deps` verification against the committed lockfile.

### Run #5
- Workflow: Okada Online V4 Verification
- Commit: c48faf435552ac733cd1adb548ccf4066d1cb19a
- Result: **success**
- Backend verification passed.
- Frontend lockfile regeneration, dependency installation, and CRA production build passed.
- Artifact: `okada-v4-generated-frontend-lockfile` (artifact ID 10790576455).
- This was a temporary verification bridge because the committed frontend lockfile was still stale at that point.

## Other verified source-control evidence

### Current branch relationship
- Branch: `v4-mobility-os`
- Compared with `main`: 130 commits ahead, 0 behind
- Main tip used for the comparison: 6b02f6a69057269f5991ab1d34f8d5b52423086c

### Commit status
- Commit 138d64fc8b8da4974e570ae4f1d9827e4526b64a reported a successful Vercel status.
- This Vercel status is recorded as external evidence for that commit but is not treated as a substitute for the GitHub Actions backend/frontend verification workflow.

### Local environment limitation
- A clean repository clone from the model container previously failed because DNS/network access to GitHub was unavailable.
- GitHub Actions therefore provides the first direct dependency-install and test execution against a real checkout for this verification pass.

## Production certification rule

A successful source audit alone does not certify production readiness. Certification remains blocked until the repository has a clean verification run and the external deployment/payment gates listed in the production audit are completed.



## 2026-09-24 — Strict CI gate closed

### Run #6
- Workflow: Okada Online V4 Verification
- Commit: 352169e1559cb9679bc172f0b8e416725b1ba700
- Result: **success**
- Both backend verification and the bridge frontend production build passed.

### Run #7
- Workflow: Okada Online V4 Verification
- Commit: c7e1440f97efaa2b9111c7005c57f2bc9aff093c
- Result: **success**
- Both backend verification and the bridge frontend production build passed.
- The run confirmed that the source-controlled synchronized frontend lockfile could be used in the bridge workflow.

### Frontend dependency reconciliation
- Commit: c7e1440f97efaa2b9111c7005c57f2bc9aff093c
- Synchronized `web-app/package-lock.json` with the `@react-google-maps/api` dependency graph reported by npm.
- No application feature behavior was intentionally changed by this commit.

### Strict workflow restore
- Commit: 5e254ff34c6ee06ada17cc992d405a2a3cab679a
- Restored strict frontend `npm ci --legacy-peer-deps` verification.
- Removed the temporary CI lockfile-generation bridge.

### Run #8 — final source-control CI verification
- Workflow: Okada Online V4 Verification
- Commit: 5e254ff34c6ee06ada17cc992d405a2a3cab679a
- Result: **success**
- Backend:
  - dependency installation: passed
  - `npm test`: passed
  - Functions package validation: passed
  - Firebase deployment structure validation: passed
  - forbidden legacy payment/auth artifact check: passed
- Frontend:
  - committed-lock `npm ci --legacy-peer-deps`: passed
  - CRA production build: passed

This is the first clean verification result using the committed repository lockfile rather than a CI-generated replacement.

### Security scan correction
- Runs #1/#3/#4 initially failed because the guard matched explanatory comments containing the word Twilio and the retained `index.js.bak2` backup.
- The guard was narrowed to actual runtime imports, environment assignments, secret-key literals, and package dependencies. The refined guard passed in Runs #5–#8.

### Dependency audit observation
- Backend dependency installation reported 31 npm audit findings in the runner: 3 low, 14 moderate, 12 high, and 2 critical.
- This is recorded as an audit observation only. No automatic `npm audit fix` or breaking dependency upgrade was applied during stabilization.

## Current certification state

The source-control CI gate is **passed** on commit 5e254ff34c6ee06ada17cc992d405a2a3cab679a.

Still outstanding for production certification:
- Firebase Functions deployment
- deployed API smoke tests
- Firestore emulator contention test
- real Paystack sandbox/live payment
- real Paystack webhook delivery
- production browser/callback recovery test
- eventual migration away from deprecated `functions.config()` before the documented March 2027 deadline

No new major Mobility OS subsystem should be treated as production-ready until those external checks are completed.


## Final documentation reconciliation — 2026-09-24

- Branch head before this documentation-only push: d5bd240b24e99f95109c746389fa2a725d6a65bc.
- Commit d5bd240b24e99f95109c746389fa2a725d6a65bc contains only the audit/log documentation update produced after the strict CI verification on 5e254ff34c6ee06ada17cc992d405a2a3cab679a.
- No application/runtime code was intentionally changed by the d5bd documentation commit.
- The strict workflow run #9 passed on its parent documentation snapshot f8c3b3648d5e728c61a7181210ba3cf7430fc8e0.
- The branch was advanced with a Git ref update for documentation reconciliation, so that ref move itself did not emit a new push-triggered workflow run.
- This final documentation-only push exists to produce a normal push-triggered verification result on the branch tip and close that traceability gap.

Current branch comparison at this point:
- `v4-mobility-os`: 139 commits ahead of `main`
- `main`: 0 commits ahead of `v4-mobility-os`


## Run #10 — final documentation-triggered verification

- Workflow: Okada Online V4 Verification
- Run ID: 35956679182
- Commit verified by the run: d5bd240b24e99f95109c746389fa2a725d6a65bc
- Result: **success**
- Backend verification: passed.
- Frontend committed-lock dependency installation: passed.
- Frontend CRA production build: passed.

The current branch tip after the documentation-only reconciliation commit is:
- b8788545f7ce6d1ada816caf5fcaa42217df3104

The b878 commit adds verification-log documentation only. No runtime/application code was changed.



## Current tip reconciliation — 2026-09-24

- Current branch tip: 6f4e60a5055a01e6a12fbc5b611ada0545937a80.
- The current tip is documentation-only relative to the strict verified application snapshot.
- Run #11 verified commit b8788545f7ce6d1ada816caf5fcaa42217df3104 and completed successfully.
- The current tip's combined GitHub status reports **Vercel: success**.
- GitHub Actions runs #8, #9, #10, and #11 all completed successfully; the earlier runs #1, #3, and #4 failed only on CI guard/lockfile defects that were subsequently corrected.
- Current branch relation to `main`: 138 commits ahead, 0 behind.
- No runtime feature was added in this reconciliation pass.

## Next production gate

The next work is deployment verification rather than a new Mobility OS subsystem:
1. Firebase Functions deployment.
2. Deployed API smoke tests.
3. Firestore emulator/concurrency verification.
4. Real Paystack sandbox transaction and signed webhook.
5. Production browser/callback recovery.

A Vercel integration is available to inspect deployment details directly, but it is not currently connected in this workspace. 


## Vercel live-deployment verification — 2026-09-24

- The Vercel integration was connected during this verification pass.
- GitHub reports Vercel status checks on recent commits; the latest verified application status observed earlier was successful.
- Direct Vercel inspection of the Okada Online project is currently blocked by authorization scope, not by a diagnosed application error.
- The Vercel connector identified the project team scope as `yaw-annor-s-projects` with team ID `team_eL4axgpzjI9qg66Av0YnKx4I`, but access to that scope currently returns HTTP 403 and requests re-authentication for that team.
- Fetching `https://okada-online.vercel.app` through the connected Vercel access path also returned an access-denied result for the deployment.
- Therefore the exact Vercel build/deployment logs and protected deployment behavior cannot be independently audited from this workspace yet.
- This is recorded as an external access gate. No Vercel project setting, environment variable, domain, or deployment was changed during this pass.

## Certification effect

The GitHub source-control verification gate remains passed. Vercel status evidence exists, but direct deployment inspection is blocked by the connected-account scope. Firebase and Paystack live-service verification remain outstanding as previously documented.


## Paystack Secret Manager migration — 2026-09-24

### Source change
- Commit: `34710602e08a406d50cce0ab8d19584dd26b1b1b`
- Result: **source migration committed**
- Replaced all active `functions.config().paystack.secret` reads with the Secret Manager parameter `PAYSTACK_SECRET`.
- Bound `PAYSTACK_SECRET` to the exported HTTP API function.
- Preserved the existing Paystack initialization, verification, webhook, and Journey settlement behavior.

### CI guard
- Commit: `35c1a8dceabf211354ceb5550c27f7b16ecac07b`
- Added a source check that fails when active JavaScript files contain `functions.config()`.
- Backup files remain excluded from the check to avoid matching retained historical copies.

### Documentation
- Commit: `a200aacb8a56b3ee8572934c6cc43ce2fe3f9389`
- Added `docs/OKADA_V4_PAYSTACK_SECRET_MIGRATION.md` with the operator procedure and production validation requirements.

### External verification status
- The new Secret Manager value has **not** been set by this workspace.
- Firebase Functions have **not** been deployed after the migration.
- A real Paystack transaction and signed webhook have **not** been executed.
- The old Runtime Config value must remain available until the migrated deployment and smoke tests are confirmed.

