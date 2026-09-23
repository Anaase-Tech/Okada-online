'use strict';

const TERMINAL_JOURNEY_STATES = new Set(['COMPLETED', 'CANCELLED']);
const ACTIVE_TRIP_STATES = new Set(['BOARDING', 'DEPARTED', 'IN_TRANSIT', 'ARRIVING', 'DELAYED']);

function normalize(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function isCompletedTrip(trip) {
  return normalize(trip?.status) === 'COMPLETED';
}

function buildOperationalState({
  journeyStatus,
  paymentStatus,
  legs = [],
  trips = [],
  finalMile = null,
  currentSegmentSequence = null,
  eventTripId = null,
  eventType = null,
}) {
  const currentJourneyStatus = normalize(journeyStatus);
  const paid = normalize(paymentStatus) === 'PAID';
  const normalizedLegs = Array.isArray(legs) ? legs : [];
  const normalizedTrips = Array.isArray(trips) ? trips : [];
  const tripById = new Map(
    normalizedTrips
      .filter((trip) => trip?.id)
      .map((trip) => [String(trip.id), trip])
  );

  const base = {
    status: currentJourneyStatus || 'CONFIRMED',
    currentSegmentSequence: null,
    nextSegmentSequence: null,
    nextAction: null,
    operationalIssue: null,
    operationalIssueSequence: null,
    changed: false,
    reason: 'NO_PROGRESS',
    eventTripId: eventTripId ? String(eventTripId) : null,
    eventType: normalize(eventType) || null,
  };

  if (!paid) {
    base.reason = 'PAYMENT_NOT_VERIFIED';
    return base;
  }

  if (TERMINAL_JOURNEY_STATES.has(currentJourneyStatus)) {
    base.reason = 'JOURNEY_TERMINAL';
    return base;
  }

  const segmentRows = normalizedLegs.map((leg, index) => {
    const trip = leg?.tripId ? tripById.get(String(leg.tripId)) : null;
    return {
      sequence: index + 1,
      leg: leg || {},
      trip,
      tripStatus: normalize(trip?.status),
    };
  });

  if (!segmentRows.length) {
    base.reason = 'NO_OPERATIONAL_LEGS';
    return base;
  }

  const cancelled = segmentRows.find((row) => row.tripStatus === 'CANCELLED');
  if (cancelled) {
    base.operationalIssue = 'SEGMENT_CANCELLED';
    base.operationalIssueSequence = cancelled.sequence;
    base.currentSegmentSequence = cancelled.sequence;
    base.nextSegmentSequence = cancelled.sequence < segmentRows.length ? cancelled.sequence + 1 : null;
    base.nextAction = 'MONITOR';
    if (cancelled.sequence < segmentRows.length) {
      base.status = 'CONNECTION_PENDING';
      base.reason = 'SEGMENT_CANCELLED_REQUIRES_ATTENTION';
      base.changed = base.status !== currentJourneyStatus;
      return base;
    }
  }

  const eventRow = eventTripId
    ? segmentRows.find((row) => String(row.leg?.tripId || '') === String(eventTripId))
    : null;
  const effectiveEventType = normalize(eventType);
  const storedSequence = Number(currentSegmentSequence);

  if (eventRow && Number.isInteger(storedSequence) && storedSequence > 0) {
    const earlierSegment = eventRow.sequence < storedSequence;
    const duplicateBoardingAfterDeparture =
      eventRow.sequence === storedSequence
      && currentJourneyStatus === 'IN_TRANSIT'
      && effectiveEventType === 'BOARDING';
    const sameSegmentAfterConnection =
      eventRow.sequence === storedSequence
      && currentJourneyStatus === 'CONNECTION_PENDING';

    if (earlierSegment || duplicateBoardingAfterDeparture || sameSegmentAfterConnection) {
      base.currentSegmentSequence = storedSequence;
      base.nextSegmentSequence = storedSequence < segmentRows.length ? storedSequence + 1 : null;
      base.nextAction = currentJourneyStatus === 'FINAL_MILE' ? 'FINAL_MILE' : 'MONITOR';
      base.reason = 'STALE_OPERATIONAL_EVENT';
      return base;
    }
  }

  // An arrival at an intermediate hub means the customer's next task is the
  // connection, but the journey is not considered completed until the segment
  // actually completes.
  if (eventRow && effectiveEventType === 'STATION_ARRIVAL' && eventRow.sequence < segmentRows.length) {
    base.status = 'CONNECTION_PENDING';
    base.currentSegmentSequence = eventRow.sequence;
    base.nextSegmentSequence = eventRow.sequence + 1;
    base.nextAction = 'CONNECT';
    base.reason = 'INTERMEDIATE_STATION_ARRIVAL';
    base.changed = base.status !== currentJourneyStatus;
    return base;
  }

  if (eventRow && effectiveEventType === 'BOARDING') {
    base.status = 'BOARDING';
    base.currentSegmentSequence = eventRow.sequence;
    base.nextSegmentSequence = eventRow.sequence < segmentRows.length ? eventRow.sequence + 1 : null;
    base.nextAction = 'BOARD';
    base.reason = 'SEGMENT_BOARDING';
    base.changed = base.status !== currentJourneyStatus;
    return base;
  }

  if (eventRow && ['DEPARTED', 'DEPARTED_STATION'].includes(effectiveEventType)) {
    base.status = 'IN_TRANSIT';
    base.currentSegmentSequence = eventRow.sequence;
    base.nextSegmentSequence = eventRow.sequence < segmentRows.length ? eventRow.sequence + 1 : null;
    base.nextAction = 'TRAVEL';
    base.reason = 'SEGMENT_DEPARTED';
    base.changed = base.status !== currentJourneyStatus;
    return base;
  }

  const firstIncomplete = segmentRows.find((row) => !isCompletedTrip(row.trip) && row.tripStatus !== 'CANCELLED');

  if (!firstIncomplete) {
    const hasFinalMile = finalMile === true
      || (finalMile && typeof finalMile === 'object'
        && finalMile.required !== false
        && Object.keys(finalMile).length > 0);
    const finalMileCompleted = finalMile && typeof finalMile === 'object'
      && normalize(finalMile.status) === 'COMPLETED';
    base.currentSegmentSequence = segmentRows.length;
    base.nextSegmentSequence = null;
    if (hasFinalMile && !finalMileCompleted) {
      base.status = 'FINAL_MILE';
      base.nextAction = 'FINAL_MILE';
      base.reason = 'TRANSIT_COMPLETED_FINAL_MILE_PENDING';
    } else {
      base.status = 'COMPLETED';
      base.nextAction = 'COMPLETE';
      base.reason = 'ALL_TRANSIT_LEGS_COMPLETED';
    }
    base.changed = base.status !== currentJourneyStatus;
    return base;
  }

  const active = segmentRows.find((row) => ACTIVE_TRIP_STATES.has(row.tripStatus));
  if (active) {
    const priorCompleted = segmentRows.slice(0, active.sequence - 1).every((row) => isCompletedTrip(row.trip));
    if (active.tripStatus === 'BOARDING') {
      base.status = 'BOARDING';
      base.nextAction = 'BOARD';
      base.reason = 'ACTIVE_SEGMENT_BOARDING';
    } else if (active.tripStatus === 'DELAYED' && !active.trip?.departedAt) {
      base.status = priorCompleted && active.sequence > 1 ? 'CONNECTION_PENDING' : currentJourneyStatus;
      base.nextAction = priorCompleted && active.sequence > 1 ? 'MONITOR' : 'MONITOR';
      base.reason = 'SEGMENT_DELAY_BEFORE_DEPARTURE';
    } else {
      base.status = 'IN_TRANSIT';
      base.nextAction = 'TRAVEL';
      base.reason = 'ACTIVE_SEGMENT_IN_TRANSIT';
    }
    base.currentSegmentSequence = active.sequence;
    base.nextSegmentSequence = active.sequence < segmentRows.length ? active.sequence + 1 : null;
    base.changed = base.status !== currentJourneyStatus;
    return base;
  }

  const completedCount = segmentRows.filter((row) => isCompletedTrip(row.trip)).length;
  if (completedCount > 0 && completedCount < segmentRows.length) {
    base.status = 'CONNECTION_PENDING';
    base.currentSegmentSequence = completedCount;
    base.nextSegmentSequence = completedCount + 1;
    base.nextAction = 'CONNECT';
    base.reason = 'SEGMENT_COMPLETED_WAITING_CONNECTION';
    base.changed = base.status !== currentJourneyStatus;
    return base;
  }

  base.status = currentJourneyStatus || 'CONFIRMED';
  base.nextSegmentSequence = 1;
  base.nextAction = 'MONITOR';
  base.reason = 'WAITING_FOR_OPERATIONAL_EVENT';
  base.changed = base.status !== currentJourneyStatus;
  return base;
}

module.exports = {
  normalize,
  isCompletedTrip,
  buildOperationalState,
};
