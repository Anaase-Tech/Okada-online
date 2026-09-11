'use strict';

/**
 * Okada Online V4 — Trotro segment-capacity engine.
 *
 * Pure functions only: no Firestore/network side effects.
 * This module is intentionally independent from the legacy ride API so it
 * can be introduced without breaking existing MOVE functionality.
 */

function normalizeStopId(value) {
  return String(value || '').trim().toLowerCase();
}

function validateStops(stops) {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new Error('A trotro route requires at least two stops');
  }

  const normalized = stops.map(normalizeStopId);
  if (normalized.some((stop) => !stop)) {
    throw new Error('Route stops cannot be empty');
  }

  if (new Set(normalized).size !== normalized.length) {
    throw new Error('Route stops must be unique');
  }

  return normalized;
}

function segmentIndexes(stops, pickupStop, dropoffStop) {
  const route = validateStops(stops);
  const pickup = normalizeStopId(pickupStop);
  const dropoff = normalizeStopId(dropoffStop);
  const from = route.indexOf(pickup);
  const to = route.indexOf(dropoff);

  if (from === -1 || to === -1) {
    throw new Error('Pickup and dropoff must both exist on the route');
  }
  if (from >= to) {
    throw new Error('Dropoff must come after pickup on the route');
  }

  // A booking from stop i to stop j occupies segments i..j-1.
  return { from, to, segments: Array.from({ length: to - from }, (_, i) => from + i) };
}

function bookingSegments(stops, booking) {
  return segmentIndexes(stops, booking.pickupStop, booking.dropoffStop).segments;
}

/**
 * Return occupancy for every route segment.
 * Each segment represents travel between stops[i] and stops[i + 1].
 */
function calculateSegmentOccupancy(stops, bookings, includeStatuses) {
  const route = validateStops(stops);
  const allowed = includeStatuses || ['CONFIRMED', 'BOARDED'];
  const occupancy = Array(route.length - 1).fill(0);

  for (const booking of Array.isArray(bookings) ? bookings : []) {
    if (booking.status && !allowed.includes(String(booking.status).toUpperCase())) continue;
    const seats = Math.max(0, Number(booking.seatCount || 0));
    if (!Number.isFinite(seats) || seats <= 0) continue;
    for (const segment of bookingSegments(route, booking)) occupancy[segment] += seats;
  }

  return occupancy;
}

function calculateSegmentAvailability(stops, capacity, bookings, includeStatuses) {
  const route = validateStops(stops);
  const vehicleCapacity = Number(capacity);
  if (!Number.isInteger(vehicleCapacity) || vehicleCapacity < 1) {
    throw new Error('Vehicle capacity must be a positive integer');
  }

  const occupancy = calculateSegmentOccupancy(route, bookings, includeStatuses);
  return occupancy.map((used, index) => ({
    from: route[index],
    to: route[index + 1],
    capacity: vehicleCapacity,
    occupied: used,
    available: Math.max(0, vehicleCapacity - used),
    overCapacity: used > vehicleCapacity,
  }));
}

/**
 * Check whether a new booking can fit on every segment it would occupy.
 */
function checkSeatAvailability(stops, capacity, bookings, candidate, includeStatuses) {
  const route = validateStops(stops);
  const seats = Number(candidate && candidate.seatCount);
  if (!Number.isInteger(seats) || seats < 1) {
    throw new Error('seatCount must be a positive integer');
  }

  const availability = calculateSegmentAvailability(route, capacity, bookings, includeStatuses);
  const requiredSegments = bookingSegments(route, candidate);
  const conflicts = availability
    .filter((segment, index) => requiredSegments.includes(index) && segment.available < seats)
    .map((segment) => ({ ...segment, requested: seats }));

  return {
    canBook: conflicts.length === 0,
    requestedSeats: seats,
    conflicts,
    segments: requiredSegments,
  };
}

function reserveBooking(stops, capacity, bookings, candidate, includeStatuses) {
  const result = checkSeatAvailability(stops, capacity, bookings, candidate, includeStatuses);
  if (!result.canBook) {
    const first = result.conflicts[0];
    throw new Error(`Not enough seats between ${first.from} and ${first.to}`);
  }
  return {
    ...candidate,
    seatCount: result.requestedSeats,
    capacityCheck: result,
  };
}

module.exports = {
  validateStops,
  segmentIndexes,
  bookingSegments,
  calculateSegmentOccupancy,
  calculateSegmentAvailability,
  checkSeatAvailability,
  reserveBooking,
};
