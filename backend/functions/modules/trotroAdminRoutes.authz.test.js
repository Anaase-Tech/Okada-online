'use strict';

// HTTP-level authorization test for trotroAdminRoutes.js, added in PASS 4.
//
// PASS 1 found that POST /verify/:type/:id/approve used `requireAdmin`
// without `requireAuth` running first. `requireAdmin` only checks
// `req.isAdmin`, which `requireAuth` is the sole setter of - so the route
// always returned 403, even for real admins. This test exercises the real
// exported router factory (not a reimplementation of it) with real HTTP
// requests, so a regression here is caught by `npm test`, not by manual
// code review.
//
// requireAuth/requireAdmin below are test doubles with the SAME observable
// contract as the real ones in v4Entry.js (same status codes, same
// req.uid/req.isAdmin semantics) - copied from v4Entry.js's own source
// rather than invented, and documented here so it's clear what is and
// isn't a real Firebase Admin SDK call. Real Firebase ID token
// verification and Firestore admin-doc lookups need either a live project
// or the Firebase emulator, neither of which is reachable from this
// sandboxed test environment (see PASS 4 report for details) - this test
// verifies the router's own middleware *wiring* is correct, which is
// exactly what PASS 1 found broken and PASS 4 corrects.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createTrotroAdminRouter } = require('./trotroAdminRoutes');

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

const ADMIN_UID = 'admin-uid-1';
const NON_ADMIN_UID = 'driver-uid-1';
const KNOWN_ADMINS = new Set([ADMIN_UID]);

// Faithful test double of v4Entry.js's requireAuth: same header check, same
// status codes, same req.uid/req.isAdmin assignment shape. The only
// difference is that "token verification" here is a lookup in a small
// in-memory map instead of a real admin.auth().verifyIdToken() call.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const token = header.slice(7);
  if (token === 'invalid-token') {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Test tokens are just the uid, e.g. "admin-uid-1" or "driver-uid-1".
  req.uid = token;
  req.isAdmin = KNOWN_ADMINS.has(token);
  return next();
}

// Identical, verbatim logic to v4Entry.js's requireAdmin (it has no
// external dependency at all, so it's copied exactly rather than doubled).
const requireAdmin = (req, res, next) =>
  req.isAdmin ? next() : res.status(403).json({ error: 'Admin access required' });

function buildApp() {
  const fail = (res, code, msg) => res.status(code).json({ error: msg });
  const ok = (res, data, code = 200) => res.status(code).json({ ok: true, ...data });

  const fakeAdminSdk = {
    firestore: {
      FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
    },
  };

  const records = new Map([
    ['op-1', { verificationStatus: 'PENDING' }],
  ]);

  const fakeDb = {
    collection(name) {
      assert.equal(name, 'trotroOperators', 'this test only exercises the operator-approval path');
      return {
        doc(id) {
          return {
            async get() {
              const data = records.get(id);
              return { exists: !!data, data: () => data };
            },
            async update(patch) {
              records.set(id, { ...(records.get(id) || {}), ...patch });
            },
          };
        },
      };
    },
  };

  const router = createTrotroAdminRouter({
    express,
    db: fakeDb,
    admin: fakeAdminSdk,
    requireAuth,
    ok,
    fail,
    requireAdmin,
  });

  const app = express();
  app.use(express.json());
  app.use('/trotro-admin', router);
  return { app, records };
}

test('POST /verify/:type/:id/approve - unauthenticated request is rejected with 401', async () => {
  const { app } = buildApp();
  const res = await callRoute(app, { path: '/trotro-admin/verify/operator/op-1/approve' });
  assert.equal(res.status, 401);
});

test('POST /verify/:type/:id/approve - authenticated non-admin is rejected with 403', async () => {
  const { app, records } = buildApp();
  const res = await callRoute(app, {
    path: '/trotro-admin/verify/operator/op-1/approve',
    headers: { Authorization: `Bearer ${NON_ADMIN_UID}` },
  });
  assert.equal(res.status, 403);
  assert.equal(records.get('op-1').verificationStatus, 'PENDING', 'a non-admin must not be able to approve');
});

test('POST /verify/:type/:id/approve - authenticated admin succeeds (this is the PASS 1/PASS 4 fix)', async () => {
  const { app, records } = buildApp();
  const res = await callRoute(app, {
    path: '/trotro-admin/verify/operator/op-1/approve',
    headers: { Authorization: `Bearer ${ADMIN_UID}` },
  });
  assert.equal(res.status, 200, `expected a real admin to succeed, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(records.get('op-1').verificationStatus, 'APPROVED');
});

test('POST /verify/:type/:id/approve - invalid token is rejected with 401', async () => {
  const { app } = buildApp();
  const res = await callRoute(app, {
    path: '/trotro-admin/verify/operator/op-1/approve',
    headers: { Authorization: 'Bearer invalid-token' },
  });
  assert.equal(res.status, 401);
});
