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
- At the time of this log entry: queued
- Required follow-up evidence: backend artifact scan result, frontend lock generation/install result, frontend production build result, and generated lockfile artifact.

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

