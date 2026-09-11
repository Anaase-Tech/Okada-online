# Okada Time Intelligence V1

**Status:** Architecture / implementation foundation  
**Date:** 2026-09-11

## Principle

**Time is a product feature.** Okada Online should optimize for reliable journey planning rather than displaying a simplistic fixed travel duration.

## Important technical distinction

GNSS/GPS satellites provide positioning and precise timing signals. They do not, by themselves, observe road traffic and calculate congestion.

Traffic-aware ETA therefore uses multiple sources:

1. GNSS location from phones and fleet devices
2. road/network routing data
3. traffic/incident data from approved providers where available
4. Okada Online fleet telemetry
5. historical travel-time observations
6. scheduled transit operations
7. station dwell/boarding observations
8. weather or road-condition signals when a reliable source is integrated

## Architecture

```text
Passenger / Driver device
        |
        v
 GNSS position + timestamp
        |
        +------> Fleet telemetry
        |
        +------> Route / road data
        |
        +------> Traffic / incidents
        |
        +------> Historical observations
        |
        v
   Okada Time Engine
        |
        +--> ETA
        +--> arrival window
        +--> pickup time
        +--> station arrival deadline
        +--> connection risk
        +--> recommended departure
        |
        v
 Okada Intelligence explanation
```

## ETA model

The engine should produce an estimate and uncertainty, not pretend that road travel is deterministic.

Example response shape:

```json
{
  "etaMinutes": 142,
  "arrivalWindowMinutes": [132, 158],
  "confidence": "medium",
  "recommendedDeparture": "2026-09-12T04:30:00Z",
  "connectionRisk": "low",
  "reasonCodes": ["historical_pattern", "live_fleet_speed"]
}
```

Times and confidence must be calculated from real data. The example above is illustrative only.

## Fleet telemetry

Where users grant the required location permission, an active driver/transit device can periodically provide:

- latitude
- longitude
- heading
- speed when available
- timestamp
- tripId/journeyId when authorized
- device/network health where useful

The backend must minimize collection, protect access, and avoid exposing raw driver location to unauthorized users.

## Operational events

ETA becomes more useful when the system records events separately from location:

`DEPARTED`, `STOPPED`, `BOARDING`, `TRAFFIC_DELAY`, `INCIDENT_REPORTED`, `MECHANICAL_DELAY`, `STATION_ARRIVAL`, `IN_TRANSIT`, `ARRIVING`, `COMPLETED`.

## Arrive-by planning

For a requested arrival deadline:

```text
arrival deadline
      - final-mile ETA
      - connection buffer
      - transit ETA
      - station/boarding buffer
      - origin pickup ETA
      = recommended departure
```

The engine must use configurable buffers and route-specific operational history.

## Connection monitoring

For a multi-segment Journey, continuously compare the current ETA of the active segment with the next segment's boarding/departure deadline.

States:

- `SAFE`
- `WATCH`
- `AT_RISK`
- `MISSED`
- `RECOVERY_AVAILABLE`

AI may explain and recommend. Backend rules remain authoritative for rebooking, refunds and cancellations.

## Punctuality metric

Record scheduled versus actual events so Okada can measure:

- on-time departure rate
- on-time arrival rate
- average delay
- median delay
- connection success rate
- route reliability by time/day

A future customer-facing **Okada Time Score** can be built only after sufficient operational data exists.

## Privacy and safety

Location collection requires clear user permission and appropriate retention/access controls. Do not expose continuous driver coordinates beyond what is necessary for an active trip or operational function.
