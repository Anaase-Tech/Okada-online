'use strict';


// ╔══════════════════════════════════════════════════════════════════╗
// ║   OKADA ONLINE — COMPLETE PRODUCTION BACKEND v3.0               ║
// ║   Firebase Functions · All modules · Security hardened          ║
// ║                                                                  ║
// ║   REVENUE SPLIT (updated):                                       ║
// ║     Owner 50% · Driver 25% · Fuel 5% · Maintenance 5%           ║
// ║     Platform 15%                                                 ║
// ║   BONUS SYSTEM:                                                  ║
// ║     +2% female drivers · +2% EV vehicles · +2% referral fund    ║
// ║                                                                  ║
// ║   Auth: Firebase Phone Auth (no Twilio)                         ║
// ║   Fintech: Savings · Loans · Insurance · Pay Later · Wallet     ║
// ║   Drive to Own: Track A (driver) · Track B (owner)              ║
// ║   Verification: KYC · License · Vehicle · Admin queue           ║
// ╚══════════════════════════════════════════════════════════════════╝

const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const express   = require('express');
const cors      = require('cors');
const axios     = require('axios');
const crypto    = require('crypto');
const {
  settleSuccessfulJourneyPayment,
  settleFailedJourneyPayment,
} = require('./modules/journeyPaymentService');
const {
  settleRidePayment,
  markRidePaymentFailed,
} = require('./modules/legacyPaymentService');

admin.initializeApp();
const db   = admin.firestore();
const auth = admin.auth();

const app = express();

// ════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARE
// ════════════════════════════════════════════════════════════

// Strict CORS — only allow your domain
// NOTE: allowedHeaders must list every custom header the frontend sends.
// api.js sends X-Platform on every request; it was missing here, which
// made the browser silently block the *real* request after a successful
// CORS preflight (OPTIONS 204) — verified against production logs, where
// every /auth/create-profile hit was an OPTIONS with zero matching POSTs.
app.use(cors({
  origin: [
    'https://okada-online.vercel.app',
    'https://okadaonline.com',
    'http://localhost:3000', // dev only
  ],
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization','X-Request-ID','X-Platform'],
  credentials: true,
}));

app.use(express.json({ limit: '50kb' })); // prevent large payload attacks

// ── Request ID for tracing ──────────────────────────────────
app.use((req, _res, next) => {
  req.requestId = crypto.randomUUID();
  next();
});

// ── In-memory rate limiter (per IP) ────────────────────────
// KNOWN LIMITATION: this only rate-limits within a single warm function
// instance. Cloud Functions can and will run several instances at once
// under real load, each with its own empty Map, so this is a soft
// speed-bump, not a hard guarantee, against abuse at scale. Fine for
// launch; revisit with Firestore- or Redis-backed limiting before
// meaningful traffic.
const rateLimitStore = new Map();
function rateLimit(maxReqs = 60, windowMs = 60000) {
  return (req, res, next) => {
    const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count++;
    rateLimitStore.set(key, entry);
    if (entry.count > maxReqs) {
      return res.status(429).json({ error: 'Too many requests — slow down' });
    }
    next();
  };
}

// Strict rate limit for auth routes
const authLimit   = rateLimit(10, 60000);  // 10/min
const globalLimit = rateLimit(120, 60000); // 120/min general
app.use(globalLimit);

// ── Firebase Auth middleware ────────────────────────────────
// Every request must carry a real Firebase ID token. The previous
// version accepted the literal string "demo_token" as valid auth for
// *any* userId supplied in the request body — a live authentication
// bypass reachable by anyone, not a real demo mode. Removed. The app's
// actual demo experience is (and always should be) a purely client-side
// simulation that never expects a real write to succeed on the backend.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Missing authorization token' });
  const token = header.split('Bearer ')[1];
  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    console.error('Token verification failed:', e.code || e.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Admin-only middleware ───────────────────────────────────
async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    const snap = await db.collection('admins').doc(req.uid).get();
    if (!snap.exists) return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

// ── Input sanitiser ─────────────────────────────────────────
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>"'`\\]/g, '').trim().substring(0, 500);
}

// ── Cross-collection user lookup ─────────────────────────────
// A userId can live in 'users' (passengers), 'drivers', or 'owners'.
// Many fintech routes (savings, loans, insurance, wallet) are shared
// across all three roles but used to hardcode db.collection('users'),
// which meant they 404'd — or worse, silently wrote a stray new
// document — for every driver and owner. This resolves the real
// collection a given userId actually lives in.
async function resolveUserRef(userId) {
  const id = sanitize(userId);
  for (const col of ['users', 'drivers', 'owners']) {
    const ref  = db.collection(col).doc(id);
    const snap = await ref.get();
    if (snap.exists) return { ref, col, data: snap.data() };
  }
  return null;
}

// ── Helpers ─────────────────────────────────────────────────
const fail = (res, code, msg) =>
  res.status(code).json({ error: msg });
const ok = (res, data) =>
  res.status(200).json({ ok: true, ...data });

