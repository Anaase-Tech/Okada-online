'use strict';

// Logic-level test for the /rides/:rideId/complete transaction + payment
// gate fix (PASS 4 correction 6).
//
// WHAT THIS TEST PROVES: using a faithful in-memory mock of the Firestore
// transaction contract (tx.get/tx.update/tx.set, FieldValue.increment,
// where()/limit() query filtering), this exercises a REDUCED copy of the
// restructured handler (see completeRide below for exactly what is and is
// not reproduced) and confirms:
//   - a normal completion credits the driver and marks the ride completed;
//   - a ride with no `payments` record (the existing cash path) still
//     completes with no gate at all - preserved exactly;
//   - a ride with a `payments` record that has not completed is blocked
//     with 409, and credits nothing;
//   - a ride whose payment has completed is allowed through;
//   - calling completion a second time *after* the first call's write has
//     landed (sequential, not concurrent) is correctly rejected as
//     'invalid-ride' and does not credit anything a second time.
//
// WHAT THIS TEST DOES NOT PROVE: real Firestore's server-side conflict
// detection for two requests that are *genuinely concurrent* - i.e. where
// both read the ride as not-yet-completed before either one commits. That
// guarantee is Firestore's own (the same one every other transactional
// booking path already relies on throughout this codebase, verified by
// reading, not by test, in PASS 2/PASS 3) and is not something an in-memory
// mock can honestly demonstrate. Firebase Emulator access is required for
// that and was not available in this sandbox: `npx firebase-tools
// setup:emulators:firestore` fails here with "Host not in allowlist:
// storage.googleapis.com" (network egress policy for this environment).
// This is reported as a BLOCKED test in the PASS 4 report, not claimed as
// passed.

const test = require('node:test');
const assert = require('node:assert/strict');

// ── A faithful-enough in-memory Firestore mock ──────────────────────────
// Supports exactly the operations the ride-completion handler uses:
// collection().doc(id), collection().doc() (auto-id), collection().where()
// chains with .limit(), tx.get/tx.update/tx.set, and
// admin.firestore.FieldValue.increment()/serverTimestamp().

const INCREMENT = Symbol('increment');
const SERVER_TIMESTAMP = Symbol('server-timestamp');

function makeFakeFirestore(seedData) {
  // seedData: { collectionName: { docId: {..fields} } }
  const store = JSON.parse(JSON.stringify(seedData));
  let autoIdCounter = 0;

  function applyPatch(collection, id, patch) {
    if (!store[collection]) store[collection] = {};
    const existing = store[collection][id] || {};
    const next = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (value && value.__type === INCREMENT) {
        const base = key.includes('.') ? getPath(existing, key) : existing[key];
        setPath(next, key, (typeof base === 'number' ? base : 0) + value.amount);
      } else if (value && value.__type === SERVER_TIMESTAMP) {
        setPath(next, key, 'SERVER_TIMESTAMP');
      } else {
        setPath(next, key, value);
      }
    }
    store[collection][id] = next;
  }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
  }
  function setPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function docRef(collection, id) {
    return {
      id,
      __collection: collection,
      async get() {
        const data = store[collection]?.[id];
        return { exists: !!data, id, data: () => data, ref: docRef(collection, id) };
      },
    };
  }

  function query(collection, filters, limit) {
    return {
      __collection: collection, __filters: filters, __limit: limit,
      where(field, op, value) {
        return query(collection, [...filters, { field, op, value }], limit);
      },
      limit(n) { return query(collection, filters, n); },
      async get() {
        const all = Object.entries(store[collection] || {});
        let matches = all.filter(([, data]) =>
          filters.every((f) => {
            if (f.op !== '==') throw new Error('mock only supports == filters');
            return getPath(data, f.field) === f.value;
          }));
        if (limit) matches = matches.slice(0, limit);
        const docs = matches.map(([id, data]) => ({ id, data: () => data, ref: docRef(collection, id) }));
        return { empty: docs.length === 0, docs };
      },
    };
  }

  const db = {
    collection(name) {
      return {
        doc(id) {
          if (id === undefined) {
            id = `auto_${++autoIdCounter}`;
          }
          return docRef(name, id);
        },
        where(field, op, value) { return query(name, [{ field, op, value }], null); },
      };
    },
  };

  const tx = {
    async get(refOrQuery) { return refOrQuery.get(); },
    update(ref, patch) { applyPatch(ref.__collection, ref.id, patch); },
    set(ref, data) { applyPatch(ref.__collection, ref.id, data); },
  };

  db.runTransaction = async (fn) => fn(tx);

  return { db, store };
}

const fakeAdmin = {
  firestore: {
    FieldValue: {
      increment: (amount) => ({ __type: INCREMENT, amount }),
      serverTimestamp: () => ({ __type: SERVER_TIMESTAMP }),
    },
  },
};

// Minimal, faithful copy of the CFG constants this handler reads (values
// are not asserted on directly by this test - only that the correct
// documents get touched and the payment gate fires correctly - so the
// exact rates don't need to match production for this test's purpose).
const CFG = {
  fare: { okada: 1, base: 5, min: 5 },
  dto: { trackARate: 0.1, trackBRate: 0.05 },
  loans: { deductPerRide: 0.05 },
  bonus: { referral: 0.02 },
};

function calcFareSplits(rideType, km, _driverData) {
  const rate = CFG.fare[rideType] || CFG.fare.okada;
  const total = Math.max(CFG.fare.base + km * rate, CFG.fare.min);
  return {
    total, driver: +(total * 0.6).toFixed(2), owner: +(total * 0.2).toFixed(2),
    fuel: +(total * 0.1).toFixed(2), maintenance: +(total * 0.1).toFixed(2),
  };
}

