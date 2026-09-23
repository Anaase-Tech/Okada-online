# Okada Journey Operational State V1

## Purpose

Journey state is now reconciled from recorded transit operational events. The customer-facing Journey remains the single journey object while underlying transit trips remain the operational source for segment activity.

## State transitions

For a paid Journey:

| Operational event | Journey state | Segment action |
| --- | --- | --- |
| BOARDING | BOARDING | BOARD |
| DEPARTED / DEPARTED_STATION | IN_TRANSIT | TRAVEL |
| intermediate STATION_ARRIVAL | CONNECTION_PENDING | CONNECT |
| next-leg BOARDING | BOARDING | BOARD |
| next-leg DEPARTED / DEPARTED_STATION | IN_TRANSIT | TRAVEL |
| final transit COMPLETED | COMPLETED, or FINAL_MILE when final-mile work is present | COMPLETE / FINAL_MILE |

A trip marked DELAYED after departure keeps the Journey in IN_TRANSIT; a delay before departure is surfaced operationally without inventing a new customer lifecycle state.

## Safety rules

Operational events do not move an unpaid Journey. Payment verification remains the gate for automatic operational progression.

A late event from an earlier segment cannot regress a Journey that has already advanced to a later segment. The Journey stores currentSegmentSequence and the state engine rejects stale earlier-segment transitions.

A cancelled transit segment does not automatically cancel the whole Journey. The Journey is placed in CONNECTION_PENDING with operationalIssue=SEGMENT_CANCELLED when another segment remains, so a separate recovery/rebooking policy can decide what happens next.

Completed or cancelled Journeys are not rewritten by later trip events.

No live ETA, GPS position, or travel-time estimate is fabricated by this engine. Recorded trip location and timestamps remain distinct from planned data.

## Journey fields written by operational reconciliation

- status
- currentSegmentSequence
- nextSegmentSequence
- nextAction
- operationalIssue
- operationalIssueSequence
- operationalIssueAt
- lastOperationalEventType
- lastOperationalEventAt
- lastOperationalEventTripId
- lastOperationalEventSequence
- operationalStateSource

operationalStateSource is TRANSIT_OPERATIONAL_EVENT when these fields were produced from the operations console event stream.

## Integration point

POST /transit/trips/:tripId/events records the administrative operational event and updates the trip in the same Firestore transaction that reconciles all paid Journeys attached to that trip's bookings.

This keeps the transit event, trip state, and Journey state synchronized as one backend operation.

## Passenger-facing behavior

The Journey screen now displays the server-owned:

- Journey state
- current leg
- next action
- last operational event
- operational attention/issue

The Journey Pass also carries the Journey state and current segment metadata.

## Testing

The pure state engine covers:

- boarding
- departure
- intermediate station arrival
- next-leg boarding
- final transit completion
- final-mile handoff
- unpaid Journey protection
- cancelled segment handling
- stale earlier-segment event protection
