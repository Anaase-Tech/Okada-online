# Okada Online — Journey Connection Monitoring V1

**Branch:** `v4-mobility-os`  
**Status:** Backend foundation implemented  
**Date:** 2026-09-23

## Purpose

A multi-segment Journey must remain understandable at transfer points such as Koforidua Hub.

The connection monitor evaluates only information actually recorded by the platform.

It never invents a vehicle position, arrival time, traffic condition, or ETA.

## Endpoint

`GET /journeys/:journeyId/connections`

Requires Firebase authentication.

The passenger can only inspect their own Journey unless they are an administrator.

The response contains a connection record for every boundary between Journey legs.

Example:

```
Journey
  Leg 1: Akosombo → Koforidua
                 ↓
            CONNECTION
                 ↓
  Leg 2: Koforidua → Kumasi
```

## Connection states

### FEASIBLE

A known arrival time leaves at least the configured minimum connection buffer before the next departure.

### AT_RISK

A known arrival time leaves less than the configured minimum connection buffer.

### MISSED

The recorded/estimated arrival is after the next scheduled departure.

### UNKNOWN

The system does not have enough timing information to determine the connection state.

### CANCELLED / BLOCKED

A cancelled next or previous transit leg makes the connection unavailable.

## Timing basis

The API explicitly identifies where the arrival timing came from:

- `RECORDED` — actual/station arrival recorded by operations
- `ESTIMATED` — an operational estimated arrival
- `PLANNED` — a Journey plan value
- `UNKNOWN`

This prevents an estimate from being presented as an operational guarantee.

## Status integration

`GET /journeys/:journeyId/status` now includes:

- `connections`
- `connectionTimingCoverage`

The existing segment status remains authoritative for each underlying trip.

## Current limitations

The connection engine does not yet have:

- real-time traffic ingestion
- GNSS-based live ETA calculation
- station geofencing
- automatic rebooking to a later transit trip
- automatic passenger rerouting
- automatic refund/recovery workflow

Those require verified operational integrations.

## Next evolution

The next operational layer can connect recorded trip events to the monitor:

```
DEPARTED
↓
STOPPED / DELAY
↓
STATION_ARRIVAL
↓
CONNECTION CHECK
↓
NEXT LEG BOARDING
↓
FINAL MILE
```

The long-term target is for Okada Online to proactively tell the passenger what is happening while clearly separating recorded facts, estimates, and actions that require confirmation.
