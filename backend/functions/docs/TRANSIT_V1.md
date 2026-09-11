# Okada Online V4 — Transit V1

## Purpose

Okada Transit is the intercity scheduled-transport layer built around a journey rather than isolated rides.

Initial product direction:
- Koforidua as the first Eastern Region transit hub.
- Intercity corridors can later include Koforidua ↔ Accra, Koforidua ↔ Kumasi, and Koforidua ↔ Ho.
- A journey may combine local pickup, a transit segment, a hub connection, and final-mile transport.

No operational fares, vehicle capacities, amenities, or travel times are hard-coded as verified facts. Those values must come from configured operational data.

## Collections

### `stations`

Station identity and access information.

Key fields:
- `name`
- `city`
- `region`
- `address`
- `landmark`
- `coordinates`
- `active`

### `transitRoutes`

A scheduled corridor with ordered stops.

Key fields:
- `name`
- `origin`
- `stops[]`
- `destination`
- `serviceClass`
- `hubStationId`
- `operatorId`
- `estimatedDurationMinutes`
- `fareRules`
- `active`

### `transitTrips`

A dated operational departure on a route.

Key fields:
- `routeId`
- `operatorId`
- `vehicleId`
- `departureAt`
- `capacity`
- `serviceClass`
- `status`
- `currentStop`
- `currentLocation`
- `departedAt`
- `completedAt`

## Service classes

`STANDARD`, `COMFORT`, `VIP`, `EXECUTIVE`, `PRIVATE`

VIP is a product class. It must not claim amenities or service levels until they are actually configured and verified.

## Journey principle

A passenger should be able to plan one complete journey:

`Origin → local pickup → transit → hub/connection → final mile → destination`

The system represents this as multiple connected legs under one journey context.

## APIs

### Stations
- `GET /transit/stations`
- `POST /transit/stations` — admin

### Routes
- `GET /transit/routes`
- `POST /transit/routes` — admin

### Trips
- `GET /transit/trips`
- `POST /transit/trips` — admin

### Search
- `GET /transit/search?from=&to=&serviceClass=`

### Journey planning
- `POST /transit/journeys/plan`
- `POST /transit/journeys/check-connections`

## Connection safety

Connection checks compare actual arrival/departure timestamps and a minimum transfer buffer. A route should be considered feasible only when the available buffer meets the configured requirement.

## Current limitation

Transit search currently returns configured trip capacity as available seats. A transactional transit booking/segment inventory layer still needs to be added before production ticket sales.
