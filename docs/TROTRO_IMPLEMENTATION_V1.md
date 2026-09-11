# Okada Online V4 — Trotro Implementation V1

## What is now implemented

The V4 mobility branch contains a first Trotro domain with segment-aware seat inventory. A booking from stop `i` to stop `j` consumes every travel segment `i..j-1`, so overlapping passengers share the same vehicle correctly without treating the whole trip as unavailable.

### Backend module
`backend/functions/modules/trotroEngine.js`

The engine is pure and has no Firestore/network side effects. It validates route stops, converts bookings into occupied segments, calculates segment availability, checks new bookings, and prepares reservations.

### HTTP router
`backend/functions/modules/trotroRoutes.js`

The V4 router exposes:

- `GET /trotro/routes`
- `POST /trotro/routes`
- `POST /trotro/trips`
- `GET /trotro/trips/:tripId`
- `GET /trotro/search`
- `POST /trotro/book`
- `POST /trotro/cancel/:bookingId`
- `GET /trotro/track/:tripId`

Booking now binds the passenger to the authenticated Firebase user instead of trusting an arbitrary passenger ID. Transactional booking reads use the Firestore transaction object so the capacity check and booking write participate in the same transaction.

## V4 integration

`backend/functions/v4Entry.js` is now the Functions entrypoint. It loads the legacy `index.js` unchanged, captures its Express application, and mounts the V4 Trotro router before the legacy catch-all 404 middleware.

`backend/functions/package.json` now points `main` to `v4Entry.js` and includes `npm test` for V4 domain tests.

## Data collections

The router uses these Firestore collections:

- `trotroRoutes`
- `trotroTrips`
- `trotroBookings`

The route model keeps origin, destination, intermediate stops, operator ID, optional estimated duration, and optional fare rules. Trip documents keep route ID, vehicle ID, departure time, capacity, status, current stop, and current location.

## Booking rules

A booking must have a valid pickup and dropoff on the same route, in forward order, with a positive integer seat count. Search reports the minimum available seats across the requested segments. Confirmed and boarded bookings consume segment capacity. Cancelled bookings do not.

## Security notes

Trotro booking requires Firebase authentication. The API does not expose service credentials to clients. Sensitive actions remain server-side.

Operator authorization for route/trip publishing is intentionally the next hardening step; the current router records the authenticated creator/operator and prevents a caller from impersonating a different operator ID. Administrative/operator-role policy should be connected to the project's existing KYC/admin model before public operator onboarding.

## Current limitations

This V1 does not yet provide payment capture, QR image generation, live vehicle telemetry, fare-rule calculation, recurring route scheduling, station/operator enrichment, family/delegated booking, or full admin management. It also does not claim real-time availability beyond what is actually stored in Firestore.

The next V4 layer should build the unified Trotro passenger experience on top of this foundation, then connect Transit/Journey, Okada Time, Smart Trotro, Return Trips, Family Mobility, and Okada Intelligence.
