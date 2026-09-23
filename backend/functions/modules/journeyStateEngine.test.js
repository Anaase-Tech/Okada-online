'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOperationalState } = require('./journeyStateEngine');

const base = {
  paymentStatus: 'PAID',
  legs: [
    { tripId: 'trip-1', origin: 'Akosombo', destination: 'Koforidua' },
    { tripId: 'trip-2', origin: 'Koforidua', destination: 'Kumasi' },
  ],
};

test('moves a paid journey into BOARDING on a real boarding event', () => {
  const state = buildOperationalState({
    ...base,
    journeyStatus: 'CONFIRMED',
    trips: [
      { id: 'trip-1', status: 'BOARDING' },
      { id: 'trip-2', status: 'SCHEDULED' },
    ],
    eventTripId: 'trip-1',
    eventType: 'BOARDING',
  });
  assert.equal(state.status, 'BOARDING');
  assert.equal(state.currentSegmentSequence, 1);
  assert.equal(state.nextAction, 'BOARD');
});

test('moves a paid journey into IN_TRANSIT when a segment departs', () => {
  const state = buildOperationalState({
    ...base,
    journeyStatus: 'BOARDING',
    trips: [
      { id: 'trip-1', status: 'DEPARTED', departedAt: '2026-09-23T08:00:00Z' },
      { id: 'trip-2', status: 'SCHEDULED' },
    ],
    eventTripId: 'trip-1',
    eventType: 'DEPARTED',
  });
  assert.equal(state.status, 'IN_TRANSIT');
  assert.equal(state.currentSegmentSequence, 1);
});

test('moves to CONNECTION_PENDING at an intermediate station arrival', () => {
  const state = buildOperationalState({
    ...base,
    journeyStatus: 'IN_TRANSIT',
    trips: [
      { id: 'trip-1', status: 'ARRIVING' },
      { id: 'trip-2', status: 'SCHEDULED' },
    ],
    eventTripId: 'trip-1',
    eventType: 'STATION_ARRIVAL',
  });
  assert.equal(state.status, 'CONNECTION_PENDING');
  assert.equal(state.currentSegmentSequence, 1);
  assert.equal(state.nextSegmentSequence, 2);
  assert.equal(state.nextAction, 'CONNECT');
});

test('moves to BOARDING for the next leg after a connection', () => {
  const state = buildOperationalState({
    ...base,
    journeyStatus: 'CONNECTION_PENDING',
    trips: [
      { id: 'trip-1', status: 'COMPLETED' },
      { id: 'trip-2', status: 'BOARDING' },
    ],
    eventTripId: 'trip-2',
    eventType: 'BOARDING',
  });
  assert.equal(state.status, 'BOARDING');
  assert.equal(state.currentSegmentSequence, 2);
});

test('completes a journey when the final transit leg completes', () => {
  const state = buildOperationalState({
    ...base,
    journeyStatus: 'IN_TRANSIT',
    trips: [
      { id: 'trip-1', status: 'COMPLETED' },
      { id: 'trip-2', status: 'COMPLETED' },
    ],
    eventTripId: 'trip-2',
    eventType: 'COMPLETED',
  });
  assert.equal(state.status, 'COMPLETED');
  assert.equal(state.nextAction, 'COMPLETE');
});

test('does not progress an unpaid journey from operational events', () => {
  const state = buildOperationalState({
    ...base,
    paymentStatus: 'PENDING',
    journeyStatus: 'CONFIRMED',
    trips: [
      { id: 'trip-1', status: 'DEPARTED' },
      { id: 'trip-2', status: 'SCHEDULED' },
    ],
    eventTripId: 'trip-1',
    eventType: 'DEPARTED',
  });
  assert.equal(state.status, 'CONFIRMED');
  assert.equal(state.reason, 'PAYMENT_NOT_VERIFIED');
});

test('records a cancelled segment as an issue without cancelling the whole journey', () => {
  const state = buildOperationalState({
    ...base,
    journeyStatus: 'IN_TRANSIT',
    trips: [
      { id: 'trip-1', status: 'CANCELLED' },
      { id: 'trip-2', status: 'SCHEDULED' },
    ],
    eventTripId: 'trip-1',
    eventType: 'CANCELLED',
  });
  assert.equal(state.status, 'CONNECTION_PENDING');
  assert.equal(state.operationalIssue, 'SEGMENT_CANCELLED');
});
