'use strict';

const STATUS_SET = new Set([
  'SCHEDULED', 'BOARDING', 'DEPARTED', 'IN_TRANSIT',
  'ARRIVING', 'COMPLETED', 'DELAYED', 'CANCELLED',
]);

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toUpperCase();
  return STATUS_SET.has(status) ? status : null;
}

function checkConnection({
  connectionIndex,
  hub,
  fromLegStatus,
  toLegStatus,
  arrivalAt,
  actualArrivalAt,
  stationArrivalAt,
  estimatedArrivalAt,
  nextDepartureAt,
  minimumBufferMinutes = 30,
  now = new Date(),
}) {
  const arrivalSources = [
    ['RECORDED', actualArrivalAt],
    ['RECORDED', stationArrivalAt],
    ['ESTIMATED', estimatedArrivalAt],
    ['PLANNED', arrivalAt],
  ];

  let selectedArrival = null;
  let arrivalBasis = 'UNKNOWN';
  for (const [basis, value] of arrivalSources) {
    const parsed = toDate(value);
    if (parsed) {
      selectedArrival = parsed;
      arrivalBasis = basis;
      break;
    }
  }

  const departure = toDate(nextDepartureAt);
  const requiredMinutes = Math.max(0, Number(minimumBufferMinutes) || 0);

  const result = {
    connectionIndex,
    fromSequence: connectionIndex,
    toSequence: connectionIndex + 1,
    hub: hub || null,
    fromLegStatus: normalizeStatus(fromLegStatus),
    toLegStatus: normalizeStatus(toLegStatus),
    timingKnown: !!selectedArrival && !!departure,
    timingBasis: selectedArrival && departure ? arrivalBasis : 'UNKNOWN',
    arrivalAt: selectedArrival,
    nextDepartureAt: departure,
    bufferMinutes: null,
    requiredBufferMinutes: requiredMinutes,
    departurePassed: false,
    state: 'UNKNOWN',
  };

  if (selectedArrival && departure) {
    result.bufferMinutes = Math.round((departure.getTime() - selectedArrival.getTime()) / 60000);

    if (result.bufferMinutes < 0) {
      result.state = 'MISSED';
    } else if (result.bufferMinutes < requiredMinutes) {
      result.state = 'AT_RISK';
    } else {
      result.state = 'FEASIBLE';
    }
  }

  const nowDate = toDate(now) || new Date();
  if (departure && departure.getTime() <= nowDate.getTime() && result.toLegStatus === 'SCHEDULED') {
    result.departurePassed = true;
  }

  if (result.toLegStatus === 'CANCELLED') result.state = 'CANCELLED';
  if (result.fromLegStatus === 'CANCELLED') result.state = 'BLOCKED';

  return result;
}

function buildConnectionMonitor({
  legs = [],
  trips = [],
  minimumBufferMinutes = 30,
  now = new Date(),
}) {
  const normalizedLegs = Array.isArray(legs) ? legs : [];
  const normalizedTrips = Array.isArray(trips) ? trips : [];
  const tripById = new Map(
    normalizedTrips.map((trip) => [trip?.id, trip]).filter(([id]) => id)
  );

  const connections = [];
  for (let i = 0; i < normalizedLegs.length - 1; i += 1) {
    const current = normalizedLegs[i] || {};
    const next = normalizedLegs[i + 1] || {};
    const currentTrip = current.tripId ? tripById.get(current.tripId) : null;
    const nextTrip = next.tripId ? tripById.get(next.tripId) : null;

    connections.push(checkConnection({
      connectionIndex: i + 1,
      hub: current.destination || null,
      fromLegStatus: currentTrip?.status || current.status,
      toLegStatus: nextTrip?.status || next.status,
      actualArrivalAt: currentTrip?.actualArrivalAt || null,
      stationArrivalAt: currentTrip?.stationArrivalAt || null,
      estimatedArrivalAt: currentTrip?.estimatedArrivalAt || null,
      arrivalAt: current.arrivalAt || null,
      nextDepartureAt: nextTrip?.departureAt || next.departureAt || null,
      minimumBufferMinutes,
      now,
    }));
  }

  return {
    connections,
    operationalTimeDataAvailable: connections.some((c) => c.timingBasis === 'RECORDED'),
    timingCoverage: connections.length
      ? Math.round((connections.filter((c) => c.timingKnown).length / connections.length) * 100)
      : 100,
  };
}

module.exports = {
  toDate,
  normalizeStatus,
  checkConnection,
  buildConnectionMonitor,
};
