'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { joinSharedTripTransaction } = require('./sharedTripTransactions');

test('shared-trip join rejects a missing joiner before beginning a transaction', async () => {
  let started = false;
  const result = await joinSharedTripTransaction({
    db: { runTransaction: async () => { started = true; } },
    tripRef: {}, joinerId: '',
  });
  assert.equal(result.blocked, 'invalid-joiner');
  assert.equal(started, false);
});
