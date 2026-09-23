'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  checkConnection,
  buildConnectionMonitor,
} = require('./journeyConnectionEngine');

test('marks a connection feasible when recorded arrival leaves required buffer', () => {
  const result = checkConnection({
    connectionIndex: 1,
    hub: 'Koforidua',
    fromLegStatus: 'COMPLETED',
    toLegStatus: 'SCHEDULED',
    actualArrivalAt: '2026-09-23T10:00:00Z',
    nextDepartureAt: '2026-09-23T10:45:00Z',
    minimumBufferMinutes: 30,
  });
  assert.equal(result.state, 'FEASIBLE');
  assert.equal(result.bufferMinutes, 45);
  assert.equal(result.timingBasis, 'RECORDED');
});

test('marks a connection at risk when recorded buffer is below the threshold', () => {
  const result = checkConnection({
    connectionIndex: 1,
    hub: 'Koforidua',
    fromLegStatus: 'ARRIVING',
    toLegStatus: 'SCHEDULED',
    arrivalAt: '2026-09-23T10:20:00Z',
    nextDepartureAt: '2026-09-23T10:40:00Z',
    minimumBufferMinutes: 30,
  });
  assert.equal(result.state, 'AT_RISK');
  assert.equal(result.bufferMinutes, 20);
});

test('marks a connection missed when the next departure precedes arrival', () => {
  const result = checkConnection({
    connectionIndex: 1,
    hub: 'Koforidua',
    fromLegStatus: 'DELAYED',
    toLegStatus: 'SCHEDULED',
    arrivalAt: '2026-09-23T11:00:00Z',
    nextDepartureAt: '2026-09-23T10:45:00Z',
  });
  assert.equal(result.state, 'MISSED');
  assert.equal(result.bufferMinutes, -15);
});

test('does not invent a connection ETA when segment arrival is unknown', () => {
  const result = buildConnectionMonitor({
    legs: [
      { tripId: 'trip-1', destination: 'Koforidua' },
      { tripId: 'trip-2', origin: 'Koforidua', destination: 'Kumasi' },
    ],
    trips: [
      { id: 'trip-1', status: 'IN_TRANSIT', departureAt: '2026-09-23T06:00:00Z' },
      { id: 'trip-2', status: 'SCHEDULED', departureAt: '2026-09-23T10:00:00Z' },
    ],
  });
  assert.equal(result.connections[0].state, 'UNKNOWN');
  assert.equal(result.connections[0].timingKnown, false);
  assert.equal(result.connections[0].timingBasis, 'UNKNOWN');
});
