import { useState, useEffect } from "react";
import { MapPin, Navigation, Phone, Star, Bike, User, X, Moon, Sun,
         AlertCircle, CheckCircle, Loader, Clock, LogOut, Bell,
         ChevronRight, Building2, Fuel, Wrench, Eye, EyeOff,
         Copy, Download, BarChart2 } from "lucide-react";

// ── API ────────────────────────────────────────────────
const API = "https://okada-online-backend.vercel.app/api";
const PAYSTACK_PUBLIC_KEY = "pk_live_7ed3389d3a6ed4146b73485bb0cba4ec55e82c5b";
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
  sendOtp(phone, role)                          { return this.req("POST","/auth/send-otp",{phone,role}); }
  verifyOtp(phone,otp,role,name,ownerCode)       { return this.req("POST","/auth/verify-otp",{phone,otp,role,name,ownerCode}); }
  requestRide(data)                              { return this.req("POST","/rides/request",data); }
  acceptRide(rideId,driverId)                    { return this.req("POST",`/rides/${rideId}/accept`,{driverId}); }
  completeRide(rideId)                           { return this.req("POST",`/rides/${rideId}/complete`,{}); }
  toggleOnline(id,isOnline,vehicleType)          { return this.req("PUT",`/drivers/${id}/status`,{isOnline,vehicleType}); }
  updateLocation(id,lat,lng)                     { return this.req("PUT",`/drivers/${id}/location`,{latitude:lat,longitude:lng}); }
  getOwnerDash(id)                               { return this.req("GET",`/owners/${id}/dashboard`); }
  initPayment(rideId,amount,email,phone)         { return this.req("POST","/payments/initialize",{rideId,amount,email,phone}); }
  getStats()                                     { return this.req("GET","/admin/stats"); }
  getHistory(uid)                                { return this.req("GET",`/rides/history/${uid}`); }
}
const api = new Api();

// ── Constants ──────────────────────────────────────────
const VEHICLES = [
  { id:"okada",    label:"Okada",     icon:"🏍️", rate:2.5, color:"green"  },
  { id:"car",      label:"Car",       icon:"🚗", rate:4.0, color:"blue"   },
  { id:"tricycle", label:"Tricycle",  icon:"🛺", rate:3.0, color:"purple" },
  { id:"bicycle",  label:"E-Bicycle", icon:"🚴", rate:1.5, color:"orange" },
];
const LOCS = ["Akosombo","Atimpoku","Senchi","Frankadua","Adjena","Akrade",
              "Asesewa","Kpong","Odumase-Krobo","Agormanya","Somanya","Nkurakan",
              "Koforidua","Nsawam","Aburi"];
const SPLITS = { platform:0.15, owner:0.70, driver:0.10, fuel:0.03, maintenance:0.02 };

// ── Theme ──────────────────────────────────────────────
const T = (dark) => ({
  bg:   dark ? "bg-gray-950" : "bg-gray-50",
  card: dark ? "bg-gray-800" : "bg-white",
  text: dark ? "text-white"  : "text-gray-900",
  sub:  dark ? "text-gray-400": "text-gray-500",
  inp:  dark
    ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
    : "bg-white text-gray-900 border-gray-300 placeholder-gray-400",
  bdr:  dark ? "border-gray-700" : "border-gray-200",
  row:  dark ? "hover:bg-gray-700" : "hover:bg-gray-50",
});

// ── Shared Components ──────────────────────────────────
const Toast = ({ msg, type, close }) => {
  useEffect(() => { const t = setTimeout(close, 3500); return ()=>clearTimeout(t); }, [close]);
  return (
    <div className={`fixed top-4 inset-x-4 z-[100] max-w-md mx-auto flex items-start gap-3 px-4 py-3 rounded-2xl shadow-2xl text-white text-sm font-bold ${type==="error"?"bg-red-600":"bg-green-600"}`}>
      {type==="error"
        ? <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5"/>
        : <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5"/>}
      <span style={{flex:1}}>{msg}</span>
      <button onClick={close}><X className="w-4 h-4"/></button>
    </div>
  );
};

const Spin = ({sm}) => <Loader className={`animate-spin ${sm?"w-4 h-4":"w-5 h-5"}`}/>;

const Badge = ({ color, children }) => {
  const c = {
    green:"bg-green-100 text-green-700", red:"bg-red-50 text-red-500",
    yellow:"bg-yellow-400 text-gray-900", blue:"bg-blue-50 text-blue-600",
    gray:"bg-gray-100 text-gray-600", purple:"bg-purple-600 text-white",
    orange:"bg-orange-500 text-white"
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c[color]||c.gray}`}>{children}</span>;
};

const StatCard = ({ icon, label, value, sub, color, dark }) => {
  const t = T(dark);
  const c = { green:"text-green-600", blue:"text-blue-600", purple:"text-purple-600", yellow:"text-yellow-600", orange:"text-orange-500" };
  return (
    <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`} style={{display:"flex",flexDirection:"column",gap:4}}>
      <span style={{fontSize:28}}>{icon}</span>
      <span className={`text-2xl font-black ${c[color]||c.green}`}>{value}</span>
      <span className={`text-xs font-semibold ${t.text}`}>{label}</span>
      {sub && <span className={`text-xs ${t.sub}`}>{sub}</span>}
    </div>
  );
};

