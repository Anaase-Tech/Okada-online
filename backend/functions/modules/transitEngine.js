'use strict';

/**
 * Okada Online V4 — Intercity Transit / Journey planning engine.
 * Pure functions: no Firestore or network side effects.
 */

const STATUSES = [
  'DRAFT', 'SCHEDULED', 'BOARDING', 'DEPARTED', 'IN_TRANSIT',
  'ARRIVING', 'COMPLETED', 'DELAYED', 'CANCELLED',
];

const SERVICE_CLASSES = ['STANDARD', 'COMFORT', 'VIP', 'EXECUTIVE', 'PRIVATE'];

function text(value, max = 160) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeName(value) {
  return text(value, 160).toLowerCase();
}

function validateStops(stops) {
  if (!Array.isArray(stops) || stops.length < 2) throw new Error('Transit route requires at least two stops');
  const clean = stops.map((s) => text(s?.name ?? s, 160));
  if (clean.some((s) => !s)) throw new Error('Transit stops cannot be empty');
  const ids = clean.map(normalizeName);
  if (new Set(ids).size !== ids.length) throw new Error('Transit stops must be unique');
  return clean;
}

function validateServiceClass(serviceClass) {
  const value = text(serviceClass || 'STANDARD', 30).toUpperCase();
  if (!SERVICE_CLASSES.includes(value)) throw new Error('Invalid service class');
  return value;
}

function findStopIndex(stops, stop) {
  const route = validateStops(stops);
  const target = normalizeName(stop);
  return route.map(normalizeName).indexOf(target);
}

function validateSegment(stops, origin, destination) {
  const route = validateStops(stops);
  const fromIndex = findStopIndex(route, origin);
  const toIndex = findStopIndex(route, destination);
  if (fromIndex < 0 || toIndex < 0) throw new Error('Origin and destination must be on the same transit route');
  if (fromIndex >= toIndex) throw new Error('Destination must come after origin');
  return { fromIndex, toIndex, stops: route.slice(fromIndex, toIndex + 1) };
}

function isConnectionFeasible({ arrivalAt, nextDepartureAt, minimumBufferMinutes = 30, disruptionBufferMinutes = 0 }) {
  const arrival = new Date(arrivalAt);
  const departure = new Date(nextDepartureAt);
  if (Number.isNaN(arrival.getTime()) || Number.isNaN(departure.getTime())) throw new Error('Invalid connection times');
  const bufferMinutes = (departure - arrival) / 60000;
  const requiredMinutes = Math.max(0, Number(minimumBufferMinutes) || 0) + Math.max(0, Number(disruptionBufferMinutes) || 0);
  return {
    feasible: bufferMinutes >= requiredMinutes,
    bufferMinutes: Math.round(bufferMinutes),
    requiredMinutes,
  };
}

function normalizeLeg(leg, index) {
  if (!leg || !leg.origin || !leg.destination) throw new Error(`Journey leg ${index + 1} is missing origin or destination`);
  return {
    index,
    mode: text(leg.mode || 'PARTNER_RIDE', 40).toUpperCase(),
    providerId: text(leg.providerId, 120) || null,
    tripId: text(leg.tripId, 120) || null,
    origin: text(leg.origin, 160),
    destination: text(leg.destination, 160),
    departureAt: leg.departureAt ? new Date(leg.departureAt).toISOString() : null,
    arrivalAt: leg.arrivalAt ? new Date(leg.arrivalAt).toISOString() : null,
    serviceClass: validateServiceClass(leg.serviceClass || 'STANDARD'),
    fare: Number.isFinite(Number(leg.fare)) ? Number(leg.fare) : 0,
    pickupRequired: leg.pickupRequired !== false,
    finalMileRequired: leg.finalMileRequired === true,
  };
}

function buildJourney({ origin, destination, legs, pickup, finalMile, serviceClass = 'STANDARD' }) {
  const cleanOrigin = text(origin);
  const cleanDestination = text(destination);
  if (!cleanOrigin || !cleanDestination) throw new Error('Journey origin and destination are required');
  if (!Array.isArray(legs) || !legs.length) throw new Error('Journey requires at least one leg');

  const normalizedLegs = legs.map(normalizeLeg);
  for (let i = 1; i < normalizedLegs.length; i += 1) {
    const previous = normalizedLegs[i - 1];
    const current = normalizedLegs[i];
    if (normalizeName(previous.destination) !== normalizeName(current.origin)) {
      throw new Error(`Journey legs ${i} and ${i + 1} are not connected`);
    }
  }

  const fares = normalizedLegs.reduce((sum, leg) => sum + leg.fare, 0)
    + Number(pickup?.fare || 0) + Number(finalMile?.fare || 0);

  return {
    origin: cleanOrigin,
    destination: cleanDestination,
    serviceClass: validateServiceClass(serviceClass),
    legs: normalizedLegs,
    pickup: pickup || null,
    finalMile: finalMile || null,
    totalFare: +fares.toFixed(2),
    status: 'PLANNING',
  };
}

module.exports = {
  STATUSES,
  SERVICE_CLASSES,
  validateStops,
  validateServiceClass,
  findStopIndex,
  validateSegment,
  isConnectionFeasible,
  normalizeLeg,
  buildJourney,
};
