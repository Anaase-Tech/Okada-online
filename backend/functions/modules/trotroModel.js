'use strict';

function cleanText(value, max = 160) {
  return String(value == null ? '' : value).trim().replace(/[<>"'`\\]/g, '').slice(0, max);
}

function normalizeStops(origin, stops, destination) {
  const values = [origin, ...(Array.isArray(stops) ? stops : []), destination]
    .map((value) => cleanText(value, 120).toLowerCase())
    .filter(Boolean);

  if (values.length < 2) throw new Error('A route requires at least two stops');
  if (new Set(values).size !== values.length) throw new Error('Route stops must be unique');
  return values;
}

function buildRoute(input, userId, nowField) {
  const origin = cleanText(input?.origin, 120);
  const destination = cleanText(input?.destination, 120);
  const stops = normalizeStops(origin, input?.stops, destination);

  return {
    name: cleanText(input?.name, 120) || `${stops[0]} → ${stops[stops.length - 1]}`,
    origin: stops[0],
    stops: stops.slice(1, -1),
    destination: stops[stops.length - 1],
    operatorId: cleanText(input?.operatorId, 120) || userId,
    estimatedDurationMinutes: Number.isInteger(Number(input?.estimatedDurationMinutes))
      ? Number(input.estimatedDurationMinutes) : null,
    baseFareRules: input?.baseFareRules || null,
    recurring: input?.recurring || null,
    active: true,
    createdBy: userId,
    createdAt: nowField,
    updatedAt: nowField,
  };
}

function buildVehicle(input, userId, nowField) {
  const capacity = Number(input?.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    throw new Error('capacity must be an integer between 1 and 100');
  }

  const type = cleanText(input?.vehicleType || 'trotro', 40).toLowerCase();
  const validTypes = ['trotro', 'minibus', 'bus', 'shuttle'];
  if (!validTypes.includes(type)) throw new Error('Invalid trotro vehicleType');

  return {
    registration: cleanText(input?.registration, 40).toUpperCase(),
    make: cleanText(input?.make, 80),
    model: cleanText(input?.model, 80),
    year: Number.isInteger(Number(input?.year)) ? Number(input.year) : null,
    vehicleType: type,
    capacity,
    operatorId: cleanText(input?.operatorId, 120) || userId,
    driverId: cleanText(input?.driverId, 120) || null,
    mateId: cleanText(input?.mateId, 120) || null,
    verificationStatus: 'PENDING',
    status: 'ACTIVE',
    createdBy: userId,
    createdAt: nowField,
    updatedAt: nowField,
  };
}

function buildOperator(input, userId, nowField) {
  const name = cleanText(input?.name, 160);
  if (!name) throw new Error('operator name is required');
  return {
    name,
    phone: cleanText(input?.phone, 40),
    email: cleanText(input?.email, 120),
    region: cleanText(input?.region, 80) || 'Eastern Region',
    verificationStatus: 'PENDING',
    active: true,
    createdBy: userId,
    createdAt: nowField,
    updatedAt: nowField,
  };
}

module.exports = { cleanText, normalizeStops, buildRoute, buildVehicle, buildOperator };
