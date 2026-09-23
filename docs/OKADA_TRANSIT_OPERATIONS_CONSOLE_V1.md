# Okada Online — Transit Operations Console V1

**Branch:** `v4-mobility-os`  
**Status:** Implemented  
**Date:** 2026-09-23

## Purpose

The Transit Operations Console gives authorized administrators a mobile-friendly way to record verified operational events for scheduled transit trips.

It is an operations control layer, not a simulated tracking screen.

## Admin workflow

```
Select transit trip
      ↓
Select operational event
      ↓
Optionally record current stop / note / verified coordinates
      ↓
Server validates admin authorization
      ↓
Transit trip status is updated
      ↓
Operational event is stored
      ↓
Journey status + connections consume the recorded state
      ↓
Passenger sees the event in the Journey timeline
```

## Endpoints

`GET /transit/trips`

Loads transit trips available to the operations console.

`POST /transit/trips/:tripId/events`

Records one controlled operational event.

`GET /transit/trips/:tripId/events`

Loads the event history for an administrator.

`GET /journeys/:journeyId/events`

Loads operational events associated with the passenger's Journey legs.

## Event types

- BOARDING
- DEPARTED
- STOPPED
- STATION_ARRIVAL
- DEPARTED_STATION
- ARRIVING
- TRAFFIC_DELAY
- ROAD_CLOSURE
- MECHANICAL_DELAY
- ACCIDENT_REPORTED
- COMPLETED
- CANCELLED

## Data integrity

The operations endpoint requires an authenticated Firebase user with admin authorization.

Coordinates are optional and validated as latitude/longitude values when supplied.

No fake coordinates are generated.

The passenger interface shows recorded operational data only.

## Status consequences

Examples:

`BOARDING` → trip status `BOARDING`

`DEPARTED` → trip status `DEPARTED`

`STATION_ARRIVAL` → trip status `ARRIVING`

`DEPARTED_STATION` → trip status `IN_TRANSIT`

Operational delay events → trip status `DELAYED`

`COMPLETED` → trip status `COMPLETED`

`CANCELLED` → trip status `CANCELLED`

## Current limitations

The console does not itself provide:

- automatic GNSS telemetry
- traffic provider integration
- geofencing
- automatic ETA prediction
- automatic connection rebooking
- automatic passenger compensation

Those require additional verified operational and provider integrations.
