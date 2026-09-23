# Okada Online V4 — Endpoint Matrix

Branch: `v4-mobility-os`

This matrix is generated from the current `web-app/src/api.js`, `backend/functions/index.js`, and the mounted V4 router source on this branch.

## Frontend API → backend

| Frontend method | HTTP | Route | Auth | Request expression from frontend | Backend match / notes |
|---|---|---|---|---|---|
| sendOtp | POST | `/auth/send-otp` | — | { phone, role } | — Retained compatibility wrapper; production auth is Firebase client phone auth. |
| verifyOtp | POST | `/auth/verify-otp` | — | { phone, otp, role, name, ownerCode } | — Retained compatibility wrapper; production auth is Firebase client phone auth. |
| verifyGhanaCard | POST | `/verify/kyc` | PUBLIC | { userId, role, docType: "ghana_card", docNumber: cardNum } | Mounted via legacy.  |
| verifyPassport | POST | `/verify/kyc` | PUBLIC | { userId, role, docType: "passport", docNumber: passNum } | Mounted via legacy.  |
| requestRide | POST | `/rides/request` | PUBLIC | data | Mounted via legacy.  |
| acceptRide | POST | `/rides/${rideId}/accept` | PUBLIC | { driverId } | Mounted via legacy.  |
| confirmCashPayment | POST | `/rides/${rideId}/complete` | PUBLIC | {} | Mounted via legacy.  |
| completeRide | POST | `/rides/${rideId}/complete` | PUBLIC | {} | Mounted via legacy.  |
| toggleOnline | PUT | `/drivers/${id}/status` | PUBLIC | { isOnline, vehicleType } | Mounted via legacy.  |
| updateLocation | PUT | `/drivers/${id}/location` | PUBLIC | { latitude: lat, longitude: lng } | Mounted via legacy.  |
| getOwnerDash | GET | `/owners/${id}/dashboard` | PUBLIC | — | Mounted via legacy.  |
| getStats | GET | `/admin/stats` | PUBLIC | — | Mounted via legacy.  |
| getHistory | GET | `/rides/history/${uid}` | PUBLIC | — | Mounted via legacy.  |
| initPayment | POST | `/payments/initialize` | PUBLIC | { rideId, amount, email, phone } | Mounted via legacy.  |
| verifyPayment | GET | `/payments/verify/${ref}` | PUBLIC | — | Mounted via legacy.  |
| payLaterRequest | POST | `/fintech/pay-later/request` | PUBLIC | { userId, rideId, amount } | Mounted via legacy.  |
| getPayLaterHistory | GET | `/fintech/pay-later/history/${uid}` | PUBLIC | — | Mounted via legacy.  |
| requestWithdrawal | POST | `/wallet/withdraw` | PUBLIC | { userId, amount, momoPhone } | Mounted via legacy.  |
| depositSavings | POST | `/fintech/savings/deposit` | PUBLIC | { userId, amount } | Mounted via legacy.  |
| withdrawSavings | POST | `/fintech/savings/withdraw` | PUBLIC | { userId, amount, momoPhone } | Mounted via legacy.  |
| setSavingsRate | PUT | `/fintech/savings/rate` | PUBLIC | { userId, rate } | Mounted via legacy.  |
| getSavingsBalance | GET | `/fintech/savings/balance/${userId}` | PUBLIC | — | Mounted via legacy.  |
| applyLoan | POST | `/fintech/loans/apply` | PUBLIC | { userId, amount, purpose } | Mounted via legacy.  |
| getLoanEligibility | GET | `/fintech/loans/eligibility/${userId}` | PUBLIC | — | Mounted via legacy.  |
| getLoanStatus | GET | `/fintech/loans/status/${userId}` | PUBLIC | — | Mounted via legacy.  |
| buyInsurance | POST | `/insurance/buy` | PUBLIC | { userId, planId } | Mounted via legacy.  |
| fileInsuranceClaim | POST | `/insurance/claim` | PUBLIC | { userId, policyId, claimType, description } | Mounted via legacy.  |
| getInsurancePolicy | GET | `/insurance/policy/${userId}` | PUBLIC | — | Mounted via legacy.  |
| createSchedule | POST | `/maas/schedule/create` | PUBLIC | data | Mounted via legacy.  |
| adjustSchedule | PUT | `/maas/schedule/${id}/adjust` | PUBLIC | data | Mounted via legacy.  |
| pauseSchedule | PUT | `/maas/schedule/${id}/pause` | PUBLIC | {} | Mounted via legacy.  |
| getTodaySchedules | GET | `/maas/schedule/today/${uid}` | PUBLIC | — | Mounted via legacy.  |
| createSubscription | POST | `/maas/subscription/create` | PUBLIC | data | Mounted via legacy.  |
| getSubscriptionStatus | GET | `/maas/subscription/status/${uid}` | PUBLIC | — | Mounted via legacy.  |
| getRentalPricing | GET | `/maas/rental/pricing` | PUBLIC | — | Mounted via legacy.  |
| bookRental | POST | `/maas/rental/book` | PUBLIC | data | Mounted via legacy.  |
| getActiveRentals | GET | `/maas/rental/active/${uid}` | PUBLIC | — | Mounted via legacy.  |
| createSharedTrip | POST | `/maas/share/create` | PUBLIC | data | Mounted via legacy.  |
| joinSharedTrip | POST | `/maas/share/${shareId}/join` | PUBLIC | { userId } | Mounted via legacy.  |
| bookEventRide | POST | `/maas/events/book` | PUBLIC | data | Mounted via legacy.  |
| requestDelivery | POST | `/delivery/request` | PUBLIC | data | Mounted via legacy.  |
| trackDelivery | GET | `/delivery/track/${code}` | PUBLIC | — | Mounted via legacy.  |
| getDeliveryHistory | GET | `/delivery/history/${uid}` | PUBLIC | — | Mounted via legacy.  |
| bookJourney | POST | `/journeys/book` | PUBLIC | data | Mounted via journey.  |
| getJourney | GET | `/journeys/${journeyId}` | PUBLIC | — | Mounted via journey.  |
| payJourney | POST | `/journeys/${journeyId}/pay` | PUBLIC | { email, phone } | Mounted via journey.  |
| verifyJourneyPayment | POST | `/journeys/${journeyId}/payment/verify` | PUBLIC | reference ? { reference } : {} | Mounted via journey.  |
| confirmJourney | POST | `/journeys/${journeyId}/confirm` | PUBLIC | {} | Mounted via journey.  |
| getJourneyPass | GET | `/journeys/${journeyId}/pass` | PUBLIC | — | Mounted via journey.  |
| getJourneyStatus | GET | `/journeys/${journeyId}/status` | PUBLIC | — | Mounted via journey.  |
| getJourneyEvents | GET | `/journeys/${journeyId}/events` | PUBLIC | — | Mounted via journey.  |
| recordTransitEvent | POST | `/transit/trips/${tripId}/events` | PUBLIC | data | Mounted via transit.  |
| getTransitTripEvents | GET | `/transit/trips/${tripId}/events` | PUBLIC | — | Mounted via transit.  |
| getJourneyConnections | GET | `/journeys/${journeyId}/connections` | PUBLIC | — | Mounted via journey.  |
| cancelJourney | POST | `/journeys/${journeyId}/cancel` | PUBLIC | { reason } | Mounted via journey.  |
| getMaasStats | GET | `/admin/maas/stats` | PUBLIC | — | Mounted via legacy.  |

