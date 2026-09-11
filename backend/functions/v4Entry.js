'use strict';

const express = require('express');
const expressCache = require.cache[require.resolve('express')];
const previousExpressExport = expressCache.exports;
let capturedApp = null;
function captureExpress(...args) { capturedApp = express(...args); return capturedApp; }
Object.assign(captureExpress, express);
Object.setPrototypeOf(captureExpress, Object.getPrototypeOf(express));
expressCache.exports = captureExpress;
let legacy;
try { legacy = require('./index'); } finally { expressCache.exports = previousExpressExport; }
if (!capturedApp) throw new Error('V4 integration failed: legacy Express app was not captured');
const admin = require('firebase-admin');
const db = admin.firestore();
const auth = admin.auth();
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing authorization token' });
  try {
    const decoded = await auth.verifyIdToken(header.slice(7));
    req.uid = decoded.uid;
    req.isAdmin = (await db.collection('admins').doc(req.uid).get()).exists;
    return next();
  } catch (_err) { return res.status(401).json({ error: 'Invalid or expired token' }); }
}
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const ok = (res, data, code = 200) => res.status(code).json({ ok: true, ...data });
const { createTrotroRouter } = require('./modules/trotroRoutesV2');
const { createTrotroAdminRouter } = require('./modules/trotroAdminRoutes');
const { createTransitRouter } = require('./modules/transitRoutes');
const { createTransitBookingRouter } = require('./modules/transitBookingRoutes');
const { createTransitHubRouter } = require('./modules/transitHubRoutes');
const { createVipTransitRouter } = require('./modules/vipTransitRoutes');
const { createJourneyBookingRouter } = require('./modules/journeyBookingRoutes');
const trotroRouter = createTrotroRouter({ express, db, admin, requireAuth, fail, ok, sanitize: (v) => String(v ?? '').replace(/[<>"'`\\]/g, '').trim().slice(0, 500) });
const trotroAdminRouter = createTrotroAdminRouter({ express, db, admin, requireAuth, ok, fail, requireAdmin: (req, res, next) => req.isAdmin ? next() : res.status(403).json({ error: 'Admin access required' }) });
const transitRouter = createTransitRouter({ express, db, admin, requireAuth, fail, ok, sanitize: (v) => String(v ?? '').replace(/[<>"'`\\]/g, '').trim().slice(0, 500) });
const transitBookingRouter = createTransitBookingRouter({ express, db, admin, requireAuth, fail, ok, sanitize: (v) => String(v ?? '').replace(/[<>"'`\\]/g, '').trim().slice(0, 500) });
const transitHubRouter = createTransitHubRouter({ express, db, admin, requireAuth, fail, ok, sanitize: (v) => String(v ?? '').replace(/[<>"'`\\]/g, '').trim().slice(0, 500) });
const vipTransitRouter = createVipTransitRouter({ express, db, admin, requireAuth, fail, ok, sanitize: (v) => String(v ?? '').replace(/[<>"'`\\]/g, '').trim().slice(0, 500) });
const journeyBookingRouter = createJourneyBookingRouter({ express, db, admin, requireAuth, fail, ok });
const stack = capturedApp._router?.stack;
if (!Array.isArray(stack)) throw new Error('V4 integration failed: Express router stack unavailable');
const terminal404Index = stack.findIndex((layer) => layer && layer.handle && !layer.route && layer.handle.length === 2);
const insertIndex = terminal404Index >= 0 ? terminal404Index : stack.length;
const v4 = express.Router();
v4.use('/trotro', trotroRouter);
v4.use('/trotro-admin', trotroAdminRouter);
v4.use('/transit', transitRouter);
v4.use('/transit', transitBookingRouter);
v4.use('/transit', transitHubRouter);
v4.use('/transit', vipTransitRouter);
v4.use('/journeys', journeyBookingRouter);
const layers = v4._router?.stack || [];
stack.splice(insertIndex, 0, ...layers);
console.log(`Okada V4 mounted: /trotro + /trotro-admin + /transit + /journeys (${layers.length} layers)`);
module.exports = legacy;
