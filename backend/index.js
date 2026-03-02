const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const axios = require('axios');

admin.initializeApp();
const db = admin.firestore();

// Twilio Setup (REAL SMS!)
const twilioClient = twilio(
  functions.config().twilio.sid,
  functions.config().twilio.token
);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION - 15% Commission!
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  commission: 0.15,
  baseFare: 3.0,
  pricePerKm: 0.8,
  pricePerKmExpress: 1.2,
  currency: 'GHS',
  twilioPhone: functions.config().twilio.phone
};

// ═══════════════════════════════════════════════════════════════
// REAL AUTHENTICATION WITH TWILIO SMS
// ═══════════════════════════════════════════════════════════════

app.post('/auth/send-otp', async (req, res) => {
  try {
    const { phone, role } = req.body;
    
    if (!phone || !phone.startsWith('+233')) {
      return res.status(400).json({ error: 'Invalid Ghana phone number' });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Save OTP to Firestore
    await db.collection('otps').doc(phone).set({
      otp,
      role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    
    // SEND REAL SMS via Twilio
    await twilioClient.messages.create({
      body: `Your Okada Online verification code is: ${otp}\n\nDrivers earn 85% with us! 🏍️`,
      from: CONFIG.twilioPhone,
      to: phone
    });
    
    res.json({ 
      success: true, 
      message: 'OTP sent via SMS',
      expiresIn: 300 
    });
    
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ 
      error: 'Failed to send OTP', 
      details: error.message 
    });
  }
});

app.post('/auth/verify-otp', async (req, res) => {
  try {
    const { phone, otp, role, name } = req.body;
    
    const otpDoc = await db.collection('otps').doc(phone).get();
    
    if (!otpDoc.exists) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    
    const otpData = otpDoc.data();
    
    if (otpData.expiresAt.toDate() < new Date()) {
      await db.collection('otps').doc(phone).delete();
      return res.status(400).json({ error: 'OTP expired' });
    }
    
    if (otpData.otp !== otp) {
      return res.status(400).json({ error: 'Incorrect OTP' });
    }
    
    // Create/Get User
    const collection = role === 'driver' ? 'drivers' : 'users';
    const userQuery = await db.collection(collection)
      .where('phone', '==', phone).get();
    
    let user;
    if (userQuery.empty) {
      const userData = {
        phone,
        name: name || '',
        role,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
        rating: 5.0,
        totalRides: 0
      };
      
      if (role === 'driver') {
        userData.isOnline = false;
        userData.isVerified = false;
        userData.earnings = { total: 0, today: 0, thisWeek: 0 };
        userData.location = null;
      }
      
      const userRef = await db.collection(collection).add(userData);
      user = { id: userRef.id, ...userData };
    } else {
      const userDoc = userQuery.docs[0];
      user = { id: userDoc.id, ...userDoc.data() };
    }
    
    // Create Firebase custom token
    const token = await admin.auth().createCustomToken(user.id);
    
    // Delete used OTP
    await db.collection('otps').doc(phone).delete();
    
    res.json({ 
      success: true, 
      token, 
      user,
      message: 'Authentication successful'
    });
    
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// REAL RIDE BOOKING WITH GPS
// ═══════════════════════════════════════════════════════════════

app.post('/rides/request', async (req, res) => {
  try {
    const { userId, pickupLocation, destination, rideType } = req.body;
    
    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Calculate real distance (simplified - use Google Maps API in production)
    const distance = calculateDistance(
      pickupLocation.latitude, pickupLocation.longitude,
      destination.latitude, destination.longitude
    );
    
    const duration = Math.ceil(distance * 3); // 3 min per km estimate
    
    // Calculate fare
    const pricePerKm = rideType === 'express' ? CONFIG.pricePerKmExpress : CONFIG.pricePerKm;
    const totalFare = Math.max(
      CONFIG.baseFare + (distance * pricePerKm),
      5.0
    );
    
    const driverEarnings = totalFare * (1 - CONFIG.commission);
    const platformFee = totalFare * CONFIG.commission;
    
    // Create ride
    const rideData = {
      userId,
      userName: userDoc.data().name,
      userPhone: userDoc.data().phone,
      pickupLocation: {
        address: pickupLocation.address || 'Pickup Location',
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude
      },
      destination: {
        address: destination.address || 'Destination',
        latitude: destination.latitude,
        longitude: destination.longitude
      },
      rideType: rideType || 'standard',
      status: 'requested',
      fare: {
        total: parseFloat(totalFare.toFixed(2)),
        driverEarnings: parseFloat(driverEarnings.toFixed(2)),
        platformFee: parseFloat(platformFee.toFixed(2)),
        currency: CONFIG.currency
      },
      distance: parseFloat(distance.toFixed(2)),
      estimatedDuration: duration,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const rideRef = await db.collection('rides').add(rideData);
    
    // Find nearby drivers (REAL-TIME)
    const nearbyDrivers = await findNearbyDrivers(
      pickupLocation.latitude,
      pickupLocation.longitude,
      5 // 5km radius
    );
    
    // Notify drivers via SMS
    for (const driver of nearbyDrivers.slice(0, 5)) {
      // Send SMS notification
      try {
        await twilioClient.messages.create({
          body: `New ride request! ${pickupLocation.address} → ${destination.address}. Fare: ₵${totalFare.toFixed(2)}. You earn: ₵${driverEarnings.toFixed(2)} (85%)`,
          from: CONFIG.twilioPhone,
          to: driver.phone
        });
      } catch (smsError) {
        console.error('SMS error:', smsError);
      }
      
      // Also save notification to DB
      await db.collection('notifications').add({
        driverId: driver.id,
        type: 'new_ride',
        rideId: rideRef.id,
        message: `New ride: ${pickupLocation.address}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false
      });
    }
    
    res.json({
      success: true,
      rideId: rideRef.id,
      fare: totalFare.toFixed(2),
      driverEarnings: driverEarnings.toFixed(2),
      distance: distance.toFixed(2),
      estimatedDuration: duration,
      nearbyDriversNotified: nearbyDrivers.length
    });
    
  } catch (error) {
    console.error('Request ride error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper: Calculate distance (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI/180);
}

// Helper: Find nearby drivers
async function findNearbyDrivers(lat, lng, radiusKm) {
  const drivers = [];
  const driversSnapshot = await db.collection('drivers')
    .where('isOnline', '==', true)
    .where('isVerified', '==', true)
    .get();
  
  driversSnapshot.forEach(doc => {
    const driver = doc.data();
    if (driver.location) {
      const distance = calculateDistance(
        lat, lng,
        driver.location.latitude,
        driver.location.longitude
      );
      if (distance <= radiusKm) {
        drivers.push({
          id: doc.id,
          ...driver,
          distance
        });
      }
    }
  });
  
  return drivers.sort((a, b) => a.distance - b.distance);
}

// ═══════════════════════════════════════════════════════════════
// DRIVER: ACCEPT RIDE
// ═══════════════════════════════════════════════════════════════

app.post('/rides/:rideId/accept', async (req, res) => {
  try {
    const { rideId } = req.params;
    const { driverId } = req.body;
    
    const rideRef = db.collection('rides').doc(rideId);
    const ride = await rideRef.get();
    
    if (!ride.exists) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    
    if (ride.data().status !== 'requested') {
      return res.status(400).json({ error: 'Ride no longer available' });
    }
    
    // Get driver data
    const driverDoc = await db.collection('drivers').doc(driverId).get();
    if (!driverDoc.exists) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    
    const driverData = driverDoc.data();
    
    // Update ride
    await rideRef.update({
      driverId,
      driverName: driverData.name,
      driverPhone: driverData.phone,
      driverRating: driverData.rating || 5.0,
      status: 'accepted',
      acceptedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Notify passenger via SMS
    const rideData = ride.data();
    await twilioClient.messages.create({
      body: `Driver ${driverData.name} accepted your ride! They're on the way. Track your ride in the app.`,
      from: CONFIG.twilioPhone,
      to: rideData.userPhone
    });
    
    res.json({ 
      success: true,
      message: 'Ride accepted',
      passenger: {
        name: rideData.userName,
        phone: rideData.userPhone
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// REAL-TIME GPS LOCATION UPDATE
// ═══════════════════════════════════════════════════════════════

app.put('/drivers/:driverId/location', async (req, res) => {
  try {
    const { driverId } = req.params;
    const { latitude, longitude, heading } = req.body;
    
    await db.collection('drivers').doc(driverId).update({
      location: {
        latitude,
        longitude,
        heading: heading || 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// REAL PAYMENT WITH PAYSTACK
// ═══════════════════════════════════════════════════════════════

app.post('/payments/initialize', async (req, res) => {
  try {
    const { rideId, amount, email, phone } = req.body;
    
    // Initialize Paystack payment
    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: email || `${phone.replace('+', '')}@okadaonline.com`,
        amount: Math.round(amount * 100), // Convert to pesewas
        currency: 'GHS',
        reference: `ride_${rideId}_${Date.now()}`,
        callback_url: `https://okadaonline.com/payment/callback`,
        metadata: {
          rideId,
          phone,
          custom_fields: [
            {
              display_name: 'Ride ID',
              variable_name: 'ride_id',
              value: rideId
            }
          ]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${functions.config().paystack.secret}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Save payment record
    await db.collection('payments').add({
      rideId,
      amount,
      currency: 'GHS',
      provider: 'paystack',
      reference: paystackResponse.data.data.reference,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      authorizationUrl: paystackResponse.data.data.authorization_url,
      accessCode: paystackResponse.data.data.access_code,
      reference: paystackResponse.data.data.reference
    });
    
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Paystack Webhook
app.post('/payments/webhook', async (req, res) => {
  try {
    const event = req.body;
    
    if (event.event === 'charge.success') {
      const { reference, metadata } = event.data;
      
      // Update payment status
      const paymentQuery = await db.collection('payments')
        .where('reference', '==', reference).get();
      
      if (!paymentQuery.empty) {
        const paymentDoc = paymentQuery.docs[0];
        await paymentDoc.ref.update({
          status: 'completed',
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Update ride status
        if (metadata.rideId) {
          await db.collection('rides').doc(metadata.rideId).update({
            paymentStatus: 'paid',
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export API
exports.api = functions.https.onRequest(app);

// Scheduled function to reset daily earnings
exports.resetDailyEarnings = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('Africa/Accra')
  .onRun(async () => {
    const driversSnapshot = await db.collection('drivers').get();
    const batch = db.batch();
    driversSnapshot.forEach(doc => {
      batch.update(doc.ref, { 'earnings.today': 0 });
    });
    await batch.commit();
  });
