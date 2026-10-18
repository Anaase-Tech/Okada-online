'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWalletBackedBooking } = require('./walletBookingTransactions');

test('wallet-backed booking rejects invalid charges without starting a transaction', async () => {
  let started = false;
  const db = { runTransaction: async () => { started = true; } };
  for (const amount of [0, -1, NaN, Infinity, 'abc']) {
    const result = await createWalletBackedBooking({
      db, fieldValue: {}, userRef: {}, serviceRef: {}, serviceData: {}, amount,
    });
    assert.equal(result.blocked, 'invalid-amount');
  }
  assert.equal(started, false);
});
