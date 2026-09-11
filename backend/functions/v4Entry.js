'use strict';

// Okada Online V4 integration entrypoint.
// Loads the legacy production API and mounts V4 domain routers before the
// legacy catch-all 404 layer. Existing functionality remains available.

const express = require('express');
const expressCache = require.cache[require.resolve('express')];
const previousExpressExport = expressCache.exports;
let capturedApp = null;

function captureExpress(...args) {
  capturedApp = express(...args);
  return capturedApp;
}
Object.assign(captureExpress, express);
Object.setPrototypeOf(captureExpress, Object.getPrototypeOf(express));
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
  try {
    const decoded = await auth.verifyIdToken(header.slice('Bearer '.length));
    req.uid = decoded.uid;
    const adminSnap = await db.collection('admins').doc(req.uid).get();
    req.isAdmin = adminSnap.exists;
    return next();
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

const { createTrotroRouter } = require('./modules/trotroRoutesV2');
const { createTrotroAdminRouter } = require('./modules/trotroAdminRoutes');
const { createTransitRouter } = require('./modules/transitRoutes');
const { createTransitBookingRouter } = require('./modules/transitBookingRoutes');

const trotroRouter = createTrotroRouter({ express, db, admin, requireAuth, fail, ok, sanitize });
const trotroAdminRouter = createTrotroAdminRouter({ express, db, admin, requireAuth, ok, fail,
  requireAdmin: async (req, res, next) => {
    if (req.isAdmin === true) return next();
    return res.status(403).json({ error: 'Admin access required' });
  },
});
const transitRouter = createTransitRouter({ express, db, admin, requireAuth, fail, ok, sanitize });
const transitBookingRouter = createTransitBookingRouter({ express, db, admin, requireAuth, fail, ok, sanitize });

const stack = capturedApp._router?.stack;
if (!Array.isArray(stack)) throw new Error('V4 integration failed: Express router stack unavailable');

const terminal404Index = stack.findIndex((layer) => layer && layer.handle && !layer.route && layer.handle.length === 2);
const insertIndex = terminal404Index >= 0 ? terminal404Index : stack.length;

const v4LayerFactory = express.Router();
v4LayerFactory.use('/trotro', trotroRouter);
v4LayerFactory.use('/trotro-admin', trotroAdminRouter);
v4LayerFactory.use('/transit', transitRouter);
v4LayerFactory.use('/transit', transitBookingRouter);
const v4Layers = v4LayerFactory._router?.stack || [];
stack.splice(insertIndex, 0, ...v4Layers);

console.log(`✅ Okada Online V4 mounted: /trotro + /trotro-admin + /transit (${v4Layers.length} layers)`);

module.exports = legacy;
