'use strict';

/**
 * Atomic Journey booking primitives.
 * Keeps the journey as the customer-facing booking while reserving each
 * underlying transit leg transactionally. Payment is intentionally separate:
 * a journey cannot be marked paid by this module without an explicit
 * payment-confirmation step elsewhere.
 */

const STATUSES = [
  'PENDING_PAYMENT', 'CONFIRMED', 'PICKUP_ASSIGNED', 'AT_STATION',
  'BOARDING', 'IN_TRANSIT', 'CONNECTION_PENDING', 'FINAL_MILE',
  'COMPLETED', 'CANCELLED',
];

function clean(value, max = 160) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function makeJourneyCode(id) {
  return `OKJ-${String(id).slice(0, 10).toUpperCase()}`;
}

function validateLegs(legs) {
  if (!Array.isArray(legs) || legs.length < 1) throw new Error('Journey requires at least one leg');
  return legs.map((leg, index) => {
    if (!leg || !leg.origin || !leg.destination) throw new Error(`Journey leg ${index + 1} is invalid`);
    return {
      index,
      mode: clean(leg.mode || 'PARTNER_RIDE', 40).toUpperCase(),
      tripId: clean(leg.tripId, 120) || null,
      providerId: clean(leg.providerId, 120) || null,
      origin: clean(leg.origin),
      destination: clean(leg.destination),
      pickupRequired: leg.pickupRequired === true,
      finalMileRequired: leg.finalMileRequired === true,
      fare: Number.isFinite(Number(leg.fare)) ? Number(leg.fare) : 0,
    };
  });
}

function validateConnectedLegs(legs) {
  const cleanLegs = validateLegs(legs);
  for (let i = 1; i < cleanLegs.length; i += 1) {
    if (cleanLegs[i - 1].destination.toLowerCase() !== cleanLegs[i].origin.toLowerCase()) {
      throw new Error(`Journey legs ${i} and ${i + 1} are not connected`);
    }
  }
  return cleanLegs;
}

module.exports = { STATUSES, clean, makeJourneyCode, validateLegs, validateConnectedLegs };
