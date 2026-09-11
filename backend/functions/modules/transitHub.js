'use strict';

const CORRIDORS = [
  { id: 'KOF-ACC', origin: 'Koforidua', destination: 'Accra', hub: 'Koforidua' },
  { id: 'KOF-KUM', origin: 'Koforidua', destination: 'Kumasi', hub: 'Koforidua' },
  { id: 'KOF-HO', origin: 'Koforidua', destination: 'Ho', hub: 'Koforidua' },
];

const SERVICE_CLASSES = ['STANDARD', 'COMFORT', 'VIP', 'EXECUTIVE', 'PRIVATE'];

function clean(value, max = 180) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function validateHub(hub) {
  const name = clean(hub?.name, 120);
  const city = clean(hub?.city, 120);
  if (!name || !city) throw new Error('Hub name and city are required');
  return {
    name,
    city,
    region: clean(hub?.region, 120) || null,
    address: clean(hub?.address, 220) || null,
    landmark: clean(hub?.landmark, 220) || null,
    active: hub?.active !== false,
  };
}

function buildJourneyPlan({ origin, destination, viaHub = 'Koforidua', serviceClass = 'VIP', legs = [] }) {
  const cleanOrigin = clean(origin);
  const cleanDestination = clean(destination);
  const hub = clean(viaHub || 'Koforidua');
  const cls = clean(serviceClass || 'VIP', 30).toUpperCase();
  if (!cleanOrigin || !cleanDestination) throw new Error('Origin and destination are required');
  if (!SERVICE_CLASSES.includes(cls)) throw new Error('Invalid service class');
  if (normalize(cleanOrigin) === normalize(cleanDestination)) throw new Error('Origin and destination must differ');

  const provided = Array.isArray(legs) && legs.length ? legs : [
    { origin: cleanOrigin, destination: hub, mode: 'PICKUP_OR_TRANSIT' },
    { origin: hub, destination: cleanDestination, mode: 'TRANSIT' },
  ];

  const normalizedLegs = provided.map((leg, index) => ({
    index,
    origin: clean(leg.origin),
    destination: clean(leg.destination),
    mode: clean(leg.mode || 'TRANSIT', 40).toUpperCase(),
    tripId: clean(leg.tripId, 120) || null,
    providerId: clean(leg.providerId, 120) || null,
    serviceClass: clean(leg.serviceClass || cls, 30).toUpperCase(),
    fare: Number.isFinite(Number(leg.fare)) ? Number(leg.fare) : 0,
    departureAt: leg.departureAt || null,
    arrivalAt: leg.arrivalAt || null,
  }));

  for (let i = 1; i < normalizedLegs.length; i += 1) {
    if (normalize(normalizedLegs[i - 1].destination) !== normalize(normalizedLegs[i].origin)) {
      throw new Error(`Leg ${i} does not connect to leg ${i + 1}`);
    }
  }

  return {
    type: 'OKADA_TRANSIT_JOURNEY',
    hub,
    serviceClass: cls,
    origin: cleanOrigin,
    destination: cleanDestination,
    legs: normalizedLegs,
    integratedPickup: true,
    integratedFinalMile: true,
    status: 'PLANNING',
  };
}

module.exports = { CORRIDORS, SERVICE_CLASSES, validateHub, buildJourneyPlan };
