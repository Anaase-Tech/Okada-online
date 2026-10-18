'use strict';

function normalizePhoneIdentity(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return null;
  return normalized;
}

function validateRequestedPhoneAgainstClaim(requestedPhone, verifiedClaim) {
  const requested = normalizePhoneIdentity(requestedPhone);
  const verified = normalizePhoneIdentity(verifiedClaim);
  if (!requested) return { ok: false, reason: 'invalid-request-phone' };
  if (!verified) return { ok: false, reason: 'missing-verified-phone-claim' };
  if (requested !== verified) return { ok: false, reason: 'phone-claim-mismatch' };
  return { ok: true, phone: verified };
}

module.exports = { normalizePhoneIdentity, validateRequestedPhoneAgainstClaim };
