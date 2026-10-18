'use strict';

async function joinSharedTripTransaction({ db, tripRef, joinerId }) {
  if (typeof joinerId !== 'string' || !joinerId) return { blocked: 'invalid-joiner' };
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(tripRef);
    if (!snapshot.exists) return { blocked: 'not-found' };
    const trip = snapshot.data() || {};
    if (trip.status !== 'open') {
      return { blocked: trip.status === 'full' ? 'full' : 'not-open' };
    }

    const passengers = trip.passengers;
    const maxPassengers = Number(trip.maxPassengers);
    if (!Array.isArray(passengers) ||
        !Number.isFinite(maxPassengers) ||
        !Number.isInteger(maxPassengers) ||
        maxPassengers < 1 ||
        passengers.some((passenger) => typeof passenger !== 'string' || !passenger)) {
      return { blocked: 'invalid-trip-data' };
    }
    if (passengers.includes(joinerId)) return { blocked: 'already-joined' };
    if (passengers.length >= maxPassengers) return { blocked: 'full' };

    const nextPassengers = [...passengers, joinerId];
    const nextStatus = nextPassengers.length >= maxPassengers ? 'full' : 'open';
    transaction.update(tripRef, { passengers: nextPassengers, status: nextStatus });
    return {
      joined: true,
      passengers: nextPassengers.length,
      status: nextStatus,
      farePerPerson: trip.farePerPerson,
    };
  });
}

module.exports = { joinSharedTripTransaction };
