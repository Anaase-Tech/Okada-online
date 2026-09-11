'use strict';

// V4 integration entrypoint.
// Loads the existing production API unchanged, captures its Express app,
// then inserts the new Trotro router immediately before the legacy 404 handler.
// This keeps the large legacy index.js stable while V4 domains are integrated.

const expressModule = require('express');
let capturedApp = null;

const originalExpress = expressModule;
function captureExpress(...args) {
  capturedApp = originalExpress(...args);
  return capturedApp;
}
Object.assign(captureExpress, originalExpress);
Object.setPrototypeOf(captureExpress, Object.getPrototypeOf(originalExpress));

const expressCache = require.cache[require.resolve('express')];
const previousExpressExport = expressCache.exports;
expressCache.exports = captureExpress;

let legacy;
try {
  legacy = require('./index');
} finally {
  expressCache.exports = previousExpressExport;
}

if (!capturedApp) throw new Error('V4 integration failed: legacy Express app was not captured');

const admin = require('firebase-admin');
const db = admin.firestore();
const auth = admin.auth();

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing authorization token' });
  const token = header.slice('Bearer '.length);
  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (_err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function sanitize(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/[<>"'`\\]/g, '').trim().substring(0, 500);
}

const fail = (res, code, msg) => res.status(code).json({ error: msg });
const ok = (res, data, code = 200) => res.status(code).json({ ok: true, ...data });

const { createTrotroRouter } = require('./modules/trotroRoutes');
const trotroRouter = createTrotroRouter({
  express: originalExpress,
  db,
  admin,
  requireAuth,
  fail,
  ok,
  sanitize,
});

// index.js installs its catch-all 404 middleware before exporting the app.
// Insert the V4 router before that terminal layer so /trotro/* is reachable.
const stack = capturedApp._router?.stack;
if (!Array.isArray(stack)) throw new Error('V4 integration failed: Express router stack unavailable');
const terminal404Index = stack.findIndex((layer) => layer && layer.handle && !layer.route && layer.handle.length === 2 && !layer.name?.toLowerCase?.().includes('cors'));
const insertIndex = terminal404Index >= 0 ? terminal404Index : stack.length;

const layerFactory = originalExpress.Router();
layerFactory.use('/trotro', trotroRouter);
const newLayers = layerFactory._router?.stack || [];
stack.splice(insertIndex, 0, ...newLayers);

console.log(`✅ Okada Online V4 Trotro router mounted at /trotro (${newLayers.length} middleware layers)`);

module.exports = legacy;
