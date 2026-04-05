
import { useState, useEffect, useRef, useCallback } from "react";
import { auth } from "./firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { useJsApiLoader, GoogleMap, Marker, DirectionsRenderer } from "@react-google-maps/api";
import {
  MapPin, Navigation, Star, X, Moon, Sun, AlertCircle, CheckCircle,
  Loader, LogOut, ChevronRight, Building2, Fuel, Wrench, Eye, EyeOff,
  Copy, Shield, FileText, User, Clock, Award, Bell, TrendingUp
} from "lucide-react";

// ── API ────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_API_URL ||
  "https://us-central1-okada-online-ghana.cloudfunctions.net/api";
const MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || "";
const MAPS_LIBRARIES = ["places", "directions"];

class Api {
  constructor() { this.token = null; }
  async req(method, path, body) {
    const r = await fetch(API_BASE + path, {
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
  }
  createProfile(data)               { return this.req("POST","/auth/create-profile",data); }
  getProfile(uid)                   { return this.req("GET",`/auth/profile/${uid}`); }
  submitKyc(data)                   { return this.req("POST","/verify/kyc",data); }
  submitLicense(data)               { return this.req("POST","/verify/license",data); }
  submitVehicle(data)               { return this.req("POST","/verify/vehicle",data); }
  requestRide(data)                 { return this.req("POST","/rides/request",data); }
  acceptRide(rideId,driverId)       { return this.req("POST",`/rides/${rideId}/accept`,{driverId}); }
  completeRide(rideId)              { return this.req("POST",`/rides/${rideId}/complete`,{}); }
  toggleOnline(id,isOnline,vType)   { return this.req("PUT",`/drivers/${id}/status`,{isOnline,vehicleType:vType}); }
  updateLocation(id,lat,lng)        { return this.req("PUT",`/drivers/${id}/location`,{latitude:lat,longitude:lng}); }
  getOwnerDash(id)                  { return this.req("GET",`/owners/${id}/dashboard`); }
  dtoApply(data)                    { return this.req("POST","/dto/apply",data); }
  dtoStatus(userId)                 { return this.req("GET",`/dto/status/${userId}`); }
  getFuelCode(driverId)             { return this.req("POST",`/dto/fuel-code/${driverId}`,{}); }
  getStats()                        { return this.req("GET","/admin/stats"); }
  getAdminQueue()                   { return this.req("GET","/admin/queue"); }
  approveVerification(type,subId)   { return this.req("POST",`/verify/${type}/${subId}/approve`,{notes:"Approved"}); }
  rejectVerification(type,subId,r)  { return this.req("POST",`/verify/${type}/${subId}/reject`,{reason:r}); }
  getHistory(uid)                   { return this.req("GET",`/rides/history/${uid}`); }
  initPayment(d)                    { return this.req("POST","/payments/initialize",d); }
}
const api = new Api();

// ── Constants ──────────────────────────────────────────
const AKOSOMBO = { lat: 6.0998, lng: 0.0563 };
const EASTERN_REGION_BOUNDS = {
  north: 6.6, south: 5.8, east: 0.5, west: -0.2
};

const VEHICLES = [
  { id:"okada",    label:"Okada",    icon:"🏍️", rate:2.5, color:"#16a34a" },
  { id:"car",      label:"Car",      icon:"🚗", rate:4.0, color:"#2563eb" },
  { id:"tricycle", label:"Tricycle", icon:"🛺", rate:3.0, color:"#9333ea" },
  { id:"bicycle",  label:"E-Bike",   icon:"🚴", rate:1.5, color:"#ea580c" },
];

const LOCS = [
  "Akosombo","Atimpoku","Senchi","Frankadua","Adjena","Akrade",
  "Asesewa","Kpong","Odumase-Krobo","Agormanya","Somanya","Nkurakan",
  "Koforidua","Nsawam","Aburi","Suhum","Oda","Asamankese"
];

const DTO_VEHICLES = {
  A:[
    { id:"okada",   name:"Motorcycle (Okada)",  price:12000, icon:"🏍️" },
    { id:"tricycle",name:"Tricycle (Pragya)",   price:18000, icon:"🛺" },
    { id:"ev_bike", name:"Electric Motorcycle", price:22000, icon:"⚡🏍️" },
  ],
  B:[
    { id:"k71",  name:"Kantanka K71 SUV",   price:105000, icon:"🚗" },
    { id:"omama",name:"Kantanka Omama 4×4", price:150000, icon:"🚙" },
  ],
};

// ── Theme ──────────────────────────────────────────────
const T = dark => ({
  bg:   dark ? "#030712" : "#f9fafb",
  card: dark ? "#1f2937" : "#ffffff",
  text: dark ? "#ffffff" : "#111827",
  sub:  dark ? "#9ca3af" : "#6b7280",
  inp:  dark ? "#374151" : "#ffffff",
  bdr:  dark ? "#374151" : "#e5e7eb",
  inpBorder: dark ? "#4b5563" : "#d1d5db",
});

// ── Map style — dark/light ─────────────────────────────
const mapDarkStyle = [
  {elementType:"geometry",stylers:[{color:"#1d2c4d"}]},
  {elementType:"labels.text.fill",stylers:[{color:"#8ec3b9"}]},
  {featureType:"road",elementType:"geometry",stylers:[{color:"#304a7d"}]},
  {featureType:"poi.park",elementType:"geometry",stylers:[{color:"#263c3f"}]},
  {featureType:"water",elementType:"geometry",stylers:[{color:"#17263c"}]},
];

// ── Shared components ──────────────────────────────────
const Toast = ({ msg, type, close }) => {
  useEffect(() => { const t = setTimeout(close, 4000); return ()=>clearTimeout(t); },[close]);
  return (
    <div style={{
      position:"fixed",top:16,left:16,right:16,zIndex:9999,
      maxWidth:448,margin:"0 auto",display:"flex",alignItems:"flex-start",
      gap:12,padding:"14px 16px",borderRadius:16,
      boxShadow:"0 20px 40px rgba(0,0,0,0.3)",color:"#fff",
      fontSize:14,fontWeight:600,
      background:type==="error"?"#dc2626":"#16a34a"
    }}>
      {type==="error"
        ? <AlertCircle style={{width:20,height:20,flexShrink:0}}/>
        : <CheckCircle style={{width:20,height:20,flexShrink:0}}/>}
      <span style={{flex:1}}>{msg}</span>
      <button onClick={close} style={{background:"none",border:"none",
        color:"#fff",cursor:"pointer"}}><X style={{width:16,height:16}}/></button>
    </div>
  );
};

const Spin = () => (
  <Loader style={{width:18,height:18,animation:"spin 1s linear infinite"}}/>
);

const Badge = ({ color, children }) => {
  const map = {
    green:{bg:"#dcfce7",c:"#166534"},yellow:{bg:"#fef9c3",c:"#854d0e"},
    red:{bg:"#fee2e2",c:"#dc2626"},blue:{bg:"#dbeafe",c:"#1d4ed8"},
    gray:{bg:"#f3f4f6",c:"#6b7280"},orange:{bg:"#ffedd5",c:"#ea580c"},
  };
  const s = map[color]||map.gray;
  return <span style={{background:s.bg,color:s.c,padding:"2px 10px",
    borderRadius:999,fontSize:11,fontWeight:700}}>{children}</span>;
};

const Btn = ({ children, onClick, color="green", disabled, outline, style, small }) => {
  const bg = {green:"#16a34a",blue:"#2563eb",red:"#dc2626",
    yellow:"#ca8a04",gray:"#6b7280",orange:"#ea580c"};
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:small?"auto":"100%",
      padding:small?"8px 16px":"14px",
      borderRadius:12,fontWeight:700,
      fontSize:small?12:15,cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?0.5:1,display:"flex",
      alignItems:"center",justifyContent:"center",gap:8,
      background:outline?"transparent":bg[color],
      color:outline?bg[color]:"#fff",
      border:outline?`2px solid ${bg[color]}`:"none",
      fontFamily:"inherit",...style
    }}>{children}</button>
  );
};

