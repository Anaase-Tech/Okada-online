# Okada Online — Journey Payment & Journey Pass V1

**Branch:** `v4-mobility-os`  
**Status:** Implemented backend foundation  
**Date:** 2026-09-23

## Scope

This milestone extends the existing Journey booking transaction with payment initiation, trusted payment confirmation, Journey Pass generation, journey status, and cancellation.

No legacy ride, KYC, wallet, fintech, rental, delivery, scheduled-ride, shared-ride, or admin flow is replaced.

## Payment flow

```
POST /journeys/book
        ↓
PENDING_PAYMENT
        ↓
POST /journeys/:journeyId/pay
        ↓
Paystack authorization
        ↓
Paystack webhook
        ↓
verified charge.success
        ↓
paymentStatus = PAID
status = CONFIRMED
        ↓
POST /journeys/:journeyId/confirm
        ↓
Journey Pass available
```

The client cannot mark a Journey as paid.

The payment amount is taken from the stored Journey `totalFare`, not a client-supplied amount.

The webhook verifies:

- Paystack signature
- configured payment secret
- stored payment reference
- received amount against the stored Journey payment amount
- currency = GHS

Webhook processing is idempotent.

## Endpoints

### Payment

`POST /journeys/:journeyId/pay`

Starts a Paystack transaction using the Journey's stored fare.

Response includes:

- `authorizationUrl`
- `reference`
- `amount`
- `currency`
- `paymentStatus`

### Confirmation

`POST /journeys/:journeyId/confirm`

Confirms a Journey only when the backend has already recorded `paymentStatus = PAID`.

`POST /journeys/:journeyId/confirm-payment` remains as a backward-compatible secure alias.

It does not accept `verified: true` as proof of payment.

### Journey Pass

`GET /journeys/:journeyId/pass`

Available after verified payment.

The pass contains:

- Journey Code
- passenger
- origin
- destination
- service class
- pickup option
- transit legs
- boarding origin/stop
- ticket code per transit booking
- ticket QR payloads
- final-mile information
- payment status
- Journey status
- Journey QR payload

The Journey QR payload is:

`okada://journey/{JourneyCode}`

Individual transit tickets retain:

`okada://transit/ticket/{bookingId}`

### Status

`GET /journeys/:journeyId/status`

Returns the recorded state of each segment and the Journey.

It exposes current stop/current location only when the trip record contains them.

It does not invent an ETA or pretend that live location exists.

### Cancellation

`POST /journeys/:journeyId/cancel`

Cancels eligible Journeys and releases confirmed underlying transit bookings.

A Journey that has reached boarding, in-transit, final-mile, or completed status is not cancelled through this endpoint.

Paid cancellations are marked:

`refundStatus = REQUIRES_REVIEW`

No automatic refund is claimed or fabricated because the actual refund policy/provider flow has not yet been wired.

## Firestore records

Journey payment records are stored in the existing:

`payments/`

collection with:

- `journeyId`
- `passengerId`
- `amount`
- `currency`
- `provider`
- `reference`
- `purpose = journey`
- payment status

Journey records keep:

- `paymentProvider`
- `paymentReference`
- `paymentStatus`
- `paymentVerifiedAt`

## Operational truth

This milestone provides the transaction and status infrastructure.

It does **not** claim:

- live traffic visibility
- live vehicle GPS unless recorded
- guaranteed ETA
- automatic refunds
- external transit partner availability
- actual VIP fleet availability

Those capabilities remain dependent on verified operational data and integrations.
