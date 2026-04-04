
import { useState, useEffect, useRef } from "react";
import { auth } from "./firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import {
  MapPin, Navigation, Star, X, Moon, Sun, AlertCircle, CheckCircle,
  Loader, LogOut, ChevronRight, Building2, Fuel, Wrench, Eye, EyeOff,
  Copy, Upload, Shield, FileText, Car, User, Clock, TrendingUp,
  CheckSquare, XCircle, Bell, Award
} from "lucide-react";

// ── API ────────────────────────────────────────────────
const API = process.env.REACT_APP_API_URL ||
  "https://us-central1-okada-online-ghana.cloudfunctions.net/api";

class Api {
  constructor() { this.token = null; }
  async req(method, path, body) {
    try {
      const r = await fetch(API + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Request failed");
      return d;
    } catch(e) { throw e; }
  }
  createProfile(data)                      { return this.req("POST","/auth/create-profile",data); }
  getProfile(uid)                          { return this.req("GET",`/auth/profile/${uid}`); }
  submitKyc(data)                          { return this.req("POST","/verify/kyc",data); }
  submitLicense(data)                      { return this.req("POST","/verify/license",data); }
  submitVehicle(data)                      { return this.req("POST","/verify/vehicle",data); }
  requestRide(data)                        { return this.req("POST","/rides/request",data); }
  acceptRide(rideId,driverId)              { return this.req("POST",`/rides/${rideId}/accept`,{driverId}); }
  completeRide(rideId)                     { return this.req("POST",`/rides/${rideId}/complete`,{}); }
  toggleOnline(id,isOnline,vehicleType)    { return this.req("PUT",`/drivers/${id}/status`,{isOnline,vehicleType}); }
  updateLocation(id,lat,lng)               { return this.req("PUT",`/drivers/${id}/location`,{latitude:lat,longitude:lng}); }
  updateProfile(id,data)                   { return this.req("PUT",`/drivers/${id}/profile`,data); }
  getOwnerDash(id)                         { return this.req("GET",`/owners/${id}/dashboard`); }
  dtoApply(data)                           { return this.req("POST","/dto/apply",data); }
  dtoStatus(userId)                        { return this.req("GET",`/dto/status/${userId}`); }
  getFuelCode(driverId)                    { return this.req("POST",`/dto/fuel-code/${driverId}`,{}); }
  getSavingsBalance(userId)                { return this.req("GET",`/fintech/savings/balance/${userId}`); }
  getLoanStatus(userId)                    { return this.req("GET",`/fintech/loans/status/${userId}`); }
  getInsurancePolicy(userId)               { return this.req("GET",`/insurance/policy/${userId}`); }
  buyInsurance(userId,planId)              { return this.req("POST","/insurance/buy",{userId,planId}); }
  getStats()                               { return this.req("GET","/admin/stats"); }
  getAdminQueue()                          { return this.req("GET","/admin/queue"); }
  approveVerification(type,subId)          { return this.req("POST",`/verify/${type}/${subId}/approve`,{notes:"Approved"}); }
  rejectVerification(type,subId,reason)    { return this.req("POST",`/verify/${type}/${subId}/reject`,{reason}); }
  getHistory(uid)                          { return this.req("GET",`/rides/history/${uid}`); }
}
const api = new Api();

// ── Constants ──────────────────────────────────────────
const VEHICLES = [
  { id:"okada",    label:"Okada",     icon:"🏍️", rate:2.5 },
  { id:"car",      label:"Car",       icon:"🚗", rate:4.0 },
  { id:"tricycle", label:"Tricycle",  icon:"🛺", rate:3.0 },
  { id:"bicycle",  label:"E-Bicycle", icon:"🚴", rate:1.5 },
];
const LOCS = ["Akosombo","Atimpoku","Senchi","Frankadua","Adjena","Akrade",
  "Asesewa","Kpong","Odumase-Krobo","Agormanya","Somanya","Nkurakan",
  "Koforidua","Nsawam","Aburi"];
const SPLITS = { owner:50, driver:25, fuel:5, maintenance:5, platform:15 };
const DTO_VEHICLES = {
  A: [
    { id:"okada",    name:"Motorcycle (Okada)",    price:12000, icon:"🏍️" },
    { id:"tricycle", name:"Tricycle (Pragya)",      price:18000, icon:"🛺" },
    { id:"ev_bike",  name:"Electric Motorcycle",   price:22000, icon:"⚡🏍️" },
  ],
  B: [
    { id:"k71",   name:"Kantanka K71 SUV",    price:105000, icon:"🚗" },
    { id:"omama", name:"Kantanka Omama 4×4",  price:150000, icon:"🚙" },
  ],
};

// ── Theme ──────────────────────────────────────────────
const T = (dark) => ({
  bg:   dark ? "#030712" : "#f9fafb",
  card: dark ? "#1f2937" : "#ffffff",
  text: dark ? "#ffffff" : "#111827",
  sub:  dark ? "#9ca3af" : "#6b7280",
  inp:  dark ? "#374151" : "#ffffff",
  inpBorder: dark ? "#4b5563" : "#d1d5db",
  bdr:  dark ? "#374151" : "#e5e7eb",
});

// ── Shared UI ──────────────────────────────────────────
const Toast = ({ msg, type, close }) => {
  useEffect(() => { const t = setTimeout(close, 4000); return ()=>clearTimeout(t); }, [close]);
  return (
    <div style={{
      position:"fixed",top:16,left:16,right:16,zIndex:9999,maxWidth:448,margin:"0 auto",
      display:"flex",alignItems:"flex-start",gap:12,padding:"14px 16px",borderRadius:16,
      boxShadow:"0 20px 40px rgba(0,0,0,0.25)",color:"#fff",fontSize:14,fontWeight:600,
      background: type==="error" ? "#dc2626" : "#16a34a"
    }}>
      {type==="error"
        ? <AlertCircle style={{width:20,height:20,flexShrink:0,marginTop:2}}/>
        : <CheckCircle style={{width:20,height:20,flexShrink:0,marginTop:2}}/>}
      <span style={{flex:1}}>{msg}</span>
      <button onClick={close} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",padding:0}}>
        <X style={{width:16,height:16}}/>
      </button>
    </div>
  );
};

const Spin = () => <Loader style={{width:18,height:18,animation:"spin 1s linear infinite"}}/>;

const Badge = ({ color, children }) => {
  const colors = {
    green: { bg:"#dcfce7", text:"#166534" },
    yellow:{ bg:"#fef9c3", text:"#854d0e" },
    red:   { bg:"#fee2e2", text:"#dc2626" },
    blue:  { bg:"#dbeafe", text:"#1d4ed8" },
    gray:  { bg:"#f3f4f6", text:"#6b7280" },
    orange:{ bg:"#ffedd5", text:"#ea580c" },
  };
  const c = colors[color] || colors.gray;
  return (
    <span style={{
      background:c.bg, color:c.text,
      padding:"2px 10px", borderRadius:999,
      fontSize:11, fontWeight:700
    }}>{children}</span>
  );
};

const Card = ({ children, style, dark }) => (
  <div style={{
    background: dark?"#1f2937":"#ffffff",
    borderRadius:16, padding:16,
    border:`1px solid ${dark?"#374151":"#e5e7eb"}`,
    ...style
  }}>{children}</div>
);

const Btn = ({ children, onClick, color="green", disabled, small, outline, style }) => {
  const bg = { green:"#16a34a", blue:"#2563eb", red:"#dc2626",
    yellow:"#ca8a04", gray:"#6b7280", orange:"#ea580c" };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: small ? "auto" : "100%",
      padding: small ? "8px 16px" : "14px",
      borderRadius:12, fontWeight:700,
      fontSize: small ? 12 : 15,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      display:"flex", alignItems:"center", justifyContent:"center", gap:8,
      background: outline ? "transparent" : bg[color],
      color: outline ? bg[color] : "#fff",
      border: outline ? `2px solid ${bg[color]}` : "none",
      fontFamily: "inherit",
      ...style
    }}>{children}</button>
  );
};

const Input = ({ placeholder, value, onChange, type="text", dark, style, maxLength }) => {
  const t = T(dark);
  return (
    <input
      type={type} placeholder={placeholder} value={value}
      onChange={onChange} maxLength={maxLength}
      style={{
        width:"100%", padding:"12px 14px",
        border:`1px solid ${t.inpBorder}`,
        borderRadius:12, fontSize:14,
        background:t.inp, color:t.text,
        outline:"none", fontFamily:"inherit",
        boxSizing:"border-box", ...style
      }}
    />
  );
};

