'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhoneIdentity, validateRequestedPhoneAgainstClaim } = require('./authPhoneIdentity');

test('phone identity normalizer accepts E.164 and strips ordinary formatting', () => {
  assert.equal(normalizePhoneIdentity('+233 24 123 4567'), '+233241234567');
  assert.equal(normalizePhoneIdentity('+1 (415) 555-2671'), '+14155552671');
  assert.equal(normalizePhoneIdentity('0201234567'), null);
  assert.equal(normalizePhoneIdentity(''), null);
  assert.equal(normalizePhoneIdentity(null), null);
});

test('profile phone must match an actual verified Firebase phone claim', () => {
  assert.deepEqual(validateRequestedPhoneAgainstClaim('+233241234567', '+233241234567'), {
    ok: true, phone: '+233241234567',
  });
  assert.deepEqual(validateRequestedPhoneAgainstClaim('+233 24 123 4567', '+233241234567'), {
    ok: true, phone: '+233241234567',
  });
  assert.equal(validateRequestedPhoneAgainstClaim('+233241234567', '+233201112222').reason, 'phone-claim-mismatch');
  assert.equal(validateRequestedPhoneAgainstClaim('+233241234567', null).reason, 'missing-verified-phone-claim');
  assert.equal(validateRequestedPhoneAgainstClaim('0201234567', '+233201234567').reason, 'invalid-request-phone');
});
