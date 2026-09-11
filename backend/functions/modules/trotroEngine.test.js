'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  validateStops,
  segmentIndexes,
  calculateSegmentOccupancy,
  calculateSegmentAvailability,
  checkSeatAvailability,
} = require('./trotroEngine');

const ROUTE = ['Akosombo', 'Kpong', 'Somanya', 'Koforidua'];

test('normalizes and validates route stops', () => {
  assert.deepEqual(validateStops(ROUTE), ['akosombo', 'kpong', 'somanya', 'koforidua']);
  assert.throws(() => validateStops(['Akosombo']), /at least two stops/);
  assert.throws(() => validateStops(['A', 'B', 'A']), /unique/);
});

test('booking occupies every segment between pickup and dropoff', () => {
  assert.deepEqual(segmentIndexes(ROUTE, 'Akosombo', 'Somanya'), {
    from: 0, to: 2, segments: [0, 1],
  });
});

test('overlapping bookings consume only shared segments', () => {
  const bookings = [
    { pickupStop: 'Akosombo', dropoffStop: 'Somanya', seatCount: 5, status: 'CONFIRMED' },
    { pickupStop: 'Kpong', dropoffStop: 'Koforidua', seatCount: 3, status: 'CONFIRMED' },
  ];
  assert.deepEqual(calculateSegmentOccupancy(ROUTE, bookings), [5, 8, 3]);
});

test('disjoint segments retain independent capacity', () => {
  const bookings = [
    { pickupStop: 'Akosombo', dropoffStop: 'Kpong', seatCount: 10, status: 'CONFIRMED' },
  ];
  const availability = calculateSegmentAvailability(ROUTE, 12, bookings);
  assert.equal(availability[0].available, 2);
  assert.equal(availability[1].available, 12);
  assert.equal(availability[2].available, 12);
});

test('full or partial overlap blocks a booking when one segment is full', () => {
  const bookings = [
    { pickupStop: 'Akosombo', dropoffStop: 'Somanya', seatCount: 12, status: 'CONFIRMED' },
  ];
  const result = checkSeatAvailability(ROUTE, 12, bookings, {
    pickupStop: 'Kpong', dropoffStop: 'Koforidua', seatCount: 1,
  });
  assert.equal(result.canBook, false);
  assert.equal(result.conflicts[0].from, 'kpong');
  assert.equal(result.conflicts[0].to, 'somanya');
});

test('cancelled bookings do not consume seats', () => {
  const bookings = [
    { pickupStop: 'Akosombo', dropoffStop: 'Koforidua', seatCount: 12, status: 'CANCELLED' },
  ];
  const availability = calculateSegmentAvailability(ROUTE, 12, bookings);
  assert.deepEqual(availability.map((s) => s.available), [12, 12, 12]);
});

test('pickup must precede dropoff', () => {
  assert.throws(() => segmentIndexes(ROUTE, 'Koforidua', 'Akosombo'), /Dropoff must come after pickup/);
});