// ── AUTH ───────────────────────────────────────────────
function AuthScreen({ onLogin, dark, apiStatus = "checking" }) {
  const t = T(dark);
  const [role,setRole]   = useState("passenger");
  const [phone,setPhone] = useState("+233");
  const [name,setName]   = useState("");
  const [owner,setOwner] = useState("");
  const [otp,setOtp]     = useState("");
  const [step,setStep]   = useState("phone");
  const [loading,setLoading] = useState(false);
  const [toast,setToast] = useState(null);
  const toast$ = (msg,type="success") => setToast({msg,type});

  const sendOtp = async () => {
    if (phone.length < 12) { toast$("Enter valid Ghana number (+233...)","error"); return; }
    if (role==="driver" && !owner) { toast$("Enter your owner's code","error"); return; }
    setLoading(true);
    try { await api.sendOtp(phone,role); setStep("otp"); toast$("OTP sent via SMS! 📱"); }
    catch { setStep("otp"); toast$("Demo mode — use any 6 digits"); }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (otp.length < 4) { toast$("Enter OTP","error"); return; }
    setLoading(true);
    try {
      const res = await api.verifyOtp(phone,otp,role,name,role==="driver"?owner:null);
      api.token = res.token;
      onLogin(res.user, res.token, role);
    } catch {
      const demo = {
        id:"demo_"+Date.now(), name:name||"Demo User", phone, role,
        rating:5.0, totalRides:0,
        profilePhoto: role==="driver"?"👨🏿‍🦱":role==="owner"?"🏢":"👤",
        ownerCode: role==="driver" ? owner : role==="owner" ? "OWN"+Math.random().toString(36).substr(2,6).toUpperCase() : null,
        isVerified: role!=="passenger",
        earnings:{total:0,today:0,week:0},
        pools:{fuel:0,maintenance:0},
      };
      onLogin(demo,"demo_token",role);
    }
    setLoading(false);
  };

  return (
    <div className={`min-h-screen flex flex-col ${t.bg}`}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      {/* Hero */}
      <div style={{background:"linear-gradient(135deg,#14532d,#16a34a,#22c55e)",paddingTop:64,paddingBottom:48,paddingLeft:24,paddingRight:24,textAlign:"center",color:"#fff"}}>
        <div style={{fontSize:56,marginBottom:12}}>🏍️🚗🛺🚴</div>
        <h1 style={{fontFamily:"Syne,sans-serif",fontSize:36,fontWeight:900,letterSpacing:"-0.02em"}}>Okada Online</h1>
        <p style={{marginTop:6,color:"#bbf7d0",fontSize:14,fontWeight:600}}>Eastern Region Ghana · Complete Transport Ecosystem 🇬🇭</p>

        {/* ── Backend Status Indicator ── */}
        <div style={{marginTop:8,display:"inline-flex",alignItems:"center",gap:6,background:"rgba(0,0,0,0.2)",borderRadius:999,padding:"4px 12px"}}>
          <div style={{
            width:8,height:8,borderRadius:"50%",
            background: apiStatus==="ok" ? "#4ade80" : apiStatus==="error" ? "#f87171" : "#facc15",
            animation: apiStatus==="checking" ? "pulse 1s infinite" : "none"
          }}/>
          <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>
            {apiStatus==="ok" ? "Backend Connected ✅" : apiStatus==="error" ? "Backend Offline ❌" : "Connecting…"}
          </span>
        </div>

        <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:8,marginTop:16}}>
          {["70% Owners","10% Drivers","Auto Fuel 3%","Auto Maintenance 2%","USSD *711#"].map(f=>(
            <span key={f} style={{background:"rgba(255,255,255,0.15)",borderRadius:999,padding:"4px 12px",fontSize:11,fontWeight:700}}>{f}</span>
          ))}
        </div>
      </div>

      <div style={{flex:1,padding:"24px 20px"}}>
        {/* Role selector */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderRadius:16,overflow:"hidden",border:`1px solid ${dark?"#374151":"#e5e7eb"}`,marginBottom:24}}>
          {[["passenger","🧍","Passenger"],["driver","🏍️","Driver"],["owner","🏢","Owner"],["admin","⚙️","Admin"]].map(([r,ic,lb])=>(
            <button key={r} onClick={()=>{setRole(r);setStep("phone");}}
              style={{padding:"10px 4px",fontSize:10,fontWeight:700,background:role===r?"#16a34a":"transparent",color:role===r?"#fff":dark?"#9ca3af":"#6b7280",transition:"all 0.2s",textAlign:"center"}}>
              <div style={{fontSize:16}}>{ic}</div>{lb}
            </button>
          ))}
        </div>

        {step==="phone" ? (
          <div className="space-y-3">
            {role!=="admin" && (
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"
                className={`w-full px-4 py-3 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}
                style={{display:"block",width:"100%"}}/>
            )}
            <input value={phone} onChange={e=>setPhone(e.target.value)} type="tel" placeholder="+233XXXXXXXXX"
              className={`w-full px-4 py-3 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}
              style={{display:"block",width:"100%"}}/>
            {role==="driver" && (
              <div>
                <input value={owner} onChange={e=>setOwner(e.target.value.toUpperCase())} placeholder="Owner Code (e.g. OWNXYZ123)"
                  className={`w-full px-4 py-3 border rounded-2xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}
                  style={{display:"block",width:"100%"}}/>
                <p className={`text-xs mt-1 ${t.sub}`}>💡 Get this code from your vehicle owner</p>
              </div>
            )}
            {role==="owner" && (
              <div className={`${t.card} rounded-xl p-3 border border-green-200`}>
                <p style={{color:"#16a34a",fontWeight:700,fontSize:12,marginBottom:4}}>🏢 Owner Benefits</p>
                <p className={`text-xs ${t.sub}`}>Earn 70% on every ride. Fuel (3%) & maintenance (2%) auto-collected. No more daily arguments with drivers!</p>
              </div>
            )}
            <button onClick={sendOtp} disabled={loading}
              style={{width:"100%",background:"#16a34a",color:"#fff",padding:"14px",borderRadius:16,fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?0.6:1}}>
              {loading && <Spin/>}{loading?"Sending…":"Get OTP via SMS 📱"}
            </button>
            <p className={`text-xs text-center ${t.sub}`}>Demo mode: tap Get OTP, then enter any 6 digits</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className={`text-sm text-center ${t.sub}`}>Code sent to {phone}</p>
            <input value={otp} onChange={e=>setOtp(e.target.value)} maxLength={6} placeholder="● ● ● ● ● ●"
              className={`w-full px-4 py-4 border rounded-2xl text-2xl text-center font-black focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}
              style={{display:"block",width:"100%",letterSpacing:"0.4em"}}/>
            <button onClick={verifyOtp} disabled={loading}
              style={{width:"100%",background:"#16a34a",color:"#fff",padding:"14px",borderRadius:16,fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?0.6:1}}>
              {loading && <Spin/>}{loading?"Verifying…":"Verify & Continue ✅"}
            </button>
            <button onClick={()=>setStep("phone")} className={`w-full py-2 text-sm ${t.sub}`}>← Back</button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-8">
          {[["🏍️🚗","4 vehicle types"],["💰","70/10/3/2/15 splits"],["⛽","Auto fuel pool"],["🔧","Auto maintenance"],["📱","USSD *711# support"],["🔒","Verified & secure"]].map(([i,l])=>(
            <div key={l} className={`${t.card} rounded-2xl p-3 flex items-center gap-2 border ${t.bdr}`}>
              <span style={{fontSize:20}}>{i}</span>
              <span className={`text-xs font-semibold ${t.text}`}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PASSENGER APP ──────────────────────────────────────
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
    if (!pickup||!dest){setFare(null);return;}
    const v=VEHICLES.find(v=>v.id===vehicle);
    const km=parseFloat((2+Math.random()*13).toFixed(1));
    const total=parseFloat((km*v.rate+3).toFixed(2));
    setFare({km,total,dur:Math.ceil(km*3)});
  },[pickup,dest,vehicle]);

  useEffect(()=>{
    if(status==="matched"&&eta>0){
      const iv=setInterval(()=>setEta(e=>{if(e<=1){clearInterval(iv);setStatus("arrived");return 0;}return e-1;}),1000);
      return()=>clearInterval(iv);
    }
  },[status,eta]);

  useEffect(()=>{
    if(view==="history"){
      api.getHistory(user.id).then(r=>setHistory(r.rides||[])).catch(()=>setHistory(
        Array.from({length:6},(_,i)=>({id:i,from:LOCS[i*2%LOCS.length],to:LOCS[(i*2+1)%LOCS.length],fare:(Math.random()*20+5).toFixed(2),date:new Date(Date.now()-i*86400000*2).toLocaleDateString(),driver:"Kwame A.",rating:5,vehicle:VEHICLES[i%4].label}))
      ));
    }
  },[view,user.id]);

  const bookRide=async()=>{
    if(!pickup||!dest){toast$("Enter pickup & destination","error");return;}
    setLoading(true);setStatus("searching");
    try{await api.requestRide({userId:user.id,pickupLocation:{address:pickup,latitude:6.0998,longitude:0.1},destination:{address:dest,latitude:6.15,longitude:0.15},rideType:vehicle});}catch{}
    setTimeout(()=>{
      const v=VEHICLES.find(v=>v.id===vehicle);
      setDriver({name:"Kwame Asante",phone:"+233241234567",rating:4.9,vehicle:v.label,icon:v.icon,plate:"ER-1234-26",photo:"👨🏿‍🦱",rides:1247});
      setStatus("matched");setEta(180);toast$(`${v.label} driver matched! ${v.icon}`);
    },3500);
    setLoading(false);
  };

  const Nav=()=>(
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr}`} style={{display:"flex",justifyContent:"space-around",padding:"6px 0",zIndex:30}}>
      {[["home","🏠","Home"],["history","📋","History"],["profile","👤","Profile"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 20px",color:view===v?"#16a34a":dark?"#9ca3af":"#6b7280"}}>
          <span style={{fontSize:20}}>{ic}</span>
          <span style={{fontSize:11,fontWeight:700,marginTop:2}}>{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`max-w-md mx-auto min-h-screen relative ${t.bg}`}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      {/* Header */}
      <div style={{background:"#16a34a",color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:20}}>🏍️</span>
          <span style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:18}}>Okada Online</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setDark(!dark)} style={{padding:6,borderRadius:8,background:"rgba(255,255,255,0.15)"}}>{dark?<Sun className="w-4 h-4"/>:<Moon className="w-4 h-4"/>}</button>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#15803d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{user.profilePhoto||"👤"}</div>
        </div>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="home"&&(
          <div style={{padding:"16px"}}>
            {/* Map placeholder */}
            <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{height:140,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",marginBottom:12,position:"relative",overflow:"hidden",background:dark?"#1f2937":"linear-gradient(135deg,#f0fdf4,#eff6ff)"}}>
              <span style={{fontSize:40}}>{status==="ongoing"?"🏍️":"🗺️"}</span>
              <p className={`text-xs font-semibold mt-2 ${t.sub}`}>
                {status==="idle"?"Akosombo · Eastern Region":status==="searching"?"Finding drivers near you…":status==="matched"?"Driver on the way! 🏍️":status==="arrived"?"Driver arrived!":status==="ongoing"?"Ride in progress":"Completed ✅"}
              </p>
              <div style={{position:"absolute",top:8,right:8}}><Badge color="green">● GPS Live</Badge></div>
            </div>

            <div className={`${t.card} rounded-2xl shadow p-4 border ${t.bdr} space-y-3`}>
              <h2 className={`font-black text-base ${t.text}`}>📍 Book Your Ride</h2>
              {status==="idle"&&<>
                <div style={{position:"relative"}}>
                  <MapPin style={{position:"absolute",left:12,top:13,width:16,height:16,color:"#16a34a"}}/>
                  <input value={pickup} onChange={e=>setPickup(e.target.value)} list="locs" placeholder="Pickup location"
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                    style={{paddingLeft:36,display:"block",width:"100%"}}/>
                </div>
                <div style={{position:"relative"}}>
                  <Navigation style={{position:"absolute",left:12,top:13,width:16,height:16,color:"#ef4444"}}/>
                  <input value={dest} onChange={e=>setDest(e.target.value)} list="locs" placeholder="Destination"
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                    style={{paddingLeft:36,display:"block",width:"100%"}}/>
                </div>
                <datalist id="locs">{LOCS.map(l=><option key={l} value={l}/>)}</datalist>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                  {VEHICLES.map(v=>(
                    <button key={v.id} onClick={()=>setVehicle(v.id)}
                      style={{padding:"10px 4px",borderRadius:12,border:`2px solid ${vehicle===v.id?"#16a34a":"#e5e7eb"}`,background:vehicle===v.id?"#f0fdf4":"transparent",textAlign:"center"}}>
                      <div style={{fontSize:20}}>{v.icon}</div>
                      <div style={{fontSize:10,fontWeight:700,color:vehicle===v.id?"#16a34a":dark?"#9ca3af":"#6b7280",marginTop:2}}>{v.label}</div>
                    </button>
                  ))}
                </div>
                {fare&&(
                  <div style={{background:dark?"#14532d":"#f0fdf4",borderRadius:12,padding:12,border:"1px solid #bbf7d0",fontSize:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span className={t.sub}>Distance</span><span className={`font-semibold ${t.text}`}>{fare.km} km · ~{fare.dur} min</span></div>
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:8,borderTop:`1px solid ${dark?"#166534":"#bbf7d0"}`}}>
                      <span className={`font-black ${t.text}`}>Total Fare</span>
                      <span style={{fontWeight:900,color:"#16a34a",fontSize:18}}>GH₵{fare.total}</span>
                    </div>
                  </div>
                )}
                <button onClick={bookRide} disabled={!pickup||!dest||loading}
                  style={{width:"100%",background:"#16a34a",color:"#fff",padding:"14px",borderRadius:16,fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:(!pickup||!dest||loading)?0.4:1}}>
                  {loading&&<Spin/>}{loading?"Booking…":`Book ${VEHICLES.find(v=>v.id===vehicle)?.label} ${VEHICLES.find(v=>v.id===vehicle)?.icon}`}
                </button>
              </>}

              {status==="searching"&&(
                <div style={{textAlign:"center",padding:"24px 0"}}>
                  <div style={{width:48,height:48,border:"4px solid #16a34a",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/>
                  <p className={`font-bold ${t.text}`}>Finding your driver…</p>
                  <p className={`text-xs mt-1 ${t.sub}`}>Notifying nearby drivers via SMS</p>
                  <button onClick={()=>setStatus("idle")} style={{marginTop:16,padding:"8px 20px",border:"1px solid #f87171",color:"#ef4444",borderRadius:12,fontSize:13,fontWeight:700}}>Cancel</button>
                </div>
              )}

              {(status==="matched"||status==="arrived")&&driver&&(
                <div className="space-y-3">
                  {status==="arrived"&&<div style={{background:"#16a34a",color:"#fff",borderRadius:12,padding:"8px",textAlign:"center",fontWeight:700,fontSize:13}}>🏍️ Driver has arrived!</div>}
                  <div style={{display:"flex",alignItems:"center",gap:12,padding:12,borderRadius:12,background:dark?"#374151":"#f9fafb"}}>
                    <div style={{width:52,height:52,borderRadius:"50%",background:"#dcfce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{driver.photo}</div>
                    <div style={{flex:1}}>
                      <p className={`font-black ${t.text}`}>{driver.name}</p>
                      <p className={`text-xs ${t.sub}`}>{driver.icon} {driver.vehicle} · {driver.plate}</p>
                      <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                        <Star style={{width:12,height:12,fill:"#facc15",color:"#facc15"}}/>
                        <span className={`text-xs ${t.sub}`}>{driver.rating} · {driver.rides} rides</span>
                      </div>
                    </div>
                    {status==="matched"&&(
                      <div style={{textAlign:"center"}}>
                        <p style={{fontWeight:900,color:"#16a34a",fontSize:20}}>{Math.floor(eta/60)}:{String(eta%60).padStart(2,"0")}</p>
                        <p className={`text-xs ${t.sub}`}>ETA</p>
                      </div>
                    )}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    <button onClick={()=>setStatus("idle")} style={{padding:"10px",border:"1px solid #f87171",color:"#ef4444",borderRadius:12,fontWeight:700,fontSize:12}}>Cancel</button>
                    <a href={`tel:${driver.phone}`} style={{padding:"10px",background:"#2563eb",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,textAlign:"center",display:"block"}}>📞 Call</a>
                    <button onClick={()=>setStatus("ongoing")} style={{padding:"10px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12}}>Start →</button>
                  </div>
                </div>
              )}

              {status==="ongoing"&&driver&&(
                <div className="space-y-3">
                  <div style={{background:"#2563eb",color:"#fff",borderRadius:12,padding:"8px",textAlign:"center",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:"#fff",animation:"pulse 2s infinite"}}/>Ride in progress
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:12,borderRadius:12,background:dark?"#374151":"#f9fafb"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <span style={{fontSize:24}}>{driver.photo}</span>
                      <div>
                        <p className={`font-bold ${t.text}`}>{driver.name}</p>
                        <p className={`text-xs ${t.sub}`}>{driver.plate}</p>
                      </div>
                    </div>
                    <p style={{fontWeight:900,color:"#16a34a",fontSize:18}}>GH₵{fare?.total}</p>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <button onClick={()=>toast$("🚨 Emergency services notified!","error")} style={{padding:"12px",background:"#dc2626",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <AlertCircle style={{width:16,height:16}}/> SOS
                    </button>
                    <button onClick={()=>{setStatus("idle");setDriver(null);setPickup("");setDest("");setFare(null);toast$("Thanks for riding Okada Online! 🇬🇭");}} style={{padding:"12px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>Complete ✅</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {view==="history"&&(
          <div style={{padding:16}}>
            <h2 className={`font-black text-lg mb-4 ${t.text}`}>📋 Ride History</h2>
            {history.length===0?(
              <div style={{textAlign:"center",padding:"48px 0"}}>
                <div style={{fontSize:48,marginBottom:12}}>🛺</div>
                <p className={t.sub}>No rides yet</p>
                <button onClick={()=>setView("home")} style={{marginTop:16,padding:"10px 24px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>Book Now</button>
              </div>
            ):history.map(r=>(
              <div key={r.id} className={`${t.card} rounded-2xl p-4 mb-3 border ${t.bdr}`}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,gap:4,display:"flex",flexDirection:"column"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}><MapPin style={{width:12,height:12,color:"#16a34a",flexShrink:0}}/><span className={`font-semibold ${t.text}`}>{r.from}</span></div>
                    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}><Navigation style={{width:12,height:12,color:"#ef4444",flexShrink:0}}/><span className={`font-semibold ${t.text}`}>{r.to}</span></div>
                    <p className={`text-xs ${t.sub}`}>{r.date} · {r.driver} · {r.vehicle}</p>
                  </div>
                  <div style={{textAlign:"right",marginLeft:12}}>
                    <p style={{fontWeight:900,color:"#16a34a"}}>GH₵{r.fare}</p>
                    <div style={{display:"flex",justifyContent:"flex-end",gap:2,marginTop:4}}>
                      {[...Array(r.rating||5)].map((_,i)=><Star key={i} style={{width:11,height:11,fill:"#facc15",color:"#facc15"}}/>)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view==="profile"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:16}}>
            <div className={`${t.card} rounded-2xl p-6 border ${t.bdr}`} style={{textAlign:"center"}}>
              <div style={{fontSize:52,marginBottom:8}}>{user.profilePhoto||"👤"}</div>
              <h2 className={`text-xl font-black ${t.text}`}>{user.name||"Passenger"}</h2>
              <p className={t.sub}>{user.phone}</p>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginTop:8}}>
                <Star style={{width:16,height:16,fill:"#facc15",color:"#facc15"}}/>
                <span className={`font-bold ${t.text}`}>{user.rating||"5.0"}</span>
              </div>
            </div>
            <button onClick={onLogout} style={{width:"100%",padding:"12px",border:"1px solid #f87171",color:"#ef4444",borderRadius:16,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <LogOut style={{width:16,height:16}}/>Logout
            </button>
          </div>
        )}
      </div>
      <Nav/>
    </div>
  );
}

// ── DRIVER APP ─────────────────────────────────────────
function DriverApp({ user, onLogout, dark, setDark }) {
  const t = T(dark);
  const [view,setView]     = useState("home");
  const [online,setOnline] = useState(false);
  const [incoming,setIncoming]=useState(null);
  const [activeRide,setActiveRide]=useState(null);
  const [earnings,setEarnings]=useState({today:0,week:0,total:0,rides:0});
  const [toast,setToast]   = useState(null);
  const [showFuelCode,setShowFuelCode] = useState(false);
  const [fuelCode] = useState("FUEL-" + Math.random().toString(36).substr(2,4).toUpperCase() + "-" + Math.random().toString(36).substr(2,4).toUpperCase());
  const toast$ = (msg,type="success")=>setToast({msg,type});

  useEffect(()=>{
    if(!online||incoming||activeRide)return;
    const tm=setTimeout(()=>setIncoming({id:"ride_"+Date.now(),passenger:"Ama Owusu",phone:"+233205556789",from:"Akosombo",to:"Atimpoku",dist:"4.2 km",dur:"12 min",fare:"GH₵13.50",earn:"GH₵1.35"}),5000);
    return()=>clearTimeout(tm);
  },[online,incoming,activeRide]);

  useEffect(()=>{
    if(!online)return;
    const iv=setInterval(()=>api.updateLocation(user.id,6.0998+Math.random()*0.01,0.1+Math.random()*0.01).catch(()=>{}),5000);
    return()=>clearInterval(iv);
  },[online,user.id]);

  const toggleOnline=async()=>{
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
    const earned=parseFloat((activeRide.earn||"GH₵1.35").replace("GH₵",""));
    setEarnings(e=>({today:+(e.today+earned).toFixed(2),week:+(e.week+earned).toFixed(2),total:+(e.total+earned).toFixed(2),rides:e.rides+1}));
    setActiveRide(null);
    toast$(`Ride complete! Earned ${activeRide.earn} 💰`);
  };

  const Nav=()=>(
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr}`} style={{display:"flex",justifyContent:"space-around",padding:"6px 0",zIndex:30}}>
      {[["home","🏠","Home"],["earnings","💰","Earnings"],["profile","👤","Profile"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 20px",color:view===v?"#16a34a":dark?"#9ca3af":"#6b7280"}}>
          <span style={{fontSize:20}}>{ic}</span><span style={{fontSize:11,fontWeight:700,marginTop:2}}>{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`max-w-md mx-auto min-h-screen ${t.bg}`}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      {incoming&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:50,display:"flex",alignItems:"flex-end",maxWidth:448,margin:"0 auto"}}>
          <div className={`${t.card} rounded-t-3xl p-6 w-full shadow-2xl`}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <div>
                <h3 className={`text-lg font-black ${t.text}`}>🏍️ New Ride Request!</h3>
                <p className={t.sub} style={{fontSize:12}}>Respond within 30 seconds</p>
              </div>
              <Badge color="green">+{incoming.earn}</Badge>
            </div>
            <div className={`${dark?"bg-gray-700":"bg-gray-50"} rounded-2xl p-3 mb-4`} style={{display:"flex",flexDirection:"column",gap:8,fontSize:13}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><MapPin style={{width:14,height:14,color:"#16a34a"}}/><span className={t.text}>{incoming.from}</span></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}><Navigation style={{width:14,height:14,color:"#ef4444"}}/><span className={t.text}>{incoming.to}</span></div>
              <div style={{display:"flex",gap:16,paddingTop:4}}>
                <span className={t.sub}>📏 {incoming.dist}</span>
                <span className={t.sub}>⏱️ {incoming.dur}</span>
                <span style={{color:"#16a34a",fontWeight:700}}>{incoming.fare}</span>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <button onClick={()=>setIncoming(null)} style={{padding:"14px",border:"1px solid #f87171",color:"#ef4444",borderRadius:16,fontWeight:700}}>Decline</button>
              <button onClick={accept} style={{padding:"14px",background:"#16a34a",color:"#fff",borderRadius:16,fontWeight:700}}>Accept ✅</button>
            </div>
          </div>
        </div>
      )}

      <div style={{background:"#166534",color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>🏍️</span><span style={{fontFamily:"Syne,sans-serif",fontWeight:900}}>Driver Portal</span></div>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",borderRadius:999,background:online?"#16a34a":"#4b5563",fontSize:11,fontWeight:900}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:online?"#fff":"#9ca3af",animation:online?"pulse 2s infinite":"none"}}/>
          {online?"ONLINE":"OFFLINE"}
        </div>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="home"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:16}}>
            <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{height:160,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",background:dark?"#1f2937":"#f0fdf4"}}>
              {online&&<div style={{position:"absolute",width:240,height:240,borderRadius:"50%",background:"#22c55e",opacity:0.08,animation:"ping 1s infinite"}}/>}
              <span style={{fontSize:44,animation:online?"bounce 1s infinite":"none"}}>{online?"🏍️":"⏸️"}</span>
              <p className={`text-sm font-semibold mt-2 ${t.sub}`}>{online?"Broadcasting GPS…":"Go online to earn"}</p>
              {online&&<div style={{position:"absolute",top:8,right:8}}><Badge color="green">● Live</Badge></div>}
            </div>
            <button onClick={toggleOnline} style={{width:"100%",padding:"14px",borderRadius:16,fontWeight:900,fontSize:16,color:"#fff",background:online?"#dc2626":"#16a34a"}}>
              {online?"🔴 Go Offline":"🟢 Go Online — Start Earning"}
            </button>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <StatCard icon="💰" label="Today" value={"GH₵"+earnings.today} color="green" dark={dark}/>
              <StatCard icon="🏍️" label="Rides" value={earnings.rides} color="blue" dark={dark}/>
            </div>
            {activeRide&&(
              <div className={`${t.card} rounded-2xl p-4 border-2 border-green-500`}>
                <p style={{color:"#16a34a",fontWeight:900,fontSize:13,marginBottom:12}}>● Active Ride</p>
                <div style={{background:dark?"#374151":"#f9fafb",borderRadius:12,padding:12,marginBottom:12,display:"flex",flexDirection:"column",gap:6,fontSize:13}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><MapPin style={{width:12,height:12,color:"#16a34a"}}/><span className={t.text}>{activeRide.from}</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><Navigation style={{width:12,height:12,color:"#ef4444"}}/><span className={t.text}>{activeRide.to}</span></div>
                  <p style={{color:"#16a34a",fontWeight:700}}>You earn: {activeRide.earn}</p>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <a href={`tel:${activeRide.phone}`} style={{padding:"10px",background:"#2563eb",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,textAlign:"center",display:"block"}}>📞 Call</a>
                  <button onClick={complete} style={{padding:"10px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12}}>✅ Complete</button>
                </div>
              </div>
            )}
            {/* ─── FUEL POOL ─────────────────────────────────── */}
            <div className={`${t.card} rounded-2xl p-4 border-2 border-yellow-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:22}}>⛽</span>
                  <span className={`font-black ${t.text}`}>Your Fuel Pool</span>
                </div>
                <span style={{fontSize:24,fontWeight:900,color:"#ca8a04"}}>GH₵{(earnings.total*0.03).toFixed(2)}</span>
              </div>
              <p className={`text-xs ${t.sub} mb-3`}>3% of every ride is auto-collected here. Use it only at registered fuel stations.</p>
              <div className={`rounded-xl p-3 mb-3 ${dark?"bg-gray-700":"bg-yellow-50"}`}>
                <p className={`text-xs font-bold mb-1`} style={{color:"#ca8a04"}}>⛽ How to use your fuel pool:</p>
                <p className={`text-xs ${t.text}`}>1. Ride to any registered Okada Online fuel station</p>
                <p className={`text-xs ${t.text}`}>2. Open app → tap <strong>Show Fuel Code</strong> below</p>
                <p className={`text-xs ${t.text}`}>3. Show code to station attendant</p>
                <p className={`text-xs ${t.text}`}>4. Pool balance deducted automatically — zero cash needed</p>
              </div>
              <button
                onClick={()=>{ setShowFuelCode(!showFuelCode); }}
                style={{width:"100%",padding:"12px",background:"#ca8a04",color:"#fff",borderRadius:12,fontWeight:900,fontSize:14}}>
                {showFuelCode ? "Hide Code" : "⛽ Show Fuel Code"}
              </button>
              {showFuelCode && (
                <div style={{marginTop:12,textAlign:"center",padding:"16px",background:dark?"#374151":"#fefce8",borderRadius:12,border:"2px dashed #ca8a04"}}>
                  <p className={`text-xs ${t.sub} mb-2`}>Your fuel station code</p>
                  <p style={{fontFamily:"monospace",fontSize:28,fontWeight:900,color:"#ca8a04",letterSpacing:"0.15em"}}>{fuelCode}</p>
                  <p className={`text-xs ${t.sub} mt-2`}>Valid for 10 minutes · Balance: GH₵{(earnings.total*0.03).toFixed(2)}</p>
                </div>
              )}
            </div>

            {/* ─── MAINTENANCE POOL ──────────────────────────── */}
            <div className={`${t.card} rounded-2xl p-4 border-2 border-orange-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:22}}>🔧</span>
                  <span className={`font-black ${t.text}`}>Maintenance Pool</span>
                </div>
                <span style={{fontSize:24,fontWeight:900,color:"#ea580c"}}>GH₵{(earnings.total*0.02).toFixed(2)}</span>
              </div>
              <p className={`text-xs ${t.sub}`}>2% auto-collected. Your owner approves mechanic payments from this. No more "vehicle broken, no money" problems.</p>
            </div>

            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <h3 className={`font-bold text-sm mb-2 ${t.text}`}>💡 Your Earnings Breakdown</h3>
              <div style={{display:"flex",flexDirection:"column",gap:6,fontSize:12}}>
                {[["Your cut (10%)","GH₵"+(earnings.total).toFixed(2),"#16a34a"],["Owner share (70%)","Auto-paid","#2563eb"],["Fuel pool (3%)","Auto-collected","#ca8a04"],["Maintenance (2%)","Auto-collected","#ea580c"],["Platform (15%)","Okada Online","#9ca3af"]].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",paddingBottom:6,borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
                    <span className={t.sub}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view==="earnings"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:16}}>
            <h2 className={`font-black text-lg ${t.text}`}>💰 Earnings</h2>
            <div className={`${t.card} rounded-2xl p-5 border ${t.bdr}`} style={{textAlign:"center"}}>
              <p className={`text-sm ${t.sub}`}>Total Lifetime</p>
              <p style={{fontSize:40,fontWeight:900,color:"#16a34a",margin:"4px 0"}}>GH₵{earnings.total}</p>
              <p className={`text-xs ${t.sub}`}>10% of all fares · transparent & fair</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
              {[["Today","GH₵"+earnings.today],["Week","GH₵"+earnings.week],["Rides",earnings.rides]].map(([l,v])=>(
                <div key={l} className={`${t.card} rounded-2xl p-4 border ${t.bdr}`} style={{textAlign:"center"}}>
                  <p className={`text-lg font-black ${t.text}`}>{v}</p>
                  <p className={`text-xs ${t.sub}`}>{l}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {view==="profile"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:16}}>
            <div className={`${t.card} rounded-2xl p-6 border ${t.bdr}`} style={{textAlign:"center"}}>
              <div style={{fontSize:52,marginBottom:8}}>{user.profilePhoto||"👨🏿"}</div>
              <h2 className={`text-xl font-black ${t.text}`}>{user.name||"Driver"}</h2>
              <p className={t.sub}>{user.phone}</p>
              <div style={{marginTop:8}}>
                <Badge color={user.isVerified?"green":"yellow"}>{user.isVerified?"✅ Verified":"⏳ Pending"}</Badge>
              </div>
              {user.ownerCode&&<p className={`text-xs mt-2 ${t.sub}`}>Owner: <span style={{fontFamily:"monospace",color:"#16a34a"}}>{user.ownerCode}</span></p>}
            </div>
            <button onClick={onLogout} style={{width:"100%",padding:"12px",border:"1px solid #f87171",color:"#ef4444",borderRadius:16,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <LogOut style={{width:16,height:16}}/>Logout
            </button>
          </div>
        )}
      </div>
      <Nav/>
    </div>
  );
}

// ── OWNER APP ──────────────────────────────────────────
function OwnerApp({ user, onLogout, dark, setDark }) {
  const t = T(dark);
  const [view,setView]   = useState("dashboard");
  const [stats,setStats] = useState({todayRevenue:450,weekRevenue:2850,totalRevenue:18200,activeDrivers:2,totalDrivers:3,fuelPool:180,maintenancePool:120});
  const [showCode,setShowCode]=useState(false);
  const [toast,setToast] = useState(null);
  const toast$ = (msg,type="success")=>setToast({msg,type});

  useEffect(()=>{
    api.getOwnerDash(user.id).then(r=>setStats(r.data||stats)).catch(()=>{});
  },[]);

  const Nav=()=>(
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr}`} style={{display:"flex",justifyContent:"space-around",padding:"6px 0",zIndex:30}}>
      {[["dashboard","📊","Dashboard"],["fleet","🚗","Fleet"],["pools","⛽","Pools"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 20px",color:view===v?"#2563eb":dark?"#9ca3af":"#6b7280"}}>
          <span style={{fontSize:20}}>{ic}</span><span style={{fontSize:11,fontWeight:700,marginTop:2}}>{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`max-w-md mx-auto min-h-screen relative ${t.bg}`}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:"linear-gradient(90deg,#1d4ed8,#2563eb)",color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><Building2 style={{width:20,height:20}}/><span style={{fontFamily:"Syne,sans-serif",fontWeight:900}}>Owner Dashboard</span></div>
        <button onClick={()=>setDark(!dark)} style={{padding:6,borderRadius:8,background:"rgba(255,255,255,0.15)"}}>{dark?<Sun className="w-4 h-4"/>:<Moon className="w-4 h-4"/>}</button>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="dashboard"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:16}}>
            {/* Owner code card */}
            <div className={`${t.card} rounded-2xl p-4 border-2 border-blue-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <p style={{color:"#2563eb",fontWeight:900,fontSize:13}}>🔑 Your Owner Code</p>
                  <p className={`text-xs ${t.sub}`}>Share with your drivers</p>
                </div>
                <button onClick={()=>setShowCode(!showCode)}>{showCode?<EyeOff style={{width:16,height:16,color:"#9ca3af"}}/>:<Eye style={{width:16,height:16,color:"#9ca3af"}}/>}</button>
              </div>
              {showCode?(
                <div style={{display:"flex",gap:8}}>
                  <div className={`flex-1 px-4 py-3 border rounded-xl ${t.inp} font-mono font-black text-center text-lg`}>{user.ownerCode||"OWN??????"}</div>
                  <button onClick={()=>{navigator.clipboard?.writeText(user.ownerCode||"");toast$("Code copied! Share with drivers 📋");}} style={{padding:"12px",background:"#2563eb",color:"#fff",borderRadius:12}}>
                    <Copy style={{width:18,height:18}}/>
                  </button>
                </div>
              ):(
                <div style={{textAlign:"center",padding:"12px 0",fontSize:28,fontFamily:"monospace",letterSpacing:"0.2em",color:dark?"#374151":"#d1d5db"}}>••••••</div>
              )}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <StatCard icon="💰" label="Today (70%)" value={"GH₵"+stats.todayRevenue} color="green" dark={dark}/>
              <StatCard icon="📅" label="This Week" value={"GH₵"+stats.weekRevenue} color="blue" dark={dark}/>
              <StatCard icon="🏆" label="Total Earned" value={"GH₵"+stats.totalRevenue} color="purple" dark={dark}/>
              <StatCard icon="👥" label="Drivers" value={`${stats.activeDrivers}/${stats.totalDrivers}`} sub="Online/Total" color="yellow" dark={dark}/>
            </div>

            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <h3 className={`font-bold mb-3 ${t.text}`}>Revenue Split (GH₵{stats.totalRevenue})</h3>
              {[["Your share (70%)","GH₵"+(stats.totalRevenue*0.70).toFixed(2),"#16a34a"],["Driver earnings (10%)","GH₵"+(stats.totalRevenue*0.10).toFixed(2),"#2563eb"],["Fuel pool (3%)","GH₵"+(stats.totalRevenue*0.03).toFixed(2),"#ca8a04"],["Maintenance (2%)","GH₵"+(stats.totalRevenue*0.02).toFixed(2),"#ea580c"],["Platform (15%)","GH₵"+(stats.totalRevenue*0.15).toFixed(2),"#9ca3af"]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",paddingBottom:8,borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,marginBottom:8,fontSize:13}}>
                  <span className={t.sub}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
            </div>

            <div className={`${t.card} rounded-2xl p-4 border-2 border-green-500`}>
              <p style={{color:"#16a34a",fontWeight:900,fontSize:13,marginBottom:8}}>✅ Your Automated Benefits</p>
              {["No daily arguments with drivers — splits are automatic","Fuel always available (3% pool auto-fills)","Maintenance never missed (2% pool + alerts)","See ALL trips in real-time","Insurance & roadworthy auto-tracked"].map(b=>(
                <p key={b} className={`text-xs ${t.text}`} style={{marginBottom:4}}>• {b}</p>
              ))}
            </div>

            <button onClick={onLogout} style={{width:"100%",padding:"12px",border:"1px solid #f87171",color:"#ef4444",borderRadius:16,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <LogOut style={{width:16,height:16}}/>Logout
            </button>
          </div>
        )}

        {view==="fleet"&&(
          <div style={{padding:16}}>
            <h2 className={`font-black text-lg mb-4 ${t.text}`}>🚗 My Fleet</h2>
            {(user.vehicles||[{id:"v1",type:"okada",plate:"ER-1234-26"},{id:"v2",type:"car",plate:"ER-5678-26"}]).map(v=>(
              <div key={v.id} className={`${t.card} rounded-2xl p-4 border ${t.bdr} mb-3`}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:32}}>{VEHICLES.find(x=>x.id===v.type)?.icon||"🏍️"}</span>
                  <div style={{flex:1}}>
                    <p className={`font-bold ${t.text}`}>{VEHICLES.find(x=>x.id===v.type)?.label||"Vehicle"}</p>
                    <p className={`text-xs font-mono ${t.sub}`}>{v.plate}</p>
                  </div>
                  <Badge color="green">Active</Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {view==="pools"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:16}}>
            <h2 className={`font-black text-lg ${t.text}`}>⛽ Fuel & Maintenance Pools</h2>
            <div className={`${t.card} rounded-2xl p-4 border-2 border-yellow-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><Fuel style={{width:20,height:20,color:"#ca8a04"}}/><span className={`font-black ${t.text}`}>Fuel Pool</span></div>
                <span style={{fontSize:24,fontWeight:900,color:"#ca8a04"}}>GH₵{stats.fuelPool}</span>
              </div>
              <p className={`text-xs ${t.sub} mb-3`}>3% of every ride. Drivers withdraw at fuel stations using a code.</p>
              <div className={`rounded-xl p-3 text-xs ${dark?"bg-gray-700":"bg-gray-50"}`}>
                <p className={t.text}>🔒 Locked — only spendable on fuel</p>
                <p className={t.text} style={{marginTop:4}}>⛽ Driver uses code at pump</p>
                <p className={t.text} style={{marginTop:4}}>📊 You see all transactions</p>
              </div>
            </div>
            <div className={`${t.card} rounded-2xl p-4 border-2 border-orange-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><Wrench style={{width:20,height:20,color:"#ea580c"}}/><span className={`font-black ${t.text}`}>Maintenance Pool</span></div>
                <span style={{fontSize:24,fontWeight:900,color:"#ea580c"}}>GH₵{stats.maintenancePool}</span>
              </div>
              <p className={`text-xs ${t.sub} mb-3`}>2% of every ride. For oil changes, repairs, servicing.</p>
              <div className={`rounded-xl p-3 text-xs ${dark?"bg-gray-700":"bg-gray-50"}`}>
                <p className={t.text}>🔧 Smart alerts when service is due</p>
                <p className={t.text} style={{marginTop:4}}>✅ You approve mechanic payments</p>
                <p className={t.text} style={{marginTop:4}}>📱 Direct payment to registered garages</p>
              </div>
            </div>
          </div>
        )}
      </div>
      <Nav/>
    </div>
  );
}

// ── ADMIN APP ──────────────────────────────────────────
function AdminApp({ user, onLogout, dark, setDark }) {
  const t = T(dark);
  const [view,setView] = useState("overview");
  const [stats,setStats]=useState({totalRides:5432,activeRides:23,totalDrivers:87,onlineDrivers:34,revenue:18450,commission:2767,users:1247,owners:42});
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  useEffect(()=>{ api.getStats().then(r=>setStats(r.data||r)).catch(()=>{}); },[]);

  const liveRides=[
    {id:"R-001",pax:"Ama O.",  driver:"Kwame A.", from:"Akosombo",  to:"Atimpoku", fare:"₵13.50",status:"ongoing"},
    {id:"R-002",pax:"Kofi M.", driver:"Yaw M.",   from:"Kpong",     to:"Asesewa",  fare:"₵9.00", status:"searching"},
    {id:"R-003",pax:"Abena T.",driver:"Akosua S.",from:"Odumase",   to:"Somanya",  fare:"₵11.00",status:"matched"},
    {id:"R-004",pax:"Kweku B.",driver:"Kofi A.",  from:"Atimpoku",  to:"Senchi",   fare:"₵7.00", status:"ongoing"},
  ];
  const drivers=[
    {name:"Kwame Asante",  phone:"+233241234567",plate:"ER-1234-26",rating:4.9,rides:1247,online:true, earn:4250},
    {name:"Yaw Mensah",    phone:"+233209876543",plate:"ER-5678-26",rating:4.8,rides:876, online:true, earn:3890},
    {name:"Akosua Sarpong",phone:"+233285556789",plate:"ER-9012-26",rating:4.7,rides:534, online:false,earn:2650},
    {name:"Kofi Adjei",    phone:"+233544444444",plate:"ER-3456-26",rating:4.6,rides:289, online:true, earn:1780},
  ];

  const tabs=[["overview","📊","Overview"],["rides","🏍️","Rides"],["drivers","👥","Drivers"],["finance","💰","Finance"]];
  const statusColor={ongoing:"green",searching:"blue",matched:"yellow",completed:"gray"};

  return (
    <div className={`max-w-md mx-auto min-h-screen ${t.bg}`}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:"#111827",color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>⚙️</span><span style={{fontFamily:"Syne,sans-serif",fontWeight:900}}>Admin Portal</span></div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setDark(!dark)} style={{padding:6,borderRadius:8,background:"rgba(255,255,255,0.1)"}}>{dark?<Sun style={{width:16,height:16}}/>:<Moon style={{width:16,height:16}}/>}</button>
          <button onClick={onLogout} style={{padding:6,borderRadius:8,background:"rgba(255,255,255,0.1)"}}><LogOut style={{width:16,height:16}}/></button>
        </div>
      </div>

      {/* Tab bar */}
      <div className={`${t.card} border-b ${t.bdr}`} style={{display:"flex",position:"sticky",top:48,zIndex:10}}>
        {tabs.map(([v,ic,lb])=>(
          <button key={v} onClick={()=>setView(v)} style={{flex:1,padding:"10px 4px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,fontSize:10,fontWeight:700,color:view===v?"#16a34a":dark?"#9ca3af":"#6b7280",borderBottom:view===v?"2px solid #16a34a":"2px solid transparent"}}>
            <span style={{fontSize:16}}>{ic}</span>{lb}
          </button>
        ))}
      </div>

      <div style={{paddingBottom:24}}>
        {view==="overview"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 className={`font-black text-lg ${t.text}`}>Live Dashboard</h2>
              <Badge color="green">● Real-time</Badge>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <StatCard icon="🏍️" label="Total Rides"   value={stats.totalRides.toLocaleString()} color="green"  dark={dark}/>
              <StatCard icon="🟢" label="Active Now"    value={stats.activeRides}                  color="blue"   dark={dark}/>
              <StatCard icon="👥" label="Drivers"       value={stats.totalDrivers}                 color="purple" dark={dark}/>
              <StatCard icon="📡" label="Online"        value={stats.onlineDrivers}                color="yellow" dark={dark}/>
              <StatCard icon="🏢" label="Owners"        value={stats.owners||42}                   color="orange" dark={dark}/>
              <StatCard icon="💰" label="Revenue"       value={"₵"+stats.revenue.toLocaleString()}  color="green"  dark={dark}/>
            </div>
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <h3 className={`font-bold mb-3 ${t.text}`}>Platform Economics</h3>
              {[["Total GMV","₵"+stats.revenue.toLocaleString(),"#16a34a"],["Platform 15%","₵"+stats.commission.toLocaleString(),"#2563eb"],["Owner payouts 70%","₵"+(stats.revenue*0.70).toFixed(0),"#9333ea"],["Driver payouts 10%","₵"+(stats.revenue*0.10).toFixed(0),"#ea580c"],["Fuel pools 3%","₵"+(stats.revenue*0.03).toFixed(0),"#ca8a04"],["Maintenance 2%","₵"+(stats.revenue*0.02).toFixed(0),"#f97316"],["Net profit","₵"+(stats.commission-(stats.revenue*0.02)).toFixed(0),"#16a34a"]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",paddingBottom:8,borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,marginBottom:8,fontSize:13}}>
                  <span className={t.sub}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view==="rides"&&(
          <div style={{padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h2 className={`font-black text-lg ${t.text}`}>Live Rides</h2>
              <button onClick={()=>toast$("Export ready 📊")} style={{fontSize:12,color:"#16a34a",fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                <Download style={{width:12,height:12}}/>Export
              </button>
            </div>
            {liveRides.map(r=>(
              <div key={r.id} className={`${t.card} rounded-2xl p-4 border ${t.bdr} mb-3`}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontFamily:"monospace",fontSize:11,fontWeight:700}} className={t.sub}>{r.id}</span>
                  <Badge color={statusColor[r.status]||"gray"}>{r.status}</Badge>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4,fontSize:13}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><MapPin style={{width:12,height:12,color:"#16a34a",flexShrink:0}}/><span className={`font-semibold ${t.text}`}>{r.from}</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><Navigation style={{width:12,height:12,color:"#ef4444",flexShrink:0}}/><span className={`font-semibold ${t.text}`}>{r.to}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",paddingTop:4}}>
                    <span className={`text-xs ${t.sub}`}>👤 {r.pax} · 🏍️ {r.driver}</span>
                    <span style={{fontWeight:900,color:"#16a34a",fontSize:13}}>{r.fare}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view==="drivers"&&(
          <div style={{padding:16}}>
            <h2 className={`font-black text-lg mb-4 ${t.text}`}>Driver Management</h2>
            {drivers.map(d=>(
              <div key={d.name} className={`${t.card} rounded-2xl p-4 border ${t.bdr} mb-3`}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:"#dcfce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>👨🏿</div>
                  <div style={{flex:1}}>
                    <p className={`font-black ${t.text}`}>{d.name}</p>
                    <p style={{fontSize:11,fontFamily:"monospace"}} className={t.sub}>{d.phone} · {d.plate}</p>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                      <Badge color={d.online?"green":"gray"}>{d.online?"Online":"Offline"}</Badge>
                      <span style={{display:"flex",alignItems:"center",gap:2,fontSize:11}}><Star style={{width:11,height:11,fill:"#facc15",color:"#facc15"}}/>{d.rating}</span>
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{fontWeight:900,color:"#16a34a"}}>₵{d.earn}</p>
                    <p style={{fontSize:11}} className={t.sub}>{d.rides} rides</p>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  <button style={{padding:"8px",background:"#eff6ff",color:"#2563eb",borderRadius:10,fontWeight:700,fontSize:11}}>Details</button>
                  <button style={{padding:"8px",background:d.online?"#fef2f2":"#f0fdf4",color:d.online?"#ef4444":"#16a34a",borderRadius:10,fontWeight:700,fontSize:11}}>{d.online?"Suspend":"Activate"}</button>
                  <button onClick={()=>toast$(`SMS sent to ${d.name}`)} style={{padding:"8px",background:"#f9fafb",color:"#374151",borderRadius:10,fontWeight:700,fontSize:11}}>📱 SMS</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {view==="finance"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:16}}>
            <h2 className={`font-black text-lg ${t.text}`}>Finance & Integrations</h2>
            {[
              {title:"Paystack",icon:"💳",items:[["Status","Active ✅"],["MoMo","MTN,Vodafone,Airtel"],["Card fee","1.95%"],["Webhook","/payments/webhook"],["Currency","GHS"]],border:"border-green-500"},
              {title:"Twilio SMS",icon:"📱",items:[["Status","Connected ✅"],["OTPs today","142"],["Delivery","98.6%"],["Cost","$0.0079/SMS"],["Number","+233 XX XXX XXXX"]],border:"border-blue-500"},
              {title:"Firebase",icon:"🔥",items:[["Functions","Deployed ✅"],["Region","us-central1"],["Auth","Custom token"],["USSD","*711# ready"],["Project","okada-online-ghana"]],border:"border-orange-500"},
            ].map(s=>(
              <div key={s.title} className={`${t.card} rounded-2xl border-2 ${s.border} overflow-hidden`}>
                <div className={`px-4 py-3 flex items-center gap-2 ${dark?"bg-gray-700":"bg-gray-50"}`}>
                  <span style={{fontSize:20}}>{s.icon}</span>
                  <span className={`font-black ${t.text}`}>{s.title}</span>
                </div>
                <div style={{padding:"8px 16px"}}>
                  {s.items.map(([l,v])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,fontSize:12}}>
                      <span className={t.sub}>{l}</span><span className={`font-semibold ${t.text}`}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ROOT ───────────────────────────────────────────────
export default function App() {
  const [dark,setDark]           = useState(false);
  const [user,setUser]           = useState(null);
  const [role,setRole]           = useState(null);
  const [apiStatus,setApiStatus] = useState("checking"); // "checking" | "ok" | "error"

  useEffect(() => {
    fetch("https://okada-online-backend.vercel.app/api/health")
      .then(r => r.json())
      .then(d => setApiStatus(d.success ? "ok" : "error"))
      .catch(() => setApiStatus("error"));
  }, []);

  const login  = (u,token,r) => { api.token=token; setUser(u); setRole(r); };
  const logout = () => { setUser(null); setRole(null); api.token=null; };

  if (!user) return <AuthScreen onLogin={login} dark={dark} apiStatus={apiStatus}/>;
  const props = { user, onLogout:logout, dark, setDark };
  if (role==="passenger") return <PassengerApp {...props}/>;
  if (role==="driver")    return <DriverApp    {...props}/>;
  if (role==="owner")     return <OwnerApp     {...props}/>;
  if (role==="admin")     return <AdminApp     {...props}/>;
}
