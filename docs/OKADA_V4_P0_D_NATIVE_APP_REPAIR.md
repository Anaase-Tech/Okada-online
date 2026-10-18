# Okada Online V4 — P0-D Native App Audit and Repair Status

**Date:** 2026-10-18
**Repository:** Anaase-Tech/Okada-online
**Base:** v4-mobility-os at bb2a558c41f77ea71c6d08dcd6242719c62c04d7
**Branch:** codex/okada-v4-p0-d-native-client
**Status:** Audit complete; native implementation blocked pending owner inputs. No application source changes have been made in this pass.

## P0-C independent review

PR #17 is open, draft, and unmerged. Its current head is af9bc8f9625398ac5a66c5262e987d711d6b49ca, not the previously reported 654f64d021e643803c1224ed877915b2212b5c06. Its base is v4-mobility-os at bb2a558c41f77ea71c6d08dcd6242719c62c04d7. The eight changed paths are the active backend route, event booking handler, unit tests, Firestore Emulator tests, security regression tests, and three audit documents.

The independent code review found the scoped P0-C change correct: supplied deposit fractions are finite and in (0, 1]; omitted/null retains the 30% default; zero-rounded and over-fare deposits are rejected before profile resolution; profile ownership and wallet balances are checked from the transaction snapshot; event creation and both wallet movements occur atomically after transaction reads. Emulator scenarios cover invalid input/no writes, malformed balances, absent pending initialization, and concurrent bookings without overdraft. Duplicate unit cases for zero-rounding and ownership are non-blocking. Repeated submissions are not idempotent; the PR documents this as a separate contract decision.

GitHub Actions run #134 (39120408917) on the current PR head passed all three configured jobs. Backend command: npm test (working directory backend/functions), 121 total / 113 passed / 0 failed / 8 skipped. Emulator command: npx --yes firebase-tools@latest emulators:exec --only firestore --project demo-okada-stress --config backend/firebase.json "cd backend/functions && OKADA_FIRESTORE_EMULATOR=1 node --test modules/firestoreConcurrency.emulator.test.js"; 8 passed / 0 failed / 0 skipped. Web command: npm run build (working directory web-app), compiled successfully. No local PR-branch tests were run because the P0-C source files are absent from this sparse checkout. A formal APPROVE review was rejected by GitHub because the authenticated reviewer is also the PR author; a scoped COMMENT review was posted instead. This is not production-readiness approval.

## P0-D findings re-verified at the base

### Native build compatibility

- mobile-app/package.json declares Expo ~54.0.0 and React 19.0.0, but pins React Native 0.75.0. Expo SDK 54 targets React Native 0.81 and React 19.1.0.
- The package declares lucide-react-native, while mobile-app/App.js imports lucide-react. The app uses HTML elements (div, input, button, span, anchor, etc.) and web-only Tailwind/className styling rather than React Native primitives.
- app.json has no Android package or iOS bundle identifier. No mobile package lockfile, EAS configuration, native Firebase app config, or mobile build workflow is present in the checked-in mobile-app directory/current base workflow.
- The base GitHub Actions workflow only verifies backend tests/structure, Firestore Emulator contention, and the web-app build. It does not run Expo config validation, Expo export, or an Android/iOS build.

### Simulated behavior and unverified contracts

- AuthScreen calls /auth/send-otp and /auth/verify-otp, which are not present in the inspected backend route inventory. Failed requests explicitly log in a fabricated demo user with demo_token. The backend requireAuth middleware requires a real Firebase ID token; the verified contract is Firebase Phone Auth followed by POST /auth/create-profile.
- Passenger fare, distance and duration are randomized; booking uses fixed coordinates; driver matching is fabricated after a timer; cancel/start/complete are local-only; payment failure is converted into a success toast and local reset; failed history loads become random sample rides.
- Driver offers are fabricated, GPS coordinates are randomized, online status changes locally even on API failure, acceptance ignores failed responses, and completion adds fabricated earnings locally without calling the backend completion endpoint.
- Admin stats fall back to fabricated figures and rides/drivers are hardcoded. The backend admin stats route requires admin authorization; profile creation explicitly does not allow a non-admin to self-provision an admin profile.
- Confirmed backend contracts include POST /rides/request, POST /rides/:rideId/accept, POST /rides/:rideId/start, POST /rides/:rideId/complete, PUT /drivers/:id/status, PUT /drivers/:id/location, GET /rides/history/:userId, POST /payments/initialize, and POST /auth/create-profile. The active backend has no REST endpoint for driver ride discovery; a direct Firestore listener would require a deliberately reviewed authenticated client contract and must not be invented as a new API.