// ════════════════════════════════════════════════════════
// AUTH SCREEN — Firebase Phone Auth
// ════════════════════════════════════════════════════════
function AuthScreen({ onLogin, dark }) {
  const t = T(dark);
  const [role,setRole]       = useState("passenger");
  const [phone,setPhone]     = useState("+233");
  const [name,setName]       = useState("");
  const [owner,setOwner]     = useState("");
  const [otp,setOtp]         = useState("");
  const [step,setStep]       = useState("phone");
  const [confirm,setConfirm] = useState(null);
  const [loading,setLoading] = useState(false);
  const [toast,setToast]     = useState(null);
  const toast$ = (msg,type="success") => setToast({msg,type});

  const sendOtp = async () => {
    if (phone.length < 12) { toast$("Enter valid Ghana number (+233...)","error"); return; }
    if (role==="driver" && !name) { toast$("Enter your name","error"); return; }
    setLoading(true);
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(
          auth, "recaptcha-container", { size:"invisible" }
        );
      }
      const confirmation = await signInWithPhoneNumber(
        auth, phone, window.recaptchaVerifier
      );
      setConfirm(confirmation);
      setStep("otp");
      toast$("OTP sent via SMS! 📱");
    } catch(e) {
      console.error(e);
      // Demo fallback
      setStep("otp");
      toast$("Demo mode — enter any 6 digits");
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (otp.length < 6) { toast$("Enter 6-digit OTP","error"); return; }
    setLoading(true);
    try {
      let firebaseUid = "demo_" + Date.now();
      let firebaseToken = "demo_token";

      if (confirm) {
        const result = await confirm.confirm(otp);
        const fbUser = result.user;
        firebaseUid  = fbUser.uid;
        firebaseToken = await fbUser.getIdToken();
      }

      // Create/fetch profile on backend
      let profile;
      try {
        const res = await api.req("POST", "/auth/create-profile", {
          firebaseUid, phone, role,
          name: name || "User",
          ownerCode: role==="driver" ? owner : undefined,
        });
        profile = res.user;
      } catch {
        // Demo fallback profile
        profile = {
          id: firebaseUid, firebaseUid, phone, role,
          name: name || "Demo User",
          isVerified: false,
          kycStatus: "pending",
          licenseStatus: "pending",
          vehicleStatus: "pending",
          ownerCode: role==="owner" ? "OWN" + Math.random().toString(36).substr(2,6).toUpperCase() : null,
          earnings: { total:0, today:0, week:0 },
          pools: { fuel:0, maintenance:0 },
          wallet: { available:0, pending:0 },
          savings: { balance:0 },
          totalRides: 0, rating: 5.0,
          gender: null, isEV: false,
        };
      }

      api.token = firebaseToken;
      onLogin(profile, firebaseToken, role);
      toast$(`Welcome to Okada Online, ${profile.name}! 🇬🇭`);
    } catch(e) {
      toast$("Invalid OTP — try again","error");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:t.bg, display:"flex", flexDirection:"column" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      {/* Hero */}
      <div style={{
        background:"linear-gradient(135deg,#14532d,#16a34a,#22c55e)",
        padding:"56px 24px 40px", textAlign:"center", color:"#fff"
      }}>
        <div style={{fontSize:52,marginBottom:8}}>🏍️🚗🛺⚡</div>
        <h1 style={{fontSize:36,fontWeight:900,margin:0,letterSpacing:"-0.02em",
          fontFamily:"Syne,sans-serif"}}>Okada Online</h1>
        <p style={{margin:"6px 0 0",color:"#bbf7d0",fontSize:13,fontWeight:600}}>
          Eastern Region Ghana · Complete Transport Ecosystem 🇬🇭
        </p>
        <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:6,marginTop:16}}>
          {[`Owner ${SPLITS.owner}%`,`Driver ${SPLITS.driver}%`,`Fuel ${SPLITS.fuel}%`,
            `Maint. ${SPLITS.maintenance}%`,`Platform ${SPLITS.platform}%`,
            "+2% Female","+2% EV","USSD *711#"].map(f=>(
            <span key={f} style={{background:"rgba(255,255,255,0.18)",
              borderRadius:999,padding:"3px 10px",fontSize:10,fontWeight:700}}>{f}</span>
          ))}
        </div>
      </div>

      <div style={{padding:"24px 20px 40px", flex:1}}>
        {/* Role selector */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",
          border:`1px solid ${t.bdr}`,borderRadius:14,overflow:"hidden",marginBottom:24}}>
          {[["passenger","🧍","Passenger"],["driver","🏍️","Driver"],
            ["owner","🏢","Owner"],["admin","⚙️","Admin"]].map(([r,ic,lb])=>(
            <button key={r} onClick={()=>{setRole(r);setStep("phone");}}
              style={{padding:"10px 4px",fontSize:10,fontWeight:700,textAlign:"center",
                background:role===r?"#16a34a":"transparent",
                color:role===r?"#fff":t.sub,border:"none",cursor:"pointer",
                fontFamily:"inherit",transition:"all 0.15s"}}>
              <div style={{fontSize:18}}>{ic}</div>{lb}
            </button>
          ))}
        </div>

        {step==="phone" ? (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {role!=="admin" && (
              <Input value={name} onChange={e=>setName(e.target.value)}
                placeholder="Full name" dark={dark}/>
            )}
            <Input value={phone} onChange={e=>setPhone(e.target.value)}
              placeholder="+233XXXXXXXXX" type="tel" dark={dark}/>
            {role==="driver" && (
              <div>
                <Input value={owner} onChange={e=>setOwner(e.target.value.toUpperCase())}
                  placeholder="Owner Code — e.g. OWNABC123 (optional)"
                  dark={dark} style={{fontFamily:"monospace"}}/>
                <p style={{fontSize:11,color:t.sub,marginTop:4}}>
                  💡 Get this from your vehicle owner. You can add it later.
                </p>
              </div>
            )}
            {role==="owner" && (
              <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",
                borderRadius:12,padding:12}}>
                <p style={{color:"#16a34a",fontWeight:700,fontSize:12,margin:"0 0 4px"}}>
                  🏢 Owner Benefits</p>
                <p style={{fontSize:11,color:"#374151",margin:0}}>
                  Earn {SPLITS.owner}% on every ride. Fuel ({SPLITS.fuel}%) &
                  maintenance ({SPLITS.maintenance}%) auto-collected.
                  Zero daily arguments with drivers.
                </p>
              </div>
            )}
            <Btn onClick={sendOtp} disabled={loading} color="green">
              {loading && <Spin/>}
              {loading ? "Sending…" : "Get OTP via SMS 📱"}
            </Btn>
            <p style={{textAlign:"center",fontSize:11,color:t.sub}}>
              Demo: tap Get OTP then enter any 6 digits
            </p>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <p style={{textAlign:"center",fontSize:13,color:t.sub}}>
              Code sent to {phone}
            </p>
            <Input value={otp} onChange={e=>setOtp(e.target.value)}
              maxLength={6} placeholder="● ● ● ● ● ●" type="tel" dark={dark}
              style={{textAlign:"center",fontSize:28,fontWeight:900,letterSpacing:"0.4em"}}/>
            <Btn onClick={verifyOtp} disabled={loading} color="green">
              {loading && <Spin/>}
              {loading ? "Verifying…" : "Verify & Continue ✅"}
            </Btn>
            <Btn onClick={()=>setStep("phone")} outline color="gray" small>← Back</Btn>
          </div>
        )}

        {/* Feature grid */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:24}}>
          {[["🔐","Firebase Phone Auth"],["📋","3-Step Verification"],
            ["💰","Driver earns 25%"],["🏢","Owner earns 50%"],
            ["⛽","Auto fuel pool 5%"],["🔧","Auto maintenance 5%"],
            ["🏍️","Drive to Own"],["🌍","USSD *711#"]].map(([i,l])=>(
            <div key={l} style={{background:t.card,borderRadius:12,padding:12,
              border:`1px solid ${t.bdr}`,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:18}}>{i}</span>
              <span style={{fontSize:11,fontWeight:600,color:t.text}}>{l}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Firebase invisible reCAPTCHA */}
      <div id="recaptcha-container"/>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// VERIFICATION SCREENS (shared across roles)
// ════════════════════════════════════════════════════════
function VerificationHub({ user, role, dark, onDone }) {
  const t = T(dark);
  const [screen,setScreen] = useState("home");
  const [toast,setToast]   = useState(null);
  const toast$ = (msg,type="success") => setToast({msg,type});

  // KYC state
  const [docType,setDocType]   = useState("ghana_card");
  const [docNum,setDocNum]     = useState("");
  const [kycLoading,setKycLoading] = useState(false);

  // License state
  const [licNum,setLicNum]     = useState("");
  const [licClass,setLicClass] = useState("B");
  const [licExpiry,setLicExpiry] = useState("");
  const [licLoading,setLicLoading] = useState(false);

  // Vehicle state
  const [plate,setPlate]       = useState("");
  const [vehicleType,setVType] = useState("okada");
  const [isEV,setIsEV]         = useState(false);
  const [vehLoading,setVehLoading] = useState(false);

  const statuses = {
    kyc:     user.kycStatus     || "pending",
    license: user.licenseStatus || "pending",
    vehicle: user.vehicleStatus || "pending",
  };

  const statusBadge = (s) => ({
    pending:        <Badge color="gray">Not submitted</Badge>,
    submitted:      <Badge color="yellow">⏳ Under review</Badge>,
    approved:       <Badge color="green">✅ Approved</Badge>,
    rejected:       <Badge color="red">❌ Rejected</Badge>,
  }[s] || <Badge color="gray">Pending</Badge>);

  const submitKyc = async () => {
    if (!docNum) { toast$("Enter document number","error"); return; }
    setKycLoading(true);
    try {
      await api.submitKyc({ userId:user.id, role, docType, docNumber:docNum });
      toast$("KYC submitted! Admin will review within 24hrs ✅");
      setScreen("home");
    } catch(e) { toast$(e.message,"error"); }
    setKycLoading(false);
  };

  const submitLicense = async () => {
    if (!licNum || !licExpiry) { toast$("Fill all fields","error"); return; }
    setLicLoading(true);
    try {
      await api.submitLicense({ userId:user.id, licenseNumber:licNum, licenseClass, expiryDate:licExpiry });
      toast$("License submitted! Admin will review within 24hrs ✅");
      setScreen("home");
    } catch(e) { toast$(e.message,"error"); }
    setLicLoading(false);
  };

  const submitVehicle = async () => {
    if (!plate) { toast$("Enter number plate","error"); return; }
    setVehLoading(true);
    try {
      await api.submitVehicle({ userId:user.id, plate, vehicleType, isEV });
      toast$("Vehicle submitted! Admin will review within 24hrs ✅");
      setScreen("home");
    } catch(e) { toast$(e.message,"error"); }
    setVehLoading(false);
  };

  const allApproved = statuses.kyc==="approved" &&
    (role!=="driver" || (statuses.license==="approved" && statuses.vehicle==="approved"));

  if (screen==="kyc") return (
    <div style={{padding:16}}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <button onClick={()=>setScreen("home")} style={{background:"none",border:"none",
        color:"#16a34a",fontWeight:700,cursor:"pointer",marginBottom:16,fontFamily:"inherit"}}>
        ← Back
      </button>
      <h2 style={{fontSize:20,fontWeight:900,color:t.text,marginBottom:4}}>
        🪪 Identity Verification (KYC)
      </h2>
      <p style={{fontSize:12,color:t.sub,marginBottom:20}}>
        Required for all users. Protects passengers and drivers.
      </p>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:t.sub}}>Document Type</label>
          <select value={docType} onChange={e=>setDocType(e.target.value)}
            style={{width:"100%",padding:"12px 14px",marginTop:4,
              border:`1px solid ${t.inpBorder}`,borderRadius:12,
              background:t.inp,color:t.text,fontSize:14,fontFamily:"inherit"}}>
            <option value="ghana_card">Ghana Card (NIA)</option>
            <option value="passport">International Passport</option>
            <option value="voters_id">Voter's ID Card</option>
          </select>
        </div>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:t.sub}}>Document Number</label>
          <Input value={docNum} onChange={e=>setDocNum(e.target.value.toUpperCase())}
            placeholder="e.g. GHA-000000000-0" dark={dark}
            style={{marginTop:4,fontFamily:"monospace"}}/>
        </div>
        <div style={{background:"#fefce8",border:"1px solid #fde047",
          borderRadius:12,padding:12}}>
          <p style={{fontSize:11,color:"#854d0e",fontWeight:700,margin:"0 0 4px"}}>
            📱 Document Image (optional for demo)
          </p>
          <p style={{fontSize:11,color:"#713f12",margin:0}}>
            In production: upload a clear photo of your document + a selfie.
            Admin will verify and approve within 24 hours.
          </p>
        </div>
        <Btn onClick={submitKyc} disabled={kycLoading || !docNum} color="green">
          {kycLoading && <Spin/>} Submit KYC Documents
        </Btn>
      </div>
    </div>
  );

  if (screen==="license") return (
    <div style={{padding:16}}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <button onClick={()=>setScreen("home")} style={{background:"none",border:"none",
        color:"#16a34a",fontWeight:700,cursor:"pointer",marginBottom:16,fontFamily:"inherit"}}>
        ← Back
      </button>
      <h2 style={{fontSize:20,fontWeight:900,color:t.text,marginBottom:4}}>
        📄 Driver/Rider License
      </h2>
      <p style={{fontSize:12,color:t.sub,marginBottom:20}}>
        Required for all drivers and riders.
      </p>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:t.sub}}>License Number</label>
          <Input value={licNum} onChange={e=>setLicNum(e.target.value.toUpperCase())}
            placeholder="e.g. GH-D-0000000" dark={dark}
            style={{marginTop:4,fontFamily:"monospace"}}/>
        </div>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:t.sub}}>License Class</label>
          <select value={licClass} onChange={e=>setLicClass(e.target.value)}
            style={{width:"100%",padding:"12px 14px",marginTop:4,
              border:`1px solid ${t.inpBorder}`,borderRadius:12,
              background:t.inp,color:t.text,fontSize:14,fontFamily:"inherit"}}>
            <option value="A">Class A — Motorcycle</option>
            <option value="B">Class B — Car/Taxi</option>
            <option value="C">Class C — Truck/Heavy</option>
            <option value="G">Class G — Tricycle</option>
          </select>
        </div>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:t.sub}}>Expiry Date</label>
          <input type="date" value={licExpiry} onChange={e=>setLicExpiry(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            style={{width:"100%",padding:"12px 14px",marginTop:4,
              border:`1px solid ${t.inpBorder}`,borderRadius:12,
              background:t.inp,color:t.text,fontSize:14,fontFamily:"inherit",
              boxSizing:"border-box"}}/>
        </div>
        <div style={{background:"#fefce8",border:"1px solid #fde047",
          borderRadius:12,padding:12}}>
          <p style={{fontSize:11,color:"#854d0e",fontWeight:700,margin:"0 0 4px"}}>
            📷 License Image</p>
          <p style={{fontSize:11,color:"#713f12",margin:0}}>
            In production: upload front and back of your license.
            Expired licenses are rejected automatically.
          </p>
        </div>
        <Btn onClick={submitLicense} disabled={licLoading||!licNum||!licExpiry} color="green">
          {licLoading && <Spin/>} Submit License
        </Btn>
      </div>
    </div>
  );

  if (screen==="vehicle") return (
    <div style={{padding:16}}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <button onClick={()=>setScreen("home")} style={{background:"none",border:"none",
        color:"#16a34a",fontWeight:700,cursor:"pointer",marginBottom:16,fontFamily:"inherit"}}>
        ← Back
      </button>
      <h2 style={{fontSize:20,fontWeight:900,color:t.text,marginBottom:4}}>
        🚗 Vehicle Verification
      </h2>
      <p style={{fontSize:12,color:t.sub,marginBottom:20}}>
        Registration, roadworthy, and insurance required.
      </p>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:t.sub}}>Number Plate</label>
          <Input value={plate} onChange={e=>setPlate(e.target.value.toUpperCase())}
            placeholder="e.g. ER-1234-26" dark={dark}
            style={{marginTop:4,fontFamily:"monospace"}}/>
        </div>
        <div>
          <label style={{fontSize:12,fontWeight:600,color:t.sub}}>Vehicle Type</label>
          <select value={vehicleType} onChange={e=>setVType(e.target.value)}
            style={{width:"100%",padding:"12px 14px",marginTop:4,
              border:`1px solid ${t.inpBorder}`,borderRadius:12,
              background:t.inp,color:t.text,fontSize:14,fontFamily:"inherit"}}>
            <option value="okada">Motorcycle (Okada)</option>
            <option value="car">Car/Taxi</option>
            <option value="tricycle">Tricycle (Pragya)</option>
            <option value="bicycle">Bicycle/E-Bicycle</option>
          </select>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <input type="checkbox" checked={isEV} onChange={e=>setIsEV(e.target.checked)}
            style={{width:18,height:18,cursor:"pointer"}}/>
          <div>
            <span style={{fontSize:14,fontWeight:600,color:t.text}}>⚡ Electric Vehicle (EV)</span>
            <p style={{fontSize:11,color:t.sub,margin:"2px 0 0"}}>
              EV drivers earn +2% bonus per ride 🌱
            </p>
          </div>
        </label>
        <div style={{background:"#fefce8",border:"1px solid #fde047",borderRadius:12,padding:12}}>
          <p style={{fontSize:11,color:"#854d0e",fontWeight:700,margin:"0 0 4px"}}>
            📋 Required Documents</p>
          <p style={{fontSize:11,color:"#713f12",margin:0}}>
            • Vehicle Registration Certificate (V5)<br/>
            • Current Roadworthy Certificate<br/>
            • Valid Insurance Certificate<br/>
            Upload in the full app. Admin inspects and approves.
          </p>
        </div>
        <Btn onClick={submitVehicle} disabled={vehLoading||!plate} color="green">
          {vehLoading && <Spin/>} Submit Vehicle Details
        </Btn>
      </div>
    </div>
  );

  // Home screen
  return (
    <div style={{padding:16}}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <h2 style={{fontSize:20,fontWeight:900,color:t.text,marginBottom:4}}>
        🛡️ Verification Centre
      </h2>
      <p style={{fontSize:12,color:t.sub,marginBottom:16}}>
        Complete all verifications to go online. Builds trust with passengers.
      </p>

      {allApproved ? (
        <div style={{background:"#f0fdf4",border:"2px solid #16a34a",
          borderRadius:16,padding:20,textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:40,marginBottom:8}}>🎉</div>
          <p style={{fontWeight:900,color:"#16a34a",fontSize:16,margin:"0 0 4px"}}>
            Fully Verified!</p>
          <p style={{fontSize:12,color:"#374151",margin:0}}>
            You can now go online and start earning.
          </p>
        </div>
      ) : (
        <div style={{background:"#fff7ed",border:"1px solid #fdba74",
          borderRadius:12,padding:12,marginBottom:16}}>
          <p style={{fontSize:12,color:"#ea580c",fontWeight:700,margin:0}}>
            ⚠️ Complete all steps below before you can go online and accept rides.
          </p>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {/* KYC */}
        <div style={{background:t.card,border:`1px solid ${t.bdr}`,
          borderRadius:14,padding:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:22}}>🪪</span>
              <div>
                <p style={{fontWeight:700,color:t.text,fontSize:14,margin:0}}>Identity (KYC)</p>
                <p style={{fontSize:11,color:t.sub,margin:0}}>Ghana Card / Passport</p>
              </div>
            </div>
            {statusBadge(statuses.kyc)}
          </div>
          {statuses.kyc==="pending"||statuses.kyc==="rejected" ? (
            <Btn onClick={()=>setScreen("kyc")} small color="green">
              Submit KYC →
            </Btn>
          ) : null}
        </div>

        {/* License — drivers only */}
        {(role==="driver"||role==="owner") && (
          <div style={{background:t.card,border:`1px solid ${t.bdr}`,
            borderRadius:14,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:22}}>📄</span>
                <div>
                  <p style={{fontWeight:700,color:t.text,fontSize:14,margin:0}}>Driver License</p>
                  <p style={{fontSize:11,color:t.sub,margin:0}}>DVLA Ghana License</p>
                </div>
              </div>
              {statusBadge(statuses.license)}
            </div>
            {statuses.license==="pending"||statuses.license==="rejected" ? (
              <Btn onClick={()=>setScreen("license")} small color="blue">
                Submit License →
              </Btn>
            ) : null}
          </div>
        )}

        {/* Vehicle — drivers only */}
        {role==="driver" && (
          <div style={{background:t.card,border:`1px solid ${t.bdr}`,
            borderRadius:14,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:22}}>🚗</span>
                <div>
                  <p style={{fontWeight:700,color:t.text,fontSize:14,margin:0}}>Vehicle</p>
                  <p style={{fontSize:11,color:t.sub,margin:0}}>Reg + Roadworthy + Insurance</p>
                </div>
              </div>
              {statusBadge(statuses.vehicle)}
            </div>
            {statuses.vehicle==="pending"||statuses.vehicle==="rejected" ? (
              <Btn onClick={()=>setScreen("vehicle")} small color="orange">
                Submit Vehicle →
              </Btn>
            ) : null}
          </div>
        )}
      </div>

      {allApproved && (
        <div style={{marginTop:16}}>
          <Btn onClick={onDone} color="green">
            ✅ Continue to App →
          </Btn>
        </div>
      )}
      {!allApproved && (
        <div style={{marginTop:12}}>
          <Btn onClick={onDone} outline color="gray" small>
            Skip for now (limited access)
          </Btn>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// DRIVE TO OWN SCREEN
// ════════════════════════════════════════════════════════
function DriveToOwn({ user, role, dark, onBack }) {
  const t = T(dark);
  const [status,setStatus]   = useState(null);
  const [screen,setScreen]   = useState("home");
  const [track,setTrack]     = useState("A");
  const [vehId,setVehId]     = useState("");
  const [loading,setLoading] = useState(false);
  const [toast,setToast]     = useState(null);
  const toast$ = (msg,type="success") => setToast({msg,type});

  useEffect(()=>{
    api.dtoStatus(user.id).then(r=>setStatus(r)).catch(()=>{});
  },[user.id]);

  const apply = async () => {
    if (!vehId) { toast$("Select a vehicle","error"); return; }
    setLoading(true);
    try {
      const r = await api.dtoApply({ userId:user.id, role, vehicleType:vehId, track });
      toast$(`Application submitted for ${DTO_VEHICLES[track].find(v=>v.id===vehId)?.name}! ✅`);
      setScreen("home");
      const updated = await api.dtoStatus(user.id);
      setStatus(updated);
    } catch(e) { toast$(e.message,"error"); }
    setLoading(false);
  };

  const app = status?.application;
  const progress = status?.progressPercent || 0;
  const vehicles = role==="driver" ? DTO_VEHICLES.A : DTO_VEHICLES.B;

  return (
    <div style={{minHeight:"100vh",background:t.bg}}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      {/* Header */}
      <div style={{background:"linear-gradient(90deg,#1e3a5f,#2563eb)",
        color:"#fff",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,
        position:"sticky",top:0,zIndex:20}}>
        <button onClick={onBack} style={{background:"rgba(255,255,255,0.2)",
          border:"none",color:"#fff",borderRadius:8,padding:6,cursor:"pointer"}}>←</button>
        <div>
          <span style={{fontWeight:900,fontSize:17}}>🏍️ Drive to Own</span>
          <p style={{fontSize:10,margin:0,opacity:0.8}}>Own your vehicle through the app</p>
        </div>
      </div>

      <div style={{padding:16}}>
        {/* No application yet */}
        {!app && screen==="home" && (
          <>
            <div style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",
              borderRadius:16,padding:20,color:"#fff",marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:40,marginBottom:8}}>🔑</div>
              <h3 style={{margin:"0 0 6px",fontWeight:900,fontSize:18}}>
                Own Your Vehicle
              </h3>
              <p style={{margin:0,opacity:0.85,fontSize:12}}>
                Work through Okada Online and your earnings automatically pay off your vehicle.
                No lump sums. No arguments. Just drive.
              </p>
            </div>

            {/* Track selector */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              {[["A","Driver Direct","🏍️",`35% of daily earnings\nOwn in 9–14 months`],
                ["B","Owner Assisted","🚗",`30% down payment\n40% of owner share`]].map(([tr,lb,ic,desc])=>(
                <button key={tr} onClick={()=>{setTrack(tr);setVehId("");}}
                  style={{padding:14,borderRadius:14,textAlign:"left",
                    border:`2px solid ${track===tr?"#2563eb":"#e5e7eb"}`,
                    background:track===tr?"#eff6ff":t.card,cursor:"pointer",
                    fontFamily:"inherit"}}>
                  <div style={{fontSize:22,marginBottom:4}}>{ic}</div>
                  <p style={{fontWeight:700,color:track===tr?"#1d4ed8":t.text,
                    fontSize:13,margin:"0 0 2px"}}>Track {tr} — {lb}</p>
                  <p style={{fontSize:10,color:t.sub,margin:0,whiteSpace:"pre-line"}}>{desc}</p>
                </button>
              ))}
            </div>

            {/* Vehicle options */}
            <h3 style={{color:t.text,fontSize:14,fontWeight:700,marginBottom:10}}>
              Select Vehicle:
            </h3>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
              {(track==="A" ? DTO_VEHICLES.A : DTO_VEHICLES.B).map(v=>(
                <div key={v.id} onClick={()=>setVehId(v.id)}
                  style={{padding:14,borderRadius:14,cursor:"pointer",
                    border:`2px solid ${vehId===v.id?"#2563eb":"#e5e7eb"}`,
                    background:vehId===v.id?"#eff6ff":t.card}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:26}}>{v.icon}</span>
                      <div>
                        <p style={{fontWeight:700,color:t.text,fontSize:13,margin:0}}>{v.name}</p>
                        <p style={{fontSize:11,color:t.sub,margin:0}}>
                          GH₵{v.price.toLocaleString()}
                          {track==="A" ? ` · ~${Math.ceil(v.price/1365)} months` :
                            ` · GH₵${(v.price*0.30).toLocaleString()} down`}
                        </p>
                      </div>
                    </div>
                    {vehId===v.id && <CheckCircle style={{width:20,height:20,color:"#2563eb"}}/>}
                  </div>
                </div>
              ))}
            </div>

            {/* Requirements */}
            <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",
              borderRadius:12,padding:12,marginBottom:16}}>
              <p style={{fontWeight:700,color:"#16a34a",fontSize:12,margin:"0 0 6px"}}>
                ✅ Eligibility Requirements
              </p>
              {["Complete 10+ rides on the platform","KYC identity verified",
                "License approved (drivers)","No active disputes"].map(r=>(
                <p key={r} style={{fontSize:11,color:"#374151",margin:"2px 0"}}>• {r}</p>
              ))}
            </div>

            <Btn onClick={apply} disabled={loading||!vehId} color="blue">
              {loading && <Spin/>} Apply for Drive to Own →
            </Btn>
          </>
        )}

        {/* Active application */}
        {app && (
          <>
            <div style={{background:
              app.status==="completed" ? "#f0fdf4" :
              app.status==="pending"   ? "#fff7ed" : "#eff6ff",
              border:`2px solid ${
                app.status==="completed" ? "#16a34a" :
                app.status==="pending"   ? "#f97316" : "#2563eb"}`,
              borderRadius:16,padding:20,marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:8}}>
                {app.status==="completed" ? "🎉" :
                 app.status==="pending"   ? "⏳" : "🏍️"}
              </div>
              <p style={{fontWeight:900,fontSize:16,margin:"0 0 4px",
                color: app.status==="completed"?"#16a34a":
                       app.status==="pending"?"#ea580c":"#1d4ed8"}}>
                {app.status==="completed" ? "Vehicle Fully Paid Off!" :
                 app.status==="pending"   ? "Application Under Review" :
                 "Drive to Own — Active"}
              </p>
              <p style={{fontSize:12,color:t.sub,margin:0}}>{app.vehicleName}</p>
            </div>

            {/* Progress */}
            {app.status==="active" && (
              <div style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:12,fontWeight:600,color:t.text}}>
                    Progress: {progress}%
                  </span>
                  <span style={{fontSize:12,color:t.sub}}>
                    GH₵{app.totalPaid?.toLocaleString()} / GH₵{app.vehiclePrice?.toLocaleString()}
                  </span>
                </div>
                <div style={{height:12,borderRadius:6,background:"#e5e7eb",overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:6,
                    background:"linear-gradient(90deg,#2563eb,#16a34a)",
                    width:`${progress}%`,transition:"width 0.5s"}}/>
                </div>
                <p style={{fontSize:11,color:t.sub,marginTop:6,textAlign:"center"}}>
                  GH₵{app.remaining?.toLocaleString()} remaining ·
                  {status?.monthsRemaining ? ` ~${status.monthsRemaining} months left` : ""}
                </p>
              </div>
            )}

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              {[
                ["Vehicle", app.vehicleName, "🚗"],
                ["Track",   app.track==="A" ? "A — Driver Direct" : "B — Owner", "📋"],
                ["Deduction", `${(app.deductRate*100)}% per ride`, "💰"],
                ["Status",  app.status, "📊"],
              ].map(([l,v,i])=>(
                <div key={l} style={{background:t.card,border:`1px solid ${t.bdr}`,
                  borderRadius:12,padding:12}}>
                  <span style={{fontSize:18}}>{i}</span>
                  <p style={{fontWeight:700,color:t.text,fontSize:12,margin:"4px 0 2px"}}>{v}</p>
                  <p style={{fontSize:10,color:t.sub,margin:0}}>{l}</p>
                </div>
              ))}
            </div>

            {app.status==="completed" && (
              <div style={{background:"#f0fdf4",border:"2px solid #16a34a",
                borderRadius:16,padding:20,textAlign:"center"}}>
                <p style={{fontWeight:900,color:"#16a34a",fontSize:15,margin:"0 0 8px"}}>
                  🎉 Congratulations! You OWN your vehicle!
                </p>
                <p style={{fontSize:12,color:"#374151",margin:0}}>
                  Okada Online will contact you within 48hrs to hand over
                  your vehicle documents. Welcome to the ownership class! 🇬🇭
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// PASSENGER APP
// ════════════════════════════════════════════════════════
function PassengerApp({ user, onLogout, dark, setDark }) {
  const t = T(dark);
  const [view,setView]     = useState("home");
  const [pickup,setPickup] = useState("");
  const [dest,setDest]     = useState("");
  const [vehicle,setVehicle]=useState("okada");
  const [fare,setFare]     = useState(null);
  const [status,setStatus] = useState("idle");
  const [driver,setDriver] = useState(null);
  const [eta,setEta]       = useState(0);
  const [history,setHistory]=useState([]);
  const [loading,setLoading]=useState(false);
  const [toast,setToast]   = useState(null);
  const toast$ = (msg,type="success")=>setToast({msg,type});

  useEffect(()=>{
    if(!pickup||!dest){setFare(null);return;}
    const v=VEHICLES.find(v=>v.id===vehicle);
    const km=parseFloat((2+Math.random()*13).toFixed(1));
    const total=parseFloat((km*v.rate+3).toFixed(2));
    const driver_share = +(total*0.25).toFixed(2);
    const owner_share  = +(total*0.50).toFixed(2);
    setFare({km,total,dur:Math.ceil(km*3),driver_share,owner_share});
  },[pickup,dest,vehicle]);

  useEffect(()=>{
    if(status==="matched"&&eta>0){
      const iv=setInterval(()=>setEta(e=>{if(e<=1){clearInterval(iv);setStatus("arrived");return 0;}return e-1;}),1000);
      return()=>clearInterval(iv);
    }
  },[status,eta]);

  useEffect(()=>{
    if(view==="history"){
      api.getHistory(user.id).then(r=>setHistory(r.rides||[])).catch(()=>
        setHistory(Array.from({length:5},(_,i)=>({id:i,
          from:LOCS[i*2%LOCS.length],to:LOCS[(i*2+1)%LOCS.length],
          fare:(Math.random()*20+5).toFixed(2),
          date:new Date(Date.now()-i*86400000*2).toLocaleDateString(),
          driver:"Kwame A.",rating:5,vehicle:VEHICLES[i%4].label})))
      );
    }
  },[view,user.id]);

  const bookRide=async()=>{
    if(!pickup||!dest){toast$("Enter pickup & destination","error");return;}
    setLoading(true);setStatus("searching");
    try{
      await api.requestRide({userId:user.id,
        pickupLocation:{address:pickup,latitude:6.0998,longitude:0.1},
        destination:{address:dest,latitude:6.15,longitude:0.15},rideType:vehicle});
    }catch{}
    setTimeout(()=>{
      const v=VEHICLES.find(v=>v.id===vehicle);
      setDriver({name:"Kwame Asante",phone:"+233241234567",rating:4.9,
        vehicle:v.label,icon:v.icon,plate:"ER-1234-26",photo:"👨🏿‍🦱",rides:1247,
        isEV:vehicle==="bicycle",isFemale:false});
      setStatus("matched");setEta(180);
      toast$(`${v.label} matched! ${v.icon}`);
    },3500);
    setLoading(false);
  };

  const Nav=()=>(
    <div style={{position:"fixed",bottom:0,left:0,right:0,maxWidth:448,margin:"0 auto",
      background:t.card,borderTop:`1px solid ${t.bdr}`,
      display:"flex",justifyContent:"space-around",padding:"6px 0",zIndex:30}}>
      {[["home","🏠","Home"],["history","📋","History"],["profile","👤","Profile"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)} style={{display:"flex",flexDirection:"column",
          alignItems:"center",padding:"4px 20px",border:"none",background:"none",
          color:view===v?"#16a34a":t.sub,cursor:"pointer",fontFamily:"inherit"}}>
          <span style={{fontSize:20}}>{ic}</span>
          <span style={{fontSize:11,fontWeight:700,marginTop:2}}>{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div style={{maxWidth:448,margin:"0 auto",minHeight:"100vh",background:t.bg}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      {/* Header */}
      <div style={{background:"#16a34a",color:"#fff",padding:"12px 16px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:20}}>🏍️</span>
          <span style={{fontWeight:900,fontSize:17,fontFamily:"Syne,sans-serif"}}>
            Okada Online</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setDark(!dark)} style={{padding:6,borderRadius:8,
            background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",cursor:"pointer"}}>
            {dark?<Sun style={{width:16,height:16}}/>:<Moon style={{width:16,height:16}}/>}
          </button>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#15803d",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
            {user.profilePhoto||"👤"}
          </div>
        </div>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="home"&&(
          <div style={{padding:16}}>
            {/* Map */}
            <div style={{height:120,borderRadius:16,marginBottom:12,position:"relative",
              overflow:"hidden",background:dark?"#1f2937":"linear-gradient(135deg,#f0fdf4,#eff6ff)",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              border:`1px solid ${t.bdr}`}}>
              <span style={{fontSize:36}}>🗺️</span>
              <p style={{fontSize:12,color:t.sub,margin:"4px 0 0",fontWeight:600}}>
                {status==="idle"?"Akosombo · Eastern Region":
                 status==="searching"?"Finding drivers…":
                 status==="matched"?"Driver on the way! 🏍️":
                 status==="arrived"?"Driver arrived!":
                 status==="ongoing"?"Ride in progress":"Complete ✅"}
              </p>
              <div style={{position:"absolute",top:8,right:8}}>
                <Badge color="green">● GPS Live</Badge>
              </div>
            </div>

            {/* Booking card */}
            <Card dark={dark} style={{marginBottom:12}}>
              <h2 style={{fontWeight:900,fontSize:15,color:t.text,margin:"0 0 12px"}}>
                📍 Book Your Ride
              </h2>

              {status==="idle"&&<>
                <div style={{position:"relative",marginBottom:10}}>
                  <MapPin style={{position:"absolute",left:12,top:13,width:16,height:16,color:"#16a34a"}}/>
                  <input value={pickup} onChange={e=>setPickup(e.target.value)}
                    list="locs" placeholder="Pickup location"
                    style={{width:"100%",padding:"12px 14px",paddingLeft:36,
                      border:`1px solid ${t.inpBorder}`,borderRadius:12,fontSize:14,
                      background:t.inp,color:t.text,boxSizing:"border-box",
                      fontFamily:"inherit",outline:"none"}}/>
                </div>
                <div style={{position:"relative",marginBottom:10}}>
                  <Navigation style={{position:"absolute",left:12,top:13,width:16,height:16,color:"#ef4444"}}/>
                  <input value={dest} onChange={e=>setDest(e.target.value)}
                    list="locs" placeholder="Destination"
                    style={{width:"100%",padding:"12px 14px",paddingLeft:36,
                      border:`1px solid ${t.inpBorder}`,borderRadius:12,fontSize:14,
                      background:t.inp,color:t.text,boxSizing:"border-box",
                      fontFamily:"inherit",outline:"none"}}/>
                </div>
                <datalist id="locs">{LOCS.map(l=><option key={l} value={l}/>)}</datalist>

                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                  {VEHICLES.map(v=>(
                    <button key={v.id} onClick={()=>setVehicle(v.id)}
                      style={{padding:"10px 4px",borderRadius:12,textAlign:"center",
                        border:`2px solid ${vehicle===v.id?"#16a34a":"#e5e7eb"}`,
                        background:vehicle===v.id?"#f0fdf4":"transparent",
                        cursor:"pointer",fontFamily:"inherit"}}>
                      <div style={{fontSize:18}}>{v.icon}</div>
                      <div style={{fontSize:9,fontWeight:700,
                        color:vehicle===v.id?"#16a34a":t.sub,marginTop:2}}>{v.label}</div>
                    </button>
                  ))}
                </div>

                {fare&&(
                  <div style={{background:dark?"#14532d":"#f0fdf4",
                    border:"1px solid #bbf7d0",borderRadius:12,padding:12,marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:t.sub}}>Distance · Duration</span>
                      <span style={{fontSize:12,fontWeight:600,color:t.text}}>
                        {fare.km}km · ~{fare.dur}min</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",
                      paddingTop:8,borderTop:`1px solid ${dark?"#166534":"#bbf7d0"}`}}>
                      <span style={{fontWeight:900,color:t.text}}>Total Fare</span>
                      <span style={{fontWeight:900,color:"#16a34a",fontSize:18}}>
                        GH₵{fare.total}</span>
                    </div>
                  </div>
                )}

                <Btn onClick={bookRide} disabled={!pickup||!dest||loading} color="green">
                  {loading&&<Spin/>}
                  {loading?"Booking…":`Book ${VEHICLES.find(v=>v.id===vehicle)?.label} ${VEHICLES.find(v=>v.id===vehicle)?.icon}`}
                </Btn>
              </>}

              {status==="searching"&&(
                <div style={{textAlign:"center",padding:"24px 0"}}>
                  <div style={{width:44,height:44,border:"4px solid #16a34a",
                    borderTopColor:"transparent",borderRadius:"50%",
                    animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/>
                  <p style={{fontWeight:700,color:t.text}}>Finding your driver…</p>
                  <Btn onClick={()=>setStatus("idle")} outline color="red" small style={{marginTop:12}}>
                    Cancel
                  </Btn>
                </div>
              )}

              {(status==="matched"||status==="arrived")&&driver&&(
                <div>
                  {status==="arrived"&&(
                    <div style={{background:"#16a34a",color:"#fff",borderRadius:10,
                      padding:"8px",textAlign:"center",fontWeight:700,fontSize:13,marginBottom:10}}>
                      🏍️ Driver has arrived!
                    </div>
                  )}
                  <div style={{display:"flex",alignItems:"center",gap:12,padding:12,
                    borderRadius:12,background:dark?"#374151":"#f9fafb",marginBottom:10}}>
                    <div style={{width:52,height:52,borderRadius:"50%",background:"#dcfce7",
                      display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>
                      {driver.photo}
                    </div>
                    <div style={{flex:1}}>
                      <p style={{fontWeight:900,color:t.text,margin:0}}>{driver.name}</p>
                      <div style={{display:"flex",gap:6,marginTop:2}}>
                        <span style={{fontSize:11,color:t.sub}}>{driver.icon} {driver.vehicle} · {driver.plate}</span>
                      </div>
                      <div style={{display:"flex",gap:6,marginTop:2,flexWrap:"wrap"}}>
                        <Star style={{width:11,height:11,fill:"#facc15",color:"#facc15"}}/>
                        <span style={{fontSize:11,color:t.sub}}>{driver.rating}</span>
                        {driver.isEV&&<Badge color="green">⚡ EV</Badge>}
                        {driver.isFemale&&<Badge color="blue">♀ +2%</Badge>}
                      </div>
                    </div>
                    {status==="matched"&&(
                      <div style={{textAlign:"center"}}>
                        <p style={{fontWeight:900,color:"#16a34a",fontSize:20,margin:0}}>
                          {Math.floor(eta/60)}:{String(eta%60).padStart(2,"0")}</p>
                        <p style={{fontSize:10,color:t.sub,margin:0}}>ETA</p>
                      </div>
                    )}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    <Btn onClick={()=>setStatus("idle")} outline color="red" small>Cancel</Btn>
                    <a href={`tel:${driver.phone}`} style={{padding:"8px",background:"#2563eb",
                      color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,
                      textAlign:"center",display:"block"}}>📞 Call</a>
                    <Btn onClick={()=>setStatus("ongoing")} color="green" small>Start →</Btn>
                  </div>
                </div>
              )}

              {status==="ongoing"&&driver&&(
                <div>
                  <div style={{background:"#2563eb",color:"#fff",borderRadius:10,
                    padding:"8px",textAlign:"center",fontWeight:700,fontSize:13,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:10}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:"#fff",
                      animation:"pulse 2s infinite"}}/>
                    Ride in progress
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                    padding:12,borderRadius:12,background:dark?"#374151":"#f9fafb",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:22}}>{driver.photo}</span>
                      <div>
                        <p style={{fontWeight:700,color:t.text,margin:0,fontSize:13}}>{driver.name}</p>
                        <p style={{fontSize:11,color:t.sub,margin:0}}>{driver.plate}</p>
                      </div>
                    </div>
                    <p style={{fontWeight:900,color:"#16a34a",fontSize:18,margin:0}}>
                      GH₵{fare?.total}</p>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <Btn onClick={()=>toast$("🚨 Emergency services notified!","error")}
                      color="red">
                      <AlertCircle style={{width:16,height:16}}/> SOS
                    </Btn>
                    <Btn onClick={()=>{setStatus("idle");setDriver(null);
                      setPickup("");setDest("");setFare(null);
                      toast$("Thanks for riding Okada Online! 🇬🇭");}}>
                      Complete ✅
                    </Btn>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {view==="history"&&(
          <div style={{padding:16}}>
            <h2 style={{fontWeight:900,fontSize:18,color:t.text,marginBottom:16}}>
              📋 Ride History</h2>
            {history.length===0?(
              <div style={{textAlign:"center",padding:"48px 0"}}>
                <div style={{fontSize:48,marginBottom:12}}>🛺</div>
                <p style={{color:t.sub}}>No rides yet</p>
                <Btn onClick={()=>setView("home")} color="green" small style={{marginTop:12}}>
                  Book Now
                </Btn>
              </div>
            ):history.map(r=>(
              <Card key={r.id} dark={dark} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <MapPin style={{width:12,height:12,color:"#16a34a",flexShrink:0}}/>
                      <span style={{fontWeight:600,color:t.text,fontSize:13}}>{r.from}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <Navigation style={{width:12,height:12,color:"#ef4444",flexShrink:0}}/>
                      <span style={{fontWeight:600,color:t.text,fontSize:13}}>{r.to}</span>
                    </div>
                    <p style={{fontSize:11,color:t.sub,margin:0}}>
                      {r.date} · {r.driver} · {r.vehicle}</p>
                  </div>
                  <div style={{textAlign:"right",marginLeft:12}}>
                    <p style={{fontWeight:900,color:"#16a34a",margin:0}}>GH₵{r.fare}</p>
                    <div style={{display:"flex",justifyContent:"flex-end",gap:2,marginTop:4}}>
                      {[...Array(r.rating||5)].map((_,i)=>(
                        <Star key={i} style={{width:11,height:11,fill:"#facc15",color:"#facc15"}}/>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {view==="profile"&&(
          <div style={{padding:16}}>
            <Card dark={dark} style={{textAlign:"center",marginBottom:12}}>
              <div style={{fontSize:52,marginBottom:8}}>👤</div>
              <h2 style={{fontSize:20,fontWeight:900,color:t.text,margin:"0 0 4px"}}>
                {user.name||"Passenger"}</h2>
              <p style={{color:t.sub,fontSize:13,margin:"0 0 8px"}}>{user.phone}</p>
              <div style={{display:"flex",justifyContent:"center",gap:4}}>
                <Star style={{width:16,height:16,fill:"#facc15",color:"#facc15"}}/>
                <span style={{fontWeight:700,color:t.text}}>{user.rating||"5.0"}</span>
              </div>
            </Card>
            <Btn onClick={onLogout} outline color="red">
              <LogOut style={{width:16,height:16}}/> Logout
            </Btn>
          </div>
        )}
      </div>
      <Nav/>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// DRIVER APP
// ════════════════════════════════════════════════════════
function DriverApp({ user, onLogout, dark, setDark }) {
  const t = T(dark);
  const [view,setView]        = useState("home");
  const [online,setOnline]    = useState(false);
  const [incoming,setIncoming]= useState(null);
  const [activeRide,setActiveRide]=useState(null);
  const [earnings,setEarnings]= useState({today:0,week:0,total:0,rides:0});
  const [pools,setPools]      = useState({fuel:0,maintenance:0});
  const [fuelCode,setFuelCode]= useState(null);
  const [dtoData,setDtoData]  = useState(null);
  const [screen,setScreen]    = useState(null); // "dto"|"verify"
  const [toast,setToast]      = useState(null);
  const toast$ = (msg,type="success")=>setToast({msg,type});

  useEffect(()=>{
    api.dtoStatus(user.id).then(r=>setDtoData(r)).catch(()=>{});
  },[user.id]);

  useEffect(()=>{
    if(!online||incoming||activeRide)return;
    const tm=setTimeout(()=>setIncoming({
      id:"ride_"+Date.now(),passenger:"Ama Owusu",
      phone:"+233205556789",from:"Akosombo",to:"Atimpoku",
      dist:"4.2 km",dur:"12 min",fare:"GH₵13.50",earn:"GH₵3.38"
    }),5000);
    return()=>clearTimeout(tm);
  },[online,incoming,activeRide]);

  useEffect(()=>{
    if(!online)return;
    const iv=setInterval(()=>api.updateLocation(user.id,
      6.0998+Math.random()*0.01,0.1+Math.random()*0.01).catch(()=>{}),5000);
    return()=>clearInterval(iv);
  },[online,user.id]);

  const toggleOnline=async()=>{
    if(!online && !user.isVerified){
      toast$("Complete all verification before going online","error");
      setScreen("verify"); return;
    }
    try{await api.toggleOnline(user.id,!online,"okada");}catch{}
    setOnline(!online);
    toast$(online?"You're offline":"Online! Waiting for rides 🏍️");
  };

  const accept=async()=>{
    try{await api.acceptRide(incoming.id,user.id);}catch{}
    setActiveRide(incoming);setIncoming(null);
    toast$("Ride accepted! Navigate to passenger 📍");
  };

  const complete=()=>{
    const earned=parseFloat((activeRide.earn||"3.38").replace("GH₵",""));
    setEarnings(e=>({today:+(e.today+earned).toFixed(2),
      week:+(e.week+earned).toFixed(2),total:+(e.total+earned).toFixed(2),rides:e.rides+1}));
    setPools(p=>({fuel:+(p.fuel+(earned/0.25*0.05)).toFixed(2),
      maintenance:+(p.maintenance+(earned/0.25*0.05)).toFixed(2)}));
    setActiveRide(null);
    toast$(`Ride complete! Earned ${activeRide.earn} 💰`);
  };

  const getFuelCode=async()=>{
    try{
      const r=await api.getFuelCode(user.id);
      setFuelCode(r);
    }catch{
      // Demo code
      setFuelCode({
        code:`FUEL-${Math.random().toString(36).substr(2,4).toUpperCase()}-${Math.random().toString(36).substr(2,4).toUpperCase()}`,
        balance: pools.fuel||8.50,
        expiresAt: new Date(Date.now()+600000).toISOString(),
        validSeconds:600
      });
    }
    toast$("Fuel code generated! Valid 10 minutes ⛽");
  };

  if(screen==="dto") return (
    <DriveToOwn user={user} role="driver" dark={dark}
      onBack={()=>setScreen(null)}/>
  );

  if(screen==="verify") return (
    <VerificationHub user={user} role="driver" dark={dark}
      onDone={()=>setScreen(null)}/>
  );

  const Nav=()=>(
    <div style={{position:"fixed",bottom:0,left:0,right:0,maxWidth:448,margin:"0 auto",
      background:t.card,borderTop:`1px solid ${t.bdr}`,
      display:"flex",justifyContent:"space-around",padding:"6px 0",zIndex:30}}>
      {[["home","🏠","Home"],["pools","⛽","Pools"],["dto","🏍️","Own"],["profile","👤","Profile"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)} style={{display:"flex",flexDirection:"column",
          alignItems:"center",padding:"4px 16px",border:"none",background:"none",
          color:view===v?"#16a34a":t.sub,cursor:"pointer",fontFamily:"inherit"}}>
          <span style={{fontSize:18}}>{ic}</span>
          <span style={{fontSize:10,fontWeight:700,marginTop:2}}>{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div style={{maxWidth:448,margin:"0 auto",minHeight:"100vh",background:t.bg}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      {/* Incoming ride sheet */}
      {incoming&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",
          zIndex:50,display:"flex",alignItems:"flex-end",maxWidth:448,margin:"0 auto"}}>
          <div style={{background:t.card,borderRadius:"24px 24px 0 0",
            padding:24,width:"100%",boxSizing:"border-box"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <h3 style={{fontSize:18,fontWeight:900,color:t.text,margin:0}}>
                  🏍️ New Ride!</h3>
                <p style={{fontSize:12,color:t.sub,margin:0}}>Respond quickly</p>
              </div>
              <Badge color="green">{incoming.earn}</Badge>
            </div>
            <div style={{background:dark?"#374151":"#f9fafb",borderRadius:14,
              padding:12,marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <MapPin style={{width:14,height:14,color:"#16a34a"}}/>
                <span style={{color:t.text,fontSize:13}}>{incoming.from}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <Navigation style={{width:14,height:14,color:"#ef4444"}}/>
                <span style={{color:t.text,fontSize:13}}>{incoming.to}</span>
              </div>
              <div style={{display:"flex",gap:16,paddingTop:6,
                borderTop:`1px solid ${t.bdr}`}}>
                <span style={{fontSize:11,color:t.sub}}>📏 {incoming.dist}</span>
                <span style={{fontSize:11,color:t.sub}}>⏱️ {incoming.dur}</span>
                <span style={{fontSize:11,fontWeight:700,color:"#16a34a"}}>{incoming.fare}</span>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Btn onClick={()=>setIncoming(null)} outline color="red">Decline</Btn>
              <Btn onClick={accept} color="green">Accept ✅</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{background:"#166534",color:"#fff",padding:"12px 16px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>🏍️</span>
          <span style={{fontWeight:900,fontFamily:"Syne,sans-serif"}}>Driver Portal</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,
          padding:"5px 12px",borderRadius:999,fontSize:11,fontWeight:900,
          background:online?"#16a34a":"#4b5563"}}>
          <div style={{width:7,height:7,borderRadius:"50%",
            background:online?"#fff":"#9ca3af",
            animation:online?"pulse 2s infinite":"none"}}/>
          {online?"ONLINE":"OFFLINE"}
        </div>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="home"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
            {/* Verification warning */}
            {!user.isVerified&&(
              <div style={{background:"#fff7ed",border:"1px solid #fdba74",
                borderRadius:14,padding:14}}>
                <p style={{fontWeight:700,color:"#ea580c",fontSize:13,margin:"0 0 6px"}}>
                  ⚠️ Verification Required</p>
                <p style={{fontSize:11,color:"#78350f",margin:"0 0 10px"}}>
                  Complete KYC, license, and vehicle verification to go online.
                </p>
                <Btn onClick={()=>setScreen("verify")} color="orange" small>
                  Complete Verification →
                </Btn>
              </div>
            )}

            {/* Map */}
            <div style={{height:140,borderRadius:16,position:"relative",overflow:"hidden",
              background:dark?"#1f2937":"#f0fdf4",border:`1px solid ${t.bdr}`,
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              {online&&<div style={{position:"absolute",width:200,height:200,borderRadius:"50%",
                background:"#22c55e",opacity:0.08,animation:"ping 1s infinite"}}/>}
              <span style={{fontSize:40,animation:online?"bounce 1s infinite":"none"}}>
                {online?"🏍️":"⏸️"}</span>
              <p style={{fontSize:12,fontWeight:600,color:t.sub,margin:"8px 0 0"}}>
                {online?"Broadcasting GPS…":"Go online to earn"}</p>
              {online&&<div style={{position:"absolute",top:8,right:8}}>
                <Badge color="green">● Live</Badge></div>}
            </div>

            <Btn onClick={toggleOnline} color={online?"red":"green"}>
              {online?"🔴 Go Offline":"🟢 Go Online — Start Earning"}
            </Btn>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["💰",`GH₵${earnings.today}`,"Today","green"],
                ["🏍️",earnings.rides,"Rides Today","blue"],
                ["📅",`GH₵${earnings.week}`,"This Week","purple"],
                ["🏆",`GH₵${earnings.total}`,"Total","yellow"]].map(([i,v,l,c])=>(
                <div key={l} style={{background:t.card,borderRadius:14,padding:14,
                  border:`1px solid ${t.bdr}`}}>
                  <span style={{fontSize:24}}>{i}</span>
                  <p style={{fontSize:22,fontWeight:900,margin:"4px 0 2px",
                    color:{green:"#16a34a",blue:"#2563eb",purple:"#9333ea",yellow:"#ca8a04"}[c]}}>{v}</p>
                  <p style={{fontSize:11,color:t.sub,margin:0}}>{l}</p>
                </div>
              ))}
            </div>

            {/* Active ride */}
            {activeRide&&(
              <div style={{background:t.card,borderRadius:14,padding:14,
                border:"2px solid #16a34a"}}>
                <p style={{color:"#16a34a",fontWeight:900,fontSize:13,margin:"0 0 10px"}}>
                  ● Active Ride</p>
                <div style={{background:dark?"#374151":"#f9fafb",borderRadius:10,
                  padding:10,marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <MapPin style={{width:12,height:12,color:"#16a34a"}}/>
                    <span style={{color:t.text,fontSize:13}}>{activeRide.from}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <Navigation style={{width:12,height:12,color:"#ef4444"}}/>
                    <span style={{color:t.text,fontSize:13}}>{activeRide.to}</span>
                  </div>
                  <p style={{color:"#16a34a",fontWeight:700,fontSize:12,margin:0}}>
                    You earn: {activeRide.earn}</p>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <a href={`tel:${activeRide.phone}`} style={{padding:"10px",
                    background:"#2563eb",color:"#fff",borderRadius:10,
                    fontWeight:700,fontSize:12,textAlign:"center",display:"block"}}>
                    📞 Call</a>
                  <Btn onClick={complete} color="green" small>✅ Complete</Btn>
                </div>
              </div>
            )}

            {/* Earnings breakdown */}
            <div style={{background:t.card,borderRadius:14,padding:14,border:`1px solid ${t.bdr}`}}>
              <p style={{fontWeight:700,fontSize:13,color:t.text,margin:"0 0 10px"}}>
                💡 Your Earnings Breakdown</p>
              {[
                [`Your cut (${SPLITS.driver}%)`,`GH₵${earnings.total.toFixed(2)}`,"#16a34a"],
                ["Owner share (50%)","Auto-paid","#2563eb"],
                ["Fuel pool (5%)","Auto-collected","#ca8a04"],
                ["Maintenance (5%)","Auto-collected","#ea580c"],
                ["Platform (15%)","Okada Online","#9ca3af"],
              ].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",
                  paddingBottom:7,borderBottom:`1px solid ${t.bdr}`,marginBottom:7,fontSize:12}}>
                  <span style={{color:t.sub}}>{l}</span>
                  <span style={{fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
              {user.gender==="female"&&(
                <p style={{fontSize:11,color:"#16a34a",fontWeight:700,margin:"4px 0 0"}}>
                  ♀ Female driver bonus: +2% per ride active!
                </p>
              )}
              {user.isEV&&(
                <p style={{fontSize:11,color:"#16a34a",fontWeight:700,margin:"4px 0 0"}}>
                  ⚡ EV bonus: +2% per ride active!
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── POOLS TAB ──────────────────────────────────────── */}
        {view==="pools"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
            {/* Fuel Pool */}
            <div style={{background:t.card,border:"2px solid #ca8a04",borderRadius:16,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Fuel style={{width:22,height:22,color:"#ca8a04"}}/>
                  <span style={{fontWeight:900,color:t.text,fontSize:15}}>Fuel Pool</span>
                </div>
                <span style={{fontSize:26,fontWeight:900,color:"#ca8a04"}}>
                  GH₵{pools.fuel.toFixed(2)}</span>
              </div>
              <p style={{fontSize:12,color:t.sub,marginBottom:12}}>
                5% of every ride. Use ONLY at registered Okada Online fuel stations.
              </p>

              {/* How to use steps */}
              <div style={{background:dark?"#374151":"#fefce8",border:"1px solid #fde047",
                borderRadius:12,padding:12,marginBottom:12}}>
                <p style={{fontSize:12,fontWeight:700,color:"#854d0e",margin:"0 0 6px"}}>
                  ⛽ How to Use Your Fuel Pool:</p>
                {["1. Go to any registered Okada Online fuel station",
                  "2. Tap 'Show Fuel Code' below to generate your code",
                  "3. Show the code to the station attendant",
                  "4. Pool balance deducted automatically — zero cash needed",
                  "5. Code expires in 10 minutes — only generate when at station"].map(s=>(
                  <p key={s} style={{fontSize:11,color:"#713f12",margin:"2px 0"}}>{s}</p>
                ))}
              </div>

              {/* Fuel code */}
              {fuelCode ? (
                <div style={{background:dark?"#374151":"#fefce8",border:"2px dashed #ca8a04",
                  borderRadius:12,padding:16,textAlign:"center",marginBottom:10}}>
                  <p style={{fontSize:11,color:t.sub,margin:"0 0 6px"}}>Your fuel station code</p>
                  <p style={{fontFamily:"monospace",fontSize:26,fontWeight:900,color:"#ca8a04",
                    letterSpacing:"0.12em",margin:"0 0 6px"}}>{fuelCode.code}</p>
                  <p style={{fontSize:11,color:t.sub,margin:0}}>
                    Balance: GH₵{fuelCode.balance?.toFixed(2)} ·
                    Valid 10 minutes
                  </p>
                </div>
              ) : null}

              <Btn onClick={getFuelCode} color="yellow"
                disabled={pools.fuel < 5}>
                {fuelCode ? "🔄 Generate New Code" : "⛽ Show Fuel Code"}
              </Btn>
              {pools.fuel < 5 && (
                <p style={{fontSize:11,color:t.sub,textAlign:"center",marginTop:6}}>
                  Minimum GH₵5 required to generate code
                </p>
              )}
            </div>

            {/* Maintenance Pool */}
            <div style={{background:t.card,border:"2px solid #ea580c",borderRadius:16,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Wrench style={{width:22,height:22,color:"#ea580c"}}/>
                  <span style={{fontWeight:900,color:t.text,fontSize:15}}>Maintenance Pool</span>
                </div>
                <span style={{fontSize:26,fontWeight:900,color:"#ea580c"}}>
                  GH₵{pools.maintenance.toFixed(2)}</span>
              </div>
              <p style={{fontSize:12,color:t.sub,marginBottom:10}}>
                5% of every ride. For oil changes, repairs, and servicing.
              </p>
              <div style={{background:dark?"#374151":"#fff7ed",border:"1px solid #fdba74",
                borderRadius:12,padding:12}}>
                <p style={{fontSize:11,color:"#78350f",margin:0}}>
                  🔧 Smart alerts when service is due<br/>
                  ✅ Owner approves mechanic payments<br/>
                  📱 Direct payment to registered garages<br/>
                  🛡️ Helps with insurance claim support
                </p>
              </div>
            </div>

            {/* Drive to Own quick link */}
            <div style={{background:"linear-gradient(135deg,#1e3a5f,#2563eb)",
              borderRadius:16,padding:16,color:"#fff"}}>
              <p style={{fontWeight:900,fontSize:14,margin:"0 0 6px"}}>
                🏍️ Own Your Vehicle</p>
              <p style={{fontSize:12,opacity:0.85,margin:"0 0 12px"}}>
                35% of your earnings can automatically pay off your own motorcycle.
                No upfront cost. Own in ~9–14 months.
              </p>
              <Btn onClick={()=>setView("dto")} style={{background:"rgba(255,255,255,0.2)",
                border:"1px solid rgba(255,255,255,0.4)"}}>
                Apply for Drive to Own →
              </Btn>
            </div>
          </div>
        )}

        {/* ── DRIVE TO OWN TAB ───────────────────────────────── */}
        {view==="dto"&&(
          <DriveToOwn user={user} role="driver" dark={dark}
            onBack={()=>setView("home")}/>
        )}

        {view==="profile"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:t.card,borderRadius:16,padding:24,
              border:`1px solid ${t.bdr}`,textAlign:"center"}}>
              <div style={{fontSize:52,marginBottom:8}}>👨🏿‍🦱</div>
              <h2 style={{fontSize:20,fontWeight:900,color:t.text,margin:"0 0 4px"}}>
                {user.name||"Driver"}</h2>
              <p style={{color:t.sub,margin:"0 0 8px"}}>{user.phone}</p>
              <div style={{display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap"}}>
                <Badge color={user.isVerified?"green":"yellow"}>
                  {user.isVerified?"✅ Verified":"⏳ Pending Verification"}
                </Badge>
                {user.gender==="female"&&<Badge color="blue">♀ +2% Bonus</Badge>}
                {user.isEV&&<Badge color="green">⚡ EV +2%</Badge>}
                {user.ownerCode&&(
                  <Badge color="gray">Owner: {user.ownerCode}</Badge>
                )}
              </div>
            </div>

            <Btn onClick={()=>setScreen("verify")} outline color="blue">
              <Shield style={{width:16,height:16}}/> Verification Centre
            </Btn>
            <Btn onClick={onLogout} outline color="red">
              <LogOut style={{width:16,height:16}}/> Logout
            </Btn>
          </div>
        )}
      </div>
      <Nav/>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// OWNER APP
// ════════════════════════════════════════════════════════
function OwnerApp({ user, onLogout, dark, setDark }) {
  const t = T(dark);
  const [view,setView]   = useState("dashboard");
  const [stats,setStats] = useState({todayRevenue:450,weekRevenue:2850,
    totalRevenue:18200,activeDrivers:2,totalDrivers:3,fuelPool:180,maintenancePool:120});
  const [showCode,setShowCode]=useState(false);
  const [screen,setScreen]=useState(null);
  const [toast,setToast] = useState(null);
  const toast$ = (msg,type="success")=>setToast({msg,type});

  useEffect(()=>{
    api.getOwnerDash(user.id).then(r=>setStats(r.data||stats)).catch(()=>{});
  },[]);

  const Nav=()=>(
    <div style={{position:"fixed",bottom:0,left:0,right:0,maxWidth:448,margin:"0 auto",
      background:t.card,borderTop:`1px solid ${t.bdr}`,
      display:"flex",justifyContent:"space-around",padding:"6px 0",zIndex:30}}>
      {[["dashboard","📊","Dashboard"],["fleet","🚗","Fleet"],
        ["dto","🏍️","Own"],["pools","⛽","Pools"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)} style={{display:"flex",flexDirection:"column",
          alignItems:"center",padding:"4px 14px",border:"none",background:"none",
          color:view===v?"#2563eb":t.sub,cursor:"pointer",fontFamily:"inherit"}}>
          <span style={{fontSize:18}}>{ic}</span>
          <span style={{fontSize:10,fontWeight:700,marginTop:2}}>{lb}</span>
        </button>
      ))}
    </div>
  );

  if(screen==="dto") return (
    <DriveToOwn user={user} role="owner" dark={dark} onBack={()=>setScreen(null)}/>
  );
  if(screen==="verify") return (
    <VerificationHub user={user} role="owner" dark={dark} onDone={()=>setScreen(null)}/>
  );

  return (
    <div style={{maxWidth:448,margin:"0 auto",minHeight:"100vh",background:t.bg}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:"linear-gradient(90deg,#1d4ed8,#2563eb)",color:"#fff",
        padding:"12px 16px",display:"flex",alignItems:"center",
        justifyContent:"space-between",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Building2 style={{width:18,height:18}}/>
          <span style={{fontWeight:900,fontFamily:"Syne,sans-serif"}}>Owner Dashboard</span>
        </div>
        <button onClick={()=>setDark(!dark)} style={{padding:6,borderRadius:8,
          background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",cursor:"pointer"}}>
          {dark?<Sun style={{width:16,height:16}}/>:<Moon style={{width:16,height:16}}/>}
        </button>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="dashboard"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
            {/* Owner code */}
            <div style={{background:t.card,border:"2px solid #2563eb",borderRadius:16,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <p style={{color:"#2563eb",fontWeight:900,fontSize:13,margin:0}}>
                    🔑 Your Owner Code</p>
                  <p style={{fontSize:11,color:t.sub,margin:0}}>Share with your drivers</p>
                </div>
                <button onClick={()=>setShowCode(!showCode)} style={{background:"none",
                  border:"none",cursor:"pointer",color:t.sub}}>
                  {showCode?<EyeOff style={{width:18,height:18}}/>
                           :<Eye style={{width:18,height:18}}/>}
                </button>
              </div>
              {showCode?(
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1,padding:"12px 14px",border:`1px solid ${t.inpBorder}`,
                    borderRadius:12,background:t.inp,fontFamily:"monospace",fontWeight:900,
                    fontSize:18,textAlign:"center",color:t.text,letterSpacing:"0.1em"}}>
                    {user.ownerCode||"OWNXXXXXX"}
                  </div>
                  <button onClick={()=>{
                    navigator.clipboard?.writeText(user.ownerCode||"");
                    toast$("Owner code copied! Share with drivers 📋");
                  }} style={{padding:12,background:"#2563eb",color:"#fff",
                    borderRadius:12,border:"none",cursor:"pointer"}}>
                    <Copy style={{width:18,height:18}}/>
                  </button>
                </div>
              ):(
                <div style={{textAlign:"center",padding:"12px 0",fontSize:28,
                  fontFamily:"monospace",letterSpacing:"0.2em",color:t.sub}}>
                  ••••••••
                </div>
              )}
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["💰","GH₵"+stats.todayRevenue,"Today (50%)","green"],
                ["📅","GH₵"+stats.weekRevenue,"This Week","blue"],
                ["🏆","GH₵"+stats.totalRevenue,"Total Earned","purple"],
                ["👥",`${stats.activeDrivers}/${stats.totalDrivers}`,"Drivers Online","yellow"]
              ].map(([i,v,l,c])=>(
                <div key={l} style={{background:t.card,borderRadius:14,padding:14,
                  border:`1px solid ${t.bdr}`}}>
                  <span style={{fontSize:24}}>{i}</span>
                  <p style={{fontSize:22,fontWeight:900,margin:"4px 0 2px",
                    color:{green:"#16a34a",blue:"#2563eb",purple:"#9333ea",yellow:"#ca8a04"}[c]}}>
                    {v}</p>
                  <p style={{fontSize:11,color:t.sub,margin:0}}>{l}</p>
                </div>
              ))}
            </div>

            {/* Revenue split */}
            <div style={{background:t.card,borderRadius:14,padding:14,border:`1px solid ${t.bdr}`}}>
              <p style={{fontWeight:700,fontSize:13,color:t.text,margin:"0 0 10px"}}>
                Revenue Split (GH₵{stats.totalRevenue.toLocaleString()})</p>
              {[
                [`Your share (${SPLITS.owner}%)`,"GH₵"+(stats.totalRevenue*0.50).toFixed(0),"#16a34a"],
                [`Driver (${SPLITS.driver}%)`,"GH₵"+(stats.totalRevenue*0.25).toFixed(0),"#2563eb"],
                [`Fuel pool (${SPLITS.fuel}%)`,"GH₵"+(stats.totalRevenue*0.05).toFixed(0),"#ca8a04"],
                [`Maintenance (${SPLITS.maintenance}%)`,"GH₵"+(stats.totalRevenue*0.05).toFixed(0),"#ea580c"],
                ["Platform (15%)","GH₵"+(stats.totalRevenue*0.15).toFixed(0),"#9ca3af"],
              ].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",
                  paddingBottom:7,borderBottom:`1px solid ${t.bdr}`,marginBottom:7,fontSize:12}}>
                  <span style={{color:t.sub}}>{l}</span>
                  <span style={{fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <Btn onClick={()=>setScreen("verify")} outline color="blue">
                <Shield style={{width:16,height:16}}/> Verification Centre
              </Btn>
              <Btn onClick={onLogout} outline color="red">
                <LogOut style={{width:16,height:16}}/> Logout
              </Btn>
            </div>
          </div>
        )}

        {view==="fleet"&&(
          <div style={{padding:16}}>
            <h2 style={{fontWeight:900,fontSize:18,color:t.text,marginBottom:16}}>
              🚗 My Fleet</h2>
            <div style={{background:t.card,borderRadius:14,padding:14,
              border:`1px solid ${t.bdr}`,marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:32}}>🏍️</span>
                <div style={{flex:1}}>
                  <p style={{fontWeight:700,color:t.text,margin:0}}>Motorcycle #1</p>
                  <p style={{fontSize:11,fontFamily:"monospace",color:t.sub,margin:0}}>
                    ER-1234-26</p>
                </div>
                <Badge color="green">Active</Badge>
              </div>
            </div>
            <div style={{background:"#f0fdf4",border:"1px dashed #16a34a",borderRadius:14,
              padding:14,textAlign:"center"}}>
              <p style={{fontWeight:700,color:"#16a34a",fontSize:13,margin:"0 0 8px"}}>
                + Add Vehicle</p>
              <p style={{fontSize:11,color:t.sub,margin:"0 0 10px"}}>
                Add vehicles and assign drivers to grow your fleet.
              </p>
              <Btn onClick={()=>setScreen("verify")} color="green" small>
                Verify & Add Vehicle
              </Btn>
            </div>
          </div>
        )}

        {view==="dto"&&(
          <DriveToOwn user={user} role="owner" dark={dark}
            onBack={()=>setView("dashboard")}/>
        )}

        {view==="pools"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
            <h2 style={{fontWeight:900,fontSize:18,color:t.text}}>
              ⛽ Fuel & Maintenance Pools</h2>
            {/* Fuel */}
            <div style={{background:t.card,border:"2px solid #ca8a04",borderRadius:16,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",mb:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Fuel style={{width:22,height:22,color:"#ca8a04"}}/>
                  <span style={{fontWeight:900,color:t.text}}>Fuel Pool</span>
                </div>
                <span style={{fontSize:24,fontWeight:900,color:"#ca8a04"}}>
                  GH₵{stats.fuelPool}</span>
              </div>
              <div style={{background:dark?"#374151":"#fefce8",border:"1px solid #fde047",
                borderRadius:12,padding:12,marginTop:10}}>
                <p style={{fontSize:11,color:"#713f12",margin:0}}>
                  🔒 Locked — only spendable on fuel at registered stations<br/>
                  ⛽ Drivers generate code in-app → show at pump<br/>
                  📊 All transactions visible to you in real-time
                </p>
              </div>
            </div>
            {/* Maintenance */}
            <div style={{background:t.card,border:"2px solid #ea580c",borderRadius:16,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Wrench style={{width:22,height:22,color:"#ea580c"}}/>
                  <span style={{fontWeight:900,color:t.text}}>Maintenance Pool</span>
                </div>
                <span style={{fontSize:24,fontWeight:900,color:"#ea580c"}}>
                  GH₵{stats.maintenancePool}</span>
              </div>
              <div style={{background:dark?"#374151":"#fff7ed",border:"1px solid #fdba74",
                borderRadius:12,padding:12,marginTop:10}}>
                <p style={{fontSize:11,color:"#78350f",margin:0}}>
                  🔧 Smart alerts when service is due<br/>
                  ✅ You approve mechanic payments<br/>
                  📱 Direct payment to registered garages<br/>
                  🛡️ Builds insurance claim evidence
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      <Nav/>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// ADMIN APP
// ════════════════════════════════════════════════════════
function AdminApp({ user, onLogout, dark, setDark }) {
  const t = T(dark);
  const [view,setView] = useState("overview");
  const [stats,setStats]=useState({totalRides:5432,activeRides:23,totalDrivers:87,
    onlineDrivers:34,verifiedDrivers:61,revenue:18450,commission:2767,users:1247,owners:42,
    dto:{total:34,pending:8,active:22,completed:4},
    loans:{active:15,pending:3},insured:67});
  const [queue,setQueue]=useState([]);
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  useEffect(()=>{
    api.getStats().then(r=>setStats(r.data||r)).catch(()=>{});
    api.getAdminQueue().then(r=>setQueue(r.queue||[])).catch(()=>{});
  },[]);

  const approve=async(type,subId)=>{
    try{
      await api.approveVerification(type,subId);
      setQueue(q=>q.filter(i=>i.subId!==subId));
      toast$(`${type} approved ✅`);
    }catch(e){toast$(e.message,"error");}
  };

  const typeLabel={
    kyc_review:"🪪 KYC",
    license_review:"📄 License",
    vehicle_review:"🚗 Vehicle",
    dto_application:"🏍️ Drive to Own",
    insurance_claim:"🛡️ Insurance Claim",
  };

  const tabs=[["overview","📊","Overview"],["queue","📋","Queue"],
    ["rides","🏍️","Rides"],["finance","💰","Finance"]];

  return (
    <div style={{maxWidth:448,margin:"0 auto",minHeight:"100vh",background:t.bg}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:"#111827",color:"#fff",padding:"12px 16px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>⚙️</span>
          <span style={{fontWeight:900,fontFamily:"Syne,sans-serif"}}>Admin Portal</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setDark(!dark)} style={{padding:6,borderRadius:8,
            background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",cursor:"pointer"}}>
            {dark?<Sun style={{width:16,height:16}}/>:<Moon style={{width:16,height:16}}/>}
          </button>
          <button onClick={onLogout} style={{padding:6,borderRadius:8,
            background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",cursor:"pointer"}}>
            <LogOut style={{width:16,height:16}}/>
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{background:t.card,borderBottom:`1px solid ${t.bdr}`,
        display:"flex",position:"sticky",top:48,zIndex:10}}>
        {tabs.map(([v,ic,lb])=>(
          <button key={v} onClick={()=>setView(v)} style={{flex:1,padding:"10px 4px",
            display:"flex",flexDirection:"column",alignItems:"center",gap:2,
            fontSize:10,fontWeight:700,border:"none",background:"none",cursor:"pointer",
            color:view===v?"#16a34a":t.sub,fontFamily:"inherit",
            borderBottom:view===v?"2px solid #16a34a":"2px solid transparent"}}>
            <span style={{fontSize:15}}>{ic}</span>{lb}
            {v==="queue"&&queue.length>0&&(
              <span style={{background:"#dc2626",color:"#fff",borderRadius:999,
                fontSize:9,fontWeight:900,padding:"1px 5px",position:"absolute",
                marginTop:-2}}>{queue.length}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{paddingBottom:24}}>
        {view==="overview"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 style={{fontWeight:900,fontSize:18,color:t.text,margin:0}}>Live Dashboard</h2>
              <Badge color="green">● Real-time</Badge>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["🏍️",stats.totalRides.toLocaleString(),"Total Rides","green"],
                ["🟢",stats.activeRides,"Active Now","blue"],
                ["👥",stats.totalDrivers,"Drivers","purple"],
                ["✅",stats.verifiedDrivers,"Verified","green"],
                ["🏢",stats.owners||42,"Owners","yellow"],
                ["💰","₵"+stats.revenue.toLocaleString(),"Revenue","green"],
              ].map(([i,v,l,c])=>(
                <div key={l} style={{background:t.card,borderRadius:14,padding:14,
                  border:`1px solid ${t.bdr}`}}>
                  <span style={{fontSize:22}}>{i}</span>
                  <p style={{fontSize:20,fontWeight:900,margin:"4px 0 2px",
                    color:{green:"#16a34a",blue:"#2563eb",purple:"#9333ea",
                           yellow:"#ca8a04",orange:"#f97316"}[c]}}>{v}</p>
                  <p style={{fontSize:11,color:t.sub,margin:0}}>{l}</p>
                </div>
              ))}
            </div>

            {/* DTO stats */}
            <div style={{background:t.card,borderRadius:14,padding:14,border:`1px solid ${t.bdr}`}}>
              <p style={{fontWeight:700,fontSize:13,color:t.text,margin:"0 0 10px"}}>
                🏍️ Drive to Own</p>
              {[["Pending review",stats.dto?.pending||0,"#ca8a04"],
                ["Active loans",stats.dto?.active||0,"#2563eb"],
                ["Completed",stats.dto?.completed||0,"#16a34a"],
                ["Total",stats.dto?.total||0,"#6b7280"],
              ].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",
                  paddingBottom:6,borderBottom:`1px solid ${t.bdr}`,marginBottom:6,fontSize:12}}>
                  <span style={{color:t.sub}}>{l}</span>
                  <span style={{fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
            </div>

            {/* Split reminder */}
            <div style={{background:"#f0fdf4",border:"1px solid #bbf7d0",
              borderRadius:12,padding:12}}>
              <p style={{fontWeight:700,color:"#16a34a",fontSize:12,margin:"0 0 6px"}}>
                ✅ Current Revenue Split</p>
              {[["Owner","50%"],["Driver","25% (+2% female/EV)"],
                ["Fuel Pool","5%"],["Maintenance","5%"],["Platform","15%"]].map(([l,v])=>(
                <p key={l} style={{fontSize:11,color:"#374151",margin:"2px 0"}}>
                  {l}: <strong>{v}</strong>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* ── VERIFICATION QUEUE ────────────────────────────── */}
        {view==="queue"&&(
          <div style={{padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 style={{fontWeight:900,fontSize:18,color:t.text,margin:0}}>
                📋 Verification Queue</h2>
              <Badge color={queue.length>0?"yellow":"green"}>
                {queue.length} pending
              </Badge>
            </div>

            {queue.length===0?(
              <div style={{textAlign:"center",padding:"48px 0"}}>
                <CheckCircle style={{width:48,height:48,color:"#16a34a",margin:"0 auto 12px"}}/>
                <p style={{fontWeight:700,color:t.text}}>Queue clear!</p>
                <p style={{fontSize:12,color:t.sub}}>All submissions reviewed.</p>
              </div>
            ):queue.map(item=>(
              <div key={item.id} style={{background:t.card,borderRadius:14,padding:14,
                marginBottom:10,border:`1px solid ${t.bdr}`}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <p style={{fontWeight:700,color:t.text,fontSize:14,margin:0}}>
                      {typeLabel[item.type]||item.type}</p>
                    <p style={{fontSize:11,color:t.sub,margin:"2px 0 0",fontFamily:"monospace"}}>
                      User: {item.userId?.slice(0,12)}…</p>
                  </div>
                  <Badge color={item.priority==="high"?"red":"yellow"}>
                    {item.priority}
                  </Badge>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <Btn onClick={()=>approve(
                    item.type.replace("_review","").replace("_application","apply"),
                    item.subId)}
                    color="green" small>
                    <CheckCircle style={{width:14,height:14}}/> Approve
                  </Btn>
                  <Btn onClick={()=>toast$("Rejection flow — add reason","error")}
                    outline color="red" small>
                    <XCircle style={{width:14,height:14}}/> Reject
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}

        {view==="rides"&&(
          <div style={{padding:16}}>
            <h2 style={{fontWeight:900,fontSize:18,color:t.text,marginBottom:16}}>
              🏍️ Live Rides</h2>
            {[{id:"R-001",pax:"Ama O.",driver:"Kwame A.",
               from:"Akosombo",to:"Atimpoku",fare:"₵13.50",status:"ongoing"},
              {id:"R-002",pax:"Kofi M.",driver:"Yaw M.",
               from:"Kpong",to:"Asesewa",fare:"₵9.00",status:"searching"},
            ].map(r=>(
              <div key={r.id} style={{background:t.card,borderRadius:14,padding:14,
                marginBottom:10,border:`1px solid ${t.bdr}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontFamily:"monospace",fontSize:11,color:t.sub}}>{r.id}</span>
                  <Badge color={r.status==="ongoing"?"green":"blue"}>{r.status}</Badge>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <MapPin style={{width:12,height:12,color:"#16a34a"}}/>
                  <span style={{color:t.text,fontSize:13,fontWeight:600}}>{r.from}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                  <Navigation style={{width:12,height:12,color:"#ef4444"}}/>
                  <span style={{color:t.text,fontSize:13,fontWeight:600}}>{r.to}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:11,color:t.sub}}>
                    👤{r.pax} · 🏍️{r.driver}</span>
                  <span style={{fontWeight:900,color:"#16a34a"}}>{r.fare}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {view==="finance"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
            <h2 style={{fontWeight:900,fontSize:18,color:t.text}}>💰 Finance</h2>
            {[
              {title:"Paystack",icon:"💳",color:"#f0fdf4",bdr:"#bbf7d0",
                items:[["Status","Active ✅"],["MoMo","MTN · Vodafone · Airtel"],
                  ["Card fee","1.95%"],["Webhook","/payments/webhook"]]},
              {title:"Firebase Auth",icon:"🔐",color:"#eff6ff",bdr:"#bfdbfe",
                items:[["OTP","Phone Auth (free tier)"],["Status","Active ✅"],
                  ["Project","okada-online-ghana"],["Region","us-central1"]]},
              {title:"Drive to Own",icon:"🏍️",color:"#f5f3ff",bdr:"#ddd6fe",
                items:[["Track A","35% daily · Drivers"],["Track B","30% down · Owners"],
                  ["Active","22 vehicles"],["Completed","4 vehicles"]]},
            ].map(s=>(
              <div key={s.title} style={{background:t.card,borderRadius:14,
                border:`1px solid ${t.bdr}`,overflow:"hidden"}}>
                <div style={{background:s.color,border:`1px solid ${s.bdr}`,
                  padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18}}>{s.icon}</span>
                  <span style={{fontWeight:700,color:t.text}}>{s.title}</span>
                </div>
                {s.items.map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",
                    padding:"8px 14px",borderBottom:`1px solid ${t.bdr}`,fontSize:12}}>
                    <span style={{color:t.sub}}>{l}</span>
                    <span style={{fontWeight:600,color:t.text}}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// ROOT ROUTER
// ════════════════════════════════════════════════════════
export default function App() {
  const [dark,setDark]         = useState(false);
  const [user,setUser]         = useState(null);
  const [role,setRole]         = useState(null);
  const [showVerify,setShowVerify] = useState(false);

  const login = (u, token, r) => {
    api.token = token;
    setUser(u);
    setRole(r);
    // Show verification hub for drivers/owners after first login
    if((r==="driver"||r==="owner") && u.kycStatus!=="approved") {
      setShowVerify(true);
    }
  };
  const logout = () => {
    setUser(null); setRole(null);
    api.token = null;
    if(window.recaptchaVerifier) {
      window.recaptchaVerifier = null;
    }
  };

  if(!user) return <AuthScreen onLogin={login} dark={dark}/>;

  if(showVerify && (role==="driver"||role==="owner")) return (
    <div style={{maxWidth:448,margin:"0 auto",minHeight:"100vh",
      background:dark?"#030712":"#f9fafb"}}>
      <div style={{background:"#16a34a",color:"#fff",padding:"12px 16px",
        display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:18}}>🛡️</span>
        <span style={{fontWeight:900,fontSize:16,fontFamily:"Syne,sans-serif"}}>
          Verification Required</span>
      </div>
      <VerificationHub
        user={user} role={role} dark={dark}
        onDone={()=>setShowVerify(false)}/>
    </div>
  );

  const props = { user, onLogout:logout, dark, setDark };
  if(role==="passenger") return <PassengerApp {...props}/>;
  if(role==="driver")    return <DriverApp    {...props}/>;
  if(role==="owner")     return <OwnerApp     {...props}/>;
  if(role==="admin")     return <AdminApp     {...props}/>;
}
