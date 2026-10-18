'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEventDepositPercent } = require('./financialIntegrity');

test('missing event deposit percentage keeps the documented 30% default', () => {
  assert.equal(parseEventDepositPercent(undefined), 0.30);
  assert.equal(parseEventDepositPercent(null), 0.30);
});

test('valid fractional event deposit percentages are preserved', () => {
  assert.equal(parseEventDepositPercent(0.30), 0.30);
  assert.equal(parseEventDepositPercent('0.75'), 0.75);
  assert.equal(parseEventDepositPercent(1), 1);
});

test('negative, zero, non-finite, empty, and over-100% ratios are rejected', () => {
  for (const value of [-0.01, 0, 1.01, NaN, Infinity, -Infinity, '', 'not-a-number']) {
    assert.equal(parseEventDepositPercent(value), null, String(value));
  }
});