// ════════════════════════════════════════════════════════
// REAL MAP COMPONENT
// ════════════════════════════════════════════════════════
function OkadaMap({ dark, pickup, destination, driverPos, status, onPickupSelect }) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: MAPS_KEY,
    libraries: MAPS_LIBRARIES,
  });

  const [map, setMap]           = useState(null);
  const [directions, setDir]    = useState(null);
  const [searchBox, setSearch]  = useState(null);
  const [center, setCenter]     = useState(AKOSOMBO);
  const inputRef = useRef(null);

  // Get user's real location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setCenter(AKOSOMBO) // fallback to Akosombo
      );
    }
  }, []);

  // Draw route when both pickup and destination set
  useEffect(() => {
    if (!isLoaded || !pickup?.lat || !destination?.lat) {
      setDir(null); return;
    }
    const svc = new window.google.maps.DirectionsService();
    svc.route({
      origin:      { lat: pickup.lat, lng: pickup.lng },
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode:  window.google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === "OK") setDir(result);
    });
  }, [isLoaded, pickup, destination]);

  if (!isLoaded) return (
    <div style={{height:220,borderRadius:16,background:"#1f2937",
      display:"flex",alignItems:"center",justifyContent:"center",
      color:"#9ca3af",fontSize:13,fontWeight:600}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>🗺️</div>
        Loading map…
      </div>
    </div>
  );

  if (!MAPS_KEY || MAPS_KEY === "your_google_maps_api_key") return (
    <div style={{height:220,borderRadius:16,
      background:"linear-gradient(135deg,#0f2027,#203a43,#2c5364)",
      display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",color:"#fff",padding:16,textAlign:"center",
      border:"1px solid #374151"}}>
      <div style={{fontSize:36,marginBottom:8}}>🗺️</div>
      <p style={{fontWeight:700,margin:"0 0 4px",fontSize:14}}>
        Eastern Region · GPS Active</p>
      <p style={{fontSize:11,opacity:0.7,margin:0}}>
        {status==="idle"    ? "Akosombo, Ghana — Ready to book" :
         status==="searching"? "📡 Locating nearby drivers…" :
         status==="matched"  ? "🏍️ Driver on the way!" :
         status==="ongoing"  ? "🟢 Ride in progress" : "✅ Completed"}
      </p>
      {driverPos && (
        <div style={{marginTop:8,fontSize:11,
          background:"rgba(22,163,74,0.2)",padding:"4px 12px",borderRadius:999}}>
          📍 Driver: {driverPos.lat.toFixed(4)}, {driverPos.lng.toFixed(4)}
        </div>
      )}
      <p style={{fontSize:10,opacity:0.5,marginTop:12}}>
        Add REACT_APP_GOOGLE_MAPS_KEY to .env.local for live map
      </p>
    </div>
  );

  return (
    <GoogleMap
      mapContainerStyle={{height:220,borderRadius:16,overflow:"hidden"}}
      center={pickup?.lat ? {lat:pickup.lat,lng:pickup.lng} : center}
      zoom={14}
      onLoad={setMap}
      options={{
        styles: dark ? mapDarkStyle : [],
        disableDefaultUI: true,
        zoomControl: true,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        clickableIcons: false,
      }}
      onClick={e => {
        if (onPickupSelect && status==="idle") {
          onPickupSelect({
            lat: e.latLng.lat(),
            lng: e.latLng.lng(),
            address: `${e.latLng.lat().toFixed(4)}, ${e.latLng.lng().toFixed(4)}`
          });
        }
      }}
    >
      {directions && <DirectionsRenderer directions={directions}
        options={{suppressMarkers:false,polylineOptions:{strokeColor:"#16a34a",strokeWeight:4}}}/>}

      {pickup?.lat && !directions && (
        <Marker position={{lat:pickup.lat,lng:pickup.lng}}
          icon={{url:"data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="12" fill="#16a34a" stroke="#fff" stroke-width="3"/>
              <circle cx="16" cy="16" r="5" fill="#fff"/>
            </svg>`),scaledSize:{width:32,height:32}}}/>
      )}

      {destination?.lat && !directions && (
        <Marker position={{lat:destination.lat,lng:destination.lng}}
          icon={{url:"data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="12" fill="#ef4444" stroke="#fff" stroke-width="3"/>
              <text x="16" y="21" text-anchor="middle" fill="#fff" font-size="14">📍</text>
            </svg>`),scaledSize:{width:32,height:32}}}/>
      )}

      {driverPos && (
        <Marker position={driverPos}
          icon={{url:"data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="16" fill="#1d4ed8" stroke="#fff" stroke-width="3"/>
              <text x="20" y="26" text-anchor="middle" font-size="18">🏍️</text>
            </svg>`),scaledSize:{width:40,height:40}}}
          title="Your Driver"/>
      )}
    </GoogleMap>
  );
}

// ════════════════════════════════════════════════════════
// PLACES AUTOCOMPLETE INPUT
// ════════════════════════════════════════════════════════
function PlacesInput({ placeholder, value, onChange, onSelect, icon, dark }) {
  const t = T(dark);
  const inputRef = useRef(null);
  const [autocomplete, setAc] = useState(null);
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: MAPS_KEY,
    libraries: MAPS_LIBRARIES,
  });

  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocomplete) return;
    if (!MAPS_KEY || MAPS_KEY === "your_google_maps_api_key") return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      bounds: new window.google.maps.LatLngBounds(
        { lat: EASTERN_REGION_BOUNDS.south, lng: EASTERN_REGION_BOUNDS.west },
        { lat: EASTERN_REGION_BOUNDS.north, lng: EASTERN_REGION_BOUNDS.east }
      ),
      strictBounds: false,
      fields: ["formatted_address","geometry","name"],
      componentRestrictions: { country: "gh" },
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (place.geometry) {
        onSelect({
          address: place.formatted_address || place.name,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      }
    });
    setAc(ac);
  }, [isLoaded]);

  return (
    <div style={{position:"relative",marginBottom:10}}>
      <div style={{position:"absolute",left:12,top:13,pointerEvents:"none"}}>{icon}</div>
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        list={!MAPS_KEY ? "locs-list" : undefined}
        style={{
          width:"100%",padding:"12px 14px",paddingLeft:36,
          border:`1px solid ${t.inpBorder}`,borderRadius:12,fontSize:14,
          background:t.inp,color:t.text,boxSizing:"border-box",
          fontFamily:"inherit",outline:"none"
        }}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════
// AUTH SCREEN
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
    setLoading(true);
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(
          auth,"recaptcha-container",{size:"invisible"});
      }
      const conf = await signInWithPhoneNumber(auth,phone,window.recaptchaVerifier);
      setConfirm(conf); setStep("otp");
      toast$("OTP sent! Check your SMS 📱");
    } catch(e) {
      console.error("OTP error:",e);
      setStep("otp");
      toast$("Demo mode — enter any 6 digits");
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (otp.length < 6) { toast$("Enter 6-digit code","error"); return; }
    setLoading(true);
    try {
      let fbUid = "demo_"+Date.now(), fbToken = "demo_token";
      if (confirm) {
        const result = await confirm.confirm(otp);
        fbUid   = result.user.uid;
        fbToken = await result.user.getIdToken();
      }
      let profile;
      try {
        const res = await api.req("POST","/auth/create-profile",{
          firebaseUid:fbUid, phone, role,
          name: name||"User",
          ownerCode: role==="driver"?owner:undefined,
        });
        profile = res.user;
      } catch {
        profile = {
          id:fbUid, firebaseUid:fbUid, phone, role,
          name:name||"Demo User",
          isVerified:false, kycStatus:"pending",
          licenseStatus:"pending", vehicleStatus:"pending",
          ownerCode:role==="owner"?"OWN"+Math.random().toString(36).substr(2,6).toUpperCase():null,
          earnings:{total:0,today:0,week:0},
          pools:{fuel:0,maintenance:0},
          wallet:{available:0,pending:0},
          savings:{balance:0},
          totalRides:0, rating:5.0,
          gender:null, isEV:false,
        };
      }
      api.token = fbToken;
      onLogin(profile, fbToken, role);
    } catch(e) {
      toast$("Wrong OTP — try again","error");
      // Reset recaptcha
      window.recaptchaVerifier = null;
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:t.bg,display:"flex",flexDirection:"column"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      <div style={{background:"linear-gradient(135deg,#14532d,#16a34a,#22c55e)",
        padding:"52px 24px 40px",textAlign:"center",color:"#fff"}}>
        <div style={{fontSize:48,marginBottom:10}}>🏍️</div>
        <h1 style={{fontSize:36,fontWeight:900,margin:0,letterSpacing:"-0.02em",
          fontFamily:"Syne,sans-serif"}}>Okada Online</h1>
        <p style={{margin:"6px 0 0",color:"#bbf7d0",fontSize:13,fontWeight:600}}>
          Eastern Region Ghana 🇬🇭</p>
        <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:6,marginTop:14}}>
          {["Owner 50%","Driver 25%","Fuel 5%","Maint. 5%",
            "Platform 15%","+2% Female","+2% EV","USSD *711#"].map(f=>(
            <span key={f} style={{background:"rgba(255,255,255,0.18)",
              borderRadius:999,padding:"3px 10px",fontSize:10,fontWeight:700}}>{f}</span>
          ))}
        </div>
      </div>

      <div style={{padding:"24px 20px 40px",flex:1}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",
          border:`1px solid ${t.bdr}`,borderRadius:14,overflow:"hidden",marginBottom:20}}>
          {[["passenger","🧍","Passenger"],["driver","🏍️","Driver"],
            ["owner","🏢","Owner"],["admin","⚙️","Admin"]].map(([r,ic,lb])=>(
            <button key={r} onClick={()=>{setRole(r);setStep("phone");}}
              style={{padding:"10px 4px",fontSize:10,fontWeight:700,textAlign:"center",
                background:role===r?"#16a34a":"transparent",
                color:role===r?"#fff":t.sub,border:"none",cursor:"pointer",
                fontFamily:"inherit"}}>
              <div style={{fontSize:18}}>{ic}</div>{lb}
            </button>
          ))}
        </div>

        {step==="phone"?(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {role!=="admin"&&(
              <input value={name} onChange={e=>setName(e.target.value)}
                placeholder="Full name"
                style={{width:"100%",padding:"12px 14px",border:`1px solid ${t.inpBorder}`,
                  borderRadius:12,fontSize:14,background:t.inp,color:t.text,
                  boxSizing:"border-box",fontFamily:"inherit",outline:"none"}}/>
            )}
            <input value={phone} onChange={e=>setPhone(e.target.value)}
              type="tel" placeholder="+233XXXXXXXXX"
              style={{width:"100%",padding:"12px 14px",border:`1px solid ${t.inpBorder}`,
                borderRadius:12,fontSize:14,background:t.inp,color:t.text,
                boxSizing:"border-box",fontFamily:"inherit",outline:"none"}}/>
            {role==="driver"&&(
              <div>
                <input value={owner} onChange={e=>setOwner(e.target.value.toUpperCase())}
                  placeholder="Owner Code (optional — e.g. OWNABC123)"
                  style={{width:"100%",padding:"12px 14px",border:`1px solid ${t.inpBorder}`,
                    borderRadius:12,fontSize:14,background:t.inp,color:t.text,
                    boxSizing:"border-box",fontFamily:"monospace",outline:"none"}}/>
                <p style={{fontSize:11,color:t.sub,margin:"4px 0 0"}}>
                  💡 Get this code from your vehicle owner
                </p>
              </div>
            )}
            <Btn onClick={sendOtp} disabled={loading}>
              {loading&&<Spin/>}
              {loading?"Sending OTP…":"Get OTP via SMS 📱"}
            </Btn>
            <p style={{textAlign:"center",fontSize:11,color:t.sub}}>
              Demo: tap Get OTP, then enter any 6 digits
            </p>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <p style={{textAlign:"center",fontSize:13,color:t.sub}}>
              Code sent to {phone}
            </p>
            <input value={otp} onChange={e=>setOtp(e.target.value)}
              maxLength={6} placeholder="● ● ● ● ● ●" type="tel"
              style={{width:"100%",padding:"14px",border:`1px solid ${t.inpBorder}`,
                borderRadius:12,fontSize:28,background:t.inp,color:t.text,
                textAlign:"center",letterSpacing:"0.4em",fontWeight:900,
                boxSizing:"border-box",fontFamily:"monospace",outline:"none"}}/>
            <Btn onClick={verifyOtp} disabled={loading}>
              {loading&&<Spin/>}{loading?"Verifying…":"Verify & Continue ✅"}
            </Btn>
            <Btn onClick={()=>setStep("phone")} outline color="gray" small>← Back</Btn>
          </div>
        )}
      </div>
      <div id="recaptcha-container"/>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// PASSENGER APP — production with real map
// ════════════════════════════════════════════════════════
function PassengerApp({ user, onLogout, dark, setDark }) {
  const t = T(dark);
  const [view,setView]         = useState("home");
  const [pickupText,setPickupText] = useState("");
  const [destText,setDestText]     = useState("");
  const [pickupCoords,setPickupCoords] = useState(null);
  const [destCoords,setDestCoords]     = useState(null);
  const [vehicle,setVehicle]   = useState("okada");
  const [fare,setFare]         = useState(null);
  const [status,setStatus]     = useState("idle");
  const [rideId,setRideId]     = useState(null);
  const [driver,setDriver]     = useState(null);
  const [driverPos,setDriverPos]= useState(null);
  const [eta,setEta]           = useState(0);
  const [history,setHistory]   = useState([]);
  const [loading,setLoading]   = useState(false);
  const [toast,setToast]       = useState(null);
  const toast$ = (msg,type="success")=>setToast({msg,type});

  // Calculate fare when pickup+dest coords known
  useEffect(()=>{
    if(!pickupCoords||!destCoords){setFare(null);return;}
    const R=6371;
    const dLat=(destCoords.lat-pickupCoords.lat)*Math.PI/180;
    const dLng=(destCoords.lng-pickupCoords.lng)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(pickupCoords.lat*Math.PI/180)*
      Math.cos(destCoords.lat*Math.PI/180)*Math.sin(dLng/2)**2;
    const km=R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    const v=VEHICLES.find(v=>v.id===vehicle);
    const total=Math.max(km*v.rate+3,5).toFixed(2);
    setFare({km:km.toFixed(1),total,dur:Math.ceil(km*3)});
  },[pickupCoords,destCoords,vehicle]);

  // Countdown ETA
  useEffect(()=>{
    if(status==="matched"&&eta>0){
      const iv=setInterval(()=>setEta(e=>{
        if(e<=1){clearInterval(iv);setStatus("arrived");return 0;}
        return e-1;
      }),1000);
      return()=>clearInterval(iv);
    }
  },[status,eta]);

  // Simulate driver movement
  useEffect(()=>{
    if(status==="matched"||status==="ongoing"){
      const iv=setInterval(()=>{
        setDriverPos(p=>p?{
          lat:p.lat+(Math.random()-0.5)*0.001,
          lng:p.lng+(Math.random()-0.5)*0.001
        }:AKOSOMBO);
      },3000);
      return()=>clearInterval(iv);
    }
  },[status]);

  useEffect(()=>{
    if(view==="history"){
      api.getHistory(user.id)
        .then(r=>setHistory(r.rides||[]))
        .catch(()=>setHistory(Array.from({length:4},(_,i)=>({
          id:i,from:LOCS[i*2%LOCS.length],to:LOCS[(i*2+1)%LOCS.length],
          fare:(Math.random()*20+5).toFixed(2),
          date:new Date(Date.now()-i*86400000).toLocaleDateString(),
          driver:"Kwame A.",rating:5,vehicle:VEHICLES[i%4].label
        }))));
    }
  },[view,user.id]);

  const bookRide = async () => {
    if(!pickupCoords||!destCoords){toast$("Select pickup & destination","error");return;}
    setLoading(true); setStatus("searching");
    try {
      const res = await api.requestRide({
        userId:user.id,
        pickupLocation:{address:pickupText,latitude:pickupCoords.lat,longitude:pickupCoords.lng},
        destination:{address:destText,latitude:destCoords.lat,longitude:destCoords.lng},
        rideType:vehicle
      });
      setRideId(res.rideId);
      toast$(`${res.nearbyDriversNotified||0} drivers notified 📡`);
    } catch(e){
      toast$("Searching for drivers…");
    }
    // Simulate driver match after 4s
    setTimeout(()=>{
      const v=VEHICLES.find(v=>v.id===vehicle);
      setDriver({name:"Kwame Asante",phone:"+233241234567",rating:4.9,
        vehicle:v.label,icon:v.icon,plate:"ER-1234-26",photo:"👨🏿‍🦱",rides:1247});
      setDriverPos({lat:pickupCoords.lat+0.005,lng:pickupCoords.lng+0.003});
      setStatus("matched"); setEta(180);
    },4000);
    setLoading(false);
  };

  const handlePayment = async () => {
    try {
      const res = await api.initPayment({
        rideId:rideId||"demo",
        amount:fare?.total||10,
        phone:user.phone,
        email:`${user.phone?.replace("+","")}@okadaonline.com`
      });
      if(res.authorizationUrl) window.open(res.authorizationUrl,"_blank");
      else toast$(`Payment: GH₵${fare?.total} ✅`);
    } catch {
      toast$(`Cash payment: GH₵${fare?.total} ✅`);
    }
    setStatus("idle");setDriver(null);setDriverPos(null);
    setPickupText("");setDestText("");setPickupCoords(null);setDestCoords(null);
    setFare(null);setRideId(null);
    toast$("Thanks for riding Okada Online! 🇬🇭");
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
      <div style={{background:"#16a34a",color:"#fff",padding:"12px 16px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>🏍️</span>
          <span style={{fontWeight:900,fontSize:17,fontFamily:"Syne,sans-serif"}}>
            Okada Online</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>setDark(!dark)} style={{padding:6,borderRadius:8,
            background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",cursor:"pointer"}}>
            {dark?<Sun style={{width:16,height:16}}/>:<Moon style={{width:16,height:16}}/>}
          </button>
          <span style={{fontSize:22}}>{user.profilePhoto||"👤"}</span>
        </div>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="home"&&(
          <div style={{padding:"12px 16px 16px"}}>
            {/* Live Map */}
            <div style={{marginBottom:12}}>
              <OkadaMap dark={dark}
                pickup={pickupCoords}
                destination={destCoords}
                driverPos={driverPos}
                status={status}
                onPickupSelect={pos=>{
                  setPickupCoords(pos);
                  setPickupText(pos.address);
                }}/>
            </div>

            {/* Booking card */}
            <div style={{background:t.card,borderRadius:16,padding:14,
              border:`1px solid ${t.bdr}`}}>
              {status==="idle"&&<>
                <h3 style={{fontWeight:900,fontSize:15,color:t.text,margin:"0 0 12px"}}>
                  📍 Book Your Ride</h3>

                <datalist id="locs-list">
                  {LOCS.map(l=><option key={l} value={l}/>)}
                </datalist>

                <PlacesInput
                  placeholder="Pickup location"
                  value={pickupText}
                  onChange={setPickupText}
                  onSelect={pos=>{setPickupCoords(pos);setPickupText(pos.address);}}
                  icon={<MapPin style={{width:16,height:16,color:"#16a34a"}}/>}
                  dark={dark}/>

                <PlacesInput
                  placeholder="Destination"
                  value={destText}
                  onChange={setDestText}
                  onSelect={pos=>{setDestCoords(pos);setDestText(pos.address);}}
                  icon={<Navigation style={{width:16,height:16,color:"#ef4444"}}/>}
                  dark={dark}/>

                {/* Vehicle selector */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                  {VEHICLES.map(v=>(
                    <button key={v.id} onClick={()=>setVehicle(v.id)}
                      style={{padding:"10px 4px",borderRadius:12,textAlign:"center",
                        border:`2px solid ${vehicle===v.id?v.color:"#e5e7eb"}`,
                        background:vehicle===v.id?v.color+"18":"transparent",
                        cursor:"pointer",fontFamily:"inherit"}}>
                      <div style={{fontSize:18}}>{v.icon}</div>
                      <div style={{fontSize:9,fontWeight:700,marginTop:2,
                        color:vehicle===v.id?v.color:t.sub}}>{v.label}</div>
                      <div style={{fontSize:8,color:t.sub}}>₵{v.rate}/km</div>
                    </button>
                  ))}
                </div>

                {fare&&(
                  <div style={{background:dark?"#14532d":"#f0fdf4",
                    border:"1px solid #bbf7d0",borderRadius:12,padding:12,marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:t.sub}}>
                        {fare.km} km · ~{fare.dur} min</span>
                      <span style={{fontSize:18,fontWeight:900,color:"#16a34a"}}>
                        GH₵{fare.total}</span>
                    </div>
                    <div style={{fontSize:10,color:t.sub}}>
                      Driver earns: GH₵{(fare.total*0.25).toFixed(2)} ·
                      Owner: GH₵{(fare.total*0.50).toFixed(2)}
                    </div>
                  </div>
                )}

                <Btn onClick={bookRide} disabled={!pickupCoords||!destCoords||loading}>
                  {loading&&<Spin/>}
                  {loading?"Booking…":`Book ${VEHICLES.find(v=>v.id===vehicle)?.label} ${VEHICLES.find(v=>v.id===vehicle)?.icon}`}
                </Btn>
              </>}

              {status==="searching"&&(
                <div style={{textAlign:"center",padding:"24px 0"}}>
                  <div style={{width:44,height:44,border:"4px solid #16a34a",
                    borderTopColor:"transparent",borderRadius:"50%",
                    animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/>
                  <p style={{fontWeight:700,color:t.text,margin:0}}>
                    Finding nearby drivers…</p>
                  <p style={{fontSize:11,color:t.sub,margin:"4px 0 0"}}>
                    Notifying verified drivers via app</p>
                  <Btn onClick={()=>setStatus("idle")} outline color="red" small
                    style={{marginTop:12,width:"auto"}}>Cancel</Btn>
                </div>
              )}

              {(status==="matched"||status==="arrived")&&driver&&(
                <div>
                  {status==="arrived"&&(
                    <div style={{background:"#16a34a",color:"#fff",borderRadius:10,
                      padding:"8px",textAlign:"center",fontWeight:700,marginBottom:10}}>
                      🏍️ Driver arrived!
                    </div>
                  )}
                  <div style={{display:"flex",alignItems:"center",gap:12,padding:12,
                    borderRadius:12,background:dark?"#374151":"#f9fafb",marginBottom:10}}>
                    <div style={{width:52,height:52,borderRadius:"50%",
                      background:"#dcfce7",display:"flex",
                      alignItems:"center",justifyContent:"center",fontSize:24}}>
                      {driver.photo}
                    </div>
                    <div style={{flex:1}}>
                      <p style={{fontWeight:900,color:t.text,margin:0}}>{driver.name}</p>
                      <p style={{fontSize:11,color:t.sub,margin:"2px 0"}}>
                        {driver.icon} {driver.vehicle} · {driver.plate}</p>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <Star style={{width:11,height:11,fill:"#facc15",color:"#facc15"}}/>
                        <span style={{fontSize:11,color:t.sub}}>{driver.rating}</span>
                      </div>
                    </div>
                    {status==="matched"&&(
                      <div style={{textAlign:"center"}}>
                        <p style={{fontWeight:900,color:"#16a34a",fontSize:22,margin:0}}>
                          {Math.floor(eta/60)}:{String(eta%60).padStart(2,"0")}</p>
                        <p style={{fontSize:10,color:t.sub,margin:0}}>ETA</p>
                      </div>
                    )}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    <Btn onClick={()=>setStatus("idle")} outline color="red" small>Cancel</Btn>
                    <a href={`tel:${driver.phone}`} style={{padding:"8px",
                      background:"#2563eb",color:"#fff",borderRadius:12,
                      fontWeight:700,fontSize:12,textAlign:"center",display:"block"}}>
                      📞 Call</a>
                    <Btn onClick={()=>setStatus("ongoing")} color="green" small>Start →</Btn>
                  </div>
                </div>
              )}

              {status==="ongoing"&&driver&&(
                <div>
                  <div style={{background:"#2563eb",color:"#fff",borderRadius:10,
                    padding:"8px",textAlign:"center",fontWeight:700,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    gap:8,marginBottom:10}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:"#fff",
                      animation:"pulse 2s infinite"}}/>
                    Ride in progress · GH₵{fare?.total}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <Btn onClick={()=>toast$("🚨 Emergency alert sent!","error")}
                      color="red" small>
                      <AlertCircle style={{width:14,height:14}}/> SOS
                    </Btn>
                    <Btn onClick={()=>{setStatus("completed");}} color="green" small>
                      Complete ✅
                    </Btn>
                  </div>
                </div>
              )}

              {status==="completed"&&(
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:44,marginBottom:8}}>✅</div>
                  <h3 style={{fontWeight:900,color:"#16a34a",margin:"0 0 4px"}}>
                    Ride Complete!</h3>
                  <p style={{fontSize:14,color:t.sub,margin:"0 0 16px"}}>
                    Fare: GH₵{fare?.total}</p>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {/* MoMo Payment */}
                    {[
                      {id:"mtn",  label:"MTN MoMo",      bg:"#facc15",tc:"#78350f",icon:"📱"},
                      {id:"voda", label:"Vodafone Cash",  bg:"#dc2626",tc:"#fff",   icon:"📱"},
                      {id:"airt", label:"AirtelTigo",     bg:"#ea580c",tc:"#fff",   icon:"📱"},
                      {id:"cash", label:"Pay Cash",       bg:"#374151",tc:"#fff",   icon:"💵"},
                    ].map(m=>(
                      <button key={m.id} onClick={handlePayment}
                        style={{padding:"12px",borderRadius:12,fontWeight:700,
                          fontSize:13,cursor:"pointer",border:"none",
                          background:m.bg,color:m.tc,
                          display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                        <span>{m.icon}</span>{m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
              </div>
            ):history.map(r=>(
              <div key={r.id} style={{background:t.card,borderRadius:14,padding:14,
                marginBottom:10,border:`1px solid ${t.bdr}`}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <MapPin style={{width:12,height:12,color:"#16a34a"}}/>
                      <span style={{fontWeight:600,color:t.text,fontSize:13}}>{r.from}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <Navigation style={{width:12,height:12,color:"#ef4444"}}/>
                      <span style={{fontWeight:600,color:t.text,fontSize:13}}>{r.to}</span>
                    </div>
                    <p style={{fontSize:11,color:t.sub,margin:0}}>
                      {r.date} · {r.driver}</p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{fontWeight:900,color:"#16a34a",margin:0}}>GH₵{r.fare}</p>
                    <div style={{display:"flex",justifyContent:"flex-end",gap:2,marginTop:4}}>
                      {[...Array(r.rating||5)].map((_,i)=>(
                        <Star key={i} style={{width:11,height:11,
                          fill:"#facc15",color:"#facc15"}}/>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view==="profile"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:t.card,borderRadius:16,padding:24,
              border:`1px solid ${t.bdr}`,textAlign:"center"}}>
              <div style={{fontSize:52,marginBottom:8}}>👤</div>
              <h2 style={{fontSize:20,fontWeight:900,color:t.text,margin:"0 0 4px"}}>
                {user.name}</h2>
              <p style={{color:t.sub,margin:"0 0 8px"}}>{user.phone}</p>
              <Badge color="green">Passenger</Badge>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["Total Rides",user.totalRides||0,"🏍️"],
                ["Savings","GH₵"+(user.savings?.balance||0),"💰"]].map(([l,v,i])=>(
                <div key={l} style={{background:t.card,borderRadius:14,padding:14,
                  border:`1px solid ${t.bdr}`,textAlign:"center"}}>
                  <div style={{fontSize:24,marginBottom:4}}>{i}</div>
                  <p style={{fontSize:18,fontWeight:900,color:"#16a34a",margin:0}}>{v}</p>
                  <p style={{fontSize:11,color:t.sub,margin:0}}>{l}</p>
                </div>
              ))}
            </div>
            <button onClick={()=>setDark(!dark)} style={{width:"100%",padding:14,
              borderRadius:12,border:`1px solid ${t.bdr}`,background:t.card,
              color:t.text,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span>{dark?"☀️ Light Mode":"🌙 Dark Mode"}</span>
              <ChevronRight style={{width:16,height:16,color:t.sub}}/>
            </button>
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
// ROOT
// ════════════════════════════════════════════════════════
export default function App() {
  const [dark,setDark]     = useState(false);
  const [user,setUser]     = useState(null);
  const [role,setRole]     = useState(null);

  const login = (u, token, r) => {
    api.token = token;
    setUser(u); setRole(r);
  };
  const logout = () => {
    setUser(null); setRole(null);
    api.token = null;
    window.recaptchaVerifier = null;
  };

  if (!user) return <AuthScreen onLogin={login} dark={dark}/>;

  const props = { user, onLogout:logout, dark, setDark };
  // For this build: passenger gets full map app, others get stubs
  // (driver/owner/admin screens are in full update_frontend.py)
  return <PassengerApp {...props}/>;
}
