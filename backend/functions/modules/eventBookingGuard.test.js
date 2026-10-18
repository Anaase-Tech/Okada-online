'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_EVENT_DEPOSIT_PERCENT,
  EVENT_DEPOSIT_PERCENT_ERROR,
  parseEventDepositPercent,
  createEventBookingHandler,
} = require('./eventBookingGuard');

function createHarness({
  available = 100,
  resolveProfile = true,
  profileExistsInTransaction = true,
} = {}) {
  const stats = {
    resolveCalls: 0,
    transactionCalls: 0,
    transactionReads: 0,
    created: [],
    updated: [],
    collectionNames: [],
  };

  const userRef = { id: 'user-1' };
  const eventRef = { id: 'event-1' };

  const db = {
    collection(name) {
      stats.collectionNames.push(name);
      return {
        doc() {
          return eventRef;
        },
      };
    },
    async runTransaction(callback) {
      stats.transactionCalls += 1;
      const tx = {
        async get(ref) {
          stats.transactionReads += 1;
          assert.equal(ref, userRef);
          return {
            exists: profileExistsInTransaction,
            data: () => ({ wallet: { available } }),
          };
        },
        create(ref, data) {
          stats.created.push({ ref, data });
        },
        update(ref, data) {
          stats.updated.push({ ref, data });
        },
      };
      return callback(tx);
    },
  };

  const admin = {
    firestore: {
      FieldValue: {
        serverTimestamp: () => 'SERVER_TIMESTAMP_TEST_VALUE',
        increment: (amount) => ({ incrementBy: amount }),
      },
    },
  };

  const resolveUserRef = async (userId, req) => {
    stats.resolveCalls += 1;
    stats.resolvedUserId = userId;
    stats.resolvedUid = req.uid;
    return resolveProfile
      ? { ref: userRef, data: { wallet: { available } } }
      : null;
  };

  const ok = (res, data) => {
    res.statusCode = 200;
    res.body = { ok: true, ...data };
    return res;
  };
  const fail = (res, statusCode, message) => {
    res.statusCode = statusCode;
    res.body = { error: message };
    return res;
  };

  const handler = createEventBookingHandler({
    resolveUserRef,
    db,
    admin,
    ok,
    fail,
    sanitize: (value) => typeof value === 'string' ? value.trim() : value,
    scheduledPricing: {
      car: { flag: 3.50, perKm: 4.50 },
    },
  });

  return {
    handler,
    stats,
    makeResponse: () => ({ statusCode: null, body: null }),
  };
}

const validBody = {
  userId: 'user-1',
  eventName: 'Community wedding',
  eventDate: '2026-11-15',
  pickupAddress: 'Akosombo',
  destAddress: 'Atimpoku',
  vehicleType: 'car',
  passengers: 2,
  notes: '',
};

test('omitted event deposit percentage keeps the existing 30 percent default', () => {
  const parsed = parseEventDepositPercent(undefined);
  assert.deepEqual(parsed, { valid: true, value: DEFAULT_EVENT_DEPOSIT_PERCENT, usesDefault: true });
  assert.equal(parseEventDepositPercent(null).value, 0.30);
});

for (const value of [0, -0.01, 1.01, 30, NaN, Infinity, 'NaN', 'Infinity', '', '   ', true, {}]) {
  test(`event deposit percentage rejects invalid value ${String(value)}`, () => {
    assert.equal(parseEventDepositPercent(value).valid, false);
  });
}

test('valid event deposit percentage is preserved as a fraction', () => {
  assert.deepEqual(parseEventDepositPercent(0.5), { valid: true, value: 0.5, usesDefault: false });
  assert.equal(parseEventDepositPercent(1).valid, true);
});

test('invalid percentage returns HTTP 400 before profile reads or financial writes', async () => {
  const h = createHarness();
  const res = h.makeResponse();
  await h.handler({ uid: 'uid-1', body: { ...validBody, depositPercent: -0.5 } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /depositPercent must be greater than 0 and no greater than 1/);
  assert.equal(h.stats.resolveCalls, 0);
  assert.equal(h.stats.transactionCalls, 0);
  assert.equal(h.stats.created.length, 0);
  assert.equal(h.stats.updated.length, 0);
});

test('event record and wallet available/pending movements are committed in one transaction', async () => {
  const h = createHarness({ available: 100 });
  const res = h.makeResponse();
  await h.handler({ uid: 'uid-1', body: { ...validBody, depositPercent: 0.5 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.estimatedFare, 71);
  assert.equal(res.body.deposit, 35.5);
  assert.equal(res.body.balanceDue, 35.5);
  assert.equal(h.stats.transactionCalls, 1);
  assert.equal(h.stats.transactionReads, 1);
  assert.deepEqual(h.stats.collectionNames, ['event_rides']);
  assert.equal(h.stats.created.length, 1);
  assert.equal(h.stats.updated.length, 1);
  assert.equal(h.stats.created[0].ref.id, 'event-1');
  assert.equal(h.stats.created[0].data.status, 'confirmed');
  assert.equal(h.stats.created[0].data.deposit, 35.5);
  assert.equal(h.stats.updated[0].data['wallet.available'].incrementBy, -35.5);
  assert.equal(h.stats.updated[0].data['wallet.pending'].incrementBy, 35.5);
});

test('omitted percentage defaults to 30 percent and calculates the existing event deposit', async () => {
  const h = createHarness({ available: 100 });
  const res = h.makeResponse();
  await h.handler({ uid: 'uid-1', body: validBody }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.deposit, 21.3);
});

test('insufficient fresh transaction balance causes neither event creation nor wallet mutation', async () => {
  const h = createHarness({ available: 10 });
  const res = h.makeResponse();
  await h.handler({ uid: 'uid-1', body: { ...validBody, depositPercent: 0.5 } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Deposit required/);
  assert.equal(h.stats.transactionCalls, 1);
  assert.equal(h.stats.transactionReads, 1);
  assert.equal(h.stats.created.length, 0);
  assert.equal(h.stats.updated.length, 0);
});

test('a profile missing when the transaction starts causes no event or wallet writes', async () => {
  const h = createHarness({ profileExistsInTransaction: false });
  const res = h.makeResponse();
  await h.handler({ uid: 'uid-1', body: validBody }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(h.stats.created.length, 0);
  assert.equal(h.stats.updated.length, 0);
});

test('a missing authenticated profile is rejected before starting a transaction', async () => {
  const h = createHarness({ resolveProfile: false });
  const res = h.makeResponse();
  await h.handler({ uid: 'uid-1', body: validBody }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(h.stats.transactionCalls, 0);
  assert.equal(h.stats.created.length, 0);
  assert.equal(h.stats.updated.length, 0);
});
