
// ══════════════════════════════════════════════════════
// OKADA ONLINE — PRODUCTION BACKEND v2.0
// Owner/Driver Splits • Paystack • Twilio • USSD
// ══════════════════════════════════════════════════════

const functions  = require('firebase-functions');
const admin      = require('firebase-admin');
const express    = require('express');
const cors       = require('cors');
const twilio     = require('twilio');
const axios      = require('axios');

admin.initializeApp();
const db = admin.firestore();
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// ── Lazy Twilio init (avoids crash if config not set) ──
let sms;
const getSms = () => {
  if (!sms) sms = twilio(functions.config().twilio?.sid, functions.config().twilio?.token);
  return sms;
};

const CFG = {
  splits: { platform:0.15, owner:0.70, driver:0.10, fuel:0.03, maintenance:0.02 },
  fare:   { base:3.0, okada:2.5, car:4.0, tricycle:3.0, bicycle:1.5, min:5.0 },
  currency: 'GHS',
};

// ── Helpers ──────────────────────────────────────────
const toRad = d => d * Math.PI / 180;
function dist(la1,lo1,la2,lo2) {
  const dLa=toRad(la2-la1), dLo=toRad(lo2-lo1);
  const a=Math.sin(dLa/2)**2+Math.cos(toRad(la1))*Math.cos(toRad(la2))*Math.sin(dLo/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function calcFare(rideType, km) {
  const rate = CFG.fare[rideType] || CFG.fare.okada;
  const total = Math.max(CFG.fare.base + km * rate, CFG.fare.min);
  return {
    total:        +total.toFixed(2),
    owner:        +(total*CFG.splits.owner).toFixed(2),
    driver:       +(total*CFG.splits.driver).toFixed(2),
    fuel:         +(total*CFG.splits.fuel).toFixed(2),
    maintenance:  +(total*CFG.splits.maintenance).toFixed(2),
    platform:     +(total*CFG.splits.platform).toFixed(2),
  };
}
async function smsTo(phone, msg) {
  try {
    await getSms().messages.create({ body:msg, from:functions.config().twilio?.phone, to:phone });
  } catch(e) { console.error('SMS failed:', e.message); }
}

// ══════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════
app.post('/auth/send-otp', async (req,res) => {
  try {
    const { phone, role } = req.body;
    if (!phone?.startsWith('+233')) return res.status(400).json({ error:'Invalid Ghana phone' });
    const otp = Math.floor(100000+Math.random()*900000).toString();
    await db.collection('otps').doc(phone).set({
      otp, role, expiresAt: new Date(Date.now()+5*60*1000),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    await smsTo(phone, `Okada Online OTP: ${otp}\nValid 5 mins. DO NOT share. 🇬🇭`);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/auth/verify-otp', async (req,res) => {
  try {
    const { phone, otp, role, name, ownerCode } = req.body;
    const doc = await db.collection('otps').doc(phone).get();
    if (!doc.exists || doc.data().otp !== otp) return res.status(400).json({ error:'Invalid OTP' });
    if (doc.data().expiresAt.toDate() < new Date()) { await doc.ref.delete(); return res.status(400).json({ error:'OTP expired' }); }
    if (role==='driver' && !ownerCode) return res.status(400).json({ error:'Owner code required' });
    if (role==='driver') {
      const ow = await db.collection('owners').where('ownerCode','==',ownerCode).get();
      if (ow.empty) return res.status(400).json({ error:'Invalid owner code' });
    }
    const col = { driver:'drivers', owner:'owners', admin:'admins' }[role] || 'users';
    const q = await db.collection(col).where('phone','==',phone).get();
    let user;
    if (q.empty) {
      const base = { phone, name:name||'', role, rating:5.0, totalRides:0, isActive:true, createdAt:admin.firestore.FieldValue.serverTimestamp() };
      if (role==='driver')  Object.assign(base,{ ownerCode, isOnline:false, isVerified:false, earnings:{total:0,today:0,week:0}, location:null });
      if (role==='owner')   Object.assign(base,{ ownerCode:'OWN'+Math.random().toString(36).substr(2,6).toUpperCase(), vehicles:[], earnings:{total:0,today:0,week:0}, pools:{fuel:0,maintenance:0} });
      const ref = await db.collection(col).add(base);
      user = { id:ref.id, ...base };
    } else { user = { id:q.docs[0].id, ...q.docs[0].data() }; }
    const token = await admin.auth().createCustomToken(user.id);
    await doc.ref.delete();
    res.json({ success:true, token, user });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════════════════
// RIDES
// ══════════════════════════════════════════════════════
app.post('/rides/request', async (req,res) => {
  try {
    const { userId, pickupLocation, destination, rideType } = req.body;
    const user = await db.collection('users').doc(userId).get();
    if (!user.exists) return res.status(404).json({ error:'User not found' });
    const km = dist(pickupLocation.latitude,pickupLocation.longitude,destination.latitude,destination.longitude);
    const fare = calcFare(rideType,km);
    const ride = {
      userId, userName:user.data().name, userPhone:user.data().phone,
      pickupLocation, destination, rideType:rideType||'okada',
      status:'requested', fare, distance:+km.toFixed(2),
      estimatedDuration:Math.ceil(km*3),
      createdAt:admin.firestore.FieldValue.serverTimestamp()
    };
    const ref = await db.collection('rides').add(ride);
    const drivers = await db.collection('drivers').where('isOnline','==',true).where('isVerified','==',true).get();
    let notified=0;
    for (const d of drivers.docs) {
      const loc = d.data().location;
      if (!loc) continue;
      if (dist(pickupLocation.latitude,pickupLocation.longitude,loc.latitude,loc.longitude)>5) continue;
      await smsTo(d.data().phone,`🏍️ New ride!
${pickupLocation.address}→${destination.address}
Fare:₵${fare.total} You earn:₵${fare.driver}`);
      await db.collection('notifications').add({ driverId:d.id, type:'new_ride', rideId:ref.id, read:false, createdAt:admin.firestore.FieldValue.serverTimestamp() });
      notified++;
    }
    res.json({ success:true, rideId:ref.id, fare, nearbyDriversNotified:notified });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/rides/:rideId/accept', async (req,res) => {
  try {
    const rideRef = db.collection('rides').doc(req.params.rideId);
    const ride = await rideRef.get();
    if (!ride.exists) return res.status(404).json({ error:'Ride not found' });
    if (ride.data().status !== 'requested') return res.status(400).json({ error:'Ride no longer available' });
    const driver = await db.collection('drivers').doc(req.body.driverId).get();
    if (!driver.exists) return res.status(404).json({ error:'Driver not found' });
    await rideRef.update({ driverId:req.body.driverId, driverName:driver.data().name, driverPhone:driver.data().phone, status:'accepted', acceptedAt:admin.firestore.FieldValue.serverTimestamp() });
    await smsTo(ride.data().userPhone,`Driver ${driver.data().name} is on the way! Track in app. 🏍️`);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/rides/:rideId/complete', async (req,res) => {
  try {
    const rideRef = db.collection('rides').doc(req.params.rideId);
    const ride = await rideRef.get();
    if (!ride.exists || ride.data().status==='completed') return res.status(400).json({ error:'Invalid ride' });
    const driver = await db.collection('drivers').doc(ride.data().driverId).get();
    const ownerSnap = await db.collection('owners').where('ownerCode','==',driver.data().ownerCode).get();
    const fare = ride.data().fare;
    await rideRef.update({ status:'completed', completedAt:admin.firestore.FieldValue.serverTimestamp() });
    await db.collection('drivers').doc(ride.data().driverId).update({
      'earnings.total':admin.firestore.FieldValue.increment(fare.driver),
      'earnings.today':admin.firestore.FieldValue.increment(fare.driver),
      'earnings.week':admin.firestore.FieldValue.increment(fare.driver),
      totalRides:admin.firestore.FieldValue.increment(1)
    });
    if (!ownerSnap.empty) await ownerSnap.docs[0].ref.update({
      'earnings.total':admin.firestore.FieldValue.increment(fare.owner),
      'earnings.today':admin.firestore.FieldValue.increment(fare.owner),
      'pools.fuel':admin.firestore.FieldValue.increment(fare.fuel),
      'pools.maintenance':admin.firestore.FieldValue.increment(fare.maintenance),
      totalRides:admin.firestore.FieldValue.increment(1)
    });
    res.json({ success:true, splits:fare });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/rides/history/:userId', async (req,res) => {
  try {
    const snap = await db.collection('rides').where('userId','==',req.params.userId).orderBy('createdAt','desc').limit(20).get();
    res.json({ success:true, rides:snap.docs.map(d=>({id:d.id,...d.data()})) });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════════════════
// DRIVERS
// ══════════════════════════════════════════════════════
app.put('/drivers/:id/location', async (req,res) => {
  try {
    const { latitude,longitude,heading } = req.body;
    await db.collection('drivers').doc(req.params.id).update({ location:{ latitude,longitude,heading:heading||0,lastUpdated:admin.firestore.FieldValue.serverTimestamp() } });
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.put('/drivers/:id/status', async (req,res) => {
  try {
    await db.collection('drivers').doc(req.params.id).update({ isOnline:req.body.isOnline, vehicleType:req.body.vehicleType||'okada' });
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════════════════
// OWNERS
// ══════════════════════════════════════════════════════
app.get('/owners/:id/dashboard', async (req,res) => {
  try {
    const owner = await db.collection('owners').doc(req.params.id).get();
    if (!owner.exists) return res.status(404).json({ error:'Owner not found' });
    const drivers = await db.collection('drivers').where('ownerCode','==',owner.data().ownerCode).get();
    res.json({ success:true, data:{ ...owner.data().earnings, pools:owner.data().pools, ownerCode:owner.data().ownerCode, totalDrivers:drivers.size, activeDrivers:drivers.docs.filter(d=>d.data().isOnline).length } });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.get('/owners/:id/vehicles', async (req,res) => {
  try {
    const owner = await db.collection('owners').doc(req.params.id).get();
    res.json({ success:true, vehicles:owner.data()?.vehicles||[] });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════════════════════
app.post('/payments/initialize', async (req,res) => {
  try {
    const { rideId,amount,email,phone } = req.body;
    const r = await axios.post('https://api.paystack.co/transaction/initialize',{
      email: email||`${phone.replace('+','')}@okadaonline.com`,
      amount: Math.round(amount*100),
      currency:'GHS',
      reference:`ride_${rideId}_${Date.now()}`,
      callback_url:'https://okadaonline.vercel.app/payment/callback',
      metadata:{ rideId, phone }
    },{ headers:{ Authorization:`Bearer ${functions.config().paystack?.secret}` } });
    await db.collection('payments').add({ rideId,amount,currency:'GHS',provider:'paystack',reference:r.data.data.reference,status:'pending',createdAt:admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success:true, authorizationUrl:r.data.data.authorization_url, reference:r.data.data.reference });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

app.post('/payments/webhook', async (req,res) => {
  try {
    if (req.body.event==='charge.success') {
      const { reference,metadata } = req.body.data;
      const q = await db.collection('payments').where('reference','==',reference).get();
      if (!q.empty) { await q.docs[0].ref.update({ status:'completed',completedAt:admin.firestore.FieldValue.serverTimestamp() }); }
      if (metadata?.rideId) await db.collection('rides').doc(metadata.rideId).update({ paymentStatus:'paid',status:'completed' });
    }
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════════════════
// USSD  (*711#)
// ══════════════════════════════════════════════════════
app.post('/ussd/callback', async (req,res) => {
  const { sessionId,phoneNumber,text } = req.body;
  const parts = (text||'').split('*');
  let response = '';
  if (text==='') {
    response = `CON Welcome to Okada Online 🇬🇭\n1. Book Okada (₵2.50/km)\n2. Book Car (₵4.00/km)\n3. My Rides\n4. Driver earnings\n5. Help`;
  } else if (parts[0]==='1'&&parts.length===1) {
    response = `CON Enter pickup area:\n1. Akosombo\n2. Atimpoku\n3. Senchi\n4. Kpong\n5. Odumase`;
  } else if (parts[0]==='1'&&parts.length===2) {
    response = `CON Enter destination:\n1. Akosombo\n2. Atimpoku\n3. Senchi\n4. Kpong\n5. Odumase`;
  } else if (parts[0]==='1'&&parts.length===3) {
    response = `END Okada booked! A driver will call you shortly.\nEstimated fare: ₵${(Math.random()*10+5).toFixed(2)}\nTrack via app or wait for SMS. 🏍️`;
    setTimeout(()=>smsTo(phoneNumber,`Ride booked via USSD! Driver will call you. Est fare: ₵${(Math.random()*10+5).toFixed(2)} 🏍️`),0);
  } else if (parts[0]==='4') {
    response = `END Driver Earnings Info:\n• You earn 10% per ride\n• Owner earns 70%\n• Fuel pool: 3% (auto)\n• Maintenance: 2% (auto)\n• Platform: 15%\nFair & transparent! 🇬🇭`;
  } else if (parts[0]==='5') {
    response = `END Okada Online Support:\nCall: +233XXXXXXXXX\nWhatsApp: +233XXXXXXXXX\nDialing hours: 6am-10pm\n🇬🇭 FOR GHANA WITH LOVE`;
  } else {
    response = `END Invalid option. Dial *711# to try again.`;
  }
  res.set('Content-Type','text/plain');
  res.send(response);
});

// ══════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════
app.get('/admin/stats', async (req,res) => {
  try {
    const [rides,drivers,users,owners] = await Promise.all([
      db.collection('rides').get(),
      db.collection('drivers').get(),
      db.collection('users').get(),
      db.collection('owners').get(),
    ]);
    const revenue = rides.docs.reduce((s,d)=>s+(d.data().fare?.total||0),0);
    res.json({ success:true, data:{ totalRides:rides.size, activeRides:rides.docs.filter(d=>d.data().status==='ongoing').length, totalDrivers:drivers.size, onlineDrivers:drivers.docs.filter(d=>d.data().isOnline).length, users:users.size, owners:owners.size, revenue:+revenue.toFixed(2), commission:+(revenue*0.15).toFixed(2) } });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// ══════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════
exports.api = functions.https.onRequest(app);

exports.resetDailyEarnings = functions.pubsub.schedule('0 0 * * *').timeZone('Africa/Accra').onRun(async()=>{
  const [d,o] = await Promise.all([db.collection('drivers').get(),db.collection('owners').get()]);
  const b = db.batch();
  d.forEach(doc=>b.update(doc.ref,{'earnings.today':0}));
  o.forEach(doc=>b.update(doc.ref,{'earnings.today':0}));
  await b.commit();
});
