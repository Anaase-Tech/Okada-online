const API = process.env.REACT_APP_API_URL ||
  "https://us-central1-okada-online-ghana.cloudfunctions.net/api";

class Api {
  constructor() { this.token = null; }

  async req(method, path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(API + path, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Platform": "okada-online-pwa",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      clearTimeout(timeout);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Request failed");
      return d;
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === "AbortError") throw new Error("Request timed out — check connection");
      throw e;
    }
  }

  // ── Auth / KYC ─────────────────────────────────────
  sendOtp(phone, role)                          { return this.req("POST", "/auth/send-otp", { phone, role }); }
  verifyOtp(phone, otp, role, name, ownerCode)  { return this.req("POST", "/auth/verify-otp", { phone, otp, role, name, ownerCode }); }
  verifyGhanaCard(cardNum, photo, selfie)        { return this.req("POST", "/kyc/ghana-card", { cardNum, photo, selfie }); }
  verifyPassport(passNum, country, photo, selfie){ return this.req("POST", "/kyc/passport", { passNum, country, photo, selfie }); }

  // ── Rides ──────────────────────────────────────────
  requestRide(data)                              { return this.req("POST", "/rides/request", data); }
  acceptRide(rideId, driverId)                   { return this.req("POST", `/rides/${rideId}/accept`, { driverId }); }
  confirmCashPayment(rideId, driverId)           { return this.req("POST", `/rides/${rideId}/confirm-cash`, { driverId }); }
  completeRide(rideId)                           { return this.req("POST", `/rides/${rideId}/complete`, {}); }
  toggleOnline(id, isOnline, vehicleType)        { return this.req("PUT", `/drivers/${id}/status`, { isOnline, vehicleType }); }
  updateLocation(id, lat, lng)                   { return this.req("PUT", `/drivers/${id}/location`, { latitude: lat, longitude: lng }); }
  getOwnerDash(id)                               { return this.req("GET", `/owners/${id}/dashboard`); }
  getStats()                                     { return this.req("GET", "/admin/stats"); }
  getHistory(uid)                                { return this.req("GET", `/rides/history/${uid}`); }

  // ── Payments / Wallet ──────────────────────────────
  initPayment(rideId, amount, email, phone)      { return this.req("POST", "/payments/initialize", { rideId, amount, email, phone }); }
  verifyPayment(ref)                             { return this.req("GET", `/payments/verify/${ref}`); }
  payLaterRequest(rideId, userId)                { return this.req("POST", "/payments/pay-later", { rideId, userId }); }
  repayLater(userId, amount)                     { return this.req("POST", "/payments/repay-later", { userId, amount }); }
  requestWithdrawal(userId, amount, momoPhone)   { return this.req("POST", "/wallet/withdraw", { userId, amount, momoPhone }); }

  // ── Fintech ────────────────────────────────────────
  depositSavings(userId, amount)                 { return this.req("POST", "/fintech/savings/deposit", { userId, amount }); }
  withdrawSavings(userId, amount)                { return this.req("POST", "/fintech/savings/withdraw", { userId, amount }); }
  setSavingsRate(userId, percent)                { return this.req("PUT", `/fintech/savings/rate/${userId}`, { percent }); }
  applyLoan(userId, amount, purpose)             { return this.req("POST", "/fintech/loans/apply", { userId, amount, purpose }); }
  buyInsurance(userId, plan, vehicleId)          { return this.req("POST", "/insurance/buy", { userId, plan, vehicleId }); }
  fileInsuranceClaim(userId, type, desc)         { return this.req("POST", "/insurance/claim", { userId, type, desc }); }

  // ── MaaS: Scheduled Trips ──────────────────────────
  createSchedule(data)                   { return this.req("POST", "/maas/schedule/create", data); }
  adjustSchedule(id, data)               { return this.req("PUT", `/maas/schedule/${id}/adjust`, data); }
  pauseSchedule(id)                      { return this.req("PUT", `/maas/schedule/${id}/pause`, {}); }
  getTodaySchedules(uid)                 { return this.req("GET", `/maas/schedule/today/${uid}`); }

  // ── MaaS: Subscriptions ────────────────────────────
  createSubscription(data)               { return this.req("POST", "/maas/subscription/create", data); }
  getSubscriptionStatus(uid)             { return this.req("GET", `/maas/subscription/status/${uid}`); }

  // ── MaaS: Rental ───────────────────────────────────
  getRentalPricing()                     { return this.req("GET", "/maas/rental/pricing"); }
  bookRental(data)                       { return this.req("POST", "/maas/rental/book", data); }
  getActiveRentals(uid)                  { return this.req("GET", `/maas/rental/active/${uid}`); }

  // ── MaaS: Trip Sharing ─────────────────────────────
  createSharedTrip(data)                 { return this.req("POST", "/maas/share/create", data); }
  joinSharedTrip(shareId, userId)        { return this.req("POST", `/maas/share/${shareId}/join`, { userId }); }

  // ── MaaS: Events ───────────────────────────────────
  bookEventRide(data)                    { return this.req("POST", "/maas/events/book", data); }

  // ── Delivery ───────────────────────────────────────
  requestDelivery(data)                  { return this.req("POST", "/delivery/request", data); }
  trackDelivery(code)                    { return this.req("GET", `/delivery/track/${code}`); }
  getDeliveryHistory(uid)                { return this.req("GET", `/delivery/history/${uid}`); }

  // ── Admin ──────────────────────────────────────────
  getMaasStats()                         { return this.req("GET", "/admin/maas/stats"); }
}

export const api = new Api();
