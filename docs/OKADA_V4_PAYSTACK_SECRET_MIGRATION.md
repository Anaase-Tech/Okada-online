# Okada Online V4 — Paystack Secret Migration

## Date

2026-09-24

## Finding

The production API previously read the Paystack secret through Firebase Runtime Config (`functions.config().paystack.secret`). Firebase now documents that Runtime Config via `functions.config()` is deprecated and that new deployments using it will fail after March 2027.

## Code change

The active API in `backend/functions/index.js` now:

- declares `PAYSTACK_SECRET` with `defineSecret('PAYSTACK_SECRET')`;
- binds that Secret Manager secret to the single HTTP API function with `runWith({ secrets: [PAYSTACK_SECRET] })`;
- reads the value with `PAYSTACK_SECRET.value()` for Paystack initialization, verification, and signed webhook validation;
- contains no active `functions.config()` calls.

No Paystack key value is stored in source control and no secret value was exposed during this change.

## Operator migration procedure

Run these commands from the Firebase project root (`backend/`) on a trusted device/session:

```bash
cd backend
firebase use okada-online-ghana
firebase functions:secrets:set PAYSTACK_SECRET
```

When prompted, enter the same Paystack secret key that is currently configured for the Okada Online backend. Do not paste it into GitHub, chat, source files, or a committed `.env` file.

Then deploy the Functions code:

```bash
firebase deploy --only functions
```

After deployment, verify the following before removing the old Runtime Config value:

1. `POST /payments/initialize` can create a Paystack transaction for an authenticated ride.
2. `GET /payments/verify/:ref` can verify a known Paystack transaction.
3. `POST /payments/webhook` accepts a correctly signed Paystack event and rejects an invalid signature.
4. Journey payment initialization and verification continue to use the same Paystack secret and canonical payment lifecycle.
5. A production callback/recovery flow completes without changing payment state from the client.

Only after those checks succeed should the legacy Paystack Runtime Config be retired through the Firebase CLI. Keep the old value available until the new deployment and smoke tests are confirmed.

## Local/emulator note

Firebase documents that Secret Manager values can be overridden for local emulator use with a `.secret.local` file when needed. Do not commit that file or its contents.

## Verification guard

The V4 GitHub Actions workflow now scans active JavaScript source for `functions.config()`. This prevents the deprecated API from silently returning in a later patch.

## Source-control result

- Runtime migration commit: 34710602e08a406d50cce0ab8d19584dd26b1b1b
- CI guard commit: 35c1a8dceabf211354ceb5550c27f7b16ecac07b
- No new feature or subsystem was introduced.
- Existing Paystack payment endpoints and payment state machines were preserved.

## Remaining external gate

This change is source-controlled but not yet production-certified. The actual Firebase Secret Manager value has not been set by this workspace, and a real Firebase deployment plus Paystack transaction/webhook test remains outstanding.
