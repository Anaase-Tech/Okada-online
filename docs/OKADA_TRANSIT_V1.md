# Okada Online Transit V1

**Status:** Architecture / implementation foundation  
**Date:** 2026-09-11  
**Owner:** Anaase-Tech / Okada Online

## Product direction

Okada Online remains Eastern Region-first. The goal is to become the local mobility champion before geographic expansion. Koforidua is the initial transit hub for scheduled long-distance journeys.

Transit is not a replacement for the existing ride-hailing platform. It is an extension that lets a passenger book a complete journey made of coordinated segments.

## Initial network

Planned corridors:

- Koforidua ↔ Accra
- Koforidua ↔ Kumasi
- Koforidua ↔ Ho

Connected journeys can therefore include:

- Accra → Koforidua → Kumasi
- Kumasi → Koforidua → Accra
- Ho → Koforidua → Kumasi
- Kumasi → Koforidua → Ho
- Ho → Koforidua → Accra
- Accra → Koforidua → Ho

These are product targets, not claims that the routes or schedules are currently operating.

## Core entities

### Station

`stationId`, `name`, `city`, `region`, `address`, `latitude`, `longitude`, `type`, `active`, `operatingHours`, `facilities`

`type`: `OKADA_OWNED | PARTNER | PUBLIC | VIRTUAL`

### Transit Route

`routeId`, `name`, `originStationId`, `destinationStationId`, `stops[]`, `active`, `estimatedDurationMin`, `fareRules`

### Transit Trip

`tripId`, `routeId`, `vehicleId`, `operatorId`, `departureTime`, `estimatedArrivalTime`, `status`, `capacity`, `seatInventoryVersion`

### Transit Booking

`bookingId`, `tripId`, `passengerId`, `pickupStop`, `dropoffStop`, `seatCount`, `fare`, `serviceClass`, `status`, `ticketCode`, `createdAt`

### Journey

A Journey is the customer-facing container for one complete door-to-door itinerary.

`journeyId`, `passengerId`, `origin`, `destination`, `segments[]`, `status`, `totalFare`, `currency`, `createdAt`

### Journey Segment

`segmentId`, `journeyId`, `sequence`, `type`, `operatorId`, `status`, `scheduledStart`, `scheduledEnd`, `estimatedStart`, `estimatedEnd`, `bookingId`, `reference`

Segment types:

- `LOCAL_PICKUP`
- `TRANSIT`
- `PARTNER_PICKUP`
- `FINAL_MILE`

## Service classes

Transit uses a service-class layer rather than a separate VIP system:

- `STANDARD`
- `COMFORT`
- `VIP`
- `EXECUTIVE` (future)

VIP can add premium fleet, reserved seating, luggage policy, boarding priority, premium final-mile choices and stronger operational service standards when those capabilities actually exist.

## Booking principle

The customer books a **journey**, not a collection of unrelated rides.

Example:

`Akosombo → Okada pickup → Koforidua Hub → VIP Transit → Kumasi → final-mile pickup`

The UI should present this as one itinerary while the backend maintains separate, auditable segment records.

## Seat inventory

Seat availability must be segment-aware. A seat occupied from Koforidua to an intermediate stop may become available for a later segment after that passenger exits. The backend must prevent overselling using transactional validation.

## Partner ecosystem

Okada Online directly operates inside its Eastern Region operating area. Outside that operating territory, final-mile transport can be fulfilled by approved partners.

Partner selection can expose:

- price
- service class
- vehicle/service information
- estimated pickup time
- operator trust/verification status

No partner is considered active until verified and onboarded by the operations team.

## Digital Journey Pass

A confirmed Journey receives a single customer-facing Journey Pass containing:

- journey reference
- passenger
- origin/destination
- each segment
- boarding instructions
- ticket/QR reference where supported
- live status

Each segment still has its own internal booking/reference for reconciliation.

## Cancellation and changes

Cancellation, rebooking, refund and partner policies must be enforced by backend rules. AI cannot override these policies.

## Safety

Transit must support verified operators, driver/vehicle assignment, trip status, incident reporting, emergency contacts and trip sharing where supported by the existing platform.

## Implementation rule

Do not remove or rewrite existing rides, authentication, KYC, fintech, scheduled rides, subscriptions, rental, shared rides, event rides, delivery or admin functionality. Transit is additive.
