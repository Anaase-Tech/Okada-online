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
  // NOTE: real phone auth goes through Firebase client-side
  // (signInWithPhoneNumber) — AuthScreen calls /auth/create-profile
  // directly. These two are kept only in case anything still
  // references them, but the backend has no matching routes.
  sendOtp(phone, role)                          { return this.req("POST", "/auth/send-otp", { phone, role }); }
  verifyOtp(phone, otp, role, name, ownerCode)  { return this.req("POST", "/auth/verify-otp", { phone, otp, role, name, ownerCode }); }
  // Real KYC path is unified: POST /verify/kyc with docType ('ghana_card'|'passport'|'voters_id')
  verifyGhanaCard(userId, role, cardNum)         { return this.req("POST", "/verify/kyc", { userId, role, docType: "ghana_card", docNumber: cardNum }); }
  verifyPassport(userId, role, passNum)          { return this.req("POST", "/verify/kyc", { userId, role, docType: "passport", docNumber: passNum }); }

  // ── Rides ──────────────────────────────────────────
  requestRide(data)                              { return this.req("POST", "/rides/request", data); }
  acceptRide(rideId, driverId)                   { return this.req("POST", `/rides/${rideId}/accept`, { driverId }); }
  // There is no separate "confirm cash" endpoint — a cash-paid ride is
  // still completed through the same /complete route as any other ride;
  // the payment method itself doesn't change how the backend settles it.
  confirmCashPayment(rideId)                     { return this.req("POST", `/rides/${rideId}/complete`, {}); }
  completeRide(rideId)                           { return this.req("POST", `/rides/${rideId}/complete`, {}); }
  toggleOnline(id, isOnline, vehicleType)        { return this.req("PUT", `/drivers/${id}/status`, { isOnline, vehicleType }); }
  updateLocation(id, lat, lng)                   { return this.req("PUT", `/drivers/${id}/location`, { latitude: lat, longitude: lng }); }
  getOwnerDash(id)                               { return this.req("GET", `/owners/${id}/dashboard`); }
  getStats()                                     { return this.req("GET", "/admin/stats"); }
  getHistory(uid)                                { return this.req("GET", `/rides/history/${uid}`); }

  // ── Payments / Wallet ──────────────────────────────
  initPayment(rideId, amount, email, phone)      { return this.req("POST", "/payments/initialize", { rideId, amount, email, phone }); }
  // No GET /payments/verify/:ref route exists on the backend yet —
  // payment status updates arrive via the Paystack webhook instead.
  verifyPayment(ref)                             { return this.req("GET", `/payments/verify/${ref}`); }
  payLaterRequest(rideId, userId, amount)        { return this.req("POST", "/fintech/pay-later/request", { userId, rideId, amount }); }
  // FintechHub only ever has a lump "amount owed", not a specific
  // transaction id, so this repays by userId+amount; the backend finds
  // and settles the matching pending record(s) itself. Pass a specific
  // payLaterTxId instead when you actually have one (e.g. from a fetched
  // list of pending records).
  repayLater(userId, amountOrTxId)               {
    const isTxId = typeof amountOrTxId === "string";
    return this.req("POST", "/fintech/pay-later/repay",
      isTxId ? { userId, payLaterTxId: amountOrTxId } : { userId, amount: amountOrTxId });
  }
  getPayLaterHistory(uid)                        { return this.req("GET", `/fintech/pay-later/history/${uid}`); }
  requestWithdrawal(userId, amount, momoPhone)   { return this.req("POST", "/wallet/withdraw", { userId, amount, momoPhone }); }

  // ── Fintech ────────────────────────────────────────
  depositSavings(userId, amount)                 { return this.req("POST", "/fintech/savings/deposit", { userId, amount }); }
  withdrawSavings(userId, amount, momoPhone)     { return this.req("POST", "/fintech/savings/withdraw", { userId, amount, momoPhone }); }
  setSavingsRate(userId, rate)                   { return this.req("PUT", "/fintech/savings/rate", { userId, rate }); }
  getSavingsBalance(userId)                      { return this.req("GET", `/fintech/savings/balance/${userId}`); }
  applyLoan(userId, amount, purpose)             { return this.req("POST", "/fintech/loans/apply", { userId, amount, purpose }); }
  getLoanEligibility(userId)                     { return this.req("GET", `/fintech/loans/eligibility/${userId}`); }
  getLoanStatus(userId)                          { return this.req("GET", `/fintech/loans/status/${userId}`); }
  buyInsurance(userId, planId)                   { return this.req("POST", "/insurance/buy", { userId, planId }); }
  // Matches how FintechHub actually calls this: (userId, claimType, description).
  // policyId is optional server-side, so it's an optional 4th arg here too.
  fileInsuranceClaim(userId, claimType, description, policyId = "") { return this.req("POST", "/insurance/claim", { userId, policyId, claimType, description }); }
  getInsurancePolicy(userId)                     { return this.req("GET", `/insurance/policy/${userId}`); }

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

  // ── Okada Transit V1 ───────────────────────────────
  getTransitRoutes(from = "", to = "") {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return this.req("GET", `/transit/routes${q.toString() ? "?" + q.toString() : ""}`);
  }
  getTransitStations()                  { return this.req("GET", "/transit/stations"); }
  searchTransit(routeId, date)          { return this.req("GET", `/transit/search?routeId=${encodeURIComponent(routeId)}&date=${encodeURIComponent(date)}`); }
  bookTransit(data)                     { return this.req("POST", "/transit/book", data); }
  getTransitBooking(id)                 { return this.req("GET", `/transit/bookings/${encodeURIComponent(id)}`); }
  cancelTransitBooking(id, reason)      { return this.req("POST", `/transit/bookings/${encodeURIComponent(id)}/cancel`, { reason }); }

  // ── Admin ──────────────────────────────────────────
  getMaasStats()                         { return this.req("GET", "/admin/maas/stats"); }
}

export const api = new Api();
