'use strict';

const DEFAULT_HUB = { id: 'KOFORIDUA_HUB', name: 'Koforidua Hub', city: 'Koforidua', region: 'Eastern Region' };
const SERVICE_CLASSES = ['STANDARD', 'COMFORT', 'VIP', 'EXECUTIVE', 'PRIVATE'];

function text(value, max = 180) { return String(value == null ? '' : value).trim().slice(0, max); }
function norm(value) { return text(value).toLowerCase(); }

function validateServiceClass(value) {
  const cls = text(value || 'VIP', 30).toUpperCase();
  if (!SERVICE_CLASSES.includes(cls)) throw new Error('Invalid service class');
  return cls;
}

function buildVipJourney({ origin, destination, transitTripId, transitOrigin, transitDestination, pickup, finalMile, serviceClass = 'VIP', fares = {} }) {
  const from = text(origin), to = text(destination), tFrom = text(transitOrigin || DEFAULT_HUB.city), tTo = text(transitDestination);
  if (!from || !to || !tTo) throw new Error('Journey origin, destination and transit destination are required');
  const cls = validateServiceClass(serviceClass);
  const legs = [];

  if (norm(from) !== norm(tFrom)) {
    legs.push({ mode: 'LOCAL_PICKUP', origin: from, destination: tFrom, providerId: pickup?.providerId || null, fare: Number(fares.pickup || pickup?.fare || 0) });
  }
  if (!transitTripId) throw new Error('A scheduled transit trip is required');
  legs.push({ mode: cls === 'VIP' ? 'VIP_TRANSIT' : 'TRANSIT', origin: tFrom, destination: tTo, tripId: transitTripId, providerId: fares.transitProviderId || null, serviceClass: cls, fare: Number(fares.transit || 0) });
  if (norm(to) !== norm(tTo)) {
    legs.push({ mode: 'FINAL_MILE', origin: tTo, destination: to, providerId: finalMile?.providerId || null, fare: Number(fares.finalMile || finalMile?.fare || 0) });
  }

  const totalFare = legs.reduce((sum, leg) => sum + (Number(leg.fare) || 0), 0);
  return { type: 'OKADA_VIP_JOURNEY', hub: DEFAULT_HUB, serviceClass: cls, origin: from, destination: to, legs, totalFare: +totalFare.toFixed(2), status: 'PLANNING' };
}

module.exports = { DEFAULT_HUB, SERVICE_CLASSES, validateServiceClass, buildVipJourney };
