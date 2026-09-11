'use strict';

const SUPPORTED_MODES = new Set(['OKADA', 'CAR', 'TRICYCLE', 'BICYCLE', 'TROTRO', 'VIP_TRANSIT', 'PARTNER_RIDE']);
const STATUSES = ['PLANNING', 'PENDING_PAYMENT', 'CONFIRMED', 'PICKUP_ASSIGNED', 'AT_STATION', 'BOARDING', 'IN_TRANSIT', 'CONNECTION_PENDING', 'FINAL_MILE', 'COMPLETED', 'CANCELLED'];

function text(value, max = 200) {
  return String(value == null ? '' : value).trim().replace(/[<>"'`\\]/g, '').slice(0, max);
}

function validateMode(mode) {
  const normalized = text(mode, 30).toUpperCase();
  if (!SUPPORTED_MODES.has(normalized)) throw new Error('Unsupported journey mode');
  return normalized;
}

function validateSegment(segment) {
  if (!segment || !segment.from || !segment.to) throw new Error('Journey segment requires from and to');
  return {
    sequence: Number.isInteger(Number(segment.sequence)) ? Number(segment.sequence) : null,
    mode: validateMode(segment.mode),
    from: text(segment.from, 160),
    to: text(segment.to, 160),
    scheduledDeparture: segment.scheduledDeparture || null,
    estimatedArrival: segment.estimatedArrival || null,
    bookingId: text(segment.bookingId, 120) || null,
    providerId: text(segment.providerId, 120) || null,
    status: text(segment.status, 40).toUpperCase() || 'PLANNING',
  };
}

function buildJourney(input, userId, nowField) {
  const segments = Array.isArray(input?.segments) ? input.segments.map(validateSegment) : [];
  if (!segments.length) throw new Error('A journey requires at least one segment');

  const serviceClass = text(input?.serviceClass || 'STANDARD', 30).toUpperCase();
  const allowedClasses = new Set(['STANDARD', 'COMFORT', 'VIP', 'EXECUTIVE', 'PRIVATE']);
  if (!allowedClasses.has(serviceClass)) throw new Error('Invalid service class');

  const status = text(input?.status || 'PLANNING', 40).toUpperCase();
  if (!STATUSES.includes(status)) throw new Error('Invalid journey status');

  return {
    passengerId: userId,
    reference: text(input?.reference, 80) || null,
    origin: text(input?.origin || segments[0].from, 160),
    destination: text(input?.destination || segments[segments.length - 1].to, 160),
    serviceClass,
    segments,
    pickupOption: input?.pickupOption || null,
    finalMileOption: input?.finalMileOption || null,
    totalFare: Number.isFinite(Number(input?.totalFare)) ? Number(input.totalFare) : null,
    currency: 'GHS',
    status,
    createdBy: userId,
    createdAt: nowField,
    updatedAt: nowField,
  };
}

function connectionIsViable(first, second, bufferMinutes = 20) {
  if (!first?.estimatedArrival || !second?.scheduledDeparture) return { known: false, viable: null, bufferMinutes };
  const arrival = new Date(first.estimatedArrival).getTime();
  const departure = new Date(second.scheduledDeparture).getTime();
  if (!Number.isFinite(arrival) || !Number.isFinite(departure)) return { known: false, viable: null, bufferMinutes };
  const gap = (departure - arrival) / 60000;
  return { known: true, viable: gap >= bufferMinutes, gapMinutes: Math.round(gap), bufferMinutes };
}

function checkConnections(segments, bufferMinutes = 20) {
  const sorted = [...segments].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const connections = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const check = connectionIsViable(sorted[i], sorted[i + 1], bufferMinutes);
    connections.push({ fromSequence: sorted[i].sequence, toSequence: sorted[i + 1].sequence, ...check });
  }
  return connections;
}

function journeyScore({ timePenalty = 0, transferPenalty = 0, farePenalty = 0, comfortBonus = 0, confidenceBonus = 0 }) {
  return Number((100 - timePenalty - transferPenalty - farePenalty + comfortBonus + confidenceBonus).toFixed(2));
}

module.exports = {
  SUPPORTED_MODES,
  STATUSES,
  validateMode,
  validateSegment,
  buildJourney,
  connectionIsViable,
  checkConnections,
  journeyScore,
};