## Blockers requiring owner decision/input

1. Select the supported native target: Android, Android+iOS, or retire the prototype from production distribution.
2. Provide/register the Firebase native app configuration for the selected target (Android google-services.json and/or iOS GoogleService-Info.plist), the chosen Android application ID/iOS bundle identifier, and the approved CI secret/config delivery mechanism. Firebase Phone Auth is a native integration dependency; no native registration/config is present in the current checkout.
3. Confirm whether driver ride discovery should use an existing scoped Firestore listener contract or be scheduled as a separate backend/API product decision. This repair will not invent an endpoint or silently broaden access.
4. Supply the remainder of the user request after “The PR must include:” so the draft PR can meet the complete required contents.

Per the task instruction, work depending on these missing integrations/contracts is stopped for the owner's decision. No demo login or simulated operational behavior is considered an acceptable fallback.

## Checks and evidence

| Check | Result | Evidence/limitation |
|---|---|---|
| P0-C current PR metadata, changed paths, review threads/reviews | PASS | PR #17 open/draft/unmerged; head af9bc8f...; 8 changed paths; no formal review submissions or inline threads before this review. GitHub rejected formal approval because reviewer equals PR author; scoped COMMENT review posted. |
| P0-C CI on current PR head | PASS | Actions run #134 / 39120408917: backend 121 total / 113 pass / 0 fail / 8 skip; emulator 8/8; web build compiled. |
| Static Expo manifest inspection | PASS | Command from mobile-app: node -e "const p=require('./package.json'), a=require('./app.json'); console.log(JSON.stringify({expo:p.dependencies.expo,react:p.dependencies.react,reactNative:p.dependencies['react-native'],webIcon:p.dependencies['lucide-react'],nativeIcon:p.dependencies['lucide-react-native'],slug:a.expo.slug,androidPackage:a.expo.android?.package,iosBundle:a.expo.ios?.bundleIdentifier},null,2))"; parsed both JSON files and printed versions/missing native IDs. |
| Expo CLI config validation | BLOCKED | npx --no-install expo config --type public from mobile-app exited 1: no local Expo CLI/dependencies; npx declined to install expo@58.0.14. No dependency installation was attempted. |
| P0-D native tests/build/export | NOT RUN | No mobile test script, lockfile, installed dependencies, Firebase native app config, or configured target/build workflow. |
| Backend tests for P0-D | NOT RUN | P0-D has made no backend changes. The current base is not the PR #17 head; use the recorded PR CI evidence for P0-C. |
| Web build for P0-D | NOT RUN | No web-app changes have been made in this audit-only stage. P0-C's web build passed but does not verify native behavior. |

## Recommended next action

Keep P0-C as a separate draft until a human reviewer other than the PR author can provide formal approval. Keep the P0-D branch separate. Obtain the native target and Firebase app/configuration decisions, then implement the smallest compatible React Native flow on this branch, preserve Firebase Phone Auth, replace false-success behavior with server-confirmed state or explicit unavailable states, and add Expo/native CI coverage. Do not distribute or describe the current mobile prototype as a live native client.

### Official Expo references

- Expo SDK 54 targets React Native 0.81 / React 19.1.0: https://docs.expo.dev/versions/v54.0.0/
- Expo Firebase guide describes Firebase JS SDK and React Native Firebase configuration/development builds: https://docs.expo.dev/guides/using-firebase/
- Expo app config reference: https://docs.expo.dev/versions/latest/config/app/