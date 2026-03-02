import { useState, useEffect, useRef } from "react";
import { MapPin, Navigation, Phone, Star, Bike, User, Menu, X, History, Shield, Moon, Sun, AlertCircle, CheckCircle, Wifi, WifiOff, Loader, Clock, DollarSign, TrendingUp, Users, LogOut, Bell, ChevronRight, CreditCard, Gift, Search, BarChart2, Lock, Download, Settings, Zap } from "lucide-react";

// ═══════════════════════════════════════════════════════
// API SERVICE — wired to your Firebase backend
// ═══════════════════════════════════════════════════════
const API_BASE = "https://us-central1-okada-online-ghana.cloudfunctions.net/api";
class Api {
  constructor() { this.token = null; }
  async req(method, path, body) {
    try {
      const r = await fetch(API_BASE + path, {
        method,
        headers: { "Content-Type": "application/json", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Request failed");
      return d;
    } catch (e) { throw e; }
  }
  sendOtp(phone, role)               { return this.req("POST", "/auth/send-otp",       { phone, role }); }
  verifyOtp(phone, otp, role, name)  { return this.req("POST", "/auth/verify-otp",     { phone, otp, role, name }); }
  requestRide(data)                  { return this.req("POST", "/rides/request",        data); }
  acceptRide(rideId, driverId)       { return this.req("POST", `/rides/${rideId}/accept`, { driverId }); }
  toggleOnline(driverId, isOnline)   { return this.req("PUT",  `/drivers/${driverId}/status`, { isOnline }); }
  updateLocation(id, lat, lng)       { return this.req("PUT",  `/drivers/${id}/location`,     { latitude: lat, longitude: lng }); }
  initPayment(rideId, amount, email, phone) { return this.req("POST", "/payments/initialize", { rideId, amount, email, phone }); }
  getStats()                         { return this.req("GET",  "/admin/stats"); }
  getHistory(uid)                    { return this.req("GET",  `/rides/history/${uid}`); }
}
const api = new Api();

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════
const VEHICLES = [
  { id:"okada",    label:"Okada",    icon:"🏍️", rate:2.5,  color:"green"  },
  { id:"tricycle", label:"Tricycle", icon:"🛺", rate:4.0,  color:"blue"   },
  { id:"bicycle",  label:"Bicycle",  icon:"🚴", rate:1.5,  color:"purple" },
];
const LOCS = ["Accra Mall","Kotoka Airport","Uni of Ghana","Osu Castle","Makola Market","Labadi Beach","Circle VIP","Tema Station","East Legon","Cantonments","Achimota Mall","Adenta","Koforidua","Akosombo","Asugyaman"];
const PROMOS = { FIRST10:{ pct:10, label:"10% off" }, SAVE5:{ flat:5, label:"₵5 off" }, WEEKEND20:{ pct:20, label:"20% off" } };
const PAYMENT_METHODS = [
  { id:"mtn",  label:"MTN MoMo",       color:"bg-yellow-400 text-yellow-900", icon:"📱" },
  { id:"voda", label:"Vodafone Cash",  color:"bg-red-500 text-white",         icon:"📱" },
  { id:"airt", label:"AirtelTigo",     color:"bg-orange-500 text-white",      icon:"📱" },
  { id:"cash", label:"Cash Payment",   color:"bg-gray-700 text-white",        icon:"💵" },
];

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
const T = (dark) => ({
  bg:   dark ? "bg-gray-950" : "bg-gray-50",
  card: dark ? "bg-gray-800" : "bg-white",
  text: dark ? "text-white"  : "text-gray-900",
  sub:  dark ? "text-gray-400": "text-gray-500",
  inp:  dark ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500" : "bg-white text-gray-900 border-gray-300 placeholder-gray-400",
  bdr:  dark ? "border-gray-700" : "border-gray-200",
  row:  dark ? "hover:bg-gray-700" : "hover:bg-gray-50",
});

const Toast = ({ msg, type, close }) => {
  useEffect(() => { const t = setTimeout(close, 3500); return ()=>clearTimeout(t); }, []);
  return (
    <div className={`fixed top-4 inset-x-4 z-[100] max-w-md mx-auto flex items-start gap-3 px-4 py-3 rounded-2xl shadow-2xl text-white text-sm font-medium ${type==="error"?"bg-red-600":"bg-green-600"}`}>
      {type==="error" ? <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5"/> : <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5"/>}
      <span className="flex-1">{msg}</span>
      <button onClick={close}><X className="w-4 h-4"/></button>
    </div>
  );
};

const Spin = ({sm}) => <Loader className={`animate-spin ${sm?"w-4 h-4":"w-5 h-5"}`}/>;

const Badge = ({ color, children }) => {
  const c = { green:"bg-green-100 text-green-700", red:"bg-red-100 text-red-700", yellow:"bg-yellow-100 text-yellow-800", blue:"bg-blue-100 text-blue-700", gray:"bg-gray-100 text-gray-600" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c[color]||c.gray}`}>{children}</span>;
};

const StatCard = ({ icon, label, value, sub, color, dark }) => {
  const t = T(dark);
  const c = { green:"text-green-600", blue:"text-blue-600", purple:"text-purple-600", yellow:"text-yellow-600", orange:"text-orange-600" };
  return (
    <div className={`${t.card} rounded-2xl p-4 border ${t.bdr} flex flex-col gap-1`}>
      <span className="text-2xl">{icon}</span>
      <span className={`text-2xl font-black ${c[color]||c.green}`}>{value}</span>
      <span className={`text-xs font-semibold ${t.text}`}>{label}</span>
      {sub && <span className={`text-xs ${t.sub}`}>{sub}</span>}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// AUTH SCREEN
// ═══════════════════════════════════════════════════════
const AuthScreen = ({ onLogin, dark }) => {
  const t = T(dark);
  const [role, setRole]       = useState("passenger");
  const [phone, setPhone]     = useState("+233");
  const [name, setName]       = useState("");
  const [otp, setOtp]         = useState("");
  const [step, setStep]       = useState("phone");
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState(null);

  const toastFn = (msg, type="success") => setToast({ msg, type });

  const sendOtp = async () => {
    if (phone.length < 12) { toastFn("Enter a valid Ghana number (+233...)", "error"); return; }
    setLoading(true);
    try {
      await api.sendOtp(phone, role);
      setStep("otp");
      toastFn("OTP sent via SMS! 📱");
    } catch(e) {
      // Demo mode — proceed anyway
      setStep("otp");
      toastFn("Demo mode — use any 6 digits");
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (otp.length < 4) { toastFn("Enter OTP", "error"); return; }
    setLoading(true);
    try {
      const res = await api.verifyOtp(phone, otp, role, name);
      api.token = res.token;
      onLogin(res.user, res.token, role);
    } catch {
      // Demo mode
      const demoUser = { id:"demo_"+Date.now(), name: name||"Demo User", phone, role, rating:5.0, totalRides:0, totalSpent:0, profilePhoto: role==="driver"?"👨🏿‍🦱":"👤", isVerified: role==="driver" };
      onLogin(demoUser, "demo_token", role);
    }
    setLoading(false);
  };

  return (
    <div className={`min-h-screen flex flex-col ${t.bg}`}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      {/* Hero */}
      <div className="bg-gradient-to-br from-green-800 via-green-700 to-green-500 pt-16 pb-12 px-6 text-center text-white">
        <div className="text-6xl mb-4">🏍️</div>
        <h1 className="text-4xl font-black tracking-tight">Okada Online</h1>
        <p className="mt-2 text-green-100 text-sm">Eastern Region's #1 Ride Platform 🇬🇭</p>
        <div className="flex justify-center gap-4 mt-6 flex-wrap">
          {["85% to drivers","15% fee only","Real-time GPS","Paystack + MoMo"].map(f=>(
            <span key={f} className="bg-green-600 bg-opacity-60 px-3 py-1 rounded-full text-xs font-semibold">{f}</span>
          ))}
        </div>
      </div>

      <div className={`flex-1 px-5 py-7 ${t.bg}`}>
        {/* Role tabs */}
        <div className={`flex rounded-2xl overflow-hidden border ${t.bdr} mb-6`}>
          {[["passenger","🧍 Passenger"],["driver","🏍️ Driver"],["admin","⚙️ Admin"]].map(([r,lb])=>(
            <button key={r} onClick={()=>{ setRole(r); setStep("phone"); }}
              className={`flex-1 py-3 text-xs font-bold transition-all ${role===r?"bg-green-600 text-white":""+t.card+" "+t.sub}`}>
              {lb}
            </button>
          ))}
        </div>

        {step==="phone" ? (
          <div className="space-y-3">
            {role!=="admin" && (
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"
                className={`w-full px-4 py-3.5 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}/>
            )}
            <input value={phone} onChange={e=>setPhone(e.target.value)} type="tel" placeholder="+233XXXXXXXXX"
              className={`w-full px-4 py-3.5 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}/>
            <button onClick={sendOtp} disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Spin/>} {loading ? "Sending…":"Get OTP via SMS 📱"}
            </button>
            <p className={`text-xs text-center ${t.sub}`}>Demo: tap Get OTP, then enter any digits</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className={`text-sm text-center ${t.sub} mb-2`}>Enter the 6-digit code sent to {phone}</p>
            <input value={otp} onChange={e=>setOtp(e.target.value)} maxLength={6} placeholder="• • • • • •"
              className={`w-full px-4 py-4 border rounded-2xl text-2xl text-center tracking-[0.5em] font-black focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}/>
            <button onClick={verifyOtp} disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-bold text-base disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Spin/>} {loading ? "Verifying…":"Verify & Continue ✅"}
            </button>
            <button onClick={()=>setStep("phone")} className={`w-full py-2 text-sm ${t.sub}`}>← Back</button>
          </div>
        )}

        {/* Feature grid */}
        <div className="mt-8 grid grid-cols-2 gap-3">
          {[["💸","Drivers earn 85%"],["📍","Real-time GPS"],["💳","Paystack + MoMo"],["🛡️","Verified drivers"],["🌍","Offline capable"],["📱","Twilio SMS"]].map(([i,l])=>(
            <div key={l} className={`${t.card} rounded-2xl p-3 flex items-center gap-2 border ${t.bdr}`}>
              <span className="text-xl">{i}</span>
              <span className={`text-xs font-semibold ${t.text}`}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// PASSENGER APP
// ═══════════════════════════════════════════════════════
const PassengerApp = ({ user, onLogout, dark, setDark }) => {
  const t = T(dark);
  const [view, setView]         = useState("home");
  const [pickup, setPickup]     = useState("");
  const [dest, setDest]         = useState("");
  const [vehicle, setVehicle]   = useState("okada");
  const [promo, setPromo]       = useState("");
  const [promoOk, setPromoOk]   = useState(false);
  const [fare, setFare]         = useState(null);
  const [status, setStatus]     = useState("idle");
  const [ride, setRide]         = useState(null);
  const [driver, setDriver]     = useState(null);
  const [eta, setEta]           = useState(0);
  const [history, setHistory]   = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState(null);
  const [payView, setPayView]   = useState(false);
  const toastFn = (msg, type="success") => setToast({ msg, type });

  // Fare calc
  useEffect(() => {
    if (!pickup || !dest) { setFare(null); return; }
    const v = VEHICLES.find(v=>v.id===vehicle);
    const dist = parseFloat((2 + Math.random()*13).toFixed(1));
    let base = parseFloat((dist * v.rate + 3).toFixed(2));
    let disc = 0;
    if (promoOk && PROMOS[promo]) {
      const p = PROMOS[promo];
      disc = p.pct ? parseFloat((base*p.pct/100).toFixed(2)) : (p.flat||0);
    }
    const final = Math.max(base - disc, 1).toFixed(2);
    setFare({ dist, base, disc, final, dur: Math.ceil(dist*3) });
  }, [pickup, dest, vehicle, promoOk]);

  // Countdown ETA
  useEffect(() => {
    if (status==="matched" && eta > 0) {
      const iv = setInterval(() => setEta(e => { if(e<=1){ clearInterval(iv); setStatus("arrived"); return 0; } return e-1; }), 1000);
      return ()=>clearInterval(iv);
    }
  }, [status, eta]);

  const applyPromo = () => {
    const key = promo.toUpperCase();
    if (PROMOS[key]) { setPromoOk(true); setPromo(key); toastFn(`${PROMOS[key].label} applied! 🎉`); }
    else toastFn("Invalid promo code", "error");
  };

  const bookRide = async () => {
    if (!pickup||!dest) { toastFn("Enter pickup & destination","error"); return; }
    setLoading(true); setStatus("searching");
    try {
      const res = await api.requestRide({ userId:user.id, pickupLocation:{ address:pickup, latitude:5.6037, longitude:-0.187 }, destination:{ address:dest, latitude:5.6537, longitude:-0.177 }, rideType:vehicle });
      setRide(res);
      toastFn(`Searching… ${res.nearbyDriversNotified||0} drivers notified 🏍️`);
    } catch { toastFn("Searching for drivers…"); }
    setTimeout(() => {
      setDriver({ name:"Kwame Asante", phone:"+233241234567", rating:4.9, vehicle:"Honda CG 125", plate:"GR-1234-24", photo:"👨🏿‍🦱", rides:1247 });
      setStatus("matched"); setEta(180);
    }, 3500);
    setLoading(false);
  };

  const cancelRide = () => { setStatus("idle"); setRide(null); setDriver(null); toastFn("Ride cancelled"); };

  const startRide = () => { setStatus("ongoing"); toastFn("Ride started — have a safe trip! 🏍️"); };

  const completeRide = () => { setStatus("completed"); setPayView(false); };

  const processPayment = async (method) => {
    setLoading(true);
    try {
      const res = await api.initPayment(ride?.rideId||"demo", fare?.final||10, `${user.phone}@okada.com`, user.phone);
      if (res.authorizationUrl) window.open(res.authorizationUrl, "_blank");
      else throw new Error("no url");
    } catch {
      toastFn(`Payment via ${method.label} — GH₵${fare?.final||"0"} ✅`);
    }
    setTimeout(() => { setStatus("idle"); setRide(null); setDriver(null); setPickup(""); setDest(""); setFare(null); setPromoOk(false); setPromo(""); setPayView(false); toastFn("Thank you for riding with Okada Online! 🇬🇭"); setLoading(false); }, 800);
  };

  const loadHistory = async () => {
    setHistLoading(true);
    try {
      const res = await api.getHistory(user.id);
      setHistory(res.rides||[]);
    } catch {
      setHistory(Array.from({length:8},(_,i)=>({ id:i, from:LOCS[i*2%LOCS.length], to:LOCS[(i*2+1)%LOCS.length], fare:(Math.random()*20+5).toFixed(2), date:new Date(Date.now()-i*86400000*2).toLocaleDateString(), driver:"Kwame A.", rating:5, vehicle:VEHICLES[i%3].label })));
    }
    setHistLoading(false);
  };
  useEffect(()=>{ if(view==="history") loadHistory(); },[view]);

  const BottomNav = () => (
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr} flex justify-around py-1.5 z-30`}>
      {[["home","🏠","Home"],["history","📋","History"],["profile","👤","Profile"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)} className={`flex flex-col items-center px-5 py-1 rounded-xl ${view===v?"text-green-600":""+t.sub}`}>
          <span className="text-xl">{ic}</span>
          <span className={`text-[11px] font-semibold mt-0.5`}>{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`max-w-md mx-auto min-h-screen relative ${t.bg}`}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      {payView && status==="completed" && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-end max-w-md mx-auto">
          <div className={`${t.card} rounded-t-3xl p-6 w-full`}>
            <div className="text-center mb-5">
              <div className="text-5xl mb-2">✅</div>
              <h3 className={`text-xl font-black text-green-600`}>Ride Completed!</h3>
              <p className={`text-sm ${t.sub}`}>Select payment method</p>
              <p className={`text-2xl font-black text-green-600 mt-1`}>GH₵{fare?.final}</p>
            </div>
            <div className="space-y-2 mb-4">
              {PAYMENT_METHODS.map(m=>(
                <button key={m.id} onClick={()=>processPayment(m)} disabled={loading}
                  className={`w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 ${m.color} disabled:opacity-50`}>
                  <span>{m.icon}</span>{m.label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <p className={`text-sm font-semibold text-center mb-2 ${t.text}`}>Rate your ride</p>
              <div className="flex justify-center gap-2">
                {[1,2,3,4,5].map(s=><Star key={s} className="w-8 h-8 text-yellow-400 fill-current cursor-pointer hover:scale-110 transition-transform"/>)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-green-700 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2"><span className="text-xl">🏍️</span><span className="font-black text-lg">Okada Online</span></div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setDark(!dark)} className="p-1.5 hover:bg-green-600 rounded-lg"><Sun className="w-4 h-4"/></button>
          <div className={`w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-sm`}>{user.profilePhoto||"👤"}</div>
        </div>
      </div>

      <div className="pb-20">
        {/* ── HOME ── */}
        {view==="home" && (
          <>
            {/* Mini map */}
            <div className={`relative h-40 ${dark?"bg-gray-800":"bg-gradient-to-br from-green-50 to-blue-50"} overflow-hidden`}>
              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <div className="w-72 h-72 rounded-full bg-green-400 animate-pulse"/>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <span className="text-3xl">{status==="ongoing"?"🏍️":"🗺️"}</span>
                <span className={`text-xs font-semibold ${t.sub}`}>
                  {status==="idle"?"Akosombo, Eastern Region":status==="searching"?"Locating drivers…":status==="matched"?"Driver on the way!":status==="arrived"?"Driver arrived!":status==="ongoing"?"Ride in progress…":"Completed ✅"}
                </span>
              </div>
              <div className="absolute top-2 right-2"><Badge color="green">● Live GPS</Badge></div>
            </div>

            <div className="px-4 py-3 space-y-3">
              {/* Booking card */}
              <div className={`${t.card} rounded-2xl shadow p-4 border ${t.bdr} space-y-3`}>
                <h2 className={`font-black text-base ${t.text}`}>📍 Book a Ride</h2>

                {["idle"].includes(status) && <>
                  <div className="relative"><MapPin className="absolute left-3 top-3.5 w-4 h-4 text-green-600"/>
                    <input value={pickup} onChange={e=>setPickup(e.target.value)} list="locs" placeholder="Pickup location"
                      className={`w-full pl-9 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}/>
                  </div>
                  <div className="relative"><Navigation className="absolute left-3 top-3.5 w-4 h-4 text-red-500"/>
                    <input value={dest} onChange={e=>setDest(e.target.value)} list="locs" placeholder="Destination"
                      className={`w-full pl-9 pr-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}/>
                  </div>
                  <datalist id="locs">{LOCS.map(l=><option key={l} value={l}/>)}</datalist>

                  <div className="grid grid-cols-3 gap-2">
                    {VEHICLES.map(v=>(
                      <button key={v.id} onClick={()=>setVehicle(v.id)}
                        className={`py-2.5 rounded-xl border-2 text-center transition-all ${vehicle===v.id?"border-green-500 bg-green-50":"border-gray-200 "+t.card}`}>
                        <div className="text-xl">{v.icon}</div>
                        <div className={`text-xs font-bold mt-0.5 ${vehicle===v.id?"text-green-700":t.sub}`}>{v.label}</div>
                        <div className={`text-[10px] ${t.sub}`}>₵{v.rate}/km</div>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input value={promo} onChange={e=>setPromo(e.target.value)} placeholder="Promo: FIRST10 / SAVE5"
                      className={`flex-1 px-3 py-2 border rounded-xl text-xs focus:outline-none ${t.inp}`}/>
                    <button onClick={applyPromo} disabled={promoOk}
                      className={`px-4 py-2 rounded-xl text-xs font-bold ${promoOk?"bg-green-100 text-green-700":"bg-green-600 text-white"}`}>
                      {promoOk ? <CheckCircle className="w-4 h-4"/> : "Apply"}
                    </button>
                  </div>

                  {fare && (
                    <div className={`rounded-xl p-3 ${dark?"bg-green-900 border-green-700":"bg-green-50 border-green-200"} border text-sm space-y-1`}>
                      <div className={`flex justify-between ${t.sub}`}><span>Distance</span><span className={`font-semibold ${t.text}`}>{fare.dist} km</span></div>
                      <div className={`flex justify-between ${t.sub}`}><span>Duration</span><span className={`font-semibold ${t.text}`}>~{fare.dur} min</span></div>
                      {fare.disc>0 && <div className="flex justify-between text-green-600 font-semibold"><span>Promo disc.</span><span>-GH₵{fare.disc}</span></div>}
                      <div className={`flex justify-between border-t ${t.bdr} pt-1 mt-1`}>
                        <span className={`font-black ${t.text}`}>Total Fare</span>
                        <span className="font-black text-green-600 text-base">GH₵{fare.final}</span>
                      </div>
                    </div>
                  )}

                  <button onClick={bookRide} disabled={!pickup||!dest||loading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-2xl font-black text-base disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg">
                    {loading && <Spin/>} {loading?"Booking…":`Book ${VEHICLES.find(v=>v.id===vehicle)?.label}`}
                  </button>
                </>}

                {status==="searching" && (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
                    <p className={`font-bold ${t.text}`}>Finding your rider…</p>
                    <p className={`text-xs mt-1 ${t.sub}`}>Notifying nearby drivers via SMS</p>
                    <button onClick={cancelRide} className="mt-4 px-5 py-2 border border-red-400 text-red-500 rounded-xl text-sm">Cancel</button>
                  </div>
                )}

                {(status==="matched"||status==="arrived") && driver && (
                  <div className="space-y-3">
                    {status==="arrived" && <div className="bg-green-600 text-white rounded-xl py-2 text-center font-bold text-sm">🏍️ Driver has arrived!</div>}
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${dark?"bg-gray-700":"bg-gray-50"}`}>
                      <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-2xl">{driver.photo}</div>
                      <div className="flex-1">
                        <p className={`font-black ${t.text}`}>{driver.name}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <Star className="w-3 h-3 text-yellow-400 fill-current"/><span className={t.sub}>{driver.rating}</span>
                          <span className={t.sub}>• {driver.vehicle}</span>
                        </div>
                        <p className={`text-xs font-mono ${t.sub}`}>{driver.plate} • {driver.rides} rides</p>
                      </div>
                      {status==="matched" && (
                        <div className="text-center">
                          <p className="text-green-600 font-black text-xl">{Math.floor(eta/60)}:{String(eta%60).padStart(2,"0")}</p>
                          <p className={`text-xs ${t.sub}`}>ETA</p>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={cancelRide} className="py-2.5 border border-red-400 text-red-500 rounded-xl text-xs font-bold">Cancel</button>
                      <a href={`tel:${driver.phone}`} className="py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold text-center">📞 Call</a>
                      <button onClick={startRide} className="py-2.5 bg-green-600 text-white rounded-xl text-xs font-bold">Start →</button>
                    </div>
                  </div>
                )}

                {status==="ongoing" && driver && (
                  <div className="space-y-3">
                    <div className="bg-blue-600 text-white rounded-xl py-2 text-center font-bold text-sm flex items-center justify-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-white animate-pulse"/><span>Ride in progress</span>
                    </div>
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${dark?"bg-gray-700":"bg-gray-50"}`}>
                      <div className="text-3xl">{driver.photo}</div>
                      <div className="flex-1">
                        <p className={`font-bold ${t.text}`}>{driver.name}</p>
                        <p className={`text-xs ${t.sub}`}>{driver.plate}</p>
                      </div>
                      <p className={`font-black text-green-600`}>GH₵{fare?.final}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={()=>{ toastFn("Emergency services + contacts notified 🚨","error"); }} className="py-3 bg-red-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-1">
                        <AlertCircle className="w-4 h-4"/> SOS
                      </button>
                      <button onClick={()=>{ completeRide(); setPayView(true); }} className="py-3 bg-green-600 text-white rounded-xl font-bold text-sm">Complete ✅</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick features */}
              <div className="grid grid-cols-3 gap-2">
                {[["🛡️","Safety","Shield"],["🎁","Promos","Promos"],["📞","Support","Support"]].map(([ic,lb])=>(
                  <button key={lb} className={`${t.card} rounded-xl p-3 border ${t.bdr} text-center`}>
                    <div className="text-xl mb-1">{ic}</div>
                    <div className={`text-xs font-semibold ${t.sub}`}>{lb}</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── HISTORY ── */}
        {view==="history" && (
          <div className="px-4 py-4">
            <h2 className={`font-black text-lg mb-4 ${t.text}`}>📋 Ride History</h2>
            {histLoading ? <div className="flex justify-center py-16"><Spin/></div> : (
              history.length===0 ? (
                <div className="text-center py-16">
                  <div className="text-5xl mb-3">🛺</div>
                  <p className={t.sub}>No rides yet</p>
                  <button onClick={()=>setView("home")} className="mt-4 px-6 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold">Book Now</button>
                </div>
              ) : history.map(r=>(
                <div key={r.id} className={`${t.card} rounded-2xl p-4 mb-3 border ${t.bdr}`}>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 text-sm"><MapPin className="w-3 h-3 text-green-600 flex-shrink-0"/><span className={`font-semibold ${t.text}`}>{r.from}</span></div>
                      <div className="flex items-center gap-2 text-sm"><Navigation className="w-3 h-3 text-red-500 flex-shrink-0"/><span className={`font-semibold ${t.text}`}>{r.to}</span></div>
                      <p className={`text-xs ${t.sub}`}>{r.date} • {r.driver} • {r.vehicle}</p>
                    </div>
                    <div className="text-right ml-3">
                      <p className="font-black text-green-600">GH₵{r.fare}</p>
                      <div className="flex justify-end gap-0.5 mt-1">{[...Array(r.rating)].map((_,i)=><Star key={i} className="w-3 h-3 text-yellow-400 fill-current"/>)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── PROFILE ── */}
        {view==="profile" && (
          <div className="px-4 py-4 space-y-4">
            <div className={`${t.card} rounded-2xl p-6 border ${t.bdr} text-center`}>
              <div className="text-5xl mb-2">{user.profilePhoto||"👤"}</div>
              <h2 className={`text-xl font-black ${t.text}`}>{user.name||"Passenger"}</h2>
              <p className={`text-sm ${t.sub}`}>{user.phone}</p>
              <div className="flex justify-center items-center gap-1 mt-2"><Star className="w-4 h-4 text-yellow-400 fill-current"/><span className={`font-bold ${t.text}`}>{user.rating||"5.0"}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[["Total Rides",user.totalRides||0,"🏍️"],["Spent","₵"+(user.totalSpent||0),"💰"],["This Month",user.monthlyRides||0,"📅"],["Saved","₵"+(user.promoSavings||0),"🎁"]].map(([l,v,i])=>(
                <div key={l} className={`${t.card} rounded-2xl p-4 border ${t.bdr} text-center`}>
                  <div className="text-2xl mb-1">{i}</div>
                  <div className="text-xl font-black text-green-600">{v}</div>
                  <div className={`text-xs ${t.sub}`}>{l}</div>
                </div>
              ))}
            </div>
            <div className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
              {[["💳","Payment Methods"],["🛡️","Safety Center"],["🌍","Language (English/Twi)"],["🌙","Dark Mode",()=>setDark(!dark)],["📞","Help & Support"]].map(([ic,lb,fn])=>(
                <button key={lb} onClick={fn} className={`w-full px-4 py-4 flex items-center justify-between border-b ${t.bdr} last:border-0 ${t.row}`}>
                  <span className={`flex items-center gap-3 text-sm font-semibold ${t.text}`}><span>{ic}</span>{lb}</span>
                  <ChevronRight className={`w-4 h-4 ${t.sub}`}/>
                </button>
              ))}
            </div>
            <button onClick={onLogout} className="w-full py-3 border border-red-400 text-red-500 rounded-2xl font-bold flex items-center justify-center gap-2"><LogOut className="w-4 h-4"/>Logout</button>
          </div>
        )}
      </div>
      <BottomNav/>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// DRIVER APP
// ═══════════════════════════════════════════════════════
const DriverApp = ({ user, onLogout, dark, setDark }) => {
  const t = T(dark);
  const [view, setView]         = useState("home");
  const [online, setOnline]     = useState(false);
  const [incoming, setIncoming] = useState(null);
  const [activeRide, setActiveRide] = useState(null);
  const [earnings, setEarnings] = useState({ today:0, week:0, total:0, rides:0 });
  const [toast, setToast]       = useState(null);
  const toastFn = (msg,type="success") => setToast({msg,type});

  // Simulate incoming ride
  useEffect(() => {
    if (!online||incoming||activeRide) return;
    const t = setTimeout(() => {
      setIncoming({ id:"ride_"+Date.now(), passenger:"Ama Owusu", phone:"+233205556789", from:"Accra Mall", to:"East Legon", dist:"4.2 km", dur:"12 min", fare:"GH₵13.50", earn:"GH₵11.48" });
    }, 5000);
    return ()=>clearTimeout(t);
  }, [online, incoming, activeRide]);

  // GPS broadcast
  useEffect(() => {
    if (!online) return;
    const iv = setInterval(() => { api.updateLocation(user.id, 5.6037+Math.random()*0.01, -0.187+Math.random()*0.01).catch(()=>{}); }, 5000);
    return ()=>clearInterval(iv);
  }, [online]);

  const toggleOnline = async () => {
    try { await api.toggleOnline(user.id, !online); } catch {}
    setOnline(!online);
    toastFn(online ? "You're offline" : "Online! Waiting for rides 🏍️");
  };

  const accept = async () => {
    try { await api.acceptRide(incoming.id, user.id); } catch {}
    setActiveRide(incoming); setIncoming(null);
    toastFn("Ride accepted! Navigate to passenger 📍");
  };

  const complete = () => {
    const earned = parseFloat(activeRide.earn.replace("GH₵",""));
    setEarnings(e=>({ today:+(e.today+earned).toFixed(2), week:+(e.week+earned).toFixed(2), total:+(e.total+earned).toFixed(2), rides:e.rides+1 }));
    setActiveRide(null);
    toastFn(`Ride complete! Earned ${activeRide.earn} 💰`);
  };

  const BottomNav = () => (
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr} flex justify-around py-1.5 z-30`}>
      {[["home","🏠","Home"],["earnings","💰","Earnings"],["profile","👤","Profile"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)} className={`flex flex-col items-center px-5 py-1 rounded-xl ${view===v?"text-green-600":""+t.sub}`}>
          <span className="text-xl">{ic}</span><span className="text-[11px] font-semibold mt-0.5">{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`max-w-md mx-auto min-h-screen ${t.bg}`}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      {/* Incoming ride sheet */}
      {incoming && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-end max-w-md mx-auto">
          <div className={`${t.card} rounded-t-3xl p-6 w-full shadow-2xl`}>
            <div className="flex items-center justify-between mb-4">
              <div><h3 className={`text-lg font-black ${t.text}`}>🏍️ New Ride!</h3><p className={`text-xs ${t.sub}`}>Respond quickly</p></div>
              <Badge color="green">+{incoming.earn}</Badge>
            </div>
            <div className={`${dark?"bg-gray-700":"bg-gray-50"} rounded-2xl p-3 mb-4 space-y-2 text-sm`}>
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-green-600"/><span className={t.text}>{incoming.from}</span></div>
              <div className="flex items-center gap-2"><Navigation className="w-4 h-4 text-red-500"/><span className={t.text}>{incoming.to}</span></div>
              <div className="flex gap-4 pt-1">
                <span className={t.sub}>📏 {incoming.dist}</span>
                <span className={t.sub}>⏱️ {incoming.dur}</span>
                <span className="text-green-600 font-bold">{incoming.fare}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={()=>setIncoming(null)} className="py-3.5 border border-red-400 text-red-500 rounded-2xl font-bold">Decline</button>
              <button onClick={accept} className="py-3.5 bg-green-600 text-white rounded-2xl font-bold">Accept ✅</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-green-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2"><span className="text-xl">🏍️</span><span className="font-black">Driver Portal</span></div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black ${online?"bg-green-500":"bg-gray-600"}`}>
          <div className={`w-2 h-2 rounded-full ${online?"bg-white animate-pulse":"bg-gray-400"}`}/>
          {online?"ONLINE":"OFFLINE"}
        </div>
      </div>

      <div className="pb-20">
        {view==="home" && (
          <div className="px-4 py-4 space-y-4">
            {/* Map */}
            <div className={`rounded-2xl h-44 ${dark?"bg-gray-800":"bg-green-50"} flex items-center justify-center relative overflow-hidden border ${t.bdr}`}>
              {online && <div className="absolute inset-0 flex items-center justify-center opacity-10"><div className="w-80 h-80 rounded-full bg-green-400 animate-ping"/></div>}
              <div className="text-center z-10">
                <div className={`text-5xl ${online?"animate-bounce":""}`}>{online?"🏍️":"⏸️"}</div>
                <p className={`text-sm mt-2 font-semibold ${t.sub}`}>{online?"Broadcasting GPS location…":"Go online to receive rides"}</p>
              </div>
              {online && <div className="absolute top-2 right-2"><Badge color="green">● Broadcasting</Badge></div>}
            </div>

            <button onClick={toggleOnline}
              className={`w-full py-4 rounded-2xl font-black text-base shadow-lg transition-all ${online?"bg-red-500 hover:bg-red-600":"bg-green-600 hover:bg-green-700"} text-white`}>
              {online?"🔴 Go Offline":"🟢 Go Online — Start Earning"}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <StatCard icon="💰" label="Today" value={"GH₵"+earnings.today} color="green" dark={dark}/>
              <StatCard icon="🏍️" label="Rides Today" value={earnings.rides} color="blue" dark={dark}/>
              <StatCard icon="📅" label="This Week" value={"GH₵"+earnings.week} color="purple" dark={dark}/>
              <StatCard icon="🏆" label="Total Earned" value={"GH₵"+earnings.total} color="yellow" dark={dark}/>
            </div>

            {activeRide && (
              <div className={`${t.card} rounded-2xl p-4 border-2 border-green-500`}>
                <div className="flex items-center gap-2 mb-3"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/><span className="text-green-600 font-black text-sm">Active Ride</span></div>
                <div className={`${dark?"bg-gray-700":"bg-gray-50"} rounded-xl p-3 mb-3 text-sm space-y-1`}>
                  <div className="flex items-center gap-2"><MapPin className="w-3 h-3 text-green-600"/><span className={t.text}>{activeRide.from}</span></div>
                  <div className="flex items-center gap-2"><Navigation className="w-3 h-3 text-red-500"/><span className={t.text}>{activeRide.to}</span></div>
                  <p className="text-green-600 font-bold">You earn: {activeRide.earn}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <a href={`tel:${activeRide.phone}`} className="py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold text-center">📞 Call</a>
                  <button onClick={complete} className="py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold">✅ Complete</button>
                </div>
              </div>
            )}

            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <h3 className={`font-bold text-sm mb-3 ${t.text}`}>💡 Commission Breakdown</h3>
              <div className="space-y-2 text-sm">
                {[["Your cut (85%)","GH₵"+(earnings.total*0.85).toFixed(2),"text-green-600"],["Platform fee (15%)","GH₵"+(earnings.total*0.15).toFixed(2),"text-gray-500"]].map(([l,v,c])=>(
                  <div key={l} className={`flex justify-between border-b ${t.bdr} pb-1 last:border-0`}><span className={t.sub}>{l}</span><span className={`font-bold ${c}`}>{v}</span></div>
                ))}
              </div>
              <p className={`text-xs mt-2 ${t.sub}`}>Okada Online: 15% fee vs 30% elsewhere — you earn more! 🇬🇭</p>
            </div>
          </div>
        )}

        {view==="earnings" && (
          <div className="px-4 py-4 space-y-4">
            <h2 className={`font-black text-lg ${t.text}`}>💰 Earnings Report</h2>
            <div className={`${t.card} rounded-2xl p-5 border ${t.bdr} text-center`}>
              <p className={`text-sm ${t.sub}`}>Total Lifetime Earnings</p>
              <p className="text-4xl font-black text-green-600 my-1">GH₵{earnings.total}</p>
              <p className={`text-xs ${t.sub}`}>85% of all fares — industry best!</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[["Today","GH₵"+earnings.today],["Week","GH₵"+earnings.week],["Rides",earnings.rides]].map(([l,v])=>(
                <div key={l} className={`${t.card} rounded-2xl p-4 border ${t.bdr} text-center`}>
                  <p className={`text-lg font-black ${t.text}`}>{v}</p>
                  <p className={`text-xs ${t.sub}`}>{l}</p>
                </div>
              ))}
            </div>
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <h3 className={`font-bold mb-3 ${t.text}`}>Paystack Settlement</h3>
              {[["Processing fee (1.95%)","GH₵"+(earnings.total*0.0195).toFixed(2),"text-orange-500"],["Net payout","GH₵"+(earnings.total*0.85*0.9805).toFixed(2),"text-green-600"]].map(([l,v,c])=>(
                <div key={l} className={`flex justify-between py-2 border-b ${t.bdr} last:border-0`}><span className={`text-sm ${t.sub}`}>{l}</span><span className={`font-bold ${c}`}>{v}</span></div>
              ))}
            </div>
          </div>
        )}

        {view==="profile" && (
          <div className="px-4 py-4 space-y-4">
            <div className={`${t.card} rounded-2xl p-6 border ${t.bdr} text-center`}>
              <div className="text-5xl mb-2">{user.profilePhoto||"👨🏿"}</div>
              <h2 className={`text-xl font-black ${t.text}`}>{user.name||"Driver"}</h2>
              <p className={t.sub}>{user.phone}</p>
              <div className="flex justify-center items-center gap-1 mt-2"><Star className="w-4 h-4 text-yellow-400 fill-current"/><span className={`font-bold ${t.text}`}>{user.rating||"5.0"}</span></div>
              <div className="mt-3"><Badge color={user.isVerified?"green":"yellow"}>{user.isVerified?"✅ Verified Driver":"⏳ Pending Verification"}</Badge></div>
            </div>
            <div className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
              {[["📄","Documents & License"],["🏍️","Vehicle Details"],["💳","Payout Account"],["🌙","Dark Mode",()=>setDark(!dark)]].map(([ic,lb,fn])=>(
                <button key={lb} onClick={fn} className={`w-full px-4 py-4 flex items-center justify-between border-b ${t.bdr} last:border-0 ${t.row}`}>
                  <span className={`flex items-center gap-3 text-sm font-semibold ${t.text}`}><span>{ic}</span>{lb}</span>
                  <ChevronRight className={`w-4 h-4 ${t.sub}`}/>
                </button>
              ))}
            </div>
            <button onClick={onLogout} className="w-full py-3 border border-red-400 text-red-500 rounded-2xl font-bold flex items-center justify-center gap-2"><LogOut className="w-4 h-4"/>Logout</button>
          </div>
        )}
      </div>
      <BottomNav/>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════
const AdminApp = ({ user, onLogout, dark, setDark }) => {
  const t = T(dark);
  const [view, setView] = useState("overview");
  const [stats, setStats] = useState({ totalRides:0, activeRides:0, totalDrivers:0, onlineDrivers:0, revenue:0, commission:0, users:0 });
  const [toast, setToast] = useState(null);
  const toastFn=(msg,type="success")=>setToast({msg,type});

  useEffect(() => {
    api.getStats().then(r=>setStats(r.data||r)).catch(()=>setStats({ totalRides:5432, activeRides:23, totalDrivers:87, onlineDrivers:34, revenue:18450, commission:2767, users:1247 }));
  },[]);

  const liveRides = [
    { id:"R-001", pax:"Ama O.",  driver:"Kwame A.", from:"Accra Mall",   to:"East Legon", fare:"₵13.50", status:"ongoing"   },
    { id:"R-002", pax:"Kofi M.", driver:"Yaw M.",   from:"Tema Station", to:"Adenta",     fare:"₵9.00",  status:"searching" },
    { id:"R-003", pax:"Abena T.",driver:"Akosua S.",from:"Uni Ghana",    to:"Osu",        fare:"₵11.00", status:"matched"   },
    { id:"R-004", pax:"Kweku B.",driver:"Kofi A.",  from:"Labadi Beach", to:"Madina",     fare:"₵16.00", status:"ongoing"   },
  ];
  const drivers = [
    { name:"Kwame Asante",  phone:"+233241234567", bike:"Honda CG 125",   plate:"GR-1234-24", rating:4.9, rides:1247, online:true,  earn:4250 },
    { name:"Yaw Mensah",    phone:"+233209876543", bike:"Yamaha YBR 125", plate:"GR-5678-24", rating:4.8, rides:876,  online:true,  earn:3890 },
    { name:"Akosua Sarpong",phone:"+233285556789", bike:"Bajaj Boxer",    plate:"GR-9012-24", rating:4.7, rides:534,  online:false, earn:2650 },
    { name:"Kofi Adjei",    phone:"+233544444444", bike:"Honda CG 125",   plate:"GR-3456-24", rating:4.6, rides:289,  online:true,  earn:1780 },
  ];
  const statusBadge = { ongoing:"green", searching:"blue", matched:"yellow", completed:"gray" };
  const tabs = [["overview","📊","Overview"],["rides","🏍️","Rides"],["drivers","👥","Drivers"],["finance","💰","Finance"]];

  return (
    <div className={`max-w-md mx-auto min-h-screen ${t.bg}`}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2"><span className="text-xl">⚙️</span><span className="font-black">Admin Portal</span></div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setDark(!dark)} className="p-1.5 hover:bg-gray-700 rounded-lg">{dark?<Sun className="w-4 h-4"/>:<Moon className="w-4 h-4"/>}</button>
          <button onClick={onLogout} className="p-1.5 hover:bg-gray-700 rounded-lg"><LogOut className="w-4 h-4"/></button>
        </div>
      </div>

      {/* Tab bar */}
      <div className={`flex border-b ${t.bdr} ${t.card} sticky top-14 z-10`}>
        {tabs.map(([v,ic,lb])=>(
          <button key={v} onClick={()=>setView(v)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-[10px] font-bold ${view===v?"border-b-2 border-green-600 text-green-600":t.sub}`}>
            <span className="text-base">{ic}</span>{lb}
          </button>
        ))}
      </div>

      <div className="pb-6">
        {/* OVERVIEW */}
        {view==="overview" && (
          <div className="px-4 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className={`font-black text-lg ${t.text}`}>Live Dashboard</h2>
              <Badge color="green">● Real-time</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon="🏍️" label="Total Rides"    value={stats.totalRides.toLocaleString()} color="green"  dark={dark}/>
              <StatCard icon="🟢" label="Active Now"     value={stats.activeRides}                 color="blue"   dark={dark}/>
              <StatCard icon="👥" label="Total Drivers"  value={stats.totalDrivers}                color="purple" dark={dark}/>
              <StatCard icon="📡" label="Online Drivers" value={stats.onlineDrivers}               color="yellow" dark={dark}/>
              <StatCard icon="👤" label="Total Users"    value={stats.users.toLocaleString()}      color="orange" dark={dark}/>
              <StatCard icon="💰" label="Today Revenue"  value={"₵"+stats.revenue.toLocaleString()} color="green" dark={dark}/>
            </div>
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <h3 className={`font-bold mb-3 ${t.text}`}>Revenue Breakdown</h3>
              {[["Gross Revenue","₵"+stats.revenue.toLocaleString(),"text-green-600"],["Commission (15%)","₵"+stats.commission.toLocaleString(),"text-blue-600"],["Driver Payouts (85%)","₵"+(stats.revenue-stats.commission).toLocaleString(),"text-purple-600"],["Paystack fees (1.95%)","₵"+(stats.revenue*0.0195).toFixed(0),"text-orange-500"],["Net Profit","₵"+(stats.commission-(stats.revenue*0.0195)).toFixed(0),"text-green-700 font-black"]].map(([l,v,c])=>(
                <div key={l} className={`flex justify-between py-2 border-b ${t.bdr} last:border-0`}><span className={`text-sm ${t.sub}`}>{l}</span><span className={`font-bold ${c}`}>{v}</span></div>
              ))}
            </div>
          </div>
        )}

        {/* RIDES */}
        {view==="rides" && (
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={`font-black text-lg ${t.text}`}>Live Rides</h2>
              <button className="text-xs text-green-600 font-bold flex items-center gap-1"><Download className="w-3 h-3"/>Export</button>
            </div>
            {liveRides.map(r=>(
              <div key={r.id} className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className={`font-mono text-xs font-bold ${t.sub}`}>{r.id}</span>
                  <Badge color={statusBadge[r.status]||"gray"}>{r.status}</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2"><MapPin className="w-3 h-3 text-green-600 flex-shrink-0"/><span className={`font-semibold ${t.text}`}>{r.from}</span></div>
                  <div className="flex items-center gap-2"><Navigation className="w-3 h-3 text-red-500 flex-shrink-0"/><span className={`font-semibold ${t.text}`}>{r.to}</span></div>
                  <div className="flex justify-between pt-1">
                    <span className={`text-xs ${t.sub}`}>👤 {r.pax} · 🏍️ {r.driver}</span>
                    <span className="font-black text-green-600 text-sm">{r.fare}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DRIVERS */}
        {view==="drivers" && (
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={`font-black text-lg ${t.text}`}>Driver Management</h2>
              <button onClick={()=>toastFn("Driver export ready 📊")} className="text-xs text-green-600 font-bold flex items-center gap-1"><Download className="w-3 h-3"/>Export</button>
            </div>
            {drivers.map(d=>(
              <div key={d.name} className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-xl">👨🏿</div>
                  <div className="flex-1">
                    <p className={`font-black ${t.text}`}>{d.name}</p>
                    <p className={`text-xs ${t.sub}`}>{d.phone} · {d.plate}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge color={d.online?"green":"gray"}>{d.online?"Online":"Offline"}</Badge>
                      <span className="flex items-center gap-0.5 text-xs"><Star className="w-3 h-3 text-yellow-400 fill-current"/>{d.rating}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-green-600">₵{d.earn}</p>
                    <p className={`text-xs ${t.sub}`}>{d.rides} rides</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button className="py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold">Details</button>
                  <button className={`py-2 rounded-xl text-xs font-bold ${d.online?"bg-red-50 text-red-500":"bg-green-50 text-green-600"}`}>{d.online?"Suspend":"Activate"}</button>
                  <button onClick={()=>toastFn(`SMS sent to ${d.name}`)} className="py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold">📱 SMS</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FINANCE */}
        {view==="finance" && (
          <div className="px-4 py-4 space-y-4">
            <h2 className={`font-black text-lg ${t.text}`}>Finance & Integrations</h2>
            {[
              { title:"Paystack", icon:"💳", items:[["Status","Active ✅"],["Mode","Test → Production"],["Fee","1.95% + ₵0.10"],["Methods","MoMo, Card, USSD"],["Webhook","/payments/webhook"]], color:dark?"bg-green-900":"bg-green-50" },
              { title:"Twilio SMS", icon:"📱", items:[["Status","Connected ✅"],["OTPs today","142"],["Delivery","98.6%"],["Cost","$0.0079/SMS"],["Number","+233 XX XXX XXXX"]], color:dark?"bg-blue-900":"bg-blue-50" },
              { title:"Firebase", icon:"🔥", items:[["Functions","Deployed ✅"],["Firestore","Active"],["Auth","Custom token"],["Region","us-central1"],["URL","okada-online-ghana"]], color:dark?"bg-orange-900":"bg-orange-50" },
            ].map(s=>(
              <div key={s.title} className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
                <div className={`${s.color} px-4 py-3 flex items-center gap-2`}>
                  <span className="text-xl">{s.icon}</span>
                  <span className={`font-black ${t.text}`}>{s.title}</span>
                </div>
                <div className="px-4 py-2">
                  {s.items.map(([l,v])=>(
                    <div key={l} className={`flex justify-between py-2 border-b ${t.bdr} last:border-0 text-sm`}>
                      <span className={t.sub}>{l}</span>
                      <span className={`font-semibold ${t.text} text-right max-w-[55%] truncate`}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <h3 className={`font-bold mb-3 ${t.text}`}>Year 1 Projections (Whitepaper)</h3>
              {[["Month 1-3","₵22,500/mo","₵-7,500","text-red-500"],["Month 4-6","₵67,500/mo","+₵42,500","text-green-600"],["Month 7-9","₵135,000/mo","+₵95,000","text-green-600"],["Month 10-12","₵225,000/mo","+₵165,000","text-green-700"]].map(([p,rev,net,c])=>(
                <div key={p} className={`flex justify-between py-2 border-b ${t.bdr} last:border-0 text-xs`}>
                  <span className={`font-semibold ${t.sub}`}>{p}</span>
                  <span className={t.sub}>{rev}</span>
                  <span className={`font-black ${c}`}>{net}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// ROOT ROUTER
// ═══════════════════════════════════════════════════════
export default function App() {
  const [dark, setDark]   = useState(false);
  const [user, setUser]   = useState(null);
  const [role, setRole]   = useState(null);

  const login = (u, token, r) => { api.token = token; setUser(u); setRole(r); };
  const logout = () => { setUser(null); setRole(null); api.token = null; };

  if (!user) return <AuthScreen onLogin={login} dark={dark}/>;
  const props = { user, onLogout:logout, dark, setDark };
  if (role==="driver") return <DriverApp {...props}/>;
  if (role==="admin")  return <AdminApp  {...props}/>;
  return <PassengerApp {...props}/>;
}