## Backend routes not currently wrapped by web-app/api.js

| HTTP | Route | Auth | Mounted scope |
|---|---|---|---|
| POST | `/auth/create-profile` | PUBLIC | legacy |
| GET | `/auth/profile/:uid` | PUBLIC | legacy |
| POST | `/verify/license` | PUBLIC | legacy |
| POST | `/verify/vehicle` | PUBLIC | legacy |
| POST | `/verify/:type/:subId/approve` | PUBLIC | legacy |
| POST | `/verify/:type/:subId/reject` | PUBLIC | legacy |
| GET | `/admin/queue` | PUBLIC | legacy |
| PUT | `/drivers/:id/profile` | PUBLIC | legacy |
| POST | `/dto/apply` | PUBLIC | legacy |
| GET | `/dto/status/:userId` | PUBLIC | legacy |
| POST | `/dto/:id/approve` | PUBLIC | legacy |
| POST | `/dto/fuel-code/:driverId` | PUBLIC | legacy |
| POST | `/dto/fuel-code/:code/redeem` | PUBLIC | legacy |
| POST | `/fintech/pay-later/repay` | PUBLIC | legacy |
| POST | `/payments/webhook` | PUBLIC | legacy |
| POST | `/ussd/callback` | PUBLIC | legacy |
| POST | `/maas/rental/:id/log-km` | PUBLIC | legacy |
| POST | `/maas/corporate/create` | PUBLIC | legacy |
| POST | `/maas/corporate/:id/add-member` | PUBLIC | legacy |
| GET | `/maas/corporate/stats/:orgId` | PUBLIC | legacy |
| PUT | `/delivery/:id/status` | PUBLIC | legacy |
| POST | `/maas/schedule/dispatch` | PUBLIC | legacy |
| GET | `/health` | PUBLIC | legacy |
| GET | `/trotro/routes` | PUBLIC | trotroV2 |
| POST | `/trotro/routes` | PUBLIC | trotroV2 |
| POST | `/trotro/trips` | PUBLIC | trotroV2 |
| POST | `/trotro/trips/:tripId/status` | PUBLIC | trotroV2 |
| GET | `/trotro/trips/:tripId` | PUBLIC | trotroV2 |
| GET | `/trotro/search` | PUBLIC | trotroV2 |
| POST | `/trotro/book` | PUBLIC | trotroV2 |
| GET | `/trotro/bookings/:bookingId` | PUBLIC | trotroV2 |
| GET | `/trotro/bookings/user/:userId` | PUBLIC | trotroV2 |
| POST | `/trotro/cancel/:bookingId` | PUBLIC | trotroV2 |
| GET | `/trotro/track/:tripId` | PUBLIC | trotroV2 |
| POST | `/trotro-admin/operators` | PUBLIC | trotroAdmin |
| POST | `/trotro-admin/vehicles` | PUBLIC | trotroAdmin |
| GET | `/trotro-admin/operators` | PUBLIC | trotroAdmin |
| GET | `/trotro-admin/vehicles` | PUBLIC | trotroAdmin |
| GET | `/trotro-admin/trips/:tripId/manifest` | PUBLIC | trotroAdmin |
| POST | `/trotro-admin/trips/:tripId/board/:bookingId` | PUBLIC | trotroAdmin |
| POST | `/trotro-admin/trips/:tripId/status` | PUBLIC | trotroAdmin |
| POST | `/trotro-admin/verify/:type/:id/approve` | PUBLIC | trotroAdmin |
| GET | `/transit/stations` | PUBLIC | transit |
| POST | `/transit/stations` | PUBLIC | transit |
| GET | `/transit/routes` | PUBLIC | transit |
| POST | `/transit/routes` | PUBLIC | transit |
| GET | `/transit/trips` | PUBLIC | transit |
| POST | `/transit/trips` | PUBLIC | transit |
| GET | `/transit/search` | PUBLIC | transit |
| POST | `/transit/journeys/plan` | PUBLIC | transit |
| POST | `/transit/journeys/check-connections` | PUBLIC | transit |
| POST | `/transit/trips/:tripId/book` | PUBLIC | transitBooking |
| GET | `/transit/bookings/:bookingId` | PUBLIC | transitBooking |
| GET | `/transit/bookings/user/:userId` | PUBLIC | transitBooking |
| POST | `/transit/bookings/:bookingId/cancel` | PUBLIC | transitBooking |
| POST | `/transit/bookings/:bookingId/board` | PUBLIC | transitBooking |
| GET | `/transit/bookings/:bookingId/ticket` | PUBLIC | transitBooking |
| GET | `/transit/trips/:tripId/availability` | PUBLIC | transitBooking |
| GET | `/transit/hub` | PUBLIC | transitHub |
| POST | `/transit/hub` | PUBLIC | transitHub |
| GET | `/transit/corridors` | PUBLIC | transitHub |
| POST | `/transit/journeys/plan` | PUBLIC | transitHub |
| POST | `/transit/journeys/attach-pickup` | PUBLIC | transitHub |
| POST | `/transit/journeys/attach-final-mile` | PUBLIC | transitHub |
| GET | `/transit/vip/options` | PUBLIC | vip |
| POST | `/transit/vip/plan` | PUBLIC | vip |
| POST | `/transit/vip/journeys` | PUBLIC | vip |
| POST | `/journeys/:journeyId/confirm-payment` | PUBLIC | journey |

## Authentication meanings

- PUBLIC: no Firebase ID token required.
- AUTH: Firebase ID token required; route-specific ownership is enforced where the route accesses a user, driver, owner, booking, Journey, or financial record.
- ADMIN: Firebase ID token plus admin authorization.

## Intentional compatibility gaps

`sendOtp` and `verifyOtp` remain in `api.js` for compatibility but are not production authentication endpoints. The current production path is Firebase client-side Phone Authentication followed by backend Firebase ID-token verification.

## Journey payment endpoints

Journey payment is split intentionally:

- `POST /journeys/book` creates a Journey and transit inventory holds with `PAYMENT_PENDING`.
- `POST /journeys/:journeyId/pay` initializes the Paystack transaction using the server-stored fare.
- `POST /journeys/:journeyId/payment/verify` calls Paystack server-side verification.
- `POST /payments/webhook` validates the Paystack signature and settles successful Journey payments.
- `POST /journeys/:journeyId/confirm` is only a state confirmation helper after payment is already marked PAID.
- `GET /journeys/:journeyId/pass` is gated on verified PAID state.

No frontend endpoint is permitted to mark a Journey or payment as successful by sending a client-controlled flag.