// REDUCED copy of the restructured transaction body from index.js. It
// reproduces the read-before-write structure, the re-entrancy guard
// (status === 'completed'), the driver authorization check, the payment
// gate, and the driver earnings credit. It does NOT reproduce the
// DTO / owner / loan / savings / referral write phase, so this test does
// not exercise those writes. Those are a mechanical tx.update/tx.set
// translation of the previous await-based calls, and were checked by
// diffing every Firestore field key, CFG reference and the response shape
// against the previous version of the handler - not by this test.
async function completeRide({ db, admin, rideId, callerUid, callerIsAdmin }) {
  const rideRef = db.collection('rides').doc(rideId);
  return db.runTransaction(async (tx) => {
    const ride = await tx.get(rideRef);
    if (!ride.exists || ride.data().status === 'completed') return { blocked: 'invalid-ride' };
    const rideData = ride.data();
    const driverId = rideData.driverId;

    const driverRef = db.collection('drivers').doc(driverId);
    const driverDoc = await tx.get(driverRef);
    if (!driverDoc.exists) return { blocked: 'driver-not-found' };
    if (!callerIsAdmin && driverDoc.data()?.firebaseUid !== callerUid && driverDoc.id !== callerUid) {
      return { blocked: 'forbidden' };
    }
    const driverData = driverDoc.data();

    const paymentAttemptSnap = await tx.get(
      db.collection('payments').where('rideId', '==', rideId).where('purpose', '==', 'ride').limit(1)
    );
    if (!paymentAttemptSnap.empty) {
      const paymentAttempt = paymentAttemptSnap.docs[0].data();
      const ridePaid = String(rideData.paymentStatus || '').toLowerCase() === 'paid';
      const paymentCompleted = String(paymentAttempt.status || '').toLowerCase() === 'completed';
      if (!ridePaid && !paymentCompleted) return { blocked: 'payment-not-settled' };
    }

    const fare = calcFareSplits(rideData.rideType, rideData.distance, driverData);
    const netDriver = fare.driver;

    tx.update(driverRef, {
      'earnings.total': admin.firestore.FieldValue.increment(netDriver),
      'wallet.pending': admin.firestore.FieldValue.increment(netDriver),
      totalRides: admin.firestore.FieldValue.increment(1),
    });
    tx.update(rideRef, {
      status: 'completed', fare, netDriverEarnings: netDriver,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { blocked: null, response: { splits: fare, netDriverEarnings: netDriver } };
  });
}

function seed(overrides = {}) {
  return {
    rides: { ride1: { status: 'requested', driverId: 'driver1', rideType: 'okada', distance: 5, userId: 'pax1', ...overrides.ride } },
    drivers: { driver1: { firebaseUid: 'driver1', earnings: { total: 0 }, wallet: { pending: 0 }, totalRides: 0, ...overrides.driver } },
    payments: overrides.payments || {},
  };
}

test('normal completion (no payments record = existing cash path) credits earnings once', async () => {
  const { db, store } = makeFakeFirestore(seed());
  const result = await completeRide({ db, admin: fakeAdmin, rideId: 'ride1', callerUid: 'driver1', callerIsAdmin: false });
  assert.equal(result.blocked, null);
  assert.equal(store.rides.ride1.status, 'completed');
  assert.ok(store.drivers.driver1.earnings.total > 0, 'driver should be credited');
});

test('ride with an incomplete online payment is blocked with payment-not-settled, credits nothing', async () => {
  const { db, store } = makeFakeFirestore(seed({
    payments: { pay1: { rideId: 'ride1', purpose: 'ride', status: 'pending' } },
  }));
  const result = await completeRide({ db, admin: fakeAdmin, rideId: 'ride1', callerUid: 'driver1', callerIsAdmin: false });
  assert.equal(result.blocked, 'payment-not-settled');
  assert.equal(store.rides.ride1.status, 'requested', 'ride must not be marked completed');
  assert.equal(store.drivers.driver1.earnings.total, 0, 'driver must not be credited before payment settles');
});

test('ride with a completed online payment is allowed through', async () => {
  const { db, store } = makeFakeFirestore(seed({
    ride: { paymentStatus: 'paid' },
    payments: { pay1: { rideId: 'ride1', purpose: 'ride', status: 'completed' } },
  }));
  const result = await completeRide({ db, admin: fakeAdmin, rideId: 'ride1', callerUid: 'driver1', callerIsAdmin: false });
  assert.equal(result.blocked, null);
  assert.equal(store.rides.ride1.status, 'completed');
  assert.ok(store.drivers.driver1.earnings.total > 0);
});

test('a second, sequential completion call after the first already landed does not credit twice', async () => {
  const { db, store } = makeFakeFirestore(seed());
  const first = await completeRide({ db, admin: fakeAdmin, rideId: 'ride1', callerUid: 'driver1', callerIsAdmin: false });
  assert.equal(first.blocked, null);
  const earningsAfterFirst = store.drivers.driver1.earnings.total;

  const second = await completeRide({ db, admin: fakeAdmin, rideId: 'ride1', callerUid: 'driver1', callerIsAdmin: false });
  assert.equal(second.blocked, 'invalid-ride', 'a ride already marked completed must not be processed again');
  assert.equal(store.drivers.driver1.earnings.total, earningsAfterFirst, 'earnings must be credited exactly once across both calls');
});

test('a non-assigned, non-admin caller is rejected with forbidden', async () => {
  const { db } = makeFakeFirestore(seed());
  const result = await completeRide({ db, admin: fakeAdmin, rideId: 'ride1', callerUid: 'someone-else', callerIsAdmin: false });
  assert.equal(result.blocked, 'forbidden');
});