const toRad = d => d * Math.PI / 180;
function haversine(la1, lo1, la2, lo2) {
  const dLa = toRad(la2 - la1), dLo = toRad(lo2 - lo1);
  const a = Math.sin(dLa/2)**2
    + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function genCode(prefix = 'OKD', len = 8) {
  return `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
    + `-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// ════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════
const CFG = {
  // ── Revenue splits ────────────────────────────────────────
  splits: {
    platform:    0.15,
    owner:       0.50,
    driver:      0.25,
    fuel:        0.05,   // combined fuel + maintenance
    maintenance: 0.05,
  },
  // ── Bonus incentives ──────────────────────────────────────
  bonus: {
    female:   0.02,  // extra 2% to female driver — deducted from platform share
    ev:       0.02,  // extra 2% to EV vehicle driver
    referral: 0.02,  // 2% to referral reward pool per new referral's ride
  },
  // ── Fares ─────────────────────────────────────────────────
  fare: {
    base: 3.0,
    okada: 2.5, car: 4.0, tricycle: 3.0, bicycle: 1.5, ev: 2.0,
    min: 5.0,
  },
  // ── Drive to Own ──────────────────────────────────────────
  dto: {
    trackARate:     0.35,  // 35% of driver earnings to loan
    trackBRate:     0.40,  // 40% of owner share to loan
    ownerDownPct:   0.30,  // 30% upfront
    adminFee:       0.025,
    defaultDays:    90,
    fuelCodeSecs:   600,   // 10 min
    minRidesApply:  10,
    vehicles: {
      okada:    { name: 'Motorcycle (Okada)',  price: 12000,  track: 'A' },
      tricycle: { name: 'Tricycle (Pragya)',   price: 18000,  track: 'A' },
      ev_bike:  { name: 'Electric Motorcycle', price: 22000,  track: 'A' },
      k71:      { name: 'Kantanka K71 SUV',   price: 105000, track: 'B' },
      omama:    { name: 'Kantanka Omama 4×4', price: 150000, track: 'B' },
    },
  },
  // ── Fintech ───────────────────────────────────────────────
  savings: { annualRate: 0.08, monthlyRate: 0.006667, maxRate: 30 },
  loans:   { deductPerRide: 0.03, autoApproveLimit: 500, maxMonthlyRate: 0.05 },
  insurance: {
    basic:   { name: 'Basic Rider',   premium: 15, cover: 2000  },
    standard:{ name: 'Standard',      premium: 35, cover: 8000  },
    premium: { name: 'Premium Fleet', premium: 80, cover: 25000 },
  },
  payLater: { defaultLimit: 50, deferDays: 7 },
};

// ════════════════════════════════════════════════════════════
// FIRESTORE SECURITY RULES (write to firestore.rules)
// These are enforced server-side — DO NOT remove
// ════════════════════════════════════════════════════════════
// See: firestore.rules file (deployed separately)

// ════════════════════════════════════════════════════════════
// A. AUTH — Firebase Phone Auth (no Twilio)
// ════════════════════════════════════════════════════════════

// POST /auth/create-profile
// Called after Firebase client-side phone verification
// Body: { firebaseUid, phone, role, name, ownerCode? }
app.post('/auth/create-profile', authLimit, requireAuth, async (req, res) => {
  try {
    const {
      firebaseUid, phone, role, name, ownerCode, referredBy
    } = req.body;

    if (!phone || !role || !name)
      return fail(res, 400, 'phone, role, name required');

    const validRoles = ['passenger','driver','owner','admin'];
    if (!validRoles.includes(sanitize(role)))
      return fail(res, 400, 'Invalid role');

    // Validate owner code for drivers
    if (role === 'driver' && ownerCode) {
      const owSnap = await db.collection('owners')
        .where('ownerCode', '==', sanitize(ownerCode)).get();
      if (owSnap.empty)
        return fail(res, 400, 'Invalid owner code');
    }

    const col = { driver:'drivers', owner:'owners', admin:'admins' }[role] || 'users';

    // Idempotent — return existing profile if already created.
    // Matches by firebaseUid first (authoritative identity), falling back
    // to phone only for legacy records that predate this field being
    // reliably set. This avoids the previous phone-only check creating a
    // duplicate profile in a different collection if the same person ever
    // re-registers under a different role by mistake.
    const uidMatch = await db.collection(col)
      .where('firebaseUid', '==', req.uid).limit(1).get();
    if (!uidMatch.empty) {
      return ok(res, { user: { id: uidMatch.docs[0].id, ...uidMatch.docs[0].data() }, isNew: false });
    }
    const existing = await db.collection(col)
      .where('phone', '==', sanitize(phone)).get();
    if (!existing.empty) {
      return ok(res, { user: { id: existing.docs[0].id, ...existing.docs[0].data() }, isNew: false });
    }

    const base = {
      firebaseUid: sanitize(firebaseUid || req.uid),
      phone:       sanitize(phone),
      name:        sanitize(name),
      role,
      rating:      5.0,
      totalRides:  0,
      isActive:    true,
      kycStatus:   'pending',   // pending → submitted → approved → rejected
      licenseStatus: 'pending', // for drivers/owners
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    };

    if (role === 'driver') Object.assign(base, {
      ownerCode:   sanitize(ownerCode || ''),
      isOnline:    false,
      isVerified:  false,
      gender:      null,       // set during profile completion
      vehicleType: null,
      isEV:        false,
      earnings:    { total: 0, today: 0, week: 0 },
      pools:       { fuel: 0, maintenance: 0 },
      wallet:      { available: 0, pending: 0 },
      savings:     { balance: 0, totalDeposited: 0, interestEarned: 0 },
      location:    null,
      disputes:    0,
    });

    if (role === 'owner') Object.assign(base, {
      ownerCode: 'OWN' + crypto.randomBytes(3).toString('hex').toUpperCase(),
      vehicles:  [],
      earnings:  { total: 0, today: 0, week: 0 },
      pools:     { fuel: 0, maintenance: 0 },
      wallet:    { available: 0, pending: 0 },
      savings:   { balance: 0, totalDeposited: 0, interestEarned: 0 },
      disputes:  0,
    });

    if (role === 'passenger') Object.assign(base, {
      wallet:    { available: 0, pending: 0 },
      savings:   { balance: 0, totalDeposited: 0, interestEarned: 0 },
      payLater:  { limit: CFG.payLater.defaultLimit, used: 0, suspended: false },
      referredBy: sanitize(referredBy || ''),
      disputes:  0,
    });

    const ref = await db.collection(col).add(base);

    // Handle referral reward
    if (referredBy) {
      await db.collection('referrals').add({
        referrerId: sanitize(referredBy),
        newUserId:  ref.id,
        role,
        status:     'pending', // activates after first ride
        createdAt:  admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Queue for admin welcome + KYC prompt notification
    await db.collection('notifications').add({
      userId: ref.id, type: 'welcome', role,
      message: `Welcome to Okada Online! Complete your KYC to start.`,
      read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok(res, { user: { id: ref.id, ...base }, isNew: true });
  } catch (e) {
    console.error('create-profile error:', e);
    return fail(res, 500, 'Profile creation failed');
  }
});

// GET /auth/profile/:uid
app.get('/auth/profile/:uid', requireAuth, async (req, res) => {
  try {
    const uid = sanitize(req.params.uid);
    const cols = ['users','drivers','owners','admins'];
    for (const col of cols) {
      const snap = await db.collection(col)
        .where('firebaseUid','==', uid).limit(1).get();
      if (!snap.empty) {
        return ok(res, { user: { id: snap.docs[0].id, ...snap.docs[0].data() } });
      }
    }
    return fail(res, 404, 'Profile not found');
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// B. KYC & VERIFICATION
// ════════════════════════════════════════════════════════════

// POST /verify/kyc
// Submit Ghana Card or Passport
// Body: { userId, role, docType, docNumber, docImageBase64, selfieBase64 }
app.post('/verify/kyc', requireAuth, async (req, res) => {
  try {
    const { userId, role, docType, docNumber, docImageBase64, selfieBase64 } = req.body;
    if (!userId || !docType || !docNumber)
      return fail(res, 400, 'userId, docType, docNumber required');

    const validDocs = ['ghana_card','passport','voters_id'];
    if (!validDocs.includes(sanitize(docType)))
      return fail(res, 400, 'Invalid document type');

    // Store submission (base64 stored in Firebase Storage in production)
    const sub = await db.collection('kyc_submissions').add({
      userId:    sanitize(userId),
      role:      sanitize(role),
      docType:   sanitize(docType),
      docNumber: sanitize(docNumber),
      // In production: upload base64 to Firebase Storage, store URL here
      hasDocImage: !!docImageBase64,
      hasSelfie:   !!selfieBase64,
      status:    'pending_review',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedAt:  null,
      reviewedBy:  null,
      notes:       '',
    });

    // Update user KYC status
    const col = { driver:'drivers', owner:'owners' }[role] || 'users';
    await db.collection(col).doc(userId).update({
      kycStatus:       'submitted',
      kycSubmissionId: sub.id,
    });

    // Add to admin queue
    await db.collection('admin_queue').add({
      type:     'kyc_review',
      subId:    sub.id,
      userId,   role,
      priority: 'normal',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok(res, { submissionId: sub.id, status: 'pending_review',
      message: 'KYC submitted. Admin review within 24 hours.' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// POST /verify/license
// Submit driver/rider license
// Body: { userId, licenseNumber, licenseClass, expiryDate, licenseImageBase64 }
app.post('/verify/license', requireAuth, async (req, res) => {
  try {
    const { userId, licenseNumber, licenseClass, expiryDate, licenseImageBase64 } = req.body;
    if (!userId || !licenseNumber || !licenseClass || !expiryDate)
      return fail(res, 400, 'userId, licenseNumber, licenseClass, expiryDate required');

    // Check expiry
    const expiry = new Date(expiryDate);
    if (expiry < new Date())
      return fail(res, 400, 'License has expired — cannot submit');

    const sub = await db.collection('license_submissions').add({
      userId:        sanitize(userId),
      licenseNumber: sanitize(licenseNumber),
      licenseClass:  sanitize(licenseClass),
      expiryDate:    expiry,
      hasImage:      !!licenseImageBase64,
      status:        'pending_review',
      submittedAt:   admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('drivers').doc(userId).update({
      licenseStatus:       'submitted',
      licenseSubmissionId: sub.id,
      licenseExpiry:       expiry,
    });

    await db.collection('admin_queue').add({
      type:     'license_review',
      subId:    sub.id,
      userId,   priority: 'normal',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok(res, { submissionId: sub.id, status: 'pending_review' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// POST /verify/vehicle
// Submit vehicle registration + roadworthy + insurance
// Body: { userId, plate, make, model, year, vehicleType, isEV,
//         regCertBase64, roadworthyBase64, insuranceCertBase64 }
app.post('/verify/vehicle', requireAuth, async (req, res) => {
  try {
    const {
      userId, plate, make, model, year, vehicleType, isEV,
      regCertBase64, roadworthyBase64, insuranceCertBase64
    } = req.body;
    if (!userId || !plate || !vehicleType)
      return fail(res, 400, 'userId, plate, vehicleType required');

    const sub = await db.collection('vehicle_submissions').add({
      userId:      sanitize(userId),
      plate:       sanitize(plate).toUpperCase(),
      make:        sanitize(make || ''),
      model:       sanitize(model || ''),
      year:        parseInt(year) || new Date().getFullYear(),
      vehicleType: sanitize(vehicleType),
      isEV:        !!isEV,
      hasRegCert:       !!regCertBase64,
      hasRoadworthy:    !!roadworthyBase64,
      hasInsuranceCert: !!insuranceCertBase64,
      status:    'pending_review',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('drivers').doc(userId).update({
      vehicleStatus: 'submitted',
      vehicleSubId:  sub.id,
      vehicleType:   sanitize(vehicleType),
      isEV:          !!isEV,
      plate:         sanitize(plate).toUpperCase(),
    });

    await db.collection('admin_queue').add({
      type:     'vehicle_review',
      subId:    sub.id,
      userId,   priority: 'normal',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok(res, { submissionId: sub.id, status: 'pending_review' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// POST /verify/:type/:subId/approve  (admin only)
app.post('/verify/:type/:subId/approve', requireAdmin, async (req, res) => {
  try {
    const { type, subId } = req.params;
    const { notes } = req.body;

    const colMap = {
      kyc:     'kyc_submissions',
      license: 'license_submissions',
      vehicle: 'vehicle_submissions',
    };
    if (!colMap[type]) return fail(res, 400, 'Invalid type');

    const subRef = db.collection(colMap[type]).doc(subId);
    const sub = await subRef.get();
    if (!sub.exists) return fail(res, 404, 'Submission not found');

    await subRef.update({
      status: 'approved',
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewedBy: req.uid,
      notes: sanitize(notes || ''),
    });

    const userId = sub.data().userId;
    const userCol = sub.data().role === 'owner' ? 'owners' : 'drivers';

    // Update user record
    const fieldMap = {
      kyc:     { kycStatus: 'approved' },
      license: { licenseStatus: 'approved' },
      vehicle: { vehicleStatus: 'approved', isVerified: true },
    };

    // Check if all 3 verifications done — then fully activate driver
    const driverSnap = await db.collection('drivers').doc(userId).get();
    if (driverSnap.exists) {
      const d = driverSnap.data();
      const updates = { ...fieldMap[type] };
      const kycOk     = type==='kyc'     || d.kycStatus==='approved';
      const licOk     = type==='license' || d.licenseStatus==='approved';
      const vehOk     = type==='vehicle' || d.vehicleStatus==='approved';
      if (kycOk && licOk && vehOk) {
        updates.isVerified = true;
        updates.activatedAt = admin.firestore.FieldValue.serverTimestamp();
        // Notify driver they're fully approved
        await db.collection('notifications').add({
          userId, type: 'fully_verified',
          message: '🎉 You are fully verified! You can now go online and start earning.',
          read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await db.collection('drivers').doc(userId).update(updates);
    } else {
      await db.collection('users').doc(userId).update(fieldMap[type]);
    }

    // Remove from admin queue
    const q = await db.collection('admin_queue')
      .where('subId','==',subId).get();
    for (const doc of q.docs) await doc.ref.delete();

    return ok(res, { subId, status: 'approved' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// POST /verify/:type/:subId/reject  (admin only)
app.post('/verify/:type/:subId/reject', requireAdmin, async (req, res) => {
  try {
    const { type, subId } = req.params;
    const { reason } = req.body;
    if (!reason) return fail(res, 400, 'Rejection reason required');

    const colMap = {
      kyc: 'kyc_submissions',
      license: 'license_submissions',
      vehicle: 'vehicle_submissions',
    };
    const subRef = db.collection(colMap[type]).doc(subId);
    const sub = await subRef.get();
    if (!sub.exists) return fail(res, 404, 'Not found');

    await subRef.update({
      status: 'rejected',
      rejectedAt:  admin.firestore.FieldValue.serverTimestamp(),
      rejectionReason: sanitize(reason),
      reviewedBy: req.uid,
    });

    const fieldMap = {
      kyc:     { kycStatus: 'rejected' },
      license: { licenseStatus: 'rejected' },
      vehicle: { vehicleStatus: 'rejected' },
    };
    const userId = sub.data().userId;
    const col = sub.data().role === 'owner' ? 'owners' : 'drivers';
    await db.collection(col).doc(userId).update(fieldMap[type]);

    await db.collection('notifications').add({
      userId, type: `${type}_rejected`,
      message: `Your ${type} verification was rejected: ${sanitize(reason)}. Please resubmit.`,
      read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok(res, { subId, status: 'rejected' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// GET /admin/queue  (admin only)
app.get('/admin/queue', requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection('admin_queue')
      .orderBy('createdAt', 'asc').limit(50).get();
    return ok(res, { queue: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// C. RIDES
// ════════════════════════════════════════════════════════════

app.post('/rides/request', requireAuth, async (req, res) => {
  try {
    const { userId, pickupLocation, destination, rideType } = req.body;
    if (!userId || !pickupLocation || !destination)
      return fail(res, 400, 'userId, pickupLocation, destination required');

    const userDoc = await db.collection('users').doc(sanitize(userId)).get();
    if (!userDoc.exists) return fail(res, 404, 'User not found');

    const km = haversine(
      pickupLocation.latitude, pickupLocation.longitude,
      destination.latitude,    destination.longitude
    );
    const fare = calcFareSplits(sanitize(rideType || 'okada'), km, null);

    const ride = {
      userId: sanitize(userId),
      userName:  sanitize(userDoc.data().name),
      userPhone: sanitize(userDoc.data().phone),
      pickupLocation: {
        address:   sanitize(pickupLocation.address || 'Pickup'),
        latitude:  parseFloat(pickupLocation.latitude),
        longitude: parseFloat(pickupLocation.longitude),
      },
      destination: {
        address:   sanitize(destination.address || 'Destination'),
        latitude:  parseFloat(destination.latitude),
        longitude: parseFloat(destination.longitude),
      },
      rideType:          sanitize(rideType || 'okada'),
      status:            'requested',
      fare,
      distance:          +km.toFixed(2),
      estimatedDuration: Math.ceil(km * 3),
      createdAt:         admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('rides').add(ride);

    // Notify nearby verified online drivers
    const drivers = await db.collection('drivers')
      .where('isOnline', '==', true)
      .where('isVerified', '==', true).get();
    let notified = 0;
    for (const d of drivers.docs) {
      const loc = d.data().location;
      if (!loc) continue;
      if (haversine(pickupLocation.latitude, pickupLocation.longitude,
                    loc.latitude, loc.longitude) > 5) continue;
      await db.collection('notifications').add({
        driverId: d.id, type: 'new_ride', rideId: ref.id,
        message:  `New ride: ${ride.pickupLocation.address} → ${ride.destination.address} | ₵${fare.total}`,
        read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      notified++;
    }

    return ok(res, { rideId: ref.id, fare, nearbyDriversNotified: notified });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/rides/:rideId/accept', requireAuth, async (req, res) => {
  try {
    const rideRef = db.collection('rides').doc(req.params.rideId);
    const ride = await rideRef.get();
    if (!ride.exists) return fail(res, 404, 'Ride not found');
    if (ride.data().status !== 'requested')
      return fail(res, 400, 'Ride no longer available');

    const driver = await db.collection('drivers').doc(sanitize(req.body.driverId)).get();
    if (!driver.exists || !driver.data().isVerified)
      return fail(res, 403, 'Driver not verified');

    await rideRef.update({
      driverId:    driver.id,
      driverName:  sanitize(driver.data().name),
      driverPhone: sanitize(driver.data().phone),
      driverRating: driver.data().rating || 5.0,
      status:      'accepted',
      acceptedAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    // Notify passenger via Firestore notification
    await db.collection('notifications').add({
      userId:   ride.data().userId,
      type:     'ride_accepted',
      message:  `🏍️ ${driver.data().name} is on the way!`,
      rideId:   req.params.rideId,
      read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok(res, { message: 'Ride accepted' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/rides/:rideId/complete', requireAuth, async (req, res) => {
  try {
    const rideRef = db.collection('rides').doc(req.params.rideId);
    const ride    = await rideRef.get();
    if (!ride.exists || ride.data().status === 'completed')
      return fail(res, 400, 'Invalid ride');

    const rideData  = ride.data();
    const driverId  = rideData.driverId;
    const driverDoc = await db.collection('drivers').doc(driverId).get();
    const driverData = driverDoc.data();

    // Recalculate fare with driver bonuses
    const fare = calcFareSplits(
      rideData.rideType,
      rideData.distance,
      driverData
    );

    // Get owner
    let ownerDoc = null;
    if (driverData.ownerCode) {
      const owSnap = await db.collection('owners')
        .where('ownerCode','==', driverData.ownerCode).get();
      if (!owSnap.empty) ownerDoc = owSnap.docs[0];
    }

    // ── Drive to Own deductions ──────────────────────────
    let dtoDeduction = 0;
    const dtoSnap = await db.collection('dto_applications')
      .where('userId','==', driverId)
      .where('status','==','active').limit(1).get();
    if (!dtoSnap.empty) {
      const dto = dtoSnap.docs[0];
      dtoDeduction = +(fare.total * CFG.dto.trackARate).toFixed(2);
      const newPaid    = +(dto.data().totalPaid + dtoDeduction).toFixed(2);
      const remaining  = +(dto.data().vehiclePrice - newPaid).toFixed(2);
      const isComplete = remaining <= 0;
      await dto.ref.update({
        totalPaid: newPaid,
        remaining: Math.max(remaining, 0),
        status:    isComplete ? 'completed' : 'active',
        lastPayment: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (isComplete) {
        await db.collection('drivers').doc(driverId).update({
          vehicleOwned: true, vehicleDocumentsReleased: true,
        });
        await db.collection('notifications').add({
          userId: driverId, type: 'dto_completed',
          message: '🎉 Congratulations! Your vehicle is FULLY PAID OFF! Documents will be released within 48hrs. You OWN your vehicle! 🇬🇭',
          read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    // ── Owner DTO (Track B) + savings auto-deduct ────────
    // NOTE: previously the Track B deduction was only ever used to move
    // the DTO application's progress bar — the owner's actual wallet
    // credit below still added the FULL fare.owner regardless, so a
    // Track B owner kept 100% of their pay while "progress" quietly
    // built up on paper with no real money ever set aside for it. Both
    // deductions below now actually reduce what the owner is credited,
    // mirroring how the driver's dtoDeduction/saveAmount already worked.
    let ownerDtoDeduction = 0;
    let ownerSaveAmount = 0;
    if (ownerDoc) {
      const ownerDtoSnap = await db.collection('dto_applications')
        .where('userId','==', ownerDoc.id)
        .where('status','==','active').limit(1).get();
      if (!ownerDtoSnap.empty) {
        const od = ownerDtoSnap.docs[0];
        ownerDtoDeduction = +(fare.owner * CFG.dto.trackBRate).toFixed(2);
        const owPaid = +(od.data().totalPaid + ownerDtoDeduction).toFixed(2);
        const owRem  = +(od.data().vehiclePrice * 0.70 - owPaid).toFixed(2);
        const owComplete = owRem <= 0;
        await od.ref.update({
          totalPaid: owPaid,
          remaining: Math.max(owRem, 0),
          status:    owComplete ? 'completed' : 'active',
          lastPayment: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (owComplete) {
          await ownerDoc.ref.update({ vehicleOwned: true, vehicleDocumentsReleased: true });
          await db.collection('notifications').add({
            userId: ownerDoc.id, type: 'dto_completed',
            message: '🎉 Congratulations! Your vehicle is FULLY PAID OFF! Documents will be released within 48hrs. You OWN your vehicle! 🇬🇭',
            read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // Auto-save from the owner's share — same mechanism the driver
      // already had, just never wired for owners until now.
      const ownerSaveRate = ownerDoc.data().savingsRate || 0;
      ownerSaveAmount = ownerSaveRate > 0
        ? +(fare.owner * ownerSaveRate / 100).toFixed(2) : 0;
      if (ownerSaveAmount > 0) {
        await db.collection('savings_transactions').add({
          userId: ownerDoc.id, rideId: req.params.rideId,
          type: 'auto_deposit', amount: ownerSaveAmount,
          status: 'completed',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await ownerDoc.ref.update({
          'savings.balance': admin.firestore.FieldValue.increment(ownerSaveAmount),
          'savings.totalDeposited': admin.firestore.FieldValue.increment(ownerSaveAmount),
        });
      }
    }

    // ── Loan repayment deduction ─────────────────────────
    let loanDeduction = 0;
    const loanId = driverData.activeLoanId;
    if (loanId) {
      const loanRef  = db.collection('loans').doc(loanId);
      const loanSnap = await loanRef.get();
      if (loanSnap.exists && loanSnap.data().status === 'active') {
        loanDeduction  = +(fare.driver * CFG.loans.deductPerRide).toFixed(2);
        const remaining = +(loanSnap.data().outstanding - loanDeduction).toFixed(2);
        if (remaining <= 0) {
          await loanRef.update({ outstanding: 0, status: 'repaid',
            closedAt: admin.firestore.FieldValue.serverTimestamp() });
          await db.collection('drivers').doc(driverId)
            .update({ activeLoanId: null });
        } else {
          await loanRef.update({ outstanding: remaining });
        }
      }
    }

    // ── Auto savings deduction (driver) ──────────────────
    const saveRate  = driverData.savingsRate || 0;
    const saveAmount = saveRate > 0
      ? +(fare.driver * saveRate / 100).toFixed(2) : 0;
    if (saveAmount > 0) {
      await db.collection('savings_transactions').add({
        userId: driverId, rideId: req.params.rideId,
        type: 'auto_deposit', amount: saveAmount,
        status: 'completed',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('drivers').doc(driverId).update({
        'savings.balance': admin.firestore.FieldValue.increment(saveAmount),
        'savings.totalDeposited': admin.firestore.FieldValue.increment(saveAmount),
      });
    }

    // ── Referral reward ──────────────────────────────────
    const refSnap = await db.collection('referrals')
      .where('newUserId','==', driverId)
      .where('status','==','pending').limit(1).get();
    if (!refSnap.empty) {
      const refBonus = +(fare.total * CFG.bonus.referral).toFixed(2);
      await db.collection('users').doc(refSnap.docs[0].data().referrerId)
        .update({ 'wallet.available': admin.firestore.FieldValue.increment(refBonus) });
      await refSnap.docs[0].ref.update({ status: 'activated', activatedAt:
        admin.firestore.FieldValue.serverTimestamp() });
    }

    // ── Net earnings after deductions ────────────────────
    const netDriver = +(fare.driver - dtoDeduction - loanDeduction - saveAmount).toFixed(2);
    const netOwner  = +(fare.owner - ownerDtoDeduction - ownerSaveAmount).toFixed(2);

    // ── Update driver ────────────────────────────────────
    await db.collection('drivers').doc(driverId).update({
      'earnings.total': admin.firestore.FieldValue.increment(netDriver),
      'earnings.today': admin.firestore.FieldValue.increment(netDriver),
      'earnings.week':  admin.firestore.FieldValue.increment(netDriver),
      'wallet.pending': admin.firestore.FieldValue.increment(netDriver),
      'pools.fuel':     admin.firestore.FieldValue.increment(fare.fuel),
      'pools.maintenance': admin.firestore.FieldValue.increment(fare.maintenance),
      totalRides: admin.firestore.FieldValue.increment(1),
    });

    // ── Update owner ─────────────────────────────────────
    if (ownerDoc) {
      await ownerDoc.ref.update({
        'earnings.total': admin.firestore.FieldValue.increment(netOwner),
        'earnings.today': admin.firestore.FieldValue.increment(netOwner),
        'wallet.pending': admin.firestore.FieldValue.increment(netOwner),
        'pools.fuel':     admin.firestore.FieldValue.increment(fare.fuel),
        'pools.maintenance': admin.firestore.FieldValue.increment(fare.maintenance),
        totalRides: admin.firestore.FieldValue.increment(1),
      });
    }

    // ── Update ride ──────────────────────────────────────
    await rideRef.update({
      status: 'completed',
      fare,
      dtoDeduction,
      ownerDtoDeduction,
      loanDeduction,
      ownerSaveAmount,
      netDriverEarnings: netDriver,
      netOwnerEarnings: ownerDoc ? netOwner : null,
      earningsReleased: false, // released after 24hr hold
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Notify passenger
    await db.collection('notifications').add({
      userId: rideData.userId, type: 'ride_completed',
      message: `Ride completed! Fare: ₵${fare.total}. Thank you for riding with Okada Online! 🇬🇭`,
      rideId: req.params.rideId,
      read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok(res, {
      splits: fare, dtoDeduction, ownerDtoDeduction, loanDeduction,
      netDriverEarnings: netDriver,
      netOwnerEarnings: ownerDoc ? netOwner : 0,
    });
  } catch (e) {
    console.error('complete-ride error:', e);
    return fail(res, 500, e.message);
  }
});

// Fare calculator with bonus logic
function calcFareSplits(rideType, km, driverData) {
  const rate  = CFG.fare[rideType] || CFG.fare.okada;
  const total = Math.max(CFG.fare.base + km * rate, CFG.fare.min);

  let driverPct  = CFG.splits.driver;   // base 25%
  let platformPct = CFG.splits.platform; // base 15%

  // Female driver bonus (+2% from platform share)
  if (driverData?.gender === 'female') {
    driverPct  += CFG.bonus.female;
    platformPct -= CFG.bonus.female;
  }
  // EV bonus (+2% from platform share)
  if (driverData?.isEV) {
    driverPct  += CFG.bonus.ev;
    platformPct -= CFG.bonus.ev;
  }

  return {
    total:       +total.toFixed(2),
    owner:       +(total * CFG.splits.owner).toFixed(2),
    driver:      +(total * driverPct).toFixed(2),
    fuel:        +(total * CFG.splits.fuel).toFixed(2),
    maintenance: +(total * CFG.splits.maintenance).toFixed(2),
    platform:    +(total * platformPct).toFixed(2),
    bonuses: {
      female: driverData?.gender === 'female' ? +(total * CFG.bonus.female).toFixed(2) : 0,
      ev:     driverData?.isEV ? +(total * CFG.bonus.ev).toFixed(2) : 0,
    },
  };
}

app.get('/rides/history/:userId', requireAuth, async (req, res) => {
  try {
    const userId = sanitize(req.params.userId);
    const snap = await db.collection('rides')
      .where('userId','==', userId)
      .orderBy('createdAt','desc').limit(20).get();
    return ok(res, { rides: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// D. DRIVERS & OWNERS
// ════════════════════════════════════════════════════════════

app.put('/drivers/:id/location', requireAuth, async (req, res) => {
  try {
    const { latitude, longitude, heading } = req.body;
    if (!latitude || !longitude) return fail(res, 400, 'latitude, longitude required');
    await db.collection('drivers').doc(req.params.id).update({
      location: {
        latitude:    parseFloat(latitude),
        longitude:   parseFloat(longitude),
        heading:     parseFloat(heading || 0),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
    return ok(res, {});
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.put('/drivers/:id/status', requireAuth, async (req, res) => {
  try {
    const driver = await db.collection('drivers').doc(req.params.id).get();
    if (!driver.exists) return fail(res, 404, 'Driver not found');
    // Only fully verified drivers can go online
    if (req.body.isOnline && !driver.data().isVerified)
      return fail(res, 403, 'Complete KYC, license, and vehicle verification to go online');
    await db.collection('drivers').doc(req.params.id).update({
      isOnline:    !!req.body.isOnline,
      vehicleType: sanitize(req.body.vehicleType || 'okada'),
    });
    return ok(res, {});
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.put('/drivers/:id/profile', requireAuth, async (req, res) => {
  try {
    const { gender, vehicleType, isEV, savingsRate } = req.body;
    const updates = {};
    if (gender)      updates.gender      = sanitize(gender);
    if (vehicleType) updates.vehicleType = sanitize(vehicleType);
    if (isEV !== undefined) updates.isEV = !!isEV;
    if (savingsRate !== undefined) {
      const rate = parseFloat(savingsRate);
      if (rate < 0 || rate > 30) return fail(res, 400, 'Savings rate must be 0–30%');
      updates.savingsRate = rate;
    }
    await db.collection('drivers').doc(req.params.id).update(updates);
    return ok(res, updates);
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/owners/:id/dashboard', requireAuth, async (req, res) => {
  try {
    const owner = await db.collection('owners').doc(req.params.id).get();
    if (!owner.exists) return fail(res, 404, 'Owner not found');
    const drivers = await db.collection('drivers')
      .where('ownerCode','==', owner.data().ownerCode).get();
    return ok(res, {
      data: {
        ...owner.data().earnings,
        pools:        owner.data().pools,
        wallet:       owner.data().wallet,
        savings:      owner.data().savings,
        savingsRate:  owner.data().savingsRate || 0,
        ownerCode:    owner.data().ownerCode,
        totalDrivers: drivers.size,
        activeDrivers: drivers.docs.filter(d => d.data().isOnline).length,
        verifiedDrivers: drivers.docs.filter(d => d.data().isVerified).length,
      },
    });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// E. DRIVE TO OWN
// ════════════════════════════════════════════════════════════

app.post('/dto/apply', requireAuth, async (req, res) => {
  try {
    const { userId, role, vehicleType, track } = req.body;
    if (!userId || !vehicleType || !track)
      return fail(res, 400, 'userId, vehicleType, track required');

    const veh = CFG.dto.vehicles[sanitize(vehicleType)];
    if (!veh) return fail(res, 400, 'Invalid vehicle type');

    const existing = await db.collection('dto_applications')
      .where('userId','==', sanitize(userId))
      .where('status','in',['pending','active']).get();
    if (!existing.empty)
      return fail(res, 400, 'You already have an active Drive to Own application');

    const col = role === 'driver' ? 'drivers' : 'owners';
    const userDoc = await db.collection(col).doc(sanitize(userId)).get();
    if (!userDoc.exists) return fail(res, 404, 'User not found');

    if ((userDoc.data().totalRides || 0) < CFG.dto.minRidesApply)
      return fail(res, 400, `Complete at least ${CFG.dto.minRidesApply} rides to qualify`);

    if (userDoc.data().kycStatus !== 'approved')
      return fail(res, 400, 'KYC verification required before applying');

    const deductRate  = track === 'A' ? CFG.dto.trackARate : CFG.dto.trackBRate;
    const downPayment = track === 'B' ? +(veh.price * CFG.dto.ownerDownPct).toFixed(2) : 0;
    const financed    = track === 'B' ? +(veh.price * 0.70).toFixed(2) : veh.price;

    const ref = await db.collection('dto_applications').add({
      userId:       sanitize(userId),
      role:         sanitize(role),
      vehicleType:  sanitize(vehicleType),
      vehicleName:  veh.name,
      vehiclePrice: veh.price,
      track:        sanitize(track),
      deductRate,
      downPayment,
      financedAmount: financed,
      totalPaid:    0,
      remaining:    financed,
      status:       'pending',
      gpsRequired:  true,
      documentsHeld: true,
      appliedAt:    admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('admin_queue').add({
      type:     'dto_application',
      subId:    ref.id,
      userId:   sanitize(userId),
      priority: 'high',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('notifications').add({
      userId: sanitize(userId), type: 'dto_submitted',
      message: `✅ Drive to Own application received for ${veh.name}. Review within 48hrs.`,
      read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok(res, { applicationId: ref.id, vehicleName: veh.name,
      deductRate, downPayment, financedAmount: financed });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/dto/status/:userId', requireAuth, async (req, res) => {
  try {
    const userId = sanitize(req.params.userId);
    const snap = await db.collection('dto_applications')
      .where('userId','==', userId)
      .orderBy('appliedAt','desc').limit(1).get();
    if (snap.empty) return ok(res, { application: null });

    const dto  = { id: snap.docs[0].id, ...snap.docs[0].data() };
    const prog = dto.vehiclePrice > 0
      ? Math.min((dto.totalPaid / dto.vehiclePrice) * 100, 100) : 0;

    const repayments = await db.collection('dto_repayments')
      .where('dtoId','==', dto.id)
      .orderBy('createdAt','desc').limit(5).get();

    return ok(res, {
      application:      dto,
      progressPercent:  +prog.toFixed(1),
      recentRepayments: repayments.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/dto/:id/approve', requireAdmin, async (req, res) => {
  try {
    const ref  = db.collection('dto_applications').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return fail(res, 404, 'Application not found');
    await ref.update({ status: 'active',
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: req.uid });
    await db.collection('notifications').add({
      userId: snap.data().userId, type: 'dto_approved',
      message: `🎉 Drive to Own APPROVED for ${snap.data().vehicleName}! Deductions start from your next ride.`,
      read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ok(res, { status: 'active' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// Generate timed fuel station code
app.post('/dto/fuel-code/:driverId', requireAuth, async (req, res) => {
  try {
    const driverId = sanitize(req.params.driverId);
    const driverDoc = await db.collection('drivers').doc(driverId).get();
    if (!driverDoc.exists) return fail(res, 404, 'Driver not found');

    const fuelBal = driverDoc.data().pools?.fuel || 0;
    if (fuelBal < 5) return fail(res, 400, 'Insufficient fuel pool (min GH₵5)');

    const code      = genCode('FUEL');
    const expiresAt = new Date(Date.now() + CFG.dto.fuelCodeSecs * 1000);

    await db.collection('fuel_codes').doc(code).set({
      driverId, code, balance: fuelBal,
      expiresAt, used: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok(res, { code, balance: fuelBal,
      expiresAt: expiresAt.toISOString(), validSeconds: CFG.dto.fuelCodeSecs });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/dto/fuel-code/:code/redeem', async (req, res) => {
  try {
    const code    = sanitize(req.params.code);
    const amount  = parseFloat(req.body.amount);
    const station = sanitize(req.body.stationId || 'unknown');
    if (!amount || amount <= 0) return fail(res, 400, 'amount required');

    const codeDoc = await db.collection('fuel_codes').doc(code).get();
    if (!codeDoc.exists) return fail(res, 404, 'Invalid code');
    const data = codeDoc.data();
    if (data.used) return fail(res, 400, 'Code already used');
    if (data.expiresAt.toDate() < new Date()) return fail(res, 400, 'Code expired');
    if (amount > data.balance) return fail(res, 400, 'Insufficient fuel balance');

    await codeDoc.ref.update({
      used: true, stationId: station, amountUsed: amount,
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('drivers').doc(data.driverId).update({
      'pools.fuel': admin.firestore.FieldValue.increment(-amount),
    });
    await db.collection('fuel_transactions').add({
      driverId: data.driverId, code, amount, stationId: station,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ok(res, { redeemed: true, amountDeducted: amount });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// F. FINTECH — SAVINGS
// ════════════════════════════════════════════════════════════

app.post('/fintech/savings/deposit', requireAuth, async (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId || !amount || parseFloat(amount) <= 0)
      return fail(res, 400, 'userId, amount required');
    const u = await resolveUserRef(userId);
    if (!u) return fail(res, 404, 'User not found');
    const a = parseFloat(amount);
    await db.collection('savings_transactions').add({
      userId: sanitize(userId), type: 'manual_deposit',
      amount: a, status: 'completed',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await u.ref.update({
      'savings.balance':        admin.firestore.FieldValue.increment(a),
      'savings.totalDeposited': admin.firestore.FieldValue.increment(a),
    });
    return ok(res, { deposited: a });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/fintech/savings/withdraw', requireAuth, async (req, res) => {
  try {
    const { userId, amount, momoPhone } = req.body;
    if (!userId || !amount || !momoPhone)
      return fail(res, 400, 'userId, amount, momoPhone required');

    const u = await resolveUserRef(userId);
    if (!u) return fail(res, 404, 'User not found');

    const bal = u.data?.savings?.balance || 0;
    const a   = parseFloat(amount);
    if (bal < a) return fail(res, 400, `Insufficient balance. Available: GH₵${bal}`);

    const tx = await db.collection('savings_transactions').add({
      userId: sanitize(userId), type: 'withdrawal',
      amount: a, momoPhone: sanitize(momoPhone),
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await u.ref.update({
      'savings.balance': admin.firestore.FieldValue.increment(-a),
    });
    return ok(res, { txId: tx.id, withdrawn: a, status: 'pending' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/fintech/savings/balance/:userId', requireAuth, async (req, res) => {
  try {
    const u = await resolveUserRef(req.params.userId);
    if (!u) return fail(res, 404, 'User not found');
    const s = u.data?.savings || {};
    const txs = await db.collection('savings_transactions')
      .where('userId','==', sanitize(req.params.userId))
      .orderBy('createdAt','desc').limit(12).get();
    return ok(res, {
      balance:        s.balance        || 0,
      totalDeposited: s.totalDeposited || 0,
      interestEarned: s.interestEarned || 0,
      savingsRate:    u.data?.savingsRate || 0,
      history:        txs.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.put('/fintech/savings/rate', requireAuth, async (req, res) => {
  try {
    const { userId, rate } = req.body;
    const r = parseFloat(rate);
    if (r < 0 || r > CFG.savings.maxRate)
      return fail(res, 400, `Rate must be 0–${CFG.savings.maxRate}%`);
    const u = await resolveUserRef(userId);
    if (!u) return fail(res, 404, 'User not found');
    await u.ref.update({ savingsRate: r });
    return ok(res, { savingsRate: r });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// G. FINTECH — LOANS
// ════════════════════════════════════════════════════════════

app.get('/fintech/loans/eligibility/:userId', requireAuth, async (req, res) => {
  try {
    const userId  = sanitize(req.params.userId);
    const u = await resolveUserRef(userId);
    if (!u) return fail(res, 404, 'User not found');
    const dd      = u.data;
    const txSnap  = await db.collection('savings_transactions')
      .where('userId','==', userId).where('type','==','auto_deposit').get();
    const months  = new Set(txSnap.docs.map(d => {
      const t = d.data().createdAt?.toDate?.() || new Date();
      return `${t.getFullYear()}-${t.getMonth()}`;
    })).size;
    const rides    = dd.totalRides || 0;
    const rating   = dd.rating || 0;
    const disputes = dd.disputes || 0;
    const kyc      = dd.kycStatus === 'approved';
    const savBal   = dd?.savings?.balance || 0;
    let score = 300;
    score += Math.min(rides, 200);
    score += Math.min(months * 30, 150);
    score += Math.round((rating - 3) * 50);
    score += kyc ? 100 : 0;
    score += savBal > 50 ? 50 : 0;
    score -= disputes * 40;
    score  = Math.max(300, Math.min(850, score));
    const eligible = months >= 3 && rides >= 20 && rating >= 4.0 && !disputes && kyc;
    const maxLoan  = eligible
      ? (months >= 12 ? 3000 : months >= 6 ? 1500 : 500) : 0;
    return ok(res, {
      creditScore: score, maxLoan, eligible, months, rides, rating, disputes, kyc,
      reasons: [
        { label: '3+ months savings', pass: months >= 3 },
        { label: '20+ rides',         pass: rides  >= 20 },
        { label: '4.0+ rating',       pass: rating >= 4.0 },
        { label: 'Zero disputes',     pass: !disputes },
        { label: 'KYC verified',      pass: kyc },
      ],
    });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/fintech/loans/apply', requireAuth, async (req, res) => {
  try {
    const { userId, amount, purpose } = req.body;
    if (!userId || !amount || !purpose)
      return fail(res, 400, 'userId, amount, purpose required');

    const existing = await db.collection('loans')
      .where('userId','==', sanitize(userId))
      .where('status','==','active').get();
    if (!existing.empty)
      return fail(res, 400, 'Repay active loan before applying');

    const u = await resolveUserRef(userId);
    if (!u) return fail(res, 404, 'User not found');
    if (u.data.kycStatus !== 'approved')
      return fail(res, 400, 'KYC approval required');

    const a   = parseFloat(amount);
    const ref = await db.collection('loans').add({
      userId:      sanitize(userId),
      amount:      a,
      outstanding: a,
      purpose:     sanitize(purpose),
      status:      a <= CFG.loans.autoApproveLimit ? 'active' : 'pending',
      deductionRate: CFG.loans.deductPerRide,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
    if (a <= CFG.loans.autoApproveLimit) {
      await u.ref.update({ activeLoanId: ref.id });
    }
    return ok(res, { loanId: ref.id,
      status: a <= CFG.loans.autoApproveLimit ? 'active' : 'pending' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/fintech/loans/status/:userId', requireAuth, async (req, res) => {
  try {
    const snap = await db.collection('loans')
      .where('userId','==', sanitize(req.params.userId))
      .where('status','in',['active','pending']).limit(1).get();
    if (snap.empty) return ok(res, { activeLoan: null });
    const loan = { id: snap.docs[0].id, ...snap.docs[0].data() };
    const repayments = await db.collection('loan_repayments')
      .where('loanId','==', loan.id)
      .orderBy('createdAt','desc').limit(10).get();
    return ok(res, {
      activeLoan: loan,
      repayments: repayments.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// H. FINTECH — INSURANCE
// ════════════════════════════════════════════════════════════

app.post('/insurance/buy', requireAuth, async (req, res) => {
  try {
    const { userId, planId } = req.body;
    const plan = CFG.insurance[sanitize(planId)];
    if (!plan) return fail(res, 400, 'Invalid plan');

    const u = await resolveUserRef(userId);
    if (!u) return fail(res, 404, 'User not found');

    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 1);

    const ref = await db.collection('insurance_policies').add({
      userId: sanitize(userId), planId: sanitize(planId),
      planName: plan.name, premium: plan.premium, cover: plan.cover,
      status: 'active', provider: 'Hollard Ghana',
      expiresAt: expiry, renewsAt: expiry,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await u.ref.update({
      'insurance.policyId': ref.id,
      'insurance.planId':   planId,
      'insurance.status':   'active',
      'insurance.expiresAt': expiry,
    });
    return ok(res, { policyId: ref.id,
      plan: plan.name, cover: plan.cover, expiresAt: expiry });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.post('/insurance/claim', requireAuth, async (req, res) => {
  try {
    const { userId, policyId, claimType, description, evidenceBase64 } = req.body;
    if (!userId || !claimType || !description)
      return fail(res, 400, 'userId, claimType, description required');

    // Verify active policy
    const pol = await db.collection('insurance_policies').doc(sanitize(policyId || '')).get();
    if (pol.exists && pol.data().status !== 'active')
      return fail(res, 400, 'Policy is not active');

    const ref = `CLM-${Date.now().toString(36).toUpperCase()}`;
    const claim = await db.collection('insurance_claims').add({
      userId:      sanitize(userId),
      policyId:    sanitize(policyId || ''),
      claimRef:    ref,
      claimType:   sanitize(claimType),
      description: sanitize(description),
      hasEvidence: !!evidenceBase64,
      status:      'submitted',
      provider:    'Hollard Ghana',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('admin_queue').add({
      type: 'insurance_claim', subId: claim.id, userId: sanitize(userId),
      priority: 'high', createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ok(res, { claimId: claim.id, claimRef: ref, status: 'submitted' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

app.get('/insurance/policy/:userId', requireAuth, async (req, res) => {
  try {
    const snap = await db.collection('insurance_policies')
      .where('userId','==', sanitize(req.params.userId))
      .where('status','==','active').limit(1).get();
    const claims = await db.collection('insurance_claims')
      .where('userId','==', sanitize(req.params.userId))
      .orderBy('submittedAt','desc').limit(5).get();
    return ok(res, {
      policy: snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() },
      claims: claims.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// I. FINTECH — PAY LATER
// ════════════════════════════════════════════════════════════

app.post('/fintech/pay-later/request', requireAuth, async (req, res) => {
  try {
    const { userId, rideId, amount } = req.body;
    if (!userId || !rideId || !amount) return fail(res, 400, 'Missing fields');
    const u = await resolveUserRef(userId);
    if (!u) return fail(res, 404, 'User not found');
    const pl   = u.data?.payLater || {};
    const avail = (pl.limit || CFG.payLater.defaultLimit) - (pl.used || 0);
    if (pl.suspended) return fail(res, 400, 'Pay Later suspended — contact support');
    if (parseFloat(amount) > avail)
      return fail(res, 400, `Pay Later limit exceeded. Available: GH₵${avail}`);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + CFG.payLater.deferDays);
    const ref = await db.collection('pay_later').add({
      userId: sanitize(userId), rideId: sanitize(rideId),
      amount: parseFloat(amount), status: 'deferred',
      dueDate, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await u.ref.update({
      'payLater.used': admin.firestore.FieldValue.increment(parseFloat(amount)),
    });
    return ok(res, { payLaterTxId: ref.id, dueDate, amountDeferred: amount });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// GET /fintech/pay-later/history/:userId
// Returns current limit/used plus the underlying transaction records —
// FintechHub only ever had a hardcoded lump "used" amount before; this
// gives it the real thing.
app.get('/fintech/pay-later/history/:userId', requireAuth, async (req, res) => {
  try {
    const u = await resolveUserRef(req.params.userId);
    if (!u) return fail(res, 404, 'User not found');
    const pl = u.data?.payLater || { limit: CFG.payLater.defaultLimit, used: 0, suspended: false };
    const snap = await db.collection('pay_later')
      .where('userId','==', sanitize(req.params.userId))
      .orderBy('createdAt','desc').limit(20).get();
    return ok(res, {
      limit: pl.limit || CFG.payLater.defaultLimit,
      used: pl.used || 0,
      suspended: !!pl.suspended,
      history: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// Supports two calling patterns:
//   { userId, payLaterTxId }  — repay one specific known record
//   { userId, amount }        — no specific record known (this is how
//     FintechHub actually calls it, since it only tracks a lump total
//     owed); settles oldest pending/overdue records up to that amount.
app.post('/fintech/pay-later/repay', requireAuth, async (req, res) => {
  try {
    const { userId, payLaterTxId, amount } = req.body;
    const u = await resolveUserRef(userId);
    if (!u) return fail(res, 404, 'User not found');

    if (payLaterTxId) {
      const txRef  = db.collection('pay_later').doc(sanitize(payLaterTxId));
      const txSnap = await txRef.get();
      if (!txSnap.exists) return fail(res, 404, 'Record not found');
      if (txSnap.data().status === 'paid') return ok(res, { message: 'Already paid' });
      const amt = txSnap.data().amount;
      await txRef.update({ status: 'paid',
        paidAt: admin.firestore.FieldValue.serverTimestamp() });
      await u.ref.update({
        'payLater.used': admin.firestore.FieldValue.increment(-amt),
      });
      return ok(res, { repaid: amt, status: 'paid' });
    }

    if (!userId || !amount)
      return fail(res, 400, 'userId and amount, or payLaterTxId, required');

    let remaining = parseFloat(amount);
    const pending = await db.collection('pay_later')
      .where('userId','==', sanitize(userId))
      .where('status','in',['deferred','overdue'])
      .orderBy('createdAt','asc').get();

    let totalRepaid = 0;
    const batch = db.batch();
    for (const doc of pending.docs) {
      if (remaining <= 0) break;
      const amt = doc.data().amount;
      batch.update(doc.ref, { status: 'paid',
        paidAt: admin.firestore.FieldValue.serverTimestamp() });
      remaining   -= amt;
      totalRepaid += amt;
    }
    if (totalRepaid === 0) return fail(res, 400, 'No outstanding Pay Later balance found');

    await batch.commit();
    await u.ref.update({
      'payLater.used': admin.firestore.FieldValue.increment(-totalRepaid),
      'payLater.suspended': false,
    });
    return ok(res, { repaid: +totalRepaid.toFixed(2), status: 'paid' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// J. WALLET
// ════════════════════════════════════════════════════════════

app.post('/wallet/withdraw', requireAuth, async (req, res) => {
  try {
    const { userId, amount, momoPhone, network } = req.body;
    if (!userId || !amount || !momoPhone)
      return fail(res, 400, 'userId, amount, momoPhone required');
    const u = await resolveUserRef(userId);
    if (!u) return fail(res, 404, 'User not found');
    const avail = u.data?.wallet?.available || 0;
    const a = parseFloat(amount);
    if (avail < a)
      return fail(res, 400, `Insufficient balance. Available: GH₵${avail.toFixed(2)}`);
    const tx = await db.collection('withdrawal_requests').add({
      userId:   sanitize(userId),
      amount:   a,
      momoPhone: sanitize(momoPhone),
      network:  sanitize(network || 'MTN'),
      status:   'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await u.ref.update({
      'wallet.available': admin.firestore.FieldValue.increment(-a),
    });
    return ok(res, { txId: tx.id, amount: a, status: 'pending' });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});

// ════════════════════════════════════════════════════════════
// K. PAYMENTS (Paystack)
// ════════════════════════════════════════════════════════════

app.post('/payments/initialize', requireAuth, async (req, res) => {
  try {
    const { rideId, email, phone } = req.body;
    if (!rideId) return fail(res, 400, 'rideId required');

    const rideRef = db.collection('rides').doc(sanitize(rideId));
    const rideSnap = await rideRef.get();
    if (!rideSnap.exists) return fail(res, 404, 'Ride not found');
    const ride = rideSnap.data();

    const rider = await resolveUserRef(ride.userId);
    if (!rider || (rider.data?.firebaseUid !== req.uid && rider.ref.id !== req.uid)) {
      return fail(res, 403, 'Payment access denied');
    }

    const amount = Number(ride.fare?.total);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail(res, 400, 'Ride does not have a payable stored fare');
    }

    const paystackSecret = functions.config().paystack?.secret;
    if (!paystackSecret) {
      console.error('Paystack secret is not configured');
      return fail(res, 500, 'Payments are not configured yet');
    }

    const r = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: sanitize(email) || `${sanitize(phone || '').replace('+','')}@okadaonline.com`,
        amount: Math.round(amount * 100),
        currency: 'GHS',
        reference: `ride_${sanitize(rideId)}_${Date.now()}`,
        callback_url: 'https://okada-online.vercel.app/payment/callback',
        metadata: { rideId: sanitize(rideId), phone: sanitize(phone || '') },
      },
      { headers: { Authorization: `Bearer ${paystackSecret}` } }
    );

    await db.collection('payments').add({
      rideId: sanitize(rideId),
      passengerId: req.uid,
      amount: +amount.toFixed(2),
      currency: 'GHS',
      provider: 'paystack',
      reference: r.data.data.reference,
      status: 'pending',
      purpose: 'ride',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok(res, {
      authorizationUrl: r.data.data.authorization_url,
      reference: r.data.data.reference,
      amount: +amount.toFixed(2),
      currency: 'GHS',
    });
  } catch (e) {
    console.error('payment init error:', e.response?.data || e.message);
    return fail(res, 500, e.response?.data?.message || e.message);
  }
});

app.get('/payments/verify/:ref', requireAuth, async (req, res) => {
  try {
    const reference = sanitize(req.params.ref, 160);
    const paymentSnap = await db.collection('payments')
      .where('reference', '==', reference).limit(1).get();
    if (paymentSnap.empty) return fail(res, 404, 'Payment record not found');

    const payment = paymentSnap.docs[0].data();
    if (payment.purpose === 'journey' && payment.journeyId) {
      const journeySnap = await db.collection('journeys').doc(sanitize(payment.journeyId)).get();
      if (!journeySnap.exists) return fail(res, 404, 'Journey not found');
      if (journeySnap.data().passengerId !== req.uid && !await (async()=>{const a=await db.collection('admins').doc(req.uid).get();return a.exists;})()) {
        return fail(res, 403, 'Payment access denied');
      }
    } else if (payment.rideId) {
      const rideSnap = await db.collection('rides').doc(sanitize(payment.rideId)).get();
      if (!rideSnap.exists) return fail(res, 404, 'Ride not found');
      const rider = await resolveUserRef(rideSnap.data().userId);
      if (!rider || (rider.data?.firebaseUid !== req.uid && rider.ref.id !== req.uid)) {
        return fail(res, 403, 'Payment access denied');
      }
    } else {
      return fail(res, 400, 'Unsupported payment record');
    }

    const paystackSecret = functions.config().paystack?.secret;
    if (!paystackSecret) return fail(res, 500, 'Payments are not configured yet');

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${paystackSecret}` } }
    );

    const data = response.data?.data || {};
    const providerStatus = String(data.status || '').toLowerCase();

    if (payment.purpose === 'journey' && payment.journeyId) {
      if (providerStatus === 'success') {
        const settled = await settleSuccessfulJourneyPayment({
          db, admin, journeyId: payment.journeyId, reference, providerData: data,
        });
        return ok(res, { reference, verified: true, outcome: settled.outcome || 'SUCCESS' });
      }
      if (['failed', 'abandoned'].includes(providerStatus)) {
        const settled = await settleFailedJourneyPayment({
          db, admin, journeyId: payment.journeyId, reference,
          failureReason: `Paystack transaction status: ${providerStatus}`,
          paymentStatus: 'FAILED',
        });
        return ok(res, { reference, verified: false, outcome: 'FAILED', ...settled });
      }
    } else if (payment.rideId) {
      if (providerStatus === 'success') {
        const settled = await settleRidePayment({ db, admin, reference, providerData: data });
        return ok(res, { reference, verified: true, outcome: settled.idempotent ? 'ALREADY_PAID' : 'SUCCESS' });
      }
      if (['failed', 'abandoned'].includes(providerStatus)) {
        const settled = await markRidePaymentFailed({
          db, admin, reference, reason: `Paystack transaction status: ${providerStatus}`,
        });
        return ok(res, { reference, verified: false, outcome: 'FAILED', ...settled });
      }
    }

    return ok(res, {
      reference,
      verified: false,
      outcome: 'PENDING',
      providerStatus: providerStatus || 'unknown',
    });
  } catch (e) {
    return fail(res, 502, e.response?.data?.message || e.message || 'Unable to verify payment');
  }
});

app.post('/payments/webhook', async (req, res) => {
  try {
    const paystackSecret = functions.config().paystack?.secret || '';
    const sig = req.headers['x-paystack-signature'] || '';
    const body = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body));
    const expected = crypto.createHmac('sha512', paystackSecret).update(body).digest('hex');
    const sigBuf = Buffer.from(String(sig), 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    const sigValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    if (!paystackSecret || !sigValid) return fail(res, 401, 'Invalid signature');

    if (req.body.event === 'charge.success') {
      const data = req.body.data || {};
      const reference = sanitize(data.reference || '');
      if (!reference) return fail(res, 400, 'Payment reference missing');

      const q = await db.collection('payments').where('reference', '==', reference).limit(1).get();
      if (!q.empty) {
        const payment = q.docs[0].data();

        if (payment.purpose === 'journey' && payment.journeyId) {
          await settleSuccessfulJourneyPayment({
            db, admin, journeyId: payment.journeyId, reference, providerData: data,
          });
        } else if (payment.rideId) {
          await settleRidePayment({
            db, admin, reference, providerData: data,
          });
        }
      }
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('Paystack webhook error:', e);
    return fail(res, 400, e.message || 'Webhook processing failed');
  }
});

// ════════════════════════════════════════════════════════════
// L. USSD  *711#
// ════════════════════════════════════════════════════════════

app.post('/ussd/callback', async (req, res) => {
  const { phoneNumber, text } = req.body;
  const p = (text || '').split('*');
  let r = '';
  if (!text) {
    r = `CON Welcome to Okada Online 🇬🇭\n1. Book Okada\n2. Book Car\n3. My rides\n4. Drive to Own\n5. Fuel balance\n6. Help`;
  } else if (p[0]==='1'&&p.length===1) {
    r = `CON Pickup area:\n1. Akosombo\n2. Atimpoku\n3. Senchi\n4. Kpong\n5. Odumase`;
  } else if (p[0]==='1'&&p.length===2) {
    r = `CON Destination:\n1. Akosombo\n2. Atimpoku\n3. Senchi\n4. Kpong\n5. Odumase`;
  } else if (p[0]==='1'&&p.length===3) {
    r = `END Okada booked! Driver calling shortly.\nEst: ₵${(Math.random()*10+5).toFixed(2)}\nSafe trip! 🏍️`;
  } else if (p[0]==='4') {
    r = `CON Drive to Own:\n1. Track A: Okada (35% daily)\n2. Track B: Car (30% down)\n3. My application`;
  } else if (p[0]==='4'&&p[1]==='1') {
    r = `END Track A:\n• Motorcycle: GH₵12,000\n• 35% auto-deducted daily\n• Own in ~9–10 months\nApply: okada-online.vercel.app`;
  } else if (p[0]==='4'&&p[1]==='2') {
    r = `END Track B:\n• Kantanka K71: GH₵105,000\n• 30% down: GH₵31,500\n• Balance from earnings\nApply: okada-online.vercel.app`;
  } else if (p[0]==='5') {
    r = `END Check fuel pool balance in the app.\nGet fuel code → show at station.\nokada-online.vercel.app ⛽`;
  } else if (p[0]==='6') {
    r = `END Okada Online Help\nApp: okada-online.vercel.app\nUSSD: *711#\n6am–10pm\n🇬🇭 FOR GHANA WITH LOVE`;
  } else {
    r = `END Invalid selection. Dial *711# again.`;
  }
  res.set('Content-Type', 'text/plain');
  res.send(r);
});

// ════════════════════════════════════════════════════════════
// M. ADMIN
// ════════════════════════════════════════════════════════════

app.get('/admin/stats', requireAdmin, async (req, res) => {
  try {
    const [rides, drivers, users, owners, dto, loans, insurance] = await Promise.all([
      db.collection('rides').get(),
      db.collection('drivers').get(),
      db.collection('users').get(),
      db.collection('owners').get(),
      db.collection('dto_applications').get(),
      db.collection('loans').get(),
      db.collection('insurance_policies').where('status','==','active').get(),
    ]);
    const revenue = rides.docs.reduce((s,d) => s + (d.data().fare?.total || 0), 0);
    return ok(res, {
      data: {
        totalRides:    rides.size,
        activeRides:   rides.docs.filter(d => d.data().status==='ongoing').length,
        totalDrivers:  drivers.size,
        onlineDrivers: drivers.docs.filter(d => d.data().isOnline).length,
        verifiedDrivers: drivers.docs.filter(d => d.data().isVerified).length,
        users:  users.size,
        owners: owners.size,
        revenue: +revenue.toFixed(2),
        commission: +(revenue * 0.15).toFixed(2),
        dto: {
          total:     dto.size,
          pending:   dto.docs.filter(d => d.data().status==='pending').length,
          active:    dto.docs.filter(d => d.data().status==='active').length,
          completed: dto.docs.filter(d => d.data().status==='completed').length,
        },
        loans: {
          active:  loans.docs.filter(d => d.data().status==='active').length,
          pending: loans.docs.filter(d => d.data().status==='pending').length,
        },
        insured: insurance.size,
        splits: {
          owner:    `${CFG.splits.owner*100}%`,
          driver:   `${CFG.splits.driver*100}% (+2% female/EV bonus)`,
          fuel:     `${CFG.splits.fuel*100}%`,
          maintenance: `${CFG.splits.maintenance*100}%`,
          platform: `${CFG.splits.platform*100}%`,
        },
      },
    });
  } catch (e) {
    return fail(res, 500, e.message);
  }
});


// ════════════════════════════════════════════════════════════
// MaaS + DELIVERY ROUTES
// Sections: Scheduled Trips · Subscriptions · Rental ·
//           Trip Sharing · Corporate · Events · Delivery · Admin
// ════════════════════════════════════════════════════════════

// ── PRICING CONSTANTS ────────────────────────────────────────
const MAAS_PRICING = {
  scheduled: {
    okada:    { perKm:2.80, flag:2.00 },
    car:      { perKm:4.50, flag:3.50 },
    tricycle: { perKm:3.20, flag:2.50 },
    ev_car:   { perKm:5.00, flag:4.00 },
    ev_bike:  { perKm:2.50, flag:1.80 },
  },
  rental: {
    kantanka_car: {
      daily:{price:350,includedKm:80,extraPerKm:3.50},
      weekly:{price:2100,includedKm:560,extraPerKm:3.00},
      monthly:{price:7500,includedKm:2400,extraPerKm:2.50},
      annual:{price:75000,includedKm:30000,extraPerKm:2.00},
    },
    kantanka_suv: {
      daily:{price:500,includedKm:100,extraPerKm:4.50},
      weekly:{price:3000,includedKm:700,extraPerKm:4.00},
      monthly:{price:11000,includedKm:3000,extraPerKm:3.50},
      annual:{price:110000,includedKm:36000,extraPerKm:3.00},
    },
    ev_car: {
      daily:{price:420,includedKm:120,extraPerKm:3.00},
      weekly:{price:2520,includedKm:840,extraPerKm:2.50},
      monthly:{price:9000,includedKm:3600,extraPerKm:2.00},
      annual:{price:90000,includedKm:43200,extraPerKm:1.80},
    },
    ev_motorcycle: {
      daily:{price:120,includedKm:80,extraPerKm:1.50},
      weekly:{price:720,includedKm:560,extraPerKm:1.20},
      monthly:{price:2500,includedKm:2400,extraPerKm:1.00},
    },
  },
  delivery: {
    motorcycle:{perKm:3.50,flag:5.00,weightSurcharge:{over5kg:2.00,over15kg:5.00}},
    tricycle:  {perKm:4.00,flag:6.00,weightSurcharge:{over5kg:1.50,over15kg:4.00}},
    car:       {perKm:5.50,flag:8.00,weightSurcharge:{over5kg:0,   over15kg:2.00}},
  },
  subscription: {
    basic:    {monthly:800,  ridesIncluded:20, pricePerExtra:35},
    standard: {monthly:1500, ridesIncluded:40, pricePerExtra:32},
    premium:  {monthly:2500, ridesIncluded:80, pricePerExtra:28},
    corporate:{monthly:8000, ridesIncluded:200,pricePerExtra:25},
  },
};

// ── A. SCHEDULED TRIPS ───────────────────────────────────────

app.post('/maas/schedule/create', requireAuth, async (req,res) => {
  try {
    const { userId,name,pickupAddress,destAddress,vehicleType,
            departTime,returnTime,days,category,payFromSavings } = req.body;
    if(!userId||!pickupAddress||!destAddress||!vehicleType||!departTime||!days?.length)
      return fail(res,400,'Missing required fields');
    const ref = await db.collection('scheduled_trips').add({
      userId:sanitize(userId), name:sanitize(name||category||'My Trip'),
      pickupAddress:sanitize(pickupAddress), destAddress:sanitize(destAddress),
      vehicleType:sanitize(vehicleType), departTime:sanitize(departTime),
      returnTime:returnTime||null, days, category:sanitize(category||'custom'),
      payFromSavings:!!payFromSavings, active:true, paused:false,
      skippedDates:[], adjustedTimes:{}, assignedDriverId:null,
      totalTrips:0, totalSpent:0,
      createdAt:admin.firestore.FieldValue.serverTimestamp(),
    });
    return ok(res, { scheduleId:ref.id, message:'Schedule created. Driver matched 30 min before departure.' });
  } catch(e) { return fail(res,500,e.message); }
});

app.put('/maas/schedule/:id/adjust', requireAuth, async (req,res) => {
  try {
    const { date, newTime, skip } = req.body;
    if (!date) return fail(res,400,'date is required');
    const ref  = db.collection('scheduled_trips').doc(req.params.id);
    const snap = await ref.get();
    if(!snap.exists) return fail(res,404,'Schedule not found');
    if(snap.data().userId !== req.uid && req.body.userId !== snap.data().userId)
      return fail(res,403,'Not your schedule');
    if(skip) {
      await ref.update({ skippedDates:admin.firestore.FieldValue.arrayUnion(date) });
      return ok(res, { message:`Trip on ${date} skipped` });
    }
    if(newTime) {
      const adj = snap.data().adjustedTimes||{};
      adj[date] = newTime;
      await ref.update({ adjustedTimes:adj });
      return ok(res, { message:`Trip on ${date} adjusted to ${newTime}` });
    }
    return fail(res,400,'Provide newTime or skip=true');
  } catch(e) { console.error('schedule adjust error:', e); return fail(res,500,e.message); }
});

app.put('/maas/schedule/:id/pause', requireAuth, async (req,res) => {
  try {
    const snap = await db.collection('scheduled_trips').doc(req.params.id).get();
    if(!snap.exists) return fail(res,404,'Schedule not found');
    const paused = !snap.data().paused;
    await snap.ref.update({ paused });
    return ok(res, { paused, message:paused?'Schedule paused':'Schedule resumed' });
  } catch(e) { return fail(res,500,e.message); }
});

app.get('/maas/schedule/today/:userId', requireAuth, async (req,res) => {
  try {
    const today = new Date().getDay();
    const snap  = await db.collection('scheduled_trips')
      .where('userId','==',sanitize(req.params.userId))
      .where('active','==',true)
      .where('paused','==',false).get();
    const trips = snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(t=>t.days.includes(today));
    return ok(res, { trips });
  } catch(e) { return fail(res,500,e.message); }
});

// ── B. SUBSCRIPTIONS ─────────────────────────────────────────

app.post('/maas/subscription/create', requireAuth, async (req,res) => {
  try {
    const { userId, driverId, tier, autoRenew } = req.body;
    if(!userId||!tier||!MAAS_PRICING.subscription[tier])
      return fail(res,400,'Invalid tier');
    const plan   = MAAS_PRICING.subscription[tier];
    const expiry = new Date(); expiry.setMonth(expiry.getMonth()+1);
    const u = await resolveUserRef(userId);
    if (!u) return fail(res,404,'User not found');
    const wallet = u.data?.wallet?.available||0;
    if(wallet < plan.monthly) return fail(res,400,`Insufficient balance. Need GH₵${plan.monthly}`);
    const ref = await db.collection('subscriptions').add({
      userId:sanitize(userId), driverId:sanitize(driverId||''),
      tier, monthlyFee:plan.monthly, ridesIncluded:plan.ridesIncluded,
      ridesUsed:0, pricePerExtra:plan.pricePerExtra,
      status:'active', autoRenew:!!autoRenew,
      startedAt:admin.firestore.FieldValue.serverTimestamp(), expiresAt:expiry, renewsAt:expiry,
    });
    await u.ref.update({
      'wallet.available':admin.firestore.FieldValue.increment(-plan.monthly),
      activeSubscriptionId:ref.id,
    });
    if(driverId) await db.collection('notifications').add({
      userId:sanitize(driverId), type:'subscription_assigned',
      message:`A passenger chose you as their personal driver (${tier} plan).`,
      createdAt:admin.firestore.FieldValue.serverTimestamp(),
    });
    return ok(res, { subscriptionId:ref.id, tier, expiresAt:expiry, ridesIncluded:plan.ridesIncluded });
  } catch(e) { return fail(res,500,e.message); }
});

app.get('/maas/subscription/status/:userId', requireAuth, async (req,res) => {
  try {
    const u = await resolveUserRef(req.params.userId);
    if (!u) return fail(res,404,'User not found');
    const subId = u.data?.activeSubscriptionId;
    if(!subId) return ok(res, { subscription:null });
    const subSnap = await db.collection('subscriptions').doc(subId).get();
    return ok(res, { subscription:{id:subId,...subSnap.data()} });
  } catch(e) { return fail(res,500,e.message); }
});

// ── C. RENTAL ────────────────────────────────────────────────

app.get('/maas/rental/pricing', async (_req,res) => {
  return ok(res, { pricing:MAAS_PRICING.rental });
});

app.post('/maas/rental/book', requireAuth, async (req,res) => {
  try {
    const { userId, vehicleType, period, startDate, driverIncluded, pickupAddress } = req.body;
    const plan = MAAS_PRICING.rental[sanitize(vehicleType)]?.[sanitize(period)];
    if(!plan) return fail(res,400,'Invalid vehicle type or rental period');
    const driverFee  = driverIncluded ? Math.round(plan.price*0.20) : 0;
    const totalPrice = plan.price + driverFee;
    const u = await resolveUserRef(userId);
    if (!u) return fail(res,404,'User not found');
    if((u.data?.wallet?.available||0) < totalPrice)
      return fail(res,400,`Insufficient balance. Need GH₵${totalPrice}`);
    const start = new Date(startDate);
    const end   = new Date(start);
    end.setDate(end.getDate() + {daily:1,weekly:7,monthly:30,annual:365}[period]);
    const ref = await db.collection('rentals').add({
      userId:sanitize(userId), vehicleType:sanitize(vehicleType), period:sanitize(period),
      basePrice:plan.price, driverFee, totalPrice,
      includedKm:plan.includedKm, kmUsed:0, extraKmCharges:0, extraPerKm:plan.extraPerKm,
      driverIncluded:!!driverIncluded, assignedDriverId:null, assignedVehicleId:null,
      pickupAddress:sanitize(pickupAddress||''),
      status:'pending', startDate:start, endDate:end,
      brandNote:'New Kantanka / EV vehicle — luxury, comfort, safety',
      createdAt:admin.firestore.FieldValue.serverTimestamp(),
    });
    await u.ref.update({
      'wallet.available':admin.firestore.FieldValue.increment(-totalPrice),
    });
    return ok(res, { rentalId:ref.id, vehicleType, period, totalPrice,
      includedKm:plan.includedKm, startDate:start, endDate:end, status:'pending',
      message:'Rental confirmed. Vehicle assigned within 2 hours.' });
  } catch(e) { return fail(res,500,e.message); }
});

app.post('/maas/rental/:id/log-km', requireAuth, async (req,res) => {
  try {
    const ref   = db.collection('rentals').doc(req.params.id);
    const snap  = await ref.get();
    if(!snap.exists) return fail(res,404,'Rental not found');
    const r         = snap.data();
    const newKmUsed = (r.kmUsed||0) + parseFloat(req.body.km);
    const extraKm   = Math.max(0, newKmUsed - r.includedKm);
    const extraCharge = +(extraKm * r.extraPerKm).toFixed(2);
    await ref.update({ kmUsed:newKmUsed, extraKmCharges:extraCharge });
    if(extraCharge > (r.extraKmCharges||0)) {
      const newCharge = extraCharge - (r.extraKmCharges||0);
      const u = await resolveUserRef(r.userId);
      if (u) await u.ref.update({
        'wallet.available':admin.firestore.FieldValue.increment(-newCharge),
      });
    }
    return ok(res, { kmUsed:newKmUsed, extraKm, extraCharge });
  } catch(e) { return fail(res,500,e.message); }
});

app.get('/maas/rental/active/:userId', requireAuth, async (req,res) => {
  try {
    const snap = await db.collection('rentals')
      .where('userId','==',sanitize(req.params.userId))
      .where('status','in',['pending','active']).get();
    return ok(res, { rentals:snap.docs.map(d=>({id:d.id,...d.data()})) });
  } catch(e) { return fail(res,500,e.message); }
});

// ── D. TRIP SHARING ──────────────────────────────────────────

app.post('/maas/share/create', requireAuth, async (req,res) => {
  try {
    const { creatorId,pickupAddress,destAddress,vehicleType,
            departTime,departDate,maxPassengers,farePerPerson } = req.body;
    const ref = await db.collection('shared_trips').add({
      creatorId:sanitize(creatorId), pickupAddress:sanitize(pickupAddress),
      destAddress:sanitize(destAddress), vehicleType:sanitize(vehicleType),
      departTime:sanitize(departTime), departDate:sanitize(departDate),
      maxPassengers:maxPassengers||4, farePerPerson:parseFloat(farePerPerson),
      passengers:[sanitize(creatorId)], status:'open', driverId:null,
      createdAt:admin.firestore.FieldValue.serverTimestamp(),
    });
    return ok(res, { shareId:ref.id, farePerPerson, maxPassengers:maxPassengers||4 });
  } catch(e) { return fail(res,500,e.message); }
});

app.post('/maas/share/:shareId/join', requireAuth, async (req,res) => {
  try {
    const ref  = db.collection('shared_trips').doc(req.params.shareId);
    const snap = await ref.get();
    if(!snap.exists) return fail(res,404,'Shared trip not found');
    const t = snap.data();
    if(t.status!=='open')              return fail(res,400,'Trip is no longer open');
    if(t.passengers.includes(req.body.userId)) return fail(res,400,'Already joined');
    if(t.passengers.length>=t.maxPassengers)   return fail(res,400,'Trip is full');
    const newP   = [...t.passengers, sanitize(req.body.userId)];
    const status = newP.length>=t.maxPassengers?'full':'open';
    await ref.update({ passengers:newP, status });
    return ok(res, { shareId:req.params.shareId, passengers:newP.length, status, farePerPerson:t.farePerPerson });
  } catch(e) { return fail(res,500,e.message); }
});

// ── E. CORPORATE ─────────────────────────────────────────────

// NOTE: previously public with no requireAuth at all — anyone could
// create arbitrary corporate accounts unauthenticated. Corporate
// account creation is an admin-facing signup and should be tied to a
// real, verified user.
app.post('/maas/corporate/create', requireAuth, async (req,res) => {
  try {
    const { orgName,orgType,contactName,contactPhone,contactEmail,monthlyBudget,maxRidesPerUser } = req.body;
    if (!orgName || !contactName || !contactPhone) return fail(res,400,'orgName, contactName, contactPhone required');
    const accountCode = 'ORG'+crypto.randomBytes(3).toString('hex').toUpperCase();
    const ref = await db.collection('corporate_accounts').add({
      orgName:sanitize(orgName), orgType:sanitize(orgType),
      contactName:sanitize(contactName), contactPhone:sanitize(contactPhone),
      contactEmail:sanitize(contactEmail||''), accountCode,
      createdByUid: req.uid,
      monthlyBudget:parseFloat(monthlyBudget||0), walletBalance:0,
      maxRidesPerUser:maxRidesPerUser||20, members:[], status:'pending', totalSpent:0,
      createdAt:admin.firestore.FieldValue.serverTimestamp(),
    });
    return ok(res, { accountId:ref.id, accountCode, message:'Corporate account created. Admin activates within 24 hours.' });
  } catch(e) { return fail(res,500,e.message); }
});

app.post('/maas/corporate/:id/add-member', requireAdmin, async (req,res) => {
  try {
    const { userId } = req.body;
    await db.collection('corporate_accounts').doc(req.params.id).update({
      members:admin.firestore.FieldValue.arrayUnion(sanitize(userId)),
    });
    const u = await resolveUserRef(userId);
    if (u) await u.ref.update({ corporateAccountId:req.params.id });
    return ok(res, { message:'Member added' });
  } catch(e) { return fail(res,500,e.message); }
});

app.get('/maas/corporate/stats/:orgId', requireAuth, async (req,res) => {
  try {
    const snap = await db.collection('corporate_accounts').doc(req.params.orgId).get();
    if(!snap.exists) return fail(res,404,'Account not found');
    const rides = await db.collection('rides')
      .where('corporateAccountId','==',req.params.orgId)
      .orderBy('createdAt','desc').limit(50).get();
    return ok(res, { account:{id:req.params.orgId,...snap.data()},
      recentRides:rides.docs.map(d=>({id:d.id,...d.data()})) });
  } catch(e) { return fail(res,500,e.message); }
});

// ── F. EVENTS ────────────────────────────────────────────────

app.post('/maas/events/book', requireAuth, async (req,res) => {
  try {
    const { userId,eventName,eventDate,pickupAddress,destAddress,
            vehicleType,passengers,notes,depositPercent } = req.body;
    const pricing   = MAAS_PRICING.scheduled[sanitize(vehicleType)]||MAAS_PRICING.scheduled.car;
    const estFare   = +(pricing.flag + 15*pricing.perKm).toFixed(2);
    const deposit   = +(estFare*(depositPercent||0.30)).toFixed(2);
    const u = await resolveUserRef(userId);
    if (!u) return fail(res,404,'User not found');
    if((u.data?.wallet?.available||0) < deposit)
      return fail(res,400,`Deposit required: GH₵${deposit}`);
    const ref = await db.collection('event_rides').add({
      userId:sanitize(userId), eventName:sanitize(eventName),
      eventDate:sanitize(eventDate), pickupAddress:sanitize(pickupAddress),
      destAddress:sanitize(destAddress), vehicleType:sanitize(vehicleType),
      passengers:parseInt(passengers)||1, notes:sanitize(notes||''),
      estimatedFare:estFare, deposit, balanceDue:+(estFare-deposit).toFixed(2),
      status:'confirmed', driverId:null,
      createdAt:admin.firestore.FieldValue.serverTimestamp(),
    });
    await u.ref.update({
      'wallet.available':admin.firestore.FieldValue.increment(-deposit),
      'wallet.pending':  admin.firestore.FieldValue.increment(deposit),
    });
    return ok(res, { eventRideId:ref.id, eventName, eventDate,
      estimatedFare:estFare, deposit, balanceDue:estFare-deposit,
      message:`Event ride confirmed for ${eventDate}. Driver assigned 24hrs before event.` });
  } catch(e) { return fail(res,500,e.message); }
});

// ── G. DELIVERY ──────────────────────────────────────────────

app.post('/delivery/request', requireAuth, async (req,res) => {
  try {
    const { senderId,pickupAddress,deliveryAddress,vehicleType,
            packageDesc,weightKg,recipientName,recipientPhone,urgent,payMethod } = req.body;
    if(!senderId||!pickupAddress||!deliveryAddress||!vehicleType)
      return fail(res,400,'Missing required fields');
    const pricing = MAAS_PRICING.delivery[sanitize(vehicleType)]||MAAS_PRICING.delivery.motorcycle;
    const weight  = parseFloat(weightKg||0);
    let fare      = pricing.flag + 5*pricing.perKm;
    if(weight>15)      fare += pricing.weightSurcharge.over15kg;
    else if(weight>5)  fare += pricing.weightSurcharge.over5kg;
    if(urgent) fare = fare*1.5;
    fare = +fare.toFixed(2);
    const trackingCode = 'DLV-'+Date.now().toString(36).toUpperCase();
    const ref = await db.collection('deliveries').add({
      senderId:sanitize(senderId), pickupAddress:sanitize(pickupAddress),
      deliveryAddress:sanitize(deliveryAddress), vehicleType:sanitize(vehicleType),
      packageDesc:sanitize(packageDesc||'Package'), weightKg:weight,
      recipientName:sanitize(recipientName), recipientPhone:sanitize(recipientPhone),
      urgent:!!urgent, fare, payMethod:sanitize(payMethod||'wallet'),
      trackingCode, status:'pending', driverId:null, proofOfDelivery:null,
      createdAt:admin.firestore.FieldValue.serverTimestamp(),
      pickedUpAt:null, deliveredAt:null,
    });
    return ok(res, { deliveryId:ref.id, trackingCode, fare, status:'pending', urgent:!!urgent });
  } catch(e) { return fail(res,500,e.message); }
});

app.put('/delivery/:id/status', requireAuth, async (req,res) => {
  try {
    const { status, driverId, proofPhoto } = req.body;
    const updates = { status:sanitize(status) };
    if(driverId)   updates.driverId = sanitize(driverId);
    if(proofPhoto) updates.proofOfDelivery = sanitize(proofPhoto);
    if(status==='picked_up')  updates.pickedUpAt  = admin.firestore.FieldValue.serverTimestamp();
    if(status==='delivered')  updates.deliveredAt = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('deliveries').doc(req.params.id).update(updates);
    const snap = await db.collection('deliveries').doc(req.params.id).get();
    const d    = snap.data();
    const msgs = {
      assigned:`Driver assigned for ${d.trackingCode}`,
      picked_up:`Package picked up — on the way to ${d.recipientName}`,
      delivered:`Package delivered to ${d.recipientName} ✅`,
      failed:`Delivery attempt failed — driver will retry`,
    };
    if(msgs[status]) await db.collection('notifications').add({
      userId:d.senderId, type:'delivery_update',
      message:msgs[status], deliveryId:req.params.id,
      createdAt:admin.firestore.FieldValue.serverTimestamp(),
    });
    return ok(res, { deliveryId:req.params.id, status });
  } catch(e) { return fail(res,500,e.message); }
});

app.get('/delivery/track/:code', async (req,res) => {
  try {
    const snap = await db.collection('deliveries')
      .where('trackingCode','==',sanitize(req.params.code)).limit(1).get();
    if(snap.empty) return fail(res,404,'Tracking code not found');
    return ok(res, { delivery:{id:snap.docs[0].id,...snap.docs[0].data()} });
  } catch(e) { return fail(res,500,e.message); }
});

app.get('/delivery/history/:userId', requireAuth, async (req,res) => {
  try {
    const snap = await db.collection('deliveries')
      .where('senderId','==',sanitize(req.params.userId))
      .orderBy('createdAt','desc').limit(20).get();
    return ok(res, { deliveries:snap.docs.map(d=>({id:d.id,...d.data()})) });
  } catch(e) { return fail(res,500,e.message); }
});

// ── H. MAAS ADMIN ────────────────────────────────────────────

app.get('/admin/maas/stats', requireAdmin, async (req,res) => {
  try {
    const [schedSnap,rentalSnap,subSnap,dlvSnap,corpSnap,eventSnap] = await Promise.all([
      db.collection('scheduled_trips').where('active','==',true).get(),
      db.collection('rentals').where('status','==','active').get(),
      db.collection('subscriptions').where('status','==','active').get(),
      db.collection('deliveries').where('status','in',['pending','assigned','in_transit']).get(),
      db.collection('corporate_accounts').where('status','==','active').get(),
      db.collection('event_rides').where('status','in',['confirmed','assigned']).get(),
    ]);
    const rentalRevenue = rentalSnap.docs.reduce((s,d)=>s+(d.data().totalPrice||0),0);
    const subRevenue    = subSnap.docs.reduce((s,d)=>s+(d.data().monthlyFee||0),0);
    return ok(res, {
      activeSchedules:schedSnap.size, activeRentals:rentalSnap.size,
      activeSubscriptions:subSnap.size, pendingDeliveries:dlvSnap.size,
      corporateAccounts:corpSnap.size, upcomingEvents:eventSnap.size,
      monthlyRevenue:{ rentals:rentalRevenue, subscriptions:subRevenue, total:rentalRevenue+subRevenue },
    });
  } catch(e) { return fail(res,500,e.message); }
});

// MaaS scheduled dispatch endpoint (called by cron)
app.post('/maas/schedule/dispatch', async (_req,res) => {
  try {
    const now    = new Date();
    const soon   = new Date(now.getTime()+30*60*1000);
    const today  = now.getDay();
    const dateStr= now.toISOString().slice(0,10);
    const snap   = await db.collection('scheduled_trips')
      .where('active','==',true).where('paused','==',false).get();
    let dispatched = 0;
    for(const doc of snap.docs){
      const t = doc.data();
      if(!t.days.includes(today)) continue;
      if(t.skippedDates?.includes(dateStr)) continue;
      if(t.assignedDriverId) continue;
      const tripTime = t.adjustedTimes?.[dateStr]||t.departTime;
      const [h,m]    = tripTime.split(':').map(Number);
      const tripDate = new Date(now); tripDate.setHours(h,m,0,0);
      if(tripDate>now && tripDate<=soon){
        const drivers = await db.collection('drivers')
          .where('isOnline','==',true)
          .where('vehicleType','==',t.vehicleType).get();
        if(!drivers.empty){
          await doc.ref.update({ assignedDriverId:drivers.docs[0].id,
            assignedAt:admin.firestore.FieldValue.serverTimestamp() });
          await db.collection('notifications').add({
            userId:t.userId, type:'scheduled_trip_incoming',
            message:`Your ${t.name} departs at ${tripTime}. Driver is on the way.`,
            scheduleId:doc.id, createdAt:admin.firestore.FieldValue.serverTimestamp(),
          });
          dispatched++;
        }
      }
    }
    return ok(res, { dispatched });
  } catch(e) { return fail(res,500,e.message); }
});

// ════════════════════════════════════════════════════════════
// N. HEALTH CHECK (public)
// ════════════════════════════════════════════════════════════
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    version: '3.0.1',
    platform: 'Okada Online',
    region: 'Eastern Region, Ghana 🇬🇭',
    splits: { owner:'50%', driver:'25%', fuel:'5%', maintenance:'5%', platform:'15%' },
    bonuses: { female:'+2%', ev:'+2%', referral:'+2%' },
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// ════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════
exports.api = functions.https.onRequest(app);

// Reset daily earnings — midnight Accra time
exports.resetDailyEarnings = functions.pubsub
  .schedule('0 0 * * *').timeZone('Africa/Accra')
  .onRun(async () => {
    const [d, o] = await Promise.all([
      db.collection('drivers').get(),
      db.collection('owners').get(),
    ]);
    const b = db.batch();
    d.forEach(doc => b.update(doc.ref, { 'earnings.today': 0 }));
    o.forEach(doc => b.update(doc.ref, { 'earnings.today': 0 }));
    await b.commit();
    console.log('✅ Daily earnings reset');
  });

// Release pending earnings after 24hr hold
exports.releasePendingEarnings = functions.pubsub
  .schedule('0 1 * * *').timeZone('Africa/Accra')
  .onRun(async () => {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);
    const rides = await db.collection('rides')
      .where('completedAt','<=', cutoff)
      .where('earningsReleased','==', false).get();
    const b = db.batch();
    for (const doc of rides.docs) {
      const { driverId, ownerId, netDriverEarnings, netOwnerEarnings, fare } = doc.data();
      if (driverId && netDriverEarnings) {
        b.update(db.collection('drivers').doc(driverId), {
          'wallet.available': admin.firestore.FieldValue.increment(netDriverEarnings),
          'wallet.pending':   admin.firestore.FieldValue.increment(-netDriverEarnings),
        });
      }
      if (ownerId && netOwnerEarnings) {
        b.update(db.collection('owners').doc(ownerId), {
          'wallet.available': admin.firestore.FieldValue.increment(netOwnerEarnings),
          'wallet.pending':   admin.firestore.FieldValue.increment(-netOwnerEarnings),
        });
      }
      b.update(doc.ref, { earningsReleased: true });
    }
    await b.commit();
    console.log(`✅ Released earnings for ${rides.size} rides`);
  });

// Monthly savings interest
exports.applySavingsInterest = functions.pubsub
  .schedule('0 0 1 * *').timeZone('Africa/Accra')
  .onRun(async () => {
    const collections = ['users', 'drivers', 'owners'];
    let count = 0;
    for (const col of collections) {
      const snap = await db.collection(col).get();
      const b = db.batch();
      snap.forEach(doc => {
        const bal = doc.data()?.savings?.balance || 0;
        if (bal > 0) {
          const interest = +(bal * CFG.savings.monthlyRate).toFixed(2);
          b.update(doc.ref, {
            'savings.balance':      admin.firestore.FieldValue.increment(interest),
            'savings.interestEarned': admin.firestore.FieldValue.increment(interest),
          });
          count++;
        }
      });
      await b.commit();
    }
    console.log(`✅ Applied interest to ${count} accounts`);
  });

// Expire unpaid Journey inventory holds.
// A Journey is a payment-backed reservation intent; until payment is verified,
// its underlying transit bookings remain PAYMENT_PENDING and must not become
// permanent inventory consumption.
exports.expireJourneyPaymentHolds = functions.pubsub
  .schedule('every 5 minutes').timeZone('Africa/Accra')
  .onRun(async () => {
    const now = new Date();
    const snap = await db.collection('journeys')
      .where('status', '==', 'PENDING_PAYMENT')
      .where('paymentExpiresAt', '<=', now)
      .limit(100)
      .get();

    let expired = 0;
    for (const doc of snap.docs) {
      const journey = doc.data();
      if (!['PENDING', 'PAYMENT_PENDING'].includes(String(journey.paymentStatus || '').toUpperCase())) continue;

      try {
        await settleFailedJourneyPayment({
          db,
          admin,
          journeyId: doc.id,
          reference: journey.paymentReference || null,
          failureReason: 'Journey payment hold expired',
          paymentStatus: 'EXPIRED',
        });
        expired += 1;
      } catch (e) {
        console.error(`Journey payment expiry failed for ${doc.id}:`, e.message);
      }
    }

    console.log(`Journey payment holds expired: ${expired}`);
  });

// Nightly checks — defaults, overdue, renewals

// MaaS dispatch — every 5 minutes
exports.maasDispatch = functions.pubsub
  .schedule('every 5 minutes').timeZone('Africa/Accra')
  .onRun(async () => {
    const snap = await db.collection('scheduled_trips')
      .where('active','==',true).where('paused','==',false).get();
    const now = new Date(); const soon = new Date(now.getTime()+30*60*1000);
    const today = now.getDay(); const dateStr = now.toISOString().slice(0,10);
    let dispatched = 0;
    for(const doc of snap.docs){
      const t = doc.data();
      if(!t.days.includes(today)) continue;
      if(t.skippedDates?.includes(dateStr)) continue;
      if(t.assignedDriverId) continue;
      const tripTime = t.adjustedTimes?.[dateStr]||t.departTime;
      const [h,m] = tripTime.split(':').map(Number);
      const td = new Date(now); td.setHours(h,m,0,0);
      if(td>now && td<=soon){
        const drivers = await db.collection('drivers')
          .where('isOnline','==',true).where('vehicleType','==',t.vehicleType).get();
        if(!drivers.empty){
          await doc.ref.update({ assignedDriverId:drivers.docs[0].id,
            assignedAt:admin.firestore.FieldValue.serverTimestamp() });
          dispatched++;
        }
      }
    }
    console.log(`MaaS dispatch: ${dispatched} trips assigned`);
  });

// Rental expiry — daily
exports.rentalExpiry = functions.pubsub
  .schedule('0 6 * * *').timeZone('Africa/Accra')
  .onRun(async () => {
    const now  = new Date();
    const snap = await db.collection('rentals').where('status','==','active').get();
    const b    = db.batch();
    snap.docs.filter(d => d.data().endDate?.toDate?.() <= now)
             .forEach(d => b.update(d.ref, { status:'completed' }));
    await b.commit();
    console.log('Rental expiry check complete');
  });

exports.nightlyChecks = functions.pubsub
  .schedule('0 2 * * *').timeZone('Africa/Accra')
  .onRun(async () => {
    const now = new Date();

    // DTO defaults
    const activeDTO = await db.collection('dto_applications')
      .where('status','==','active').get();
    for (const doc of activeDTO.docs) {
      const last = doc.data().lastPayment?.toDate?.() || new Date(0);
      if ((now - last) / 86400000 > CFG.dto.defaultDays) {
        await doc.ref.update({ status: 'defaulted',
          defaultedAt: admin.firestore.FieldValue.serverTimestamp() });
        await db.collection('drivers').doc(doc.data().userId)
          .update({ isActive: false });
        console.log(`⚠️ DTO defaulted: ${doc.id}`);
      }
    }

    // Pay Later overdue
    const overdue = await db.collection('pay_later')
      .where('status','==','deferred')
      .where('dueDate','<=', now).get();
    for (const doc of overdue.docs) {
      await doc.ref.update({ status: 'overdue' });
      const u = await resolveUserRef(doc.data().userId);
      if (u) await u.ref.update({ 'payLater.suspended': true });
    }

    // Insurance renewals
    const expiring = await db.collection('insurance_policies')
      .where('status','==','active')
      .where('renewsAt','<=', now).get();
    for (const doc of expiring.docs) {
      const plan  = CFG.insurance[doc.data().planId];
      const u     = await resolveUserRef(doc.data().userId);
      const walBal = u?.data?.wallet?.available || 0;
      if (plan && u && walBal >= plan.premium) {
        const newExp = new Date(now);
        newExp.setMonth(newExp.getMonth() + 1);
        await doc.ref.update({ expiresAt: newExp, renewsAt: newExp });
        await u.ref.update({
          'wallet.available': admin.firestore.FieldValue.increment(-plan.premium),
        });
      } else {
        await doc.ref.update({ status: 'lapsed' });
        if (u) await u.ref.update({ 'insurance.status': 'lapsed' });
      }
    }

    console.log(`✅ Nightly checks complete`);
  });
