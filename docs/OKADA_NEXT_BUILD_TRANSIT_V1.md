# Okada Online — Next Build: Transit V1

## What is now implemented

This build starts the scheduled/intercity transport layer without replacing the existing ride system.

### Passenger
- New **Transit** section in the passenger navigation.
- Route selection.
- Service-date selection.
- Published departure search.
- Segment pickup/drop-off selection.
- Seat quantity selection (1–8).
- Authenticated reservation.
- Booking code/ticket confirmation.
- Passenger cancellation.

### Backend
New module: `backend/functions/transit.js`

API prefix:
- `GET /transit/routes`
- `GET /transit/stations`
- `GET /transit/search?routeId=...&date=...`
- `POST /transit/book`
- `GET /transit/bookings/:bookingId`
- `POST /transit/bookings/:bookingId/cancel`
- `POST /transit/admin/stations`
- `POST /transit/admin/routes`
- `POST /transit/admin/trips`

### Firestore model
- `transit_stations`
- `transit_routes`
- `transit_trips`
- `transit_bookings`

The booking engine is **segment-aware**. A seat reserved from Stop A → Stop B can become available again for a later B → C segment. This is the foundation required for connected trotro/intercity journeys.

## Security decisions

- Existing Firebase Phone Auth remains the authentication system.
- No Twilio is introduced.
- Passenger booking routes require a verified Firebase ID token.
- Station/route/trip provisioning is admin-only.
- Existing Firestore client-write security is not weakened.
- Existing ride, delivery, MaaS, fintech, KYC, owner, driver and admin systems remain intact.

## Current scope deliberately not invented

No operational fares, capacities, travel times, vehicles, drivers, partner operators, or station relationships are fabricated. Admin provisioning creates the real operational data.

## Next build after Transit V1

1. **Journey engine** — combine local pickup → station → intercity segment → connection → final mile into one Journey.
2. **Koforidua hub** — station/interchange model for the Eastern Region hub.
3. **VIP service class** — comfort/vehicle/boarding/pickup options without inventing fleet specifications.
4. **Okada Time** — actual departure/arrival events, ETA confidence and punctuality data.
5. **Partner final-mile network** — Eastern Region Okada fulfillment plus external partner operators where needed.
6. **Okada Voice** — Khaya language layer feeding validated journey/search intents.

## Build principle

**Do not replace the wheels. Add another wheel to the vehicle.**

The existing ride marketplace remains the local mobility engine. Transit becomes the scheduled/intercity engine. Journey becomes the layer that connects them.
