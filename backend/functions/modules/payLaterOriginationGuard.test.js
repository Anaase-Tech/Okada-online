'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isPayLaterOriginationSuspended, PAY_LATER_ORIGINATION_UNAVAILABLE_MESSAGE } = require('./payLaterOriginationGuard');

test('new Pay Later originations remain suspended until a verified repayment flow is approved', () => {
  assert.equal(isPayLaterOriginationSuspended(), true);
});

test('suspension message explains non-success and preservation of existing debts and rides', () => {
  assert.match(PAY_LATER_ORIGINATION_UNAVAILABLE_MESSAGE,/temporarily unavailable/);
  assert.match(PAY_LATER_ORIGINATION_UNAVAILABLE_MESSAGE,/Existing deferred rides and outstanding balances are unchanged/);
});
