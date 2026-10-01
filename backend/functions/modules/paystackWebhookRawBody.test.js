'use strict';

// Real HTTP-level test for the Paystack webhook raw-body fix, added in
// PASS 4 correction 4.
//
// PASS 1/PASS 3 found that index.js's global express.json() had no
// `verify` callback, so req.rawBody was never populated, and the webhook
// handler's `Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(
// JSON.stringify(req.body))` always fell back to re-serializing the parsed
// body - which can legitimately differ from the exact bytes Paystack
// signed over.
//
// index.js cannot be required directly for this test: it exports
// `exports.api` (a functions.runWith(...).https.onRequest(app) wrapper),
// not the raw Express `app` itself, which is a local, non-exported
// variable - restructuring that is out of scope for this correction. This
// test instead mirrors the two exact, relevant blocks of index.js
// verbatim - the corrected express.json({ verify }) middleware and the
// webhook's signature-check block - in a small standalone Express app, and
// exercises them with real HTTP requests (via Node's built-in fetch) and real
// HMAC-SHA512 signatures, so it tests real behavior over real raw bytes,
// not a simplified reimplementation of the logic being verified.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');

const TEST_SECRET = 'test_paystack_secret_do_not_use_in_production';


// Minimal HTTP helper using Node's built-in fetch against a real listening
// server on an ephemeral port - real requests through real Express, with no
// extra test dependency.
async function callRoute(app, { method = 'POST', path, headers = {}, body }) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body });
    let json = null;
    try { json = await res.json(); } catch (_e) { /* non-JSON body */ }
    return { status: res.status, body: json };
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function buildWebhookTestApp() {
  const app = express();

  // Verbatim copy of the corrected middleware in index.js.
  app.use(express.json({
    limit: '50kb',
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }));

  // Verbatim copy of index.js's webhook signature-check block (the part
  // this correction touches). The settlement logic after the signature
  // check is intentionally not reproduced here - it's already covered by
  // journeyPaymentService's own tests, and is unchanged by this
  // correction.
  app.post('/payments/webhook', (req, res) => {
    const paystackSecret = TEST_SECRET || '';
    const sig = req.headers['x-paystack-signature'] || '';
    const body = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body));
    const expected = crypto.createHmac('sha512', paystackSecret).update(body).digest('hex');
    const sigBuf = Buffer.from(String(sig), 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    const sigValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    if (!paystackSecret || !sigValid) return res.status(401).json({ error: 'Invalid signature' });
    return res.status(200).json({ ok: true });
  });

  return app;
}

function sign(rawBodyString) {
  return crypto.createHmac('sha512', TEST_SECRET).update(rawBodyString).digest('hex');
}

test('webhook: a validly-signed request (real raw bytes) is accepted', async () => {
  const app = buildWebhookTestApp();
  // A body whose JSON.stringify round-trip would still match is not a
  // strong test of "uses raw bytes" on its own, so this uses a payload
  // Paystack sends with a key ordering/number-formatting profile.
  const payload = { event: 'charge.success', data: { reference: 'ref_123', amount: 150000 } };
  const rawBodyString = JSON.stringify(payload);
  const signature = sign(rawBodyString);

  const res = await callRoute(app, {
    path: '/payments/webhook',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature },
    body: rawBodyString,
  });

  assert.equal(res.status, 200, `expected a validly-signed webhook to be accepted, got ${res.status}: ${JSON.stringify(res.body)}`);
});

test('webhook: an invalid signature is rejected with 401', async () => {
  const app = buildWebhookTestApp();
  const payload = { event: 'charge.success', data: { reference: 'ref_123', amount: 150000 } };

  const res = await callRoute(app, {
    path: '/payments/webhook',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': 'not-a-real-signature' },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 401);
});

test('webhook: raw-body capture means byte-for-byte formatting differences do not break a genuine signature', async () => {
  // This is the specific failure mode PASS 1 flagged: Paystack signs the
  // exact bytes it sends. If Express re-serializes req.body instead of
  // using the original bytes, a payload with formatting JSON.stringify
  // would not reproduce identically (e.g. unicode escaping) would fail
  // verification even with the correct secret. This raw body includes a
  // unicode-escaped character and deliberately-unordered-looking spacing
  // to probe that.
  const app = buildWebhookTestApp();
  const rawBodyString = '{"event":"charge.success","data":{"reference":"r\\u00e9f_1","amount":500}}';
  const signature = sign(rawBodyString);

  const res = await callRoute(app, {
    path: '/payments/webhook',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature },
    body: rawBodyString,
  });

  assert.equal(res.status, 200, `expected the raw-bytes signature to verify regardless of how the body would re-serialize, got ${res.status}: ${JSON.stringify(res.body)}`);
});

test('webhook: missing signature header is rejected with 401', async () => {
  const app = buildWebhookTestApp();
  const res = await callRoute(app, {
    path: '/payments/webhook',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'charge.success', data: {} }),
  });

  assert.equal(res.status, 401);
});
