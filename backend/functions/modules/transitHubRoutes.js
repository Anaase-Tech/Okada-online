'use strict';

const { CORRIDORS, validateHub, buildJourneyPlan } = require('./transitHub');

function createTransitHubRouter({ express, db, admin, requireAuth, ok, fail, sanitize }) {
  const router = express.Router();
  const clean = (v, max = 180) => sanitize(String(v == null ? '' : v).trim()).slice(0, max);

  router.get('/hub', async (_req, res) => {
    try {
      const snap = await db.collection('stations').where('active', '==', true).where('city', '==', 'Koforidua').limit(20).get();
      return ok(res, { hub: { id: 'KOFORIDUA_HUB', name: 'Koforidua Hub', city: 'Koforidua', region: 'Eastern Region', stations: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }, corridors: CORRIDORS });
    } catch (_e) { return fail(res, 500, 'Unable to load Koforidua hub'); }
  });

  router.post('/hub', requireAuth, async (req, res) => {
    try {
      if (req.isAdmin !== true) return fail(res, 403, 'Admin access required');
      const hub = validateHub(req.body || {});
      const ref = await db.collection('transitHubs').doc('KOFORIDUA_HUB').set({
        ...hub,
        code: 'KOFORIDUA_HUB',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: req.uid,
      }, { merge: true });
      return ok(res, { hubId: 'KOFORIDUA_HUB' }, 201);
    } catch (e) { return fail(res, 400, e.message); }
  });

  router.get('/corridors', (_req, res) => ok(res, { corridors: CORRIDORS }));

  router.post('/journeys/plan', requireAuth, async (req, res) => {
    try {
      const plan = buildJourneyPlan({
        origin: req.body?.origin,
        destination: req.body?.destination,
        viaHub: req.body?.viaHub || 'Koforidua',
        serviceClass: req.body?.serviceClass || 'VIP',
        legs: req.body?.legs,
      });
      return ok(res, { journey: plan });
    } catch (e) { return fail(res, 400, e.message); }
  });

  router.post('/journeys/attach-pickup', requireAuth, async (req, res) => {
    try {
      const journeyId = clean(req.body?.journeyId, 120);
      const pickup = req.body?.pickup;
      if (!journeyId || !pickup) return fail(res, 400, 'journeyId and pickup are required');
      const ref = db.collection('journeys').doc(journeyId);
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Journey not found');
      const journey = snap.data();
      const ownerId = journey.passengerId || journey.userId || null;
      if (ownerId && ownerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Journey access denied');
      if (!ownerId && req.isAdmin !== true) return fail(res, 403, 'Journey access denied');
      await ref.update({ pickup: { ...pickup, source: pickup.source || 'OKADA_ONLINE', attachedAt: admin.firestore.FieldValue.serverTimestamp() }, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return ok(res, { journeyId, pickupAttached: true });
    } catch (_e) { return fail(res, 500, 'Unable to attach pickup'); }
  });

  router.post('/journeys/attach-final-mile', requireAuth, async (req, res) => {
    try {
      const journeyId = clean(req.body?.journeyId, 120);
      const finalMile = req.body?.finalMile;
      if (!journeyId || !finalMile) return fail(res, 400, 'journeyId and finalMile are required');
      const ref = db.collection('journeys').doc(journeyId);
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, 'Journey not found');
      const journey = snap.data();
      const ownerId = journey.passengerId || journey.userId || null;
      if (ownerId && ownerId !== req.uid && req.isAdmin !== true) return fail(res, 403, 'Journey access denied');
      if (!ownerId && req.isAdmin !== true) return fail(res, 403, 'Journey access denied');
      await ref.update({ finalMile: { ...finalMile, source: finalMile.source || 'OKADA_ONLINE', attachedAt: admin.firestore.FieldValue.serverTimestamp() }, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return ok(res, { journeyId, finalMileAttached: true });
    } catch (_e) { return fail(res, 500, 'Unable to attach final mile'); }
  });

  return router;
}

module.exports = { createTransitHubRouter };
