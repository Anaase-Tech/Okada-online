import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { MapPin, Navigation, Star, X, Moon, Sun,
         AlertCircle, CheckCircle, Loader, LogOut,
         Building2, Fuel, Wrench, Eye, EyeOff, Copy, Download,
         Shield, Clock, ArrowDownCircle, TrendingUp,
         PiggyBank, Landmark, HeartPulse, ChevronRight } from "lucide-react";

// ── API ────────────────────────────────────────────────
const API = process.env.REACT_APP_API_URL || "https://us-central1-okada-online-ghana.cloudfunctions.net/api";

class Api {
  constructor() { this.token = null; }
  async req(method, path, body) {
    try {
      const r = await fetch(API + path, {
        method,
        headers: { "Content-Type":"application/json", ...(this.token?{Authorization:`Bearer ${this.token}`}:{}) },
        ...(body?{body:JSON.stringify(body)}:{})
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error||"Request failed");
      return d;
    } catch(e) { throw e; }
  }
  sendOtp(phone,role)                           { return this.req("POST","/auth/send-otp",{phone,role}); }
  verifyOtp(phone,otp,role,name,ownerCode)      { return this.req("POST","/auth/verify-otp",{phone,otp,role,name,ownerCode}); }
  verifyGhanaCard(cardNum,photo,selfie)         { return this.req("POST","/kyc/ghana-card",{cardNum,photo,selfie}); }
  verifyPassport(passNum,country,photo,selfie)  { return this.req("POST","/kyc/passport",{passNum,country,photo,selfie}); }
  requestRide(data)                             { return this.req("POST","/rides/request",data); }
  acceptRide(rideId,driverId)                   { return this.req("POST",`/rides/${rideId}/accept`,{driverId}); }
  confirmCashPayment(rideId,driverId)           { return this.req("POST",`/rides/${rideId}/confirm-cash`,{driverId}); }
  completeRide(rideId)                          { return this.req("POST",`/rides/${rideId}/complete`,{}); }
  toggleOnline(id,isOnline,vehicleType)         { return this.req("PUT",`/drivers/${id}/status`,{isOnline,vehicleType}); }
  updateLocation(id,lat,lng)                    { return this.req("PUT",`/drivers/${id}/location`,{latitude:lat,longitude:lng}); }
  getOwnerDash(id)                              { return this.req("GET",`/owners/${id}/dashboard`); }
  initPayment(rideId,amount,email,phone)        { return this.req("POST","/payments/initialize",{rideId,amount,email,phone}); }
  verifyPayment(ref)                            { return this.req("GET",`/payments/verify/${ref}`); }
  payLaterRequest(rideId,userId)                { return this.req("POST","/payments/pay-later",{rideId,userId}); }
  repayLater(userId,amount)                     { return this.req("POST","/payments/repay-later",{userId,amount}); }
  requestWithdrawal(userId,amount,momoPhone)    { return this.req("POST","/wallet/withdraw",{userId,amount,momoPhone}); }
  depositSavings(userId,amount)                 { return this.req("POST","/fintech/savings/deposit",{userId,amount}); }
  withdrawSavings(userId,amount)                { return this.req("POST","/fintech/savings/withdraw",{userId,amount}); }
  setSavingsRate(userId,percent)                { return this.req("PUT",`/fintech/savings/rate/${userId}`,{percent}); }
  applyLoan(userId,amount,purpose)              { return this.req("POST","/fintech/loans/apply",{userId,amount,purpose}); }
  buyInsurance(userId,plan,vehicleId)           { return this.req("POST","/insurance/buy",{userId,plan,vehicleId}); }
  fileInsuranceClaim(userId,type,desc)          { return this.req("POST","/insurance/claim",{userId,type,desc}); }
  getStats()                                    { return this.req("GET","/admin/stats"); }
  getHistory(uid)                               { return this.req("GET",`/rides/history/${uid}`); }
}
const api = new Api();

// ── Constants ──────────────────────────────────────────
const VEHICLES = [
  {id:"okada",    label:"Okada",     icon:"🏍️", rate:2.5},
  {id:"car",      label:"Car",       icon:"🚗", rate:4.0},
  {id:"tricycle", label:"Tricycle",  icon:"🛺", rate:3.0},
  {id:"bicycle",  label:"E-Bicycle", icon:"🚴", rate:1.5},
];
const LOCS = ["Akosombo","Atimpoku","Senchi","Frankadua","Adjena","Akrade",
              "Asesewa","Kpong","Odumase-Krobo","Agormanya","Somanya","Nkurakan",
              "Koforidua","Nsawam","Aburi"];
const COUNTRIES = ["Nigeria","UK","USA","Germany","France","South Africa","Kenya","China","India","Canada","Australia","UAE","Italy","Japan","Other"];
const SPLITS = { platform:0.15, owner:0.50, driver:0.25, fuel:0.05, maintenance:0.05 };

// ── Theme ──────────────────────────────────────────────
const T = (dark) => ({
  bg:   dark?"bg-gray-950":"bg-gray-50",
  card: dark?"bg-gray-800":"bg-white",
  text: dark?"text-white":"text-gray-900",
  sub:  dark?"text-gray-400":"text-gray-500",
  inp:  dark?"bg-gray-700 text-white border-gray-600 placeholder-gray-500"
            :"bg-white text-gray-900 border-gray-300 placeholder-gray-400",
  bdr:  dark?"border-gray-700":"border-gray-200",
});

// ── Shared UI ──────────────────────────────────────────
const Toast = ({msg,type,close}) => {
  useEffect(()=>{const t=setTimeout(close,3500);return()=>clearTimeout(t);},[close]);
  return (
    <div className={`fixed top-4 inset-x-4 z-[100] max-w-md mx-auto flex items-start gap-3 px-4 py-3 rounded-2xl shadow-2xl text-white text-sm font-bold ${type==="error"?"bg-red-600":"bg-green-600"}`}>
      {type==="error"?<AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5"/>:<CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5"/>}
      <span style={{flex:1}}>{msg}</span>
      <button onClick={close}><X className="w-4 h-4"/></button>
    </div>
  );
};
const Spin = ({sm}) => <Loader className={`animate-spin ${sm?"w-4 h-4":"w-5 h-5"}`}/>;
const Badge = ({color,children}) => {
  const c={green:"bg-green-100 text-green-700",red:"bg-red-50 text-red-500",
           yellow:"bg-yellow-400 text-gray-900",blue:"bg-blue-50 text-blue-600",
           gray:"bg-gray-100 text-gray-600",purple:"bg-purple-600 text-white",
           orange:"bg-orange-500 text-white",teal:"bg-teal-100 text-teal-700",
           indigo:"bg-indigo-100 text-indigo-700"};
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c[color]||c.gray}`}>{children}</span>;
};
const StatCard = ({icon,label,value,sub,color,dark}) => {
  const t=T(dark);
  const c={green:"text-green-600",blue:"text-blue-600",purple:"text-purple-600",
           yellow:"text-yellow-600",orange:"text-orange-500",teal:"text-teal-600",indigo:"text-indigo-600"};
  return (
    <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`} style={{display:"flex",flexDirection:"column",gap:4}}>
      <span style={{fontSize:28}}>{icon}</span>
      <span className={`text-2xl font-black ${c[color]||c.green}`}>{value}</span>
      <span className={`text-xs font-semibold ${t.text}`}>{label}</span>
      {sub&&<span className={`text-xs ${t.sub}`}>{sub}</span>}
    </div>
  );
};
// ── KYC VERIFICATION — Ghana Card + International Passport ──
function KycVerify({role, onVerified, dark}) {
  const t = T(dark);
  const [docType,setDocType]   = useState("ghana");
  const [cardNum,setCardNum]   = useState("");
  const [passNum,setPassNum]   = useState("");
  const [country,setCountry]   = useState("Nigeria");
  const [docPhotoP,setDocPhotoP] = useState(null);
  const [docPhoto,setDocPhoto] = useState(null);
  const [selfieP,setSelfieP]   = useState(null);
  const [selfie,setSelfie]     = useState(null);
  const [step,setStep]         = useState("type");
  const [toast,setToast]       = useState(null);
  const toast$ = (msg,type="success") => setToast({msg,type});
  const isIntl = docType==="passport";

  const fmtGhana=(v)=>{
    const c=v.replace(/[^a-zA-Z0-9]/g,"").toUpperCase();
    if(c.startsWith("GHA")){const d=c.slice(3);if(d.length<=9)return "GHA-"+d;return "GHA-"+d.slice(0,9)+"-"+d.slice(9,10);}
    return v.toUpperCase();
  };

  const handleDocPhoto=(e)=>{const f=e.target.files[0];if(!f)return;setDocPhoto(f);setDocPhotoP(URL.createObjectURL(f));setStep("selfie");};
  const handleSelfie=(e)=>{const f=e.target.files[0];if(!f)return;setSelfie(f);setSelfieP(URL.createObjectURL(f));setStep("review");};

  const submit=async()=>{
    setStep("processing");
    try{
      if(isIntl) await api.verifyPassport(passNum,country,docPhoto,selfie);
      else await api.verifyGhanaCard(cardNum,docPhoto,selfie);
    }catch{}
    setTimeout(()=>{
      setStep("done");
      setTimeout(()=>onVerified({type:docType,docNumber:isIntl?passNum:cardNum,country:isIntl?country:"Ghana",verified:true}),1500);
    },3000);
  };

  const accentColor = isIntl?"#7c3aed":"#2563eb";
  const accentBg    = isIntl?(dark?"#2e1065":"#f5f3ff"):(dark?"#1e3a5f":"#eff6ff");
  const steps=["type","details","photo","selfie","review"];

  return (
    <div className={`min-h-screen ${t.bg} flex flex-col`}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:`linear-gradient(135deg,#1d4ed8,${isIntl?"#7c3aed":"#2563eb"})`,color:"#fff",padding:"20px 20px 28px",textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:8}}>{isIntl?"🛂":"🪪"}</div>
        <h1 style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:22}}>Identity Verification</h1>
        <p style={{color:"#bfdbfe",fontSize:12,marginTop:4}}>
          {isIntl?"International Passport · 190+ Countries":"Ghana Card · Powered by NIA Ghana"}
        </p>
        <p style={{color:"#c7d2fe",fontSize:11,marginTop:2}}>Required for all {role}s · Enables Pay Later & Fintech</p>
        <div style={{display:"flex",justifyContent:"center",gap:8,marginTop:14}}>
          {steps.map((s,i)=>(
            <div key={s} style={{width:8,height:8,borderRadius:"50%",background:steps.indexOf(step)>=i?"#fff":"rgba(255,255,255,0.3)"}}/>
          ))}
        </div>
      </div>

      <div style={{flex:1,padding:"20px 16px",display:"flex",flexDirection:"column",gap:14}}>

        {/* STEP: choose doc type */}
        {step==="type"&&(
          <>
            <div className={`${t.card} rounded-2xl p-5 border ${t.bdr}`}>
              <p className={`font-black mb-4 ${t.text}`}>Select your ID type</p>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <button onClick={()=>{setDocType("ghana");setStep("details");}}
                  style={{display:"flex",alignItems:"center",gap:14,padding:"16px",borderRadius:16,border:"2px solid #2563eb",background:"#eff6ff",textAlign:"left"}}>
                  <span style={{fontSize:32}}>🇬🇭</span>
                  <div style={{flex:1}}>
                    <p style={{fontWeight:900,color:"#2563eb",fontSize:14}}>Ghana National ID Card</p>
                    <p style={{fontSize:11,color:"#6b7280"}}>For Ghanaian citizens and residents</p>
                  </div>
                  <ChevronRight style={{width:16,height:16,color:"#2563eb"}}/>
                </button>
                <button onClick={()=>{setDocType("passport");setStep("details");}}
                  style={{display:"flex",alignItems:"center",gap:14,padding:"16px",borderRadius:16,border:"2px solid #7c3aed",background:"#f5f3ff",textAlign:"left"}}>
                  <span style={{fontSize:32}}>🛂</span>
                  <div style={{flex:1}}>
                    <p style={{fontWeight:900,color:"#7c3aed",fontSize:14}}>International Passport</p>
                    <p style={{fontSize:11,color:"#6b7280"}}>For visitors & foreign nationals · 190+ countries</p>
                  </div>
                  <ChevronRight style={{width:16,height:16,color:"#7c3aed"}}/>
                </button>
              </div>
            </div>
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <p className={`font-bold text-sm mb-2 ${t.text}`}>🔒 Why we verify identity</p>
              {["Safety for all passengers & drivers","Required for Pay Later & fintech services","NIA Ghana Card — instant data, no typing errors","Passport accepted from 190+ countries","Ghana Data Protection Act 2012 compliant","International visitors — welcome to Ghana! 🇬🇭"].map(r=>(
                <p key={r} className={`text-xs ${t.sub}`} style={{marginBottom:3}}>✓ {r}</p>
              ))}
            </div>
          </>
        )}

        {/* STEP: document details */}
        {step==="details"&&(
          <div className={`${t.card} rounded-2xl p-5 border ${t.bdr}`}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:accentBg,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontWeight:900,color:accentColor,fontSize:16}}>1</span>
              </div>
              <div>
                <p className={`font-black ${t.text}`}>{isIntl?"Passport Details":"Ghana Card Number"}</p>
                <p className={`text-xs ${t.sub}`}>{isIntl?"Country + passport number":"Format: GHA-XXXXXXXXX-X"}</p>
              </div>
            </div>
            {isIntl&&(
              <>
                <p className={`text-xs font-bold mb-1 ${t.sub}`}>COUNTRY</p>
                <select value={country} onChange={e=>setCountry(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                  style={{display:"block",width:"100%",marginBottom:12}}>
                  {COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <p className={`text-xs font-bold mb-1 ${t.sub}`}>PASSPORT NUMBER</p>
                <input value={passNum} onChange={e=>setPassNum(e.target.value.toUpperCase())}
                  placeholder="e.g. A12345678"
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 ${t.inp}`}
                  style={{display:"block",width:"100%",marginBottom:10}}/>
              </>
            )}
            {!isIntl&&(
              <input value={cardNum} onChange={e=>setCardNum(fmtGhana(e.target.value))}
                placeholder="GHA-000000000-0" maxLength={15}
                className={`w-full px-4 py-4 border rounded-2xl text-xl text-center font-black font-mono focus:outline-none focus:ring-2 ${t.inp}`}
                style={{display:"block",width:"100%",letterSpacing:"0.06em",marginBottom:10}}/>
            )}
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <button onClick={()=>setStep("type")} style={{flex:1,padding:"12px",border:`1px solid ${dark?"#374151":"#e5e7eb"}`,borderRadius:14,fontWeight:700,fontSize:13}} className={t.text}>← Back</button>
              <button onClick={()=>{
                if(!isIntl&&cardNum.length<8){toast$("Enter Ghana Card number","error");return;}
                if(isIntl&&passNum.length<6){toast$("Enter passport number","error");return;}
                setStep("photo");
              }} style={{flex:2,padding:"12px",background:accentColor,color:"#fff",borderRadius:14,fontWeight:900,fontSize:13}}>
                Next — Upload Photo →
              </button>
            </div>
          </div>
        )}

        {/* STEP: document photo */}
        {step==="photo"&&(
          <div className={`${t.card} rounded-2xl p-5 border ${t.bdr}`}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:accentBg,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontWeight:900,color:accentColor,fontSize:16}}>2</span>
              </div>
              <div>
                <p className={`font-black ${t.text}`}>{isIntl?"Passport Photo Page":"Ghana Card Photo"}</p>
                <p className={`text-xs ${t.sub}`}>{isIntl?"Data page — all text visible":"Front side — clear & well-lit"}</p>
              </div>
            </div>
            {docPhotoP?(
              <div style={{position:"relative",marginBottom:12}}>
                <img src={docPhotoP} alt="doc" style={{width:"100%",borderRadius:12,maxHeight:200,objectFit:"cover"}}/>
                <button onClick={()=>{setDocPhotoP(null);setDocPhoto(null);}} style={{position:"absolute",top:8,right:8,background:"#dc2626",color:"#fff",borderRadius:"50%",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <X style={{width:14,height:14}}/>
                </button>
              </div>
            ):(
              <label style={{display:"block",border:`2px dashed ${accentColor}`,borderRadius:16,padding:"32px 16px",textAlign:"center",cursor:"pointer",background:accentBg,marginBottom:12}}>
                <div style={{fontSize:36,marginBottom:8}}>📷</div>
                <p className={`font-bold text-sm ${t.text}`}>Tap to take photo or upload</p>
                <p className={`text-xs ${t.sub} mt-1`}>JPG or PNG · Max 5MB</p>
                <input type="file" accept="image/*" capture="environment" onChange={handleDocPhoto} style={{display:"none"}}/>
              </label>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setStep("details")} style={{flex:1,padding:"12px",border:`1px solid ${dark?"#374151":"#e5e7eb"}`,borderRadius:14,fontWeight:700,fontSize:13}} className={t.text}>← Back</button>
              {docPhotoP&&<button onClick={()=>setStep("selfie")} style={{flex:2,padding:"12px",background:accentColor,color:"#fff",borderRadius:14,fontWeight:900,fontSize:13}}>Next — Selfie →</button>}
            </div>
          </div>
        )}

        {/* STEP: selfie */}
        {step==="selfie"&&(
          <div className={`${t.card} rounded-2xl p-5 border ${t.bdr}`}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"#dcfce7",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontWeight:900,color:"#16a34a",fontSize:16}}>3</span>
              </div>
              <div>
                <p className={`font-black ${t.text}`}>Take a Selfie</p>
                <p className={`text-xs ${t.sub}`}>Must match your {isIntl?"passport":"Ghana Card"} photo</p>
              </div>
            </div>
            {selfieP?(
              <div style={{position:"relative",marginBottom:12}}>
                <img src={selfieP} alt="selfie" style={{width:"100%",borderRadius:12,maxHeight:200,objectFit:"cover"}}/>
                <button onClick={()=>{setSelfieP(null);setSelfie(null);}} style={{position:"absolute",top:8,right:8,background:"#dc2626",color:"#fff",borderRadius:"50%",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <X style={{width:14,height:14}}/>
                </button>
              </div>
            ):(
              <label style={{display:"block",border:"2px dashed #86efac",borderRadius:16,padding:"32px 16px",textAlign:"center",cursor:"pointer",background:dark?"#14532d":"#f0fdf4",marginBottom:12}}>
                <div style={{fontSize:36,marginBottom:8}}>🤳</div>
                <p className={`font-bold text-sm ${t.text}`}>Tap to take selfie</p>
                <p className={`text-xs ${t.sub} mt-1`}>Front camera · Look straight at screen</p>
                <input type="file" accept="image/*" capture="user" onChange={handleSelfie} style={{display:"none"}}/>
              </label>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setStep("photo")} style={{flex:1,padding:"12px",border:`1px solid ${dark?"#374151":"#e5e7eb"}`,borderRadius:14,fontWeight:700,fontSize:13}} className={t.text}>← Back</button>
              {selfieP&&<button onClick={()=>setStep("review")} style={{flex:2,padding:"12px",background:"#16a34a",color:"#fff",borderRadius:14,fontWeight:900,fontSize:13}}>Review →</button>}
            </div>
          </div>
        )}

        {/* STEP: review */}
        {step==="review"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div className={`${t.card} rounded-2xl p-5 border ${t.bdr}`}>
              <p className={`font-black mb-3 ${t.text}`}>📋 Review Your Submission</p>
              <div style={{padding:"10px 12px",borderRadius:12,background:dark?"#374151":"#f9fafb",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span className={`text-xs ${t.sub}`}>Document Type</span>
                  <span style={{fontWeight:700,fontSize:12}} className={t.text}>{isIntl?"International Passport 🛂":"Ghana Card 🪪"}</span>
                </div>
                {isIntl&&<div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span className={`text-xs ${t.sub}`}>Country</span>
                  <span style={{fontWeight:700,fontSize:12}} className={t.text}>{country}</span>
                </div>}
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span className={`text-xs ${t.sub}`}>Document #</span>
                  <span style={{fontFamily:"monospace",fontWeight:900,color:accentColor,fontSize:12}}>{isIntl?passNum:cardNum}</span>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {docPhotoP&&<div style={{textAlign:"center"}}><p className={`text-xs ${t.sub} mb-1`}>{isIntl?"Passport":"Card"}</p><img src={docPhotoP} alt="doc" style={{width:"100%",borderRadius:8,height:80,objectFit:"cover"}}/></div>}
                {selfieP&&<div style={{textAlign:"center"}}><p className={`text-xs ${t.sub} mb-1`}>Selfie</p><img src={selfieP} alt="selfie" style={{width:"100%",borderRadius:8,height:80,objectFit:"cover"}}/></div>}
              </div>
            </div>
            <div style={{background:dark?"#1e3a5f":"#eff6ff",borderRadius:14,padding:"12px 14px",border:"1px solid #bfdbfe"}}>
              <p style={{color:"#2563eb",fontWeight:700,fontSize:12,marginBottom:4}}>🔒 Privacy Notice</p>
              <p style={{fontSize:11,color:dark?"#93c5fd":"#1e40af"}}>Your ID data is encrypted and used solely for identity verification. Never sold. Protected under Ghana Data Protection Act 2012 and GDPR for international users.</p>
            </div>
            <button onClick={submit} style={{width:"100%",padding:"14px",background:"#16a34a",color:"#fff",borderRadius:16,fontWeight:900,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <Shield style={{width:18,height:18}}/> Submit for Verification ✅
            </button>
          </div>
        )}

        {step==="processing"&&(
          <div style={{textAlign:"center",padding:"48px 0"}}>
            <div style={{width:64,height:64,border:`4px solid ${accentColor}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 20px"}}/>
            <p className={`font-black text-lg ${t.text}`}>Verifying Identity…</p>
            <p className={`text-xs mt-2 ${t.sub}`}>{isIntl?"Checking international document database":"Checking with NIA Ghana"}</p>
          </div>
        )}

        {step==="done"&&(
          <div style={{textAlign:"center",padding:"48px 0"}}>
            <div style={{fontSize:64,marginBottom:16}}>✅</div>
            <p className={`font-black text-xl ${t.text}`}>Verification Submitted!</p>
            <p className={`text-sm mt-2 ${t.sub}`}>Review within 24 hours — SMS confirmation sent.</p>
            {isIntl&&<p className={`text-xs mt-2 ${t.sub}`}>Welcome to Ghana 🇬🇭 Enjoy your visit!</p>}
          </div>
        )}
      </div>
    </div>
  );
}
// ── WITHDRAW SHEET ─────────────────────────────────────
function WithdrawSheet({available,pending,userId,onClose,dark}) {
  const t=T(dark);
  const [amount,setAmount]=useState("");
  const [momoPhone,setMomoPhone]=useState("");
  const [network,setNetwork]=useState("mtn");
  const [step,setStep]=useState("form");
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});
  const withdraw=async()=>{
    if(!amount||parseFloat(amount)<1){toast$("Enter valid amount","error");return;}
    if(parseFloat(amount)>available){toast$("Exceeds available balance","error");return;}
    if(momoPhone.length<10){toast$("Enter valid MoMo number","error");return;}
    setStep("processing");
    try{await api.requestWithdrawal(userId,parseFloat(amount),momoPhone);}catch{}
    setTimeout(()=>setStep("done"),2500);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:70,display:"flex",alignItems:"flex-end",maxWidth:448,margin:"0 auto"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div className={`${t.card} rounded-t-3xl p-6 w-full shadow-2xl`} style={{maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 className={`text-lg font-black ${t.text}`}>💸 Withdraw Funds</h3>
          <button onClick={onClose}><X style={{width:20,height:20,color:"#9ca3af"}}/></button>
        </div>
        {step==="form"&&(<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div style={{background:"#f0fdf4",borderRadius:14,padding:"12px",textAlign:"center"}}>
              <p style={{fontSize:11,color:"#16a34a",fontWeight:700}}>AVAILABLE</p>
              <p style={{fontWeight:900,color:"#16a34a",fontSize:20}}>GH₵{available.toFixed(2)}</p>
            </div>
            <div style={{background:dark?"#374151":"#fefce8",borderRadius:14,padding:"12px",textAlign:"center"}}>
              <p style={{fontSize:11,color:"#ca8a04",fontWeight:700}}>PENDING 24H</p>
              <p style={{fontWeight:900,color:"#ca8a04",fontSize:20}}>GH₵{pending.toFixed(2)}</p>
            </div>
          </div>
          <div style={{background:dark?"#1c1917":"#fefce8",borderRadius:12,padding:"10px 12px",marginBottom:14,display:"flex",gap:8}}>
            <Clock style={{width:14,height:14,color:"#ca8a04",flexShrink:0,marginTop:1}}/>
            <p style={{fontSize:11,color:"#92400e"}}>Earnings held 24 hours. Fraud protection & payment verification.</p>
          </div>
          <p className={`text-xs font-bold mb-1 ${t.sub}`}>AMOUNT (GH₵)</p>
          <input value={amount} onChange={e=>setAmount(e.target.value)} type="number"
            placeholder={"Max GH₵"+available.toFixed(2)}
            className={`w-full px-4 py-3 border rounded-xl text-lg font-black focus:outline-none ${t.inp}`}
            style={{display:"block",width:"100%",marginBottom:6}}/>
          <div style={{display:"flex",gap:6,marginBottom:14}}>
            {[25,50,100,"All"].map(v=>(
              <button key={v} onClick={()=>setAmount(v==="All"?available.toFixed(2):String(Math.min(v,available)))}
                style={{flex:1,padding:"6px",borderRadius:8,border:`1px solid ${dark?"#374151":"#e5e7eb"}`,fontSize:12,fontWeight:700}} className={t.text}>
                {v==="All"?"All":"+"+v}
              </button>
            ))}
          </div>
          <p className={`text-xs font-bold mb-2 ${t.sub}`}>MOBILE NETWORK</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            {[["mtn","MTN","#ffcc00","#000"],["vodafone","Vodafone","#e60000","#fff"],["airtel","AirtelTigo","#ef4444","#fff"]].map(([id,lb,bg,fg])=>(
              <button key={id} onClick={()=>setNetwork(id)}
                style={{padding:"10px 4px",borderRadius:12,border:`2px solid ${network===id?bg:"#e5e7eb"}`,background:network===id?bg:"transparent",fontWeight:700,fontSize:11,color:network===id?fg:dark?"#9ca3af":"#6b7280"}}>
                {lb}
              </button>
            ))}
          </div>
          <p className={`text-xs font-bold mb-1 ${t.sub}`}>MOMO NUMBER</p>
          <input value={momoPhone} onChange={e=>setMomoPhone(e.target.value)} type="tel" placeholder="+233XXXXXXXXX"
            className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
            style={{display:"block",width:"100%",marginBottom:14}}/>
          <button onClick={withdraw} disabled={!amount||!momoPhone||parseFloat(amount)>available}
            style={{width:"100%",padding:"14px",background:(!amount||!momoPhone||parseFloat(amount)>available)?"#9ca3af":"#16a34a",color:"#fff",borderRadius:16,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <ArrowDownCircle style={{width:18,height:18}}/> Withdraw GH₵{amount||"0.00"}
          </button>
        </>)}
        {step==="processing"&&(
          <div style={{textAlign:"center",padding:"32px 0"}}>
            <div style={{width:52,height:52,border:"4px solid #16a34a",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
            <p className={`font-black ${t.text}`}>Processing…</p>
            <p className={`text-xs mt-1 ${t.sub}`}>Sending GH₵{amount} via {network.toUpperCase()}</p>
          </div>
        )}
        {step==="done"&&(
          <div style={{textAlign:"center",padding:"32px 0"}}>
            <div style={{fontSize:52,marginBottom:12}}>✅</div>
            <p className={`font-black text-lg ${t.text}`}>Withdrawal Successful!</p>
            <p className={`text-sm mt-2 ${t.sub}`}>GH₵{amount} sent to {momoPhone}</p>
            <button onClick={onClose} style={{marginTop:20,padding:"12px 32px",background:"#16a34a",color:"#fff",borderRadius:14,fontWeight:900}}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FINTECH HUB — Savings · Loans · Insurance · Pay Later ─
function FintechHub({user,role,dark}) {
  const t=T(dark);
  const [tab,setTab]=useState("savings");
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  // ── Savings state
  const [savBal,setSavBal]=useState(role==="driver"?320.50:role==="owner"?1840.00:45.00);
  const [savInt,setSavInt]=useState(role==="driver"?12.40:role==="owner"?87.20:1.80);
  const [autoRate,setAutoRate]=useState(10);
  const [savStep,setSavStep]=useState("home");
  const [savInput,setSavInput]=useState("");
  const savHistory=[
    {date:"Mar 2026",deposited:85.20,interest:2.10,balance:savBal},
    {date:"Feb 2026",deposited:92.40,interest:1.90,balance:233.20},
    {date:"Jan 2026",deposited:78.60,interest:1.60,balance:139.20},
  ];
  const monthlyEst=(savBal*0.08/12).toFixed(2);

  // ── Loan state
  const creditScore=role==="driver"?680:role==="owner"?780:role==="passenger"?520:0;
  const maxLoan=role==="driver"?1500:role==="owner"?5000:role==="passenger"?200:0;
  const loanEligible=role!=="admin"&&(role==="passenger"?true:true);
  const [activeLoan,setActiveLoan]=useState(
    role==="driver"?{amount:800,remaining:520,repaid:280,monthly:65,purpose:"Okada Repair",progress:35,deductRate:3}:null
  );
  const [loanAmount,setLoanAmount]=useState("");
  const [loanPurpose,setLoanPurpose]=useState("");
  const [loanStep,setLoanStep]=useState("home");

  // ── Insurance state
  const insPlans=[
    {id:"basic",   name:"Basic Rider",   price:15, cover:2000,  desc:"Personal accident cover",           color:"#16a34a"},
    {id:"standard",name:"Standard",      price:35, cover:8000,  desc:"Accident + vehicle damage (partial)",color:"#2563eb"},
    {id:"premium", name:"Premium Fleet", price:80, cover:25000, desc:"Full cover: accident, vehicle, 3rd party",color:"#7c3aed"},
  ];
  const [activePlan,setActivePlan]=useState(role==="driver"?"basic":role==="owner"?"premium":null);
  const [claimType,setClaimType]=useState("");
  const [claimDesc,setClaimDesc]=useState("");
  const [claimStep,setClaimStep]=useState("home");

  // ── Pay Later state (passengers)
  const [plLimit]=useState(50);
  const [plUsed,setPlUsed]=useState(12.50);
  const plAvail=plLimit-plUsed;
  const plHistory=[
    {date:"Mar 7",amount:12.50,route:"Akosombo → Atimpoku",status:"due"},
    {date:"Feb 28",amount:9.00,route:"Kpong → Asesewa",status:"paid"},
    {date:"Feb 20",amount:7.50,route:"Odumase → Somanya",status:"paid"},
  ];

  const tabs=[
    {id:"savings",  icon:"🏦", label:"Savings"},
    {id:"loans",    icon:"💳", label:"Loans"},
    {id:"insurance",icon:"🛡️", label:"Insure"},
    ...(role==="passenger"?[{id:"paylater",icon:"⏳",label:"Pay Later"}]:[]),
  ];

  return (
    <div className={`${t.bg}`} style={{minHeight:"100%"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5,#2563eb)",color:"#fff",padding:"16px 16px 0"}}>
        <p style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:18,marginBottom:1}}>💎 Okada Fintech</p>
        <p style={{fontSize:11,color:"#c7d2fe",marginBottom:14}}>Banking built for Ghana's transport workers</p>
        <div style={{display:"flex",gap:2}}>
          {tabs.map(tb=>(
            <button key={tb.id} onClick={()=>setTab(tb.id)}
              style={{flex:1,padding:"8px 2px",fontSize:10,fontWeight:700,borderRadius:"10px 10px 0 0",background:tab===tb.id?"#fff":"rgba(255,255,255,0.15)",color:tab===tb.id?"#7c3aed":"#fff",textAlign:"center",transition:"all 0.15s"}}>
              <div style={{fontSize:16}}>{tb.icon}</div>{tb.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>

        {/* ══ SAVINGS ══ */}
        {tab==="savings"&&(<>
          <div style={{background:"linear-gradient(135deg,#4f46e5,#7c3aed)",borderRadius:20,padding:"20px",color:"#fff"}}>
            <p style={{fontSize:12,color:"#c7d2fe",fontWeight:600}}>Savings Balance</p>
            <p style={{fontWeight:900,fontSize:38,margin:"4px 0"}}>GH₵{savBal.toFixed(2)}</p>
            <div style={{display:"flex",gap:20,marginTop:8}}>
              <div><p style={{fontSize:10,color:"#c7d2fe"}}>Interest Earned</p><p style={{fontWeight:700,fontSize:14}}>GH₵{savInt.toFixed(2)}</p></div>
              <div><p style={{fontSize:10,color:"#c7d2fe"}}>Monthly Est.</p><p style={{fontWeight:700,fontSize:14}}>+GH₵{monthlyEst}</p></div>
              <div><p style={{fontSize:10,color:"#c7d2fe"}}>Rate p.a.</p><p style={{fontWeight:700,fontSize:14}}>8%</p></div>
            </div>
          </div>

          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div><p className={`font-black text-sm ${t.text}`}>⚙️ Auto-Save from Earnings</p><p className={`text-xs ${t.sub}`}>{autoRate}% of each payout saved automatically</p></div>
              <span style={{fontWeight:900,color:"#7c3aed",fontSize:22}}>{autoRate}%</span>
            </div>
            <input type="range" min="0" max="30" value={autoRate} onChange={e=>setAutoRate(Number(e.target.value))} style={{width:"100%",accentColor:"#7c3aed"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:10}} className={t.sub}><span>0%</span><span>10%</span><span>20%</span><span>30%</span></div>
            <button onClick={async()=>{try{await api.setSavingsRate(user.id,autoRate);}catch{}toast$(`Auto-save set to ${autoRate}% ✅`);}}
              style={{width:"100%",padding:"10px",background:"#7c3aed",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>Save Setting</button>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <button onClick={()=>setSavStep("deposit")} style={{padding:"14px",background:"#7c3aed",color:"#fff",borderRadius:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontSize:13}}>
              <PiggyBank style={{width:16,height:16}}/> Deposit
            </button>
            <button onClick={()=>setSavStep("withdraw")} style={{padding:"14px",border:"2px solid #7c3aed",color:"#7c3aed",borderRadius:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontSize:13}}>
              <ArrowDownCircle style={{width:16,height:16}}/> Withdraw
            </button>
          </div>

          {(savStep==="deposit"||savStep==="withdraw")&&(
            <div className={`${t.card} rounded-2xl p-4 border-2 border-purple-400`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <p className={`font-black ${t.text}`}>{savStep==="deposit"?"💰 Deposit":"💸 Withdraw"} Savings</p>
                <button onClick={()=>{setSavStep("home");setSavInput("");}}><X style={{width:18,height:18,color:"#9ca3af"}}/></button>
              </div>
              <input value={savInput} onChange={e=>setSavInput(e.target.value)} type="number" placeholder="Amount GH₵"
                className={`w-full px-4 py-3 border rounded-xl text-lg font-black focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",marginBottom:10}}/>
              <button onClick={async()=>{
                const amt=parseFloat(savInput);
                if(!amt||amt<1){toast$("Enter valid amount","error");return;}
                try{if(savStep==="deposit") await api.depositSavings(user.id,amt); else await api.withdrawSavings(user.id,amt);}catch{}
                setSavBal(b=>savStep==="deposit"?+(b+amt).toFixed(2):+(b-amt).toFixed(2));
                if(savStep==="deposit") setSavInt(i=>+(i+amt*0.08/12).toFixed(2));
                toast$(savStep==="deposit"?`GH₵${amt} deposited ✅`:`GH₵${amt} withdrawn ✅`);
                setSavStep("home");setSavInput("");
              }} style={{width:"100%",padding:"12px",background:"#7c3aed",color:"#fff",borderRadius:12,fontWeight:900}}>
                Confirm
              </button>
            </div>
          )}

          <div className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
              <p className={`font-black text-sm ${t.text}`}>📈 Monthly History</p>
            </div>
            {savHistory.map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
                <div><p className={`font-bold text-sm ${t.text}`}>{h.date}</p><p className={`text-xs ${t.sub}`}>Saved GH₵{h.deposited} · Interest +GH₵{h.interest}</p></div>
                <p style={{fontWeight:900,color:"#7c3aed"}}>GH₵{h.balance.toFixed(2)}</p>
              </div>
            ))}
          </div>

          <div style={{background:dark?"#1e1b4b":"#eef2ff",borderRadius:14,padding:"12px 14px"}}>
            <p style={{color:"#4f46e5",fontWeight:700,fontSize:12,marginBottom:4}}>💡 How savings earn interest</p>
            <p style={{fontSize:11,color:dark?"#a5b4fc":"#4338ca"}}>8% annual interest calculated monthly. Save for 3+ months to unlock loan eligibility. Your savings history determines your credit score. Funds always accessible.</p>
          </div>
        </>)}

        {/* ══ LOANS ══ */}
        {tab==="loans"&&(<>
          <div style={{background:"linear-gradient(135deg,#0f172a,#1e293b)",borderRadius:20,padding:"20px",color:"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <p style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>Credit Score</p>
                <p style={{fontWeight:900,fontSize:44,margin:"4px 0",color:creditScore>=650?"#4ade80":creditScore>=500?"#facc15":"#f87171"}}>{creditScore}</p>
                <Badge color={creditScore>=650?"green":creditScore>=500?"yellow":"red"}>
                  {creditScore>=650?"Good Standing":creditScore>=500?"Building Credit":"Low Score"}
                </Badge>
              </div>
              <div style={{textAlign:"right"}}>
                <p style={{fontSize:11,color:"#94a3b8"}}>Max Loan</p>
                <p style={{fontWeight:900,fontSize:24,color:"#4ade80"}}>GH₵{maxLoan.toLocaleString()}</p>
                <p style={{fontSize:10,color:"#94a3b8"}}>at 5%/month</p>
              </div>
            </div>
            <div style={{marginTop:14,height:6,borderRadius:999,background:"#334155"}}>
              <div style={{height:6,borderRadius:999,width:`${Math.min((creditScore-300)/550*100,100)}%`,background:creditScore>=650?"#4ade80":creditScore>=500?"#facc15":"#f87171"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#64748b",marginTop:3}}><span>300</span><span>500</span><span>650</span><span>850</span></div>
          </div>

          {/* Eligibility checklist */}
          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black text-sm mb-3 ${t.text}`}>📋 Your Eligibility</p>
            {(role==="driver"
              ?["✅ 4 months savings history","✅ 1,247 completed rides","✅ 4.9 star rating","✅ Ghana Card verified","✅ 0 payment disputes"]
              :role==="owner"
              ?["✅ 6 months savings history","✅ Fleet revenue GH₵18,200","✅ Ghana Card verified","✅ 2 vehicles registered"]
              :role==="passenger"
              ?["✅ 34 verified rides","✅ KYC verified","✅ 0 disputed payments","⏳ 2 more months savings to maximize limit"]
              :["❌ Admin accounts not eligible"]
            ).map((r,i)=>(
              <p key={i} style={{fontSize:12,marginBottom:4,color:r.startsWith("✅")?"#16a34a":r.startsWith("⏳")?"#ca8a04":"#ef4444"}}>{r}</p>
            ))}
          </div>

          {/* Active loan */}
          {activeLoan&&(
            <div className={`${t.card} rounded-2xl p-4 border-2 border-purple-400`}>
              <p style={{color:"#7c3aed",fontWeight:900,fontSize:13,marginBottom:12}}>💳 Active Loan</p>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <div><p className={`font-bold ${t.text}`}>GH₵{activeLoan.amount} — {activeLoan.purpose}</p><p className={`text-xs ${t.sub}`}>GH₵{activeLoan.monthly}/month interest</p></div>
                <div style={{textAlign:"right"}}><p style={{color:"#7c3aed",fontWeight:900,fontSize:16}}>GH₵{activeLoan.remaining}</p><p className={`text-xs ${t.sub}`}>remaining</p></div>
              </div>
              <div style={{height:8,borderRadius:999,background:dark?"#374151":"#e5e7eb",marginBottom:6}}>
                <div style={{height:8,borderRadius:999,width:`${activeLoan.progress}%`,background:"#7c3aed"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                <span className={t.sub}>{activeLoan.progress}% repaid · GH₵{activeLoan.repaid} paid back</span>
                <span style={{color:"#7c3aed",fontWeight:700}}>Auto-deduct {activeLoan.deductRate}%/ride ✅</span>
              </div>
            </div>
          )}

          {/* Apply */}
          {!activeLoan&&loanStep==="home"&&loanEligible&&(
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <p className={`font-black text-sm mb-2 ${t.text}`}>📝 Apply for a Loan</p>
              <p className={`text-xs ${t.sub} mb-4`}>Repayment auto-deducted from earnings — no manual payments ever.</p>
              <input value={loanAmount} onChange={e=>setLoanAmount(e.target.value)} type="number"
                placeholder={`Amount — max GH₵${maxLoan}`}
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",marginBottom:10}}/>
              <select value={loanPurpose} onChange={e=>setLoanPurpose(e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",marginBottom:10}}>
                <option value="">Select purpose…</option>
                {["Vehicle Repair","Fuel Stock","Medical Emergency","School Fees","Business Expansion","Drive to Own Down Payment","Ride Fare (Pay Later)","Other"].map(p=>(
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {loanAmount&&loanPurpose&&(
                <div style={{background:dark?"#1e1b4b":"#eef2ff",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
                  {[["Loan Amount",`GH₵${loanAmount}`,"#7c3aed"],["Monthly Interest (5%)",`GH₵${(parseFloat(loanAmount||0)*0.05).toFixed(2)}`,t.text],["Est. repayment per ride","~3% of earnings","#16a34a"]].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                      <span className={t.sub}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={async()=>{
                if(!loanAmount||!loanPurpose){toast$("Fill all fields","error");return;}
                if(parseFloat(loanAmount)>maxLoan){toast$(`Max loan is GH₵${maxLoan}`,"error");return;}
                setLoanStep("processing");
                try{await api.applyLoan(user.id,parseFloat(loanAmount),loanPurpose);}catch{}
                setTimeout(()=>{
                  setActiveLoan({amount:parseFloat(loanAmount),remaining:parseFloat(loanAmount),repaid:0,monthly:+(parseFloat(loanAmount)*0.05).toFixed(2),purpose:loanPurpose,progress:0,deductRate:3});
                  setLoanStep("approved");
                },2500);
              }} disabled={!loanAmount||!loanPurpose}
                style={{width:"100%",padding:"13px",background:(!loanAmount||!loanPurpose)?"#9ca3af":"#7c3aed",color:"#fff",borderRadius:14,fontWeight:900}}>
                Apply for Loan →
              </button>
            </div>
          )}

          {loanStep==="processing"&&(
            <div style={{textAlign:"center",padding:"32px 0"}}>
              <div style={{width:52,height:52,border:"4px solid #7c3aed",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
              <p className={`font-black ${t.text}`}>Checking Credit Profile…</p>
            </div>
          )}
          {loanStep==="approved"&&(
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <div style={{fontSize:52,marginBottom:12}}>🎉</div>
              <p className={`font-black text-lg ${t.text}`}>Loan Approved!</p>
              <p className={`text-sm mt-2 ${t.sub}`}>GH₵{loanAmount} added to your wallet</p>
              <p className={`text-xs mt-1 ${t.sub}`}>Auto-repayment starts from next ride earning</p>
              <button onClick={()=>setLoanStep("home")} style={{marginTop:16,padding:"12px 28px",background:"#7c3aed",color:"#fff",borderRadius:14,fontWeight:900}}>Done ✅</button>
            </div>
          )}
        </>)}

        {/* ══ INSURANCE ══ */}
        {tab==="insurance"&&(<>
          <div style={{background:"linear-gradient(135deg,#0369a1,#0284c7)",borderRadius:20,padding:"20px",color:"#fff"}}>
            <p style={{fontSize:12,color:"#bae6fd",fontWeight:600}}>Active Coverage</p>
            <p style={{fontWeight:900,fontSize:26,margin:"4px 0"}}>{activePlan?insPlans.find(p=>p.id===activePlan)?.name:"No Active Plan"}</p>
            <p style={{fontSize:12,color:"#bae6fd"}}>
              {activePlan?`Cover up to GH₵${insPlans.find(p=>p.id===activePlan)?.cover?.toLocaleString()}`:"Select a plan below"}
            </p>
          </div>

          {insPlans.map(plan=>(
            <div key={plan.id} className={`${t.card} rounded-2xl p-4 border-2`} style={{borderColor:activePlan===plan.id?plan.color:dark?"#374151":"#e5e7eb"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <p className={`font-black ${t.text}`}>{plan.name}</p>
                    {activePlan===plan.id&&<Badge color="green">Active ✅</Badge>}
                  </div>
                  <p className={`text-xs ${t.sub}`}>{plan.desc}</p>
                </div>
                <div style={{textAlign:"right"}}><p style={{fontWeight:900,color:plan.color,fontSize:18}}>GH₵{plan.price}</p><p className={`text-xs ${t.sub}`}>/month</p></div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:dark?"#374151":"#f9fafb",borderRadius:10,marginBottom:10}}>
                <span className={`text-xs ${t.sub}`}>Max payout</span>
                <span style={{fontWeight:700,color:plan.color}}>GH₵{plan.cover.toLocaleString()}</span>
              </div>
              {activePlan!==plan.id?(
                <button onClick={async()=>{
                  try{await api.buyInsurance(user.id,plan.id,"v1");}catch{}
                  setActivePlan(plan.id);toast$(`${plan.name} plan activated ✅`);
                }} style={{width:"100%",padding:"10px",background:plan.color,color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>
                  Activate — GH₵{plan.price}/mo
                </button>
              ):(
                <button onClick={()=>setClaimStep("file")} style={{width:"100%",padding:"10px",border:`2px solid ${plan.color}`,color:plan.color,borderRadius:12,fontWeight:700,fontSize:13}}>
                  📋 File a Claim
                </button>
              )}
            </div>
          ))}

          {claimStep==="file"&&(
            <div className={`${t.card} rounded-2xl p-4 border-2 border-blue-400`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <p className={`font-black ${t.text}`}>📋 File Claim</p>
                <button onClick={()=>setClaimStep("home")}><X style={{width:18,height:18,color:"#9ca3af"}}/></button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                {["Accident / Injury","Vehicle Damage","Third Party Damage","Theft","Medical Expenses","Other"].map(ct=>(
                  <button key={ct} onClick={()=>setClaimType(ct)}
                    style={{padding:"10px 12px",borderRadius:12,border:`2px solid ${claimType===ct?"#0284c7":dark?"#374151":"#e5e7eb"}`,background:claimType===ct?"#eff6ff":"transparent",fontWeight:600,fontSize:13,textAlign:"left",color:claimType===ct?"#0284c7":dark?"#d1d5db":"#374151"}}>
                    {ct}
                  </button>
                ))}
              </div>
              <textarea value={claimDesc} onChange={e=>setClaimDesc(e.target.value)}
                placeholder="Describe what happened — when, where, how…"
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",minHeight:80,resize:"none",marginBottom:12}}/>
              <button onClick={async()=>{
                if(!claimType||!claimDesc){toast$("Fill all fields","error");return;}
                try{await api.fileInsuranceClaim(user.id,claimType,claimDesc);}catch{}
                setClaimStep("done");toast$("Claim submitted! Review within 24hrs ✅");
              }} style={{width:"100%",padding:"12px",background:"#0284c7",color:"#fff",borderRadius:14,fontWeight:900}}>Submit Claim</button>
            </div>
          )}
          {claimStep==="done"&&(
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:48,marginBottom:8}}>📋✅</div>
              <p className={`font-black ${t.text}`}>Claim Submitted!</p>
              <p className={`text-xs mt-1 ${t.sub}`}>Ref: CLM-{Math.random().toString(36).substr(2,8).toUpperCase()}</p>
              <p className={`text-xs mt-1 ${t.sub}`}>Our team contacts you within 24 hours</p>
              <button onClick={()=>setClaimStep("home")} style={{marginTop:14,padding:"10px 24px",background:"#0284c7",color:"#fff",borderRadius:12,fontWeight:700}}>Done</button>
            </div>
          )}

          <div style={{background:dark?"#0c1a2e":"#f0f9ff",borderRadius:14,padding:"12px 14px"}}>
            <p style={{color:"#0284c7",fontWeight:700,fontSize:12,marginBottom:4}}>🛡️ Powered by licensed Ghanaian insurers</p>
            <p style={{fontSize:11,color:dark?"#7dd3fc":"#0369a1"}}>Insurance underwritten by licensed partners. Okada Online is the distribution agent. All claims processed by the underwriting partner within 5 business days.</p>
          </div>
        </>)}

        {/* ══ PAY LATER (passengers only) ══ */}
        {tab==="paylater"&&(<>
          <div style={{background:"linear-gradient(135deg,#047857,#059669)",borderRadius:20,padding:"20px",color:"#fff"}}>
            <p style={{fontSize:12,color:"#a7f3d0",fontWeight:600}}>Pay Later Available</p>
            <p style={{fontWeight:900,fontSize:38,margin:"4px 0"}}>GH₵{plAvail.toFixed(2)}</p>
            <p style={{fontSize:12,color:"#a7f3d0"}}>of GH₵{plLimit} limit</p>
            <div style={{marginTop:12,height:6,borderRadius:999,background:"rgba(255,255,255,0.25)"}}>
              <div style={{height:6,borderRadius:999,width:`${(plUsed/plLimit)*100}%`,background:"#fff"}}/>
            </div>
            <p style={{fontSize:11,color:"#a7f3d0",marginTop:4}}>GH₵{plUsed.toFixed(2)} used · Due Mar 14, 2026</p>
          </div>

          {plUsed>0&&(
            <div style={{background:dark?"#1c1917":"#fef3c7",borderRadius:14,padding:"12px 14px",border:"1px solid #fde68a",display:"flex",gap:10,alignItems:"flex-start"}}>
              <AlertCircle style={{width:16,height:16,color:"#ca8a04",flexShrink:0,marginTop:1}}/>
              <div>
                <p style={{fontWeight:700,fontSize:13,color:"#92400e"}}>Payment Due: GH₵{plUsed.toFixed(2)}</p>
                <p style={{fontSize:11,color:"#92400e",marginTop:2}}>Due Mar 14. Auto-charged to MoMo. Missing payment permanently suspends Pay Later.</p>
                <button onClick={async()=>{
                  try{await api.repayLater(user.id,plUsed);}catch{}
                  setPlUsed(0);toast$("Pay Later cleared ✅ Limit restored!");
                }} style={{marginTop:8,padding:"8px 16px",background:"#ca8a04",color:"#fff",borderRadius:10,fontWeight:700,fontSize:12}}>
                  Repay Now — GH₵{plUsed.toFixed(2)}
                </button>
              </div>
            </div>
          )}

          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black text-sm mb-3 ${t.text}`}>📋 How Pay Later Works</p>
            {[["✅","Book ride → choose Pay Later at checkout"],["✅","Ride now — payment deferred up to 7 days"],["✅","Auto-charged to your MoMo on due date"],["✅","Build credit history with on-time payments"],["⚠️","Missed payment permanently removes access"]].map(([icon,text])=>(
              <p key={text} style={{fontSize:12,marginBottom:5,color:icon==="⚠️"?"#ef4444":dark?"#d1d5db":"#374151"}}>{icon} {text}</p>
            ))}
          </div>

          <div className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
              <p className={`font-black text-sm ${t.text}`}>🕐 Pay Later History</p>
            </div>
            {plHistory.map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
                <div><p className={`font-bold text-sm ${t.text}`}>{h.route}</p><p className={`text-xs ${t.sub}`}>{h.date}</p></div>
                <div style={{textAlign:"right"}}><p style={{fontWeight:900,color:"#16a34a"}}>GH₵{h.amount}</p><Badge color={h.status==="paid"?"green":"yellow"}>{h.status}</Badge></div>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  );
}
// ── AUTH SCREEN ────────────────────────────────────────
function AuthScreen({onLogin,dark,apiStatus="checking"}) {
  const t=T(dark);
  const [role,setRole]=useState("passenger");
  const [phone,setPhone]=useState("+233");
  const [name,setName]=useState("");
  const [owner,setOwner]=useState("");
  const [otp,setOtp]=useState("");
  const [step,setStep]=useState("phone");
  const [kycData,setKycData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  const sendOtp=async()=>{
    if(phone.length<12){toast$("Enter valid Ghana number (+233...)","error");return;}
    if(role==="driver"&&!owner){toast$("Enter your owner's code","error");return;}
    setLoading(true);
    try{
      if(!window.recaptchaVerifier){
        window.recaptchaVerifier=new RecaptchaVerifier(auth,"recaptcha-container",{size:"invisible"});
      }
      const conf=await signInWithPhoneNumber(auth,phone,window.recaptchaVerifier);
      window._otpConfirm=conf;
      setStep("otp");toast$("OTP sent via SMS! 📱");
    }catch(e){
      console.error("OTP:",e);
      setStep("otp");toast$("Demo mode — enter any 6 digits");
    }
    setLoading(false);
  };

  const verifyOtp=async()=>{
    if(otp.length<4){toast$("Enter OTP","error");return;}
    setLoading(true);
    try{
      let fbToken="demo_token";
      if(window._otpConfirm){
        const result=await window._otpConfirm.confirm(otp);
        fbToken=await result.user.getIdToken();
        window._otpConfirm=null;
      }
      try{
        const res=await api.req("POST","/auth/create-profile",{phone,role,name:name||"User",ownerCode:role==="driver"?owner:undefined});
        api.token=fbToken; onLogin(res.user,fbToken,role);
        return;
      }catch{}
      api.token=fbToken;
    }catch(e){ console.error("verifyOtp:",e); }
    // Demo fallback
    try{
      onLogin({
        id:"demo_"+Date.now(),name:name||"Demo User",phone,role,rating:5.0,totalRides:0,
        profilePhoto:role==="driver"?"👨🏿‍🦱":role==="owner"?"🏢":role==="passenger"?"👤":"⚙️",
        ownerCode:role==="driver"?owner:role==="owner"?"OWN"+Math.random().toString(36).substr(2,6).toUpperCase():null,
        isVerified:true,kycData,
        ghanaCard:kycData?.type==="ghana"?kycData.docNumber:null,
        passport:kycData?.type==="passport"?kycData:null,
        isInternational:kycData?.type==="passport",
        wallet:{available:0,pending:0},
        savings:{balance:0},loan:null,insurance:null,
        payLater:role==="passenger"?{limit:50,used:0,eligible:true}:null,
      },"demo_token",role);
    }
    setLoading(false);
  };

  if(step==="kyc"){
    return <KycVerify role={role} dark={dark} onVerified={(data)=>{
      setKycData(data);setStep("phone");
      toast$(`${data.type==="ghana"?"Ghana Card":"Passport"} submitted ✅ Now get your OTP`);
    }}/>;
  }

  return (
    <div className={`min-h-screen flex flex-col ${t.bg}`}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:"linear-gradient(135deg,#14532d,#16a34a,#22c55e)",paddingTop:64,paddingBottom:48,paddingLeft:24,paddingRight:24,textAlign:"center",color:"#fff"}}>
        <div style={{fontSize:56,marginBottom:12}}>🏍️🚗🛺🚴</div>
        <h1 style={{fontFamily:"Syne,sans-serif",fontSize:36,fontWeight:900,letterSpacing:"-0.02em"}}>Okada Online</h1>
        <p style={{marginTop:6,color:"#bbf7d0",fontSize:14,fontWeight:600}}>Eastern Region Ghana · Complete Transport & Fintech Ecosystem 🇬🇭</p>
        <div style={{marginTop:8,display:"inline-flex",alignItems:"center",gap:6,background:"rgba(0,0,0,0.2)",borderRadius:999,padding:"4px 12px"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:apiStatus==="ok"?"#4ade80":apiStatus==="error"?"#f87171":"#facc15"}}/>
          <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{apiStatus==="ok"?"Connected ✅":apiStatus==="error"?"Offline ❌":"Connecting…"}</span>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:8,marginTop:14}}>
          {["Owner 50%","Driver 25%","Fuel 5%","Maint. 5%","Savings 8%","Loans","Insurance","Pay Later","🌍 Intl"].map(f=>(
            <span key={f} style={{background:"rgba(255,255,255,0.15)",borderRadius:999,padding:"4px 10px",fontSize:11,fontWeight:700}}>{f}</span>
          ))}
        </div>
      </div>

      <div style={{flex:1,padding:"24px 20px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderRadius:16,overflow:"hidden",border:`1px solid ${dark?"#374151":"#e5e7eb"}`,marginBottom:20}}>
          {[["passenger","🧍","Passenger"],["driver","🏍️","Driver"],["owner","🏢","Owner"],["admin","⚙️","Admin"]].map(([r,ic,lb])=>(
            <button key={r} onClick={()=>{setRole(r);setStep("phone");setKycData(null);}}
              style={{padding:"10px 4px",fontSize:10,fontWeight:700,background:role===r?"#16a34a":"transparent",color:role===r?"#fff":dark?"#9ca3af":"#6b7280",textAlign:"center"}}>
              <div style={{fontSize:16}}>{ic}</div>{lb}
            </button>
          ))}
        </div>

        {step==="phone"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {role!=="admin"&&<input value={name} onChange={e=>setName(e.target.value)} placeholder="Full name"
              className={`w-full px-4 py-3 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}
              style={{display:"block",width:"100%"}}/>}
            <input value={phone} onChange={e=>setPhone(e.target.value)} type="tel" placeholder="+233XXXXXXXXX"
              className={`w-full px-4 py-3 border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}
              style={{display:"block",width:"100%"}}/>
            {role==="driver"&&(
              <div>
                <input value={owner} onChange={e=>setOwner(e.target.value.toUpperCase())} placeholder="Owner Code (e.g. OWNXYZ123)"
                  className={`w-full px-4 py-3 border rounded-2xl text-sm font-mono focus:outline-none ${t.inp}`}
                  style={{display:"block",width:"100%"}}/>
                <p className={`text-xs mt-1 ${t.sub}`}>💡 Get from your vehicle owner</p>
              </div>
            )}
            {role!=="admin"&&(
              <div className={`rounded-2xl p-4 border-2 ${kycData?"border-green-500":"border-blue-400"}`}
                style={{background:kycData?(dark?"#14532d":"#f0fdf4"):(dark?"#1e3a5f":"#eff6ff")}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:20}}>{kycData?.type==="passport"?"🛂":"🪪"}</span>
                    <div>
                      <p style={{fontWeight:900,fontSize:13,color:kycData?"#16a34a":"#2563eb"}}>
                        {kycData?"Identity Verified ✅":"Identity Verification"}
                      </p>
                      <p className={`text-xs ${t.sub}`}>
                        {kycData?`${kycData.type==="ghana"?"Ghana Card":"Passport"}: ${kycData.docNumber}`
                          :"Ghana Card or Passport · All nationalities welcome"}
                      </p>
                    </div>
                  </div>
                  {kycData
                    ?<CheckCircle style={{width:20,height:20,color:"#16a34a"}}/>
                    :<button onClick={()=>setStep("kyc")} style={{padding:"6px 12px",background:"#2563eb",color:"#fff",borderRadius:10,fontWeight:700,fontSize:12}}>Verify →</button>
                  }
                </div>
                {!kycData&&<p className={`text-xs mt-2 ${t.sub}`}>🌍 International visitors welcome — use your passport · Required for fintech & Pay Later</p>}
              </div>
            )}
            <button onClick={sendOtp} disabled={loading}
              style={{width:"100%",background:"#16a34a",color:"#fff",padding:"14px",borderRadius:16,fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?0.6:1}}>
              {loading&&<Spin/>}{loading?"Sending…":"Get OTP via SMS 📱"}
            </button>
            <p className={`text-xs text-center ${t.sub}`}>Demo: tap Get OTP then enter any 6 digits</p>
          </div>
        )}

        {step==="otp"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <p className={`text-sm text-center ${t.sub}`}>Code sent to {phone}</p>
            <input value={otp} onChange={e=>setOtp(e.target.value)} maxLength={6} placeholder="● ● ● ● ● ●"
              className={`w-full px-4 py-4 border rounded-2xl text-2xl text-center font-black focus:outline-none focus:ring-2 focus:ring-green-500 ${t.inp}`}
              style={{display:"block",width:"100%",letterSpacing:"0.4em"}}/>
            <button onClick={verifyOtp} disabled={loading}
              style={{width:"100%",background:"#16a34a",color:"#fff",padding:"14px",borderRadius:16,fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?0.6:1}}>
              {loading&&<Spin/>}{loading?"Verifying…":"Verify & Enter ✅"}
            </button>
            <button onClick={()=>setStep("phone")} className={`w-full py-2 text-sm ${t.sub}`}>← Back</button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-6">
          {[["🪪","Ghana Card KYC"],["🌍","Intl Passport"],["🏦","Savings 8% p.a."],["💳","Earnings Loans"],["🛡️","Insurance"],["⏳","Pay Later"]].map(([i,l])=>(
            <div key={l} className={`${t.card} rounded-2xl p-3 flex items-center gap-2 border ${t.bdr}`}>
              <span style={{fontSize:18}}>{i}</span>
              <span className={`text-xs font-semibold ${t.text}`}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// ── PASSENGER APP ──────────────────────────────────────
function PassengerApp({user,onLogout,dark,setDark}) {
  const t=T(dark);
  const [view,setView]=useState("home");
  const [pickup,setPickup]=useState("");
  const [dest,setDest]=useState("");
  const [vehicle,setVehicle]=useState("okada");
  const [fare,setFare]=useState(null);
  const [status,setStatus]=useState("idle");
  const [driver,setDriver]=useState(null);
  const [eta,setEta]=useState(0);
  const [history,setHistory]=useState([]);
  const [loading,setLoading]=useState(false);
  const [toast,setToast]=useState(null);
  const [payStatus,setPayStatus]=useState("idle");
  const [payMethod,setPayMethod]=useState(null);
  const [momoPhone,setMomoPhone]=useState(user.phone||"+233");
  const [email,setEmail]=useState("");
  const [showKyc,setShowKyc]=useState(!user.kycData&&!user.ghanaCard);
  const toast$=(msg,type="success")=>setToast({msg,type});

  useEffect(()=>{
    if(!pickup||!dest){setFare(null);return;}
    const v=VEHICLES.find(v=>v.id===vehicle);
    const km=parseFloat((2+Math.random()*13).toFixed(1));
    setFare({km,total:parseFloat((km*v.rate+3).toFixed(2)),dur:Math.ceil(km*3)});
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
        Array.from({length:6},(_,i)=>({id:i,from:LOCS[i*2%LOCS.length],to:LOCS[(i*2+1)%LOCS.length],fare:(Math.random()*20+5).toFixed(2),date:new Date(Date.now()-i*86400000*2).toLocaleDateString(),driver:"Kwame A.",rating:5,vehicle:VEHICLES[i%4].label,paid:["MoMo","Cash","Card","Pay Later"][i%4]}))
      ));
    }
  },[view,user.id]);

  const bookRide=async()=>{
    if(!pickup||!dest){toast$("Enter pickup & destination","error");return;}
    setLoading(true);setStatus("searching");
    try{await api.requestRide({userId:user.id,pickupLocation:{address:pickup,latitude:6.0998,longitude:0.1},destination:{address:dest,latitude:6.15,longitude:0.15},rideType:vehicle});}catch{}
    setTimeout(()=>{
      const v=VEHICLES.find(v=>v.id===vehicle);
      setDriver({name:"Kwame Asante",phone:"+233241234567",rating:4.9,vehicle:v.label,icon:v.icon,plate:"ER-1234-26",photo:"👨🏿‍🦱",rides:1247,id:"drv_001"});
      setStatus("matched");setEta(180);toast$(`${v.label} driver matched! ${v.icon}`);
    },3500);
    setLoading(false);
  };

  if(showKyc) return <KycVerify role="passenger" dark={dark} onVerified={()=>setShowKyc(false)}/>;

  const Nav=()=>(
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr}`} style={{display:"flex",justifyContent:"space-around",padding:"6px 0",zIndex:30}}>
      {[["home","🏠","Home"],["fintech","💎","Fintech"],["history","📋","History"],["profile","👤","Profile"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 10px",color:view===v?"#16a34a":dark?"#9ca3af":"#6b7280"}}>
          <span style={{fontSize:18}}>{ic}</span><span style={{fontSize:10,fontWeight:700,marginTop:1}}>{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`max-w-md mx-auto min-h-screen relative ${t.bg}`}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:"#16a34a",color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>🏍️</span><span style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:18}}>Okada Online</span></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setDark(!dark)} style={{padding:6,borderRadius:8,background:"rgba(255,255,255,0.15)"}}>{dark?<Sun className="w-4 h-4"/>:<Moon className="w-4 h-4"/>}</button>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#15803d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{user.profilePhoto||"👤"}</div>
        </div>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="fintech"&&<FintechHub user={user} role="passenger" dark={dark}/>}

        {view==="home"&&(
          <div style={{padding:16}}>
            {user.isInternational&&(
              <div style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",borderRadius:16,padding:"12px 14px",marginBottom:12,color:"#fff",display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:24}}>🌍</span>
                <div>
                  <p style={{fontWeight:700,fontSize:13}}>Welcome to Ghana! 🇬🇭</p>
                  <p style={{fontSize:11,color:"#c7d2fe"}}>Passport verified · {user.passport?.country} visitor · Pay Later enabled</p>
                </div>
              </div>
            )}
            <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{height:130,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",marginBottom:12,position:"relative",background:dark?"#1f2937":"linear-gradient(135deg,#f0fdf4,#eff6ff)"}}>
              <span style={{fontSize:40}}>{status==="ongoing"?"🏍️":"🗺️"}</span>
              <p className={`text-xs font-semibold mt-2 ${t.sub}`}>{status==="idle"?"Akosombo · Eastern Region":status==="searching"?"Finding drivers…":status==="matched"?"Driver on the way! 🏍️":status==="arrived"?"Driver arrived!":status==="ongoing"?"Ride in progress":"Done ✅"}</p>
              <div style={{position:"absolute",top:8,right:8}}><Badge color="green">● GPS Live</Badge></div>
            </div>

            <div className={`${t.card} rounded-2xl shadow p-4 border ${t.bdr}`} style={{display:"flex",flexDirection:"column",gap:12}}>
              <h2 className={`font-black text-base ${t.text}`}>📍 Book Your Ride</h2>
              {status==="idle"&&<>
                <div style={{position:"relative"}}>
                  <MapPin style={{position:"absolute",left:12,top:13,width:16,height:16,color:"#16a34a"}}/>
                  <input value={pickup} onChange={e=>setPickup(e.target.value)} list="locs" placeholder="Pickup location"
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{paddingLeft:36,display:"block",width:"100%"}}/>
                </div>
                <div style={{position:"relative"}}>
                  <Navigation style={{position:"absolute",left:12,top:13,width:16,height:16,color:"#ef4444"}}/>
                  <input value={dest} onChange={e=>setDest(e.target.value)} list="locs" placeholder="Destination"
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{paddingLeft:36,display:"block",width:"100%"}}/>
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
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span className={t.sub}>Distance</span><span className={`font-semibold ${t.text}`}>{fare.km} km · ~{fare.dur} min</span>
                    </div>
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
                  <button onClick={()=>setStatus("idle")} style={{marginTop:16,padding:"8px 20px",border:"1px solid #f87171",color:"#ef4444",borderRadius:12,fontSize:13,fontWeight:700}}>Cancel</button>
                </div>
              )}

              {(status==="matched"||status==="arrived")&&driver&&(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
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
                    {status==="matched"&&<div style={{textAlign:"center"}}><p style={{fontWeight:900,color:"#16a34a",fontSize:20}}>{Math.floor(eta/60)}:{String(eta%60).padStart(2,"0")}</p><p className={`text-xs ${t.sub}`}>ETA</p></div>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    <button onClick={()=>setStatus("idle")} style={{padding:"10px",border:"1px solid #f87171",color:"#ef4444",borderRadius:12,fontWeight:700,fontSize:12}}>Cancel</button>
                    <a href={`tel:${driver.phone}`} style={{padding:"10px",background:"#2563eb",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,textAlign:"center",display:"block"}}>📞 Call</a>
                    <button onClick={()=>setStatus("ongoing")} style={{padding:"10px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12}}>Start →</button>
                  </div>
                </div>
              )}

              {status==="ongoing"&&driver&&(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{background:"#2563eb",color:"#fff",borderRadius:12,padding:"8px",textAlign:"center",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:"#fff",animation:"pulse 2s infinite"}}/>Ride in progress
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:12,borderRadius:12,background:dark?"#374151":"#f9fafb"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:24}}>{driver.photo}</span>
                      <div><p className={`font-bold ${t.text}`}>{driver.name}</p><p className={`text-xs ${t.sub}`}>{driver.plate}</p></div>
                    </div>
                    <p style={{fontWeight:900,color:"#16a34a",fontSize:18}}>GH₵{fare?.total}</p>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <button onClick={()=>toast$("🚨 Emergency services notified!","error")} style={{padding:"12px",background:"#dc2626",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <AlertCircle style={{width:16,height:16}}/> SOS
                    </button>
                    <button onClick={()=>setPayStatus("selecting")} style={{padding:"12px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>Pay 💳</button>
                  </div>
                </div>
              )}
              {payStatus==="paid"&&(
                <div style={{textAlign:"center",padding:"16px 0"}}>
                  <div style={{fontSize:48,marginBottom:8}}>✅</div>
                  <p className={`font-black ${t.text}`}>Payment Complete!</p>
                  <p className={`text-xs ${t.sub} mt-1`}>Thanks for riding Okada Online 🇬🇭</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Payment Sheet ── */}
        {payStatus==="selecting"&&fare&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:60,display:"flex",alignItems:"flex-end",maxWidth:448,margin:"0 auto"}}>
            <div className={`${t.card} rounded-t-3xl p-6 w-full shadow-2xl`} style={{maxHeight:"90vh",overflowY:"auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <h3 className={`text-lg font-black ${t.text}`}>💳 Pay for Ride</h3>
                <button onClick={()=>setPayStatus("idle")}><X style={{width:20,height:20,color:"#9ca3af"}}/></button>
              </div>
              <p className={`text-xs ${t.sub} mb-3`}>{pickup} → {dest}</p>
              <div style={{background:dark?"#14532d":"#f0fdf4",borderRadius:12,padding:12,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span className={`font-semibold ${t.text}`}>Total</span>
                <span style={{fontWeight:900,color:"#16a34a",fontSize:22}}>GH₵{fare.total}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
                {[
                  {id:"mtn",      label:"MTN Mobile Money",   icon:"📱",color:"#ffcc00",text:"#000"},
                  {id:"vodafone", label:"Vodafone Cash",       icon:"📲",color:"#e60000",text:"#fff"},
                  {id:"airtel",   label:"AirtelTigo Money",    icon:"💳",color:"#ef4444",text:"#fff"},
                  {id:"card",     label:"Credit / Debit Card", icon:"🏦",color:"#2563eb",text:"#fff"},
                  {id:"cash",     label:"Pay with Cash",       icon:"💵",color:"#16a34a",text:"#fff"},
                  ...(user.payLater?.eligible?[{id:"paylater",label:"Pay Later (7 days)",icon:"⏳",color:"#7c3aed",text:"#fff"}]:[]),
                ].map(m=>(
                  <button key={m.id} onClick={()=>setPayMethod(m.id)}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:14,border:`2px solid ${payMethod===m.id?m.color:"#e5e7eb"}`,background:payMethod===m.id?m.color+"18":"transparent",textAlign:"left"}}>
                    <span style={{fontSize:22}}>{m.icon}</span>
                    <span className={`font-bold text-sm ${t.text}`}>{m.label}</span>
                    {payMethod===m.id&&<CheckCircle style={{width:16,height:16,color:m.color,marginLeft:"auto"}}/>}
                  </button>
                ))}
              </div>
              {["mtn","vodafone","airtel"].includes(payMethod)&&(
                <div style={{marginBottom:12}}>
                  <p className={`text-xs font-bold mb-1 ${t.sub}`}>MOMO NUMBER</p>
                  <input value={momoPhone} onChange={e=>setMomoPhone(e.target.value)}
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                    style={{display:"block",width:"100%"}} placeholder="+233XXXXXXXXX"/>
                </div>
              )}
              {payMethod==="card"&&(
                <div style={{marginBottom:12}}>
                  <p className={`text-xs font-bold mb-1 ${t.sub}`}>EMAIL</p>
                  <input value={email} onChange={e=>setEmail(e.target.value)} type="email"
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                    style={{display:"block",width:"100%"}} placeholder="your@email.com"/>
                </div>
              )}
              {payMethod==="cash"&&(
                <div style={{background:dark?"#374151":"#f9fafb",borderRadius:12,padding:12,marginBottom:12}}>
                  <p className={`font-bold text-sm ${t.text}`} style={{marginBottom:4}}>💵 Pay driver directly</p>
                  <p className={`text-xs ${t.sub}`}>Hand GH₵{fare.total} cash. Driver must confirm on their app before ride closes.</p>
                </div>
              )}
              {payMethod==="paylater"&&(
                <div style={{background:dark?"#1e1b4b":"#eef2ff",borderRadius:12,padding:12,marginBottom:12}}>
                  <p style={{fontWeight:700,fontSize:13,color:"#7c3aed",marginBottom:4}}>⏳ Pay Later — 7 day defer</p>
                  <p className={`text-xs ${t.sub}`}>GH₵{fare.total} deducted from your Pay Later limit. Auto-charged to MoMo in 7 days.</p>
                </div>
              )}
              <button disabled={!payMethod} onClick={async()=>{
                if(!payMethod) return;
                if(payMethod==="cash"){
                  setPayStatus("awaiting-driver");
                  setTimeout(()=>{setPayStatus("paid");setStatus("idle");setDriver(null);setPickup("");setDest("");setFare(null);toast$("Cash confirmed by driver ✅");setTimeout(()=>setPayStatus("idle"),2500);},4000);
                  return;
                }
                if(payMethod==="paylater"){
                  try{await api.payLaterRequest("ride_"+Date.now(),user.id);}catch{}
                  setPayStatus("paid");setStatus("idle");setDriver(null);setPickup("");setDest("");
                  toast$(`GH₵${fare.total} deferred — Pay Later used ⏳`);setTimeout(()=>setPayStatus("idle"),3000);
                  return;
                }
                setPayStatus("processing");
                try{await api.initPayment("ride_"+Date.now(),fare.total,email||user.phone+"@okada.gh",momoPhone);}catch{}
                setTimeout(()=>{setPayStatus("paid");setStatus("idle");setDriver(null);setPickup("");setDest("");setFare(null);toast$(`GH₵${fare.total} paid via ${payMethod.toUpperCase()} ✅`);setTimeout(()=>setPayStatus("idle"),3000);},2500);
              }} style={{width:"100%",padding:"14px",background:!payMethod?"#9ca3af":"#16a34a",color:"#fff",borderRadius:16,fontWeight:900,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:!payMethod?0.5:1}}>
                {payStatus==="processing"?<><Spin/>Processing…</>:payMethod==="cash"?`Notify Driver — GH₵${fare.total} Cash`:payMethod==="paylater"?`Defer GH₵${fare.total} — Pay Later`:`Pay GH₵${fare.total} via Paystack 🔒`}
              </button>
              <p className={`text-xs text-center mt-2 ${t.sub}`}>🔒 Secured by Paystack · MTN · Vodafone · Airtel</p>
            </div>
          </div>
        )}

        {payStatus==="awaiting-driver"&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",maxWidth:448,margin:"0 auto"}}>
            <div className={`${t.card} rounded-3xl p-8 mx-4 shadow-2xl`} style={{textAlign:"center"}}>
              <div style={{width:52,height:52,border:"4px solid #ca8a04",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
              <p className={`font-black text-lg ${t.text}`}>Waiting for Driver…</p>
              <p className={`text-sm mt-2 ${t.sub}`}>Driver must confirm GH₵{fare?.total} cash received</p>
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
                    <div style={{display:"flex",gap:6,marginTop:2}}>
                      <p className={`text-xs ${t.sub}`}>{r.date} · {r.driver}</p>
                      <Badge color={r.paid==="Pay Later"?"indigo":r.paid==="Cash"?"yellow":"green"}>{r.paid}</Badge>
                    </div>
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
              <h2 className={`text-xl font-black ${t.text}`}>{user.name}</h2>
              <p className={t.sub}>{user.phone}</p>
              <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:8,flexWrap:"wrap"}}>
                <Badge color="green">✅ KYC Verified</Badge>
                {user.isInternational&&<Badge color="indigo">🌍 {user.passport?.country}</Badge>}
                {user.payLater?.eligible&&<Badge color="purple">⏳ Pay Later</Badge>}
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
function DriverApp({user,onLogout,dark,setDark}) {
  const t=T(dark);
  const [view,setView]=useState("home");
  const [online,setOnline]=useState(false);
  const [incoming,setIncoming]=useState(null);
  const [activeRide,setActiveRide]=useState(null);
  const [cashConfirm,setCashConfirm]=useState(null);
  const [earnings,setEarnings]=useState({today:0,week:0,total:0,rides:0});
  const [wallet,setWallet]=useState({available:0,pending:0});
  const [showWithdraw,setShowWithdraw]=useState(false);
  const [showFuelCode,setShowFuelCode]=useState(false);
  const [fuelCode]=useState("FUEL-"+Math.random().toString(36).substr(2,4).toUpperCase()+"-"+Math.random().toString(36).substr(2,4).toUpperCase());
  const [showKyc,setShowKyc]=useState(!user.kycData&&!user.ghanaCard);
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  useEffect(()=>{
    if(!online||incoming||activeRide||cashConfirm) return;
    const tm=setTimeout(()=>setIncoming({id:"ride_"+Date.now(),passenger:"Ama Owusu",phone:"+233205556789",from:"Akosombo",to:"Atimpoku",dist:"4.2 km",dur:"12 min",fare:"GH₵13.50",earn:"GH₵1.35",payMethod:["mtn","cash","vodafone"][Math.floor(Math.random()*3)]}),5000);
    return()=>clearTimeout(tm);
  },[online,incoming,activeRide,cashConfirm]);

  useEffect(()=>{
    if(!online) return;
    const iv=setInterval(()=>api.updateLocation(user.id,6.0998+Math.random()*0.01,0.1+Math.random()*0.01).catch(()=>{}),5000);
    return()=>clearInterval(iv);
  },[online,user.id]);

  useEffect(()=>{
    if(!activeRide||activeRide.payMethod!=="cash") return;
    const tm=setTimeout(()=>setCashConfirm(activeRide),8000);
    return()=>clearTimeout(tm);
  },[activeRide]);

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

  const confirmCash=async()=>{
    const earned=parseFloat((cashConfirm.earn||"GH₵1.35").replace("GH₵",""));
    try{await api.confirmCashPayment(cashConfirm.id,user.id);}catch{}
    setEarnings(e=>({today:+(e.today+earned).toFixed(2),week:+(e.week+earned).toFixed(2),total:+(e.total+earned).toFixed(2),rides:e.rides+1}));
    setWallet(w=>({available:w.available,pending:+(w.pending+earned).toFixed(2)}));
    setTimeout(()=>setWallet(w=>({available:+(w.available+earned).toFixed(2),pending:Math.max(0,+(w.pending-earned).toFixed(2))})),5000);
    setCashConfirm(null);setActiveRide(null);
    toast$(`Cash confirmed! GH₵${earned.toFixed(2)} earned 💰`);
  };

  const complete=()=>{
    const earned=parseFloat((activeRide.earn||"GH₵1.35").replace("GH₵",""));
    setEarnings(e=>({today:+(e.today+earned).toFixed(2),week:+(e.week+earned).toFixed(2),total:+(e.total+earned).toFixed(2),rides:e.rides+1}));
    setWallet(w=>({available:w.available,pending:+(w.pending+earned).toFixed(2)}));
    setTimeout(()=>setWallet(w=>({available:+(w.available+earned).toFixed(2),pending:Math.max(0,+(w.pending-earned).toFixed(2))})),5000);
    setActiveRide(null);
    toast$(`Ride complete! +GH₵${earned.toFixed(2)} (24hr hold) 💰`);
  };

  if(showKyc) return <KycVerify role="driver" dark={dark} onVerified={()=>setShowKyc(false)}/>;

  const Nav=()=>(
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr}`} style={{display:"flex",justifyContent:"space-around",padding:"6px 0",zIndex:30}}>
      {[["home","🏠","Home"],["fintech","💎","Fintech"],["dto","🏍️","Own"],["earnings","💰","Earn"],["profile","👤","Me"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 8px",color:view===v?"#16a34a":dark?"#9ca3af":"#6b7280"}}>
          <span style={{fontSize:18}}>{ic}</span><span style={{fontSize:10,fontWeight:700,marginTop:1}}>{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`max-w-md mx-auto min-h-screen ${t.bg}`}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      {showWithdraw&&<WithdrawSheet available={wallet.available} pending={wallet.pending} userId={user.id} onClose={()=>setShowWithdraw(false)} dark={dark}/>}

      {/* Cash confirm overlay */}
      {cashConfirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",maxWidth:448,margin:"0 auto",padding:"0 20px"}}>
          <div className={`${t.card} rounded-3xl p-6 w-full shadow-2xl`}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:44,marginBottom:8}}>💵</div>
              <h3 className={`font-black text-lg ${t.text}`}>Cash Confirmation</h3>
              <p className={`text-sm ${t.sub} mt-1`}>{cashConfirm.passenger} says they paid cash</p>
            </div>
            <div style={{background:dark?"#374151":"#f0fdf4",borderRadius:14,padding:"16px",textAlign:"center",marginBottom:14}}>
              <p style={{fontWeight:900,color:"#16a34a",fontSize:32}}>GH₵{cashConfirm.fare?.replace("GH₵","")}</p>
              <p className={`text-xs ${t.sub}`}>{cashConfirm.from} → {cashConfirm.to}</p>
            </div>
            <div style={{background:dark?"#1c1917":"#fef3c7",borderRadius:12,padding:"10px 12px",marginBottom:14,display:"flex",gap:8}}>
              <AlertCircle style={{width:14,height:14,color:"#ca8a04",flexShrink:0,marginTop:1}}/>
              <p style={{fontSize:11,color:"#92400e"}}>Only confirm if cash physically received. Cannot be undone.</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>{setCashConfirm(null);toast$("Dispute raised — admin will review","error");}}
                style={{padding:"12px",border:"1px solid #f87171",color:"#ef4444",borderRadius:14,fontWeight:700,fontSize:13}}>❌ Not Received</button>
              <button onClick={confirmCash} style={{padding:"12px",background:"#16a34a",color:"#fff",borderRadius:14,fontWeight:900,fontSize:13}}>✅ Confirm Cash</button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming ride */}
      {incoming&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:50,display:"flex",alignItems:"flex-end",maxWidth:448,margin:"0 auto"}}>
          <div className={`${t.card} rounded-t-3xl p-6 w-full shadow-2xl`}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 className={`text-lg font-black ${t.text}`}>🏍️ New Ride!</h3><p className={t.sub} style={{fontSize:12}}>Respond in 30 seconds</p></div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <Badge color="green">+{incoming.earn}</Badge>
                <Badge color={incoming.payMethod==="cash"?"yellow":"blue"}>{incoming.payMethod==="cash"?"💵 Cash":"💳 MoMo"}</Badge>
              </div>
            </div>
            <div className={`${dark?"bg-gray-700":"bg-gray-50"} rounded-2xl p-3 mb-4`} style={{display:"flex",flexDirection:"column",gap:8,fontSize:13}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><MapPin style={{width:14,height:14,color:"#16a34a"}}/><span className={t.text}>{incoming.from}</span></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}><Navigation style={{width:14,height:14,color:"#ef4444"}}/><span className={t.text}>{incoming.to}</span></div>
              <div style={{display:"flex",gap:16,paddingTop:4}}>
                <span className={t.sub}>📏 {incoming.dist}</span><span className={t.sub}>⏱️ {incoming.dur}</span>
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
          <div style={{width:7,height:7,borderRadius:"50%",background:online?"#fff":"#9ca3af"}}/>{online?"ONLINE":"OFFLINE"}
        </div>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="fintech"&&<FintechHub user={user} role="driver" dark={dark}/>}
        {view==="dto"&&<DriveToOwn user={user} role="driver" dark={dark} onBack={()=>setView("home")}/>}

        {view==="home"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
            <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{height:140,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",background:dark?"#1f2937":"#f0fdf4"}}>
              <span style={{fontSize:44}}>{online?"🏍️":"⏸️"}</span>
              <p className={`text-sm font-semibold mt-2 ${t.sub}`}>{online?"Broadcasting GPS…":"Go online to earn"}</p>
              {online&&<div style={{position:"absolute",top:8,right:8}}><Badge color="green">● Live</Badge></div>}
            </div>
            <button onClick={toggleOnline} style={{width:"100%",padding:"14px",borderRadius:16,fontWeight:900,fontSize:16,color:"#fff",background:online?"#dc2626":"#16a34a"}}>
              {online?"🔴 Go Offline":"🟢 Go Online — Start Earning"}
            </button>

            {/* Wallet */}
            <div className={`${t.card} rounded-2xl p-4 border-2 border-green-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <p style={{color:"#16a34a",fontWeight:900,fontSize:13}}>💰 My Wallet</p>
                <button onClick={()=>setShowWithdraw(true)} style={{padding:"6px 12px",background:"#16a34a",color:"#fff",borderRadius:10,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                  <ArrowDownCircle style={{width:12,height:12}}/> Withdraw
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{background:"#f0fdf4",borderRadius:12,padding:"10px",textAlign:"center"}}>
                  <p style={{fontSize:10,color:"#16a34a",fontWeight:700}}>AVAILABLE</p>
                  <p style={{fontWeight:900,color:"#16a34a",fontSize:20}}>GH₵{wallet.available.toFixed(2)}</p>
                </div>
                <div style={{background:dark?"#374151":"#fefce8",borderRadius:12,padding:"10px",textAlign:"center"}}>
                  <p style={{fontSize:10,color:"#ca8a04",fontWeight:700}}>PENDING 24H</p>
                  <p style={{fontWeight:900,color:"#ca8a04",fontSize:20}}>GH₵{wallet.pending.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <StatCard icon="💰" label="Today" value={"GH₵"+earnings.today} color="green" dark={dark}/>
              <StatCard icon="🏍️" label="Rides" value={earnings.rides} color="blue" dark={dark}/>
            </div>

            {activeRide&&(
              <div className={`${t.card} rounded-2xl p-4 border-2 border-green-500`}>
                <p style={{color:"#16a34a",fontWeight:900,fontSize:13,marginBottom:10}}>● Active Ride</p>
                <div style={{background:dark?"#374151":"#f9fafb",borderRadius:12,padding:12,marginBottom:10,display:"flex",flexDirection:"column",gap:6,fontSize:13}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><MapPin style={{width:12,height:12,color:"#16a34a"}}/><span className={t.text}>{activeRide.from}</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><Navigation style={{width:12,height:12,color:"#ef4444"}}/><span className={t.text}>{activeRide.to}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{color:"#16a34a",fontWeight:700}}>Earn: {activeRide.earn}</span>
                    <Badge color={activeRide.payMethod==="cash"?"yellow":"blue"}>{activeRide.payMethod==="cash"?"💵 Cash":"💳 MoMo"}</Badge>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <a href={`tel:${activeRide.phone}`} style={{padding:"10px",background:"#2563eb",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,textAlign:"center",display:"block"}}>📞 Call</a>
                  <button onClick={complete} style={{padding:"10px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12}}>✅ Complete</button>
                </div>
              </div>
            )}

            {/* Fuel Pool */}
            <div className={`${t.card} rounded-2xl p-4 border-2 border-yellow-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:22}}>⛽</span><span className={`font-black ${t.text}`}>Fuel Pool</span></div>
                <span style={{fontWeight:900,color:"#ca8a04",fontSize:20}}>GH₵{(earnings.total*0.05).toFixed(2)}</span>
              </div>
              <p className={`text-xs ${t.sub} mb-3`}>5% of every ride. Use at registered stations.</p>
              <button onClick={()=>setShowFuelCode(!showFuelCode)}
                style={{width:"100%",padding:"10px",background:"#ca8a04",color:"#fff",borderRadius:12,fontWeight:900,fontSize:13}}>
                {showFuelCode?"Hide Code":"⛽ Show Fuel Code"}
              </button>
              {showFuelCode&&(
                <div style={{marginTop:10,textAlign:"center",padding:"14px",background:dark?"#374151":"#fefce8",borderRadius:12,border:"2px dashed #ca8a04"}}>
                  <p className={`text-xs ${t.sub} mb-1`}>Station code — valid 10 minutes</p>
                  <p style={{fontFamily:"monospace",fontSize:24,fontWeight:900,color:"#ca8a04",letterSpacing:"0.15em"}}>{fuelCode}</p>
                </div>
              )}
            </div>

            {/* Maintenance Pool */}
            <div className={`${t.card} rounded-2xl p-4 border-2 border-orange-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:22}}>🔧</span><span className={`font-black ${t.text}`}>Maintenance Pool</span></div>
                <span style={{fontWeight:900,color:"#ea580c",fontSize:20}}>GH₵{(earnings.total*0.05).toFixed(2)}</span>
              </div>
              <p className={`text-xs ${t.sub}`}>5% auto-collected. Owner approves mechanic payments.</p>
            </div>
          </div>
        )}

        {view==="earnings"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 className={`font-black text-lg ${t.text}`}>💰 Earnings & Wallet</h2>
              <button onClick={()=>setShowWithdraw(true)} style={{padding:"8px 12px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                <ArrowDownCircle style={{width:12,height:12}}/> Withdraw
              </button>
            </div>
            <div className={`${t.card} rounded-2xl p-5 border ${t.bdr}`} style={{textAlign:"center"}}>
              <p className={`text-sm ${t.sub}`}>Total Lifetime (your 10%)</p>
              <p style={{fontSize:40,fontWeight:900,color:"#16a34a",margin:"4px 0"}}>GH₵{earnings.total}</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div className={`${t.card} rounded-2xl p-4 border-2 border-green-500`} style={{textAlign:"center"}}>
                <p style={{fontSize:10,color:"#16a34a",fontWeight:700}}>AVAILABLE NOW</p>
                <p style={{fontWeight:900,color:"#16a34a",fontSize:22}}>GH₵{wallet.available.toFixed(2)}</p>
              </div>
              <div className={`${t.card} rounded-2xl p-4 border-2 border-yellow-400`} style={{textAlign:"center"}}>
                <p style={{fontSize:10,color:"#ca8a04",fontWeight:700}}>PENDING 24H</p>
                <p style={{fontWeight:900,color:"#ca8a04",fontSize:22}}>GH₵{wallet.pending.toFixed(2)}</p>
              </div>
            </div>
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`} style={{display:"flex",gap:8}}>
              <Clock style={{width:16,height:16,color:"#ca8a04",flexShrink:0,marginTop:2}}/>
              <p className={`text-xs ${t.sub}`}>Earnings held 24 hours before withdrawal — fraud protection, payment verification, dispute resolution. Your money is always safe and recorded.</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {[["Today","GH₵"+earnings.today],["This Week","GH₵"+earnings.week],["Rides",earnings.rides]].map(([l,v])=>(
                <div key={l} className={`${t.card} rounded-2xl p-4 border ${t.bdr}`} style={{textAlign:"center"}}>
                  <p className={`text-lg font-black ${t.text}`}>{v}</p>
                  <p className={`text-xs ${t.sub}`}>{l}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {view==="profile"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
            <div className={`${t.card} rounded-2xl p-6 border ${t.bdr}`} style={{textAlign:"center"}}>
              <div style={{fontSize:52,marginBottom:8}}>{user.profilePhoto||"👨🏿"}</div>
              <h2 className={`text-xl font-black ${t.text}`}>{user.name}</h2>
              <p className={t.sub}>{user.phone}</p>
              <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:8,flexWrap:"wrap"}}>
                <Badge color="green">✅ KYC Verified</Badge>
                <Badge color="blue">🪪 Ghana Card</Badge>
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
function OwnerApp({user,onLogout,dark,setDark}) {
  const t=T(dark);
  const [view,setView]=useState("dashboard");
  const [stats,setStats]=useState({todayRevenue:450,weekRevenue:2850,totalRevenue:18200,activeDrivers:2,totalDrivers:3,fuelPool:180,maintenancePool:120});
  const [wallet,setWallet]=useState({available:8540,pending:1820});
  const [showCode,setShowCode]=useState(false);
  const [showWithdraw,setShowWithdraw]=useState(false);
  const [showKyc,setShowKyc]=useState(!user.kycData&&!user.ghanaCard);
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  useEffect(()=>{api.getOwnerDash(user.id).then(r=>setStats(r.data||stats)).catch(()=>{});},[]);

  if(showKyc) return <KycVerify role="owner" dark={dark} onVerified={()=>setShowKyc(false)}/>;

  const Nav=()=>(
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr}`} style={{display:"flex",justifyContent:"space-around",padding:"6px 0",zIndex:30}}>
      {[["dashboard","📊","Dashboard"],["fintech","💎","Fintech"],["dto","🏍️","Own"],["fleet","🚗","Fleet"],["pools","⛽","Pools"]].map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 8px",color:view===v?"#2563eb":dark?"#9ca3af":"#6b7280"}}>
          <span style={{fontSize:18}}>{ic}</span><span style={{fontSize:10,fontWeight:700,marginTop:1}}>{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`max-w-md mx-auto min-h-screen relative ${t.bg}`}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      {showWithdraw&&<WithdrawSheet available={wallet.available} pending={wallet.pending} userId={user.id} onClose={()=>setShowWithdraw(false)} dark={dark}/>}

      <div style={{background:"linear-gradient(90deg,#1d4ed8,#2563eb)",color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><Building2 style={{width:20,height:20}}/><span style={{fontFamily:"Syne,sans-serif",fontWeight:900}}>Owner Dashboard</span></div>
        <button onClick={()=>setDark(!dark)} style={{padding:6,borderRadius:8,background:"rgba(255,255,255,0.15)"}}>{dark?<Sun className="w-4 h-4"/>:<Moon className="w-4 h-4"/>}</button>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="fintech"&&<FintechHub user={user} role="owner" dark={dark}/>}
        {view==="dto"&&<DriveToOwn user={user} role="owner" dark={dark} onBack={()=>setView("dashboard")}/>}
        {view==="dashboard"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
            <div className={`${t.card} rounded-2xl p-4 border-2 border-blue-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <p style={{color:"#2563eb",fontWeight:900,fontSize:13}}>💰 My Wallet</p>
                <button onClick={()=>setShowWithdraw(true)} style={{padding:"6px 12px",background:"#2563eb",color:"#fff",borderRadius:10,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                  <ArrowDownCircle style={{width:12,height:12}}/> Withdraw
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{background:"#eff6ff",borderRadius:12,padding:"10px",textAlign:"center"}}>
                  <p style={{fontSize:10,color:"#2563eb",fontWeight:700}}>AVAILABLE</p>
                  <p style={{fontWeight:900,color:"#2563eb",fontSize:20}}>GH₵{wallet.available.toFixed(2)}</p>
                </div>
                <div style={{background:dark?"#374151":"#fefce8",borderRadius:12,padding:"10px",textAlign:"center"}}>
                  <p style={{fontSize:10,color:"#ca8a04",fontWeight:700}}>PENDING 24H</p>
                  <p style={{fontWeight:900,color:"#ca8a04",fontSize:20}}>GH₵{wallet.pending.toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className={`${t.card} rounded-2xl p-4 border-2 border-blue-400`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div><p style={{color:"#2563eb",fontWeight:900,fontSize:13}}>🔑 Your Owner Code</p><p className={`text-xs ${t.sub}`}>Share with your drivers</p></div>
                <button onClick={()=>setShowCode(!showCode)}>{showCode?<EyeOff style={{width:16,height:16,color:"#9ca3af"}}/>:<Eye style={{width:16,height:16,color:"#9ca3af"}}/>}</button>
              </div>
              {showCode?(
                <div style={{display:"flex",gap:8}}>
                  <div className={`flex-1 px-4 py-3 border rounded-xl ${t.inp} font-mono font-black text-center text-lg`}>{user.ownerCode||"OWN??????"}</div>
                  <button onClick={()=>{navigator.clipboard?.writeText(user.ownerCode||"");toast$("Copied! 📋");}} style={{padding:"12px",background:"#2563eb",color:"#fff",borderRadius:12}}><Copy style={{width:18,height:18}}/></button>
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
              {[["Your share (50%)","GH₵"+(stats.totalRevenue*0.50).toFixed(0),"#16a34a"],["Driver earnings (25%)","GH₵"+(stats.totalRevenue*0.10).toFixed(0),"#2563eb"],["Fuel pool (5%)","GH₵"+(stats.totalRevenue*0.05).toFixed(0),"#ca8a04"],["Maintenance (5%)","GH₵"+(stats.totalRevenue*0.05).toFixed(0),"#ea580c"],["Platform (15%)","GH₵"+(stats.totalRevenue*0.15).toFixed(0),"#9ca3af"]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",paddingBottom:8,borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,marginBottom:8,fontSize:13}}>
                  <span className={t.sub}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                </div>
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
                  <div style={{flex:1}}><p className={`font-bold ${t.text}`}>{VEHICLES.find(x=>x.id===v.type)?.label}</p><p className={`text-xs font-mono ${t.sub}`}>{v.plate}</p></div>
                  <Badge color="green">Active</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
        {view==="pools"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
            <h2 className={`font-black text-lg ${t.text}`}>⛽ Fuel & Maintenance Pools</h2>
            {[{icon:<Fuel style={{width:20,height:20,color:"#ca8a04"}}/>,label:"Fuel Pool",val:stats.fuelPool,color:"#ca8a04",border:"border-yellow-500",items:["🔒 Locked — fuel stations only","⛽ Driver code at pump","📊 Full transaction log"]},
              {icon:<Wrench style={{width:20,height:20,color:"#ea580c"}}/>,label:"Maintenance Pool",val:stats.maintenancePool,color:"#ea580c",border:"border-orange-500",items:["🔧 Service due alerts","✅ You approve payments","📱 Direct to garages"]}
            ].map(p=>(
              <div key={p.label} className={`${t.card} rounded-2xl p-4 border-2 ${p.border}`}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>{p.icon}<span className={`font-black ${t.text}`}>{p.label}</span></div>
                  <span style={{fontSize:22,fontWeight:900,color:p.color}}>GH₵{p.val}</span>
                </div>
                <div className={`rounded-xl p-3 text-xs ${dark?"bg-gray-700":"bg-gray-50"}`}>
                  {p.items.map(i=><p key={i} className={t.text} style={{marginBottom:3}}>{i}</p>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Nav/>
    </div>
  );
}
// ── ADMIN APP ──────────────────────────────────────────
function AdminApp({user,onLogout,dark,setDark}) {
  const t=T(dark);
  const [view,setView]=useState("overview");
  const [stats,setStats]=useState({totalRides:5432,activeRides:23,totalDrivers:87,onlineDrivers:34,revenue:18450,commission:2767,users:1247,owners:42,pendingKyc:14,totalLoans:32,activePolicies:67});
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});
  useEffect(()=>{api.getStats().then(r=>setStats(r.data||r)).catch(()=>{});},[]);

  const liveRides=[
    {id:"R-001",pax:"Ama O.",  driver:"Kwame A.",from:"Akosombo",to:"Atimpoku",fare:"₵13.50",status:"ongoing",  pay:"MoMo"},
    {id:"R-002",pax:"Kofi M.", driver:"Yaw M.",  from:"Kpong",   to:"Asesewa", fare:"₵9.00", status:"searching",pay:"Cash"},
    {id:"R-003",pax:"Abena T.",driver:"Akosua S.",from:"Odumase",to:"Somanya", fare:"₵11.00",status:"matched",  pay:"PayLater"},
    {id:"R-004",pax:"Kweku B.",driver:"Kofi A.", from:"Atimpoku",to:"Senchi",  fare:"₵7.00", status:"ongoing",  pay:"Card"},
  ];
  const drivers=[
    {name:"Kwame Asante",  phone:"+233241234567",plate:"ER-1234-26",rating:4.9,rides:1247,online:true, earn:4250,kyc:"GHA-123456789-1",loan:800},
    {name:"Yaw Mensah",    phone:"+233209876543",plate:"ER-5678-26",rating:4.8,rides:876, online:true, earn:3890,kyc:"GHA-987654321-2",loan:0},
    {name:"Akosua Sarpong",phone:"+233285556789",plate:"ER-9012-26",rating:4.7,rides:534, online:false,earn:2650,kyc:"Pending",loan:0},
    {name:"Kofi Adjei",    phone:"+233544444444",plate:"ER-3456-26",rating:4.6,rides:289, online:true, earn:1780,kyc:"A12345678",loan:500},
  ];
  const kycQueue=[
    {name:"Kofi Adjei",    role:"Driver",    type:"Ghana Card",  time:"2h ago"},
    {name:"Abena Tetteh",  role:"Owner",     type:"Ghana Card",  time:"4h ago"},
    {name:"James Wilson",  role:"Passenger", type:"Passport 🛂",time:"5h ago"},
    {name:"Sarah Chen",    role:"Passenger", type:"Passport 🛂",time:"6h ago"},
    {name:"Yaw Asare",     role:"Driver",    type:"Ghana Card",  time:"8h ago"},
  ];
  const withdrawals=[
    {name:"Kwame Asante",amount:350,method:"MTN MoMo",status:"completed",time:"2h ago"},
    {name:"Yaw Mensah",  amount:200,method:"Vodafone", status:"completed",time:"5h ago"},
    {name:"Ama Owusu",   amount:180,method:"MTN MoMo",status:"pending",  time:"Just now"},
    {name:"Kofi Adjei",  amount:120,method:"AirtelTigo",status:"pending", time:"30m ago"},
  ];
  const loans=[
    {name:"Kwame Asante",amount:800,remaining:520,purpose:"Okada Repair",status:"active",rate:"3%/ride"},
    {name:"Kofi Adjei",  amount:500,remaining:500,purpose:"Fuel Stock",  status:"pending",rate:"3%/ride"},
    {name:"Yaw Mensah",  amount:1200,remaining:0, purpose:"Veh. Repair", status:"paid",   rate:"—"},
  ];
  const statusColor={ongoing:"green",searching:"blue",matched:"yellow",completed:"gray"};
  const tabs=[["overview","📊","Overview"],["rides","🏍️","Rides"],["drivers","👥","Drivers"],["fintech","💎","Fintech"],["kyc","🪪","KYC"]];

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
      <div className={`${t.card} border-b ${t.bdr}`} style={{display:"flex",overflowX:"auto",position:"sticky",top:48,zIndex:10}}>
        {tabs.map(([v,ic,lb])=>(
          <button key={v} onClick={()=>setView(v)} style={{flex:"0 0 auto",padding:"10px 14px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,fontSize:10,fontWeight:700,color:view===v?"#16a34a":dark?"#9ca3af":"#6b7280",borderBottom:view===v?"2px solid #16a34a":"2px solid transparent",whiteSpace:"nowrap"}}>
            <span style={{fontSize:16}}>{ic}</span>{lb}
          </button>
        ))}
      </div>

      <div style={{paddingBottom:24}}>

        {view==="overview"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 className={`font-black text-lg ${t.text}`}>Live Dashboard</h2>
              <Badge color="green">● Real-time</Badge>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <StatCard icon="🏍️" label="Total Rides" value={stats.totalRides.toLocaleString()} color="green" dark={dark}/>
              <StatCard icon="🟢" label="Active Now" value={stats.activeRides} color="blue" dark={dark}/>
              <StatCard icon="👥" label="Drivers" value={stats.totalDrivers} color="purple" dark={dark}/>
              <StatCard icon="🪪" label="KYC Pending" value={stats.pendingKyc||14} sub="Awaiting review" color="yellow" dark={dark}/>
              <StatCard icon="💳" label="Active Loans" value={stats.totalLoans||32} color="indigo" dark={dark}/>
              <StatCard icon="🛡️" label="Insured" value={stats.activePolicies||67} sub="Active policies" color="teal" dark={dark}/>
            </div>
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <h3 className={`font-bold mb-3 ${t.text}`}>💰 Platform Economics</h3>
              {[["Total GMV","₵"+stats.revenue.toLocaleString(),"#16a34a"],["Platform 15%","₵"+stats.commission.toLocaleString(),"#2563eb"],["Owner payouts 50%","₵"+(stats.revenue*0.50).toFixed(0),"#9333ea"],["Driver payouts 25%","₵"+(stats.revenue*0.25).toFixed(0),"#ea580c"],["Fuel pools 5%","₵"+(stats.revenue*0.05).toFixed(0),"#ca8a04"],["Maintenance 5%","₵"+(stats.revenue*0.05).toFixed(0),"#f97316"]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",paddingBottom:8,borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,marginBottom:8,fontSize:13}}>
                  <span className={t.sub}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view==="rides"&&(
          <div style={{padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <h2 className={`font-black text-lg ${t.text}`}>Live Rides</h2>
              <button onClick={()=>toast$("Export ready 📊")} style={{fontSize:12,color:"#16a34a",fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                <Download style={{width:12,height:12}}/>Export
              </button>
            </div>
            {liveRides.map(r=>(
              <div key={r.id} className={`${t.card} rounded-2xl p-4 border ${t.bdr} mb-3`}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontFamily:"monospace",fontSize:11,fontWeight:700}} className={t.sub}>{r.id}</span>
                  <div style={{display:"flex",gap:4}}>
                    <Badge color={statusColor[r.status]||"gray"}>{r.status}</Badge>
                    <Badge color={r.pay==="Cash"?"yellow":r.pay==="PayLater"?"purple":"blue"}>{r.pay}</Badge>
                  </div>
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
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:"#dcfce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>👨🏿</div>
                  <div style={{flex:1}}>
                    <p className={`font-black ${t.text}`}>{d.name}</p>
                    <p style={{fontSize:11,fontFamily:"monospace"}} className={t.sub}>{d.plate}</p>
                    <div style={{display:"flex",gap:4,marginTop:4,flexWrap:"wrap"}}>
                      <Badge color={d.online?"green":"gray"}>{d.online?"Online":"Offline"}</Badge>
                      <Badge color={d.kyc==="Pending"?"yellow":"blue"}>{d.kyc==="Pending"?"🪪 KYC Pending":"🪪 Verified"}</Badge>
                      {d.loan>0&&<Badge color="indigo">Loan GH₵{d.loan}</Badge>}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}><p style={{fontWeight:900,color:"#16a34a"}}>₵{d.earn}</p><p style={{fontSize:11}} className={t.sub}>{d.rides} rides</p></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  <button style={{padding:"8px",background:"#eff6ff",color:"#2563eb",borderRadius:10,fontWeight:700,fontSize:11}}>Details</button>
                  <button style={{padding:"8px",background:d.online?"#fef2f2":"#f0fdf4",color:d.online?"#ef4444":"#16a34a",borderRadius:10,fontWeight:700,fontSize:11}}>{d.online?"Suspend":"Activate"}</button>
                  <button onClick={()=>toast$(`SMS sent to ${d.name}`)} style={{padding:"8px",background:dark?"#374151":"#f9fafb",color:"#374151",borderRadius:10,fontWeight:700,fontSize:11}}>📱 SMS</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {view==="fintech"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
            <h2 className={`font-black text-lg ${t.text}`}>💎 Fintech Overview</h2>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <StatCard icon="🏦" label="Total Savings" value="GH₵12,450" color="indigo" dark={dark}/>
              <StatCard icon="💳" label="Loans Issued" value="GH₵38,200" color="purple" dark={dark}/>
              <StatCard icon="🛡️" label="Premiums/mo" value="GH₵4,125" color="teal" dark={dark}/>
              <StatCard icon="⏳" label="Pay Later bal" value="GH₵2,340" color="orange" dark={dark}/>
            </div>

            {/* Loans table */}
            <div className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
              <div style={{padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,display:"flex",alignItems:"center",gap:8}}>
                <Landmark style={{width:16,height:16,color:"#7c3aed"}}/>
                <span className={`font-black text-sm ${t.text}`}>Active Loans</span>
              </div>
              {loans.map((l,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
                  <div>
                    <p className={`font-bold text-sm ${t.text}`}>{l.name}</p>
                    <p className={`text-xs ${t.sub}`}>{l.purpose} · {l.rate}</p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{fontWeight:900,color:"#7c3aed"}}>GH₵{l.remaining}/{l.amount}</p>
                    <Badge color={l.status==="paid"?"green":l.status==="active"?"blue":"yellow"}>{l.status}</Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Withdrawals */}
            <div className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
              <div style={{padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,display:"flex",alignItems:"center",gap:8}}>
                <ArrowDownCircle style={{width:16,height:16,color:"#16a34a"}}/>
                <span className={`font-black text-sm ${t.text}`}>Recent Withdrawals</span>
              </div>
              {withdrawals.map((w,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
                  <div><p className={`font-bold text-sm ${t.text}`}>{w.name}</p><p className={`text-xs ${t.sub}`}>{w.method} · {w.time}</p></div>
                  <div style={{textAlign:"right"}}><p style={{fontWeight:900,color:"#16a34a"}}>GH₵{w.amount}</p><Badge color={w.status==="completed"?"green":"yellow"}>{w.status}</Badge></div>
                </div>
              ))}
            </div>

            {/* System status */}
            {[
              {title:"Paystack",icon:"💳",items:[["Status","Active ✅"],["MoMo","MTN,Vodafone,Airtel"],["Pay Later","Enabled"],["Webhooks","/payments/webhook"]]},
              {title:"Twilio SMS",icon:"📱",items:[["Status","Connected ✅"],["OTPs today","142"],["Delivery","98.6%"]]},
              {title:"Firebase",icon:"🔥",items:[["Functions","Deployed ✅"],["USSD","*711# ready"],["Project","okada-online-ghana"]]},
            ].map(s=>(
              <div key={s.title} className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
                <div style={{padding:"10px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,display:"flex",alignItems:"center",gap:8,background:dark?"#374151":"#f9fafb"}}>
                  <span style={{fontSize:18}}>{s.icon}</span><span className={`font-black text-sm ${t.text}`}>{s.title}</span>
                </div>
                {s.items.map(([l,v])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,fontSize:12}}>
                    <span className={t.sub}>{l}</span><span className={`font-semibold ${t.text}`}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {view==="kyc"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 className={`font-black text-lg ${t.text}`}>🪪 KYC Queue</h2>
              <Badge color="yellow">{kycQueue.length} pending</Badge>
            </div>
            {kycQueue.map((k,i)=>(
              <div key={i} className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div>
                    <p className={`font-black ${t.text}`}>{k.name}</p>
                    <div style={{display:"flex",gap:6,marginTop:4}}>
                      <Badge color="gray">{k.role}</Badge>
                      <Badge color={k.type.includes("Passport")?"indigo":"blue"}>{k.type}</Badge>
                    </div>
                    <p className={`text-xs mt-1 ${t.sub}`}>Submitted {k.time}</p>
                  </div>
                  <Badge color="yellow">Pending Review</Badge>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <button onClick={()=>toast$(`${k.name} KYC approved ✅`)} style={{padding:"10px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12}}>✅ Approve</button>
                  <button onClick={()=>toast$(`${k.name} KYC rejected`,"error")} style={{padding:"10px",background:"#fef2f2",color:"#ef4444",borderRadius:12,fontWeight:700,fontSize:12}}>❌ Reject</button>
                </div>
              </div>
            ))}
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <p className={`font-bold text-sm mb-2 ${t.text}`}>📊 KYC Stats</p>
              {[["Total Verified","1,233 users","#16a34a"],["Ghana Cards","1,018","#2563eb"],["International Passports","215","#7c3aed"],["Pending Review","14","#ca8a04"],["Rejected (30 days)","6","#ef4444"]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",paddingBottom:8,borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,marginBottom:8,fontSize:13}}>
                  <span className={t.sub}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ── DRIVE TO OWN ──────────────────────────────────────
function DriveToOwn({user,role,dark,onBack}) {
  const t=T(dark);
  const [track,setTrack]=useState('A');
  const [vehId,setVehId]=useState('');
  const [appStatus,setAppStatus]=useState(null);
  const [progress,setProgress]=useState(0);
  const [paid,setPaid]=useState(0);
  const [loading,setLoading]=useState(false);
  const [toast,setToast]=useState(null);
  const toast$=(msg,type='success')=>setToast({msg,type});

  const DTV={
    A:[
      {id:'okada',   name:'Motorcycle (Okada)',  price:12000, icon:'🏍️', months:'9-10'},
      {id:'tricycle',name:'Tricycle (Pragya)',   price:18000, icon:'🛺',  months:'13-14'},
      {id:'ev_bike', name:'Electric Motorcycle', price:22000, icon:'⚡🏍️',months:'16-17'},
    ],
    B:[
      {id:'k71',  name:'Kantanka K71 SUV',   price:105000, icon:'🚗'},
      {id:'omama',name:'Kantanka Omama 4x4', price:150000, icon:'🚙'},
    ],
  };
  const vehicles=DTV[track]||DTV.A;
  const selected=vehicles.find(v=>v.id===vehId);

  const apply=async()=>{
    if(!vehId){toast$('Select a vehicle','error');return;}
    setLoading(true);
    try{
      await api.req('POST','/dto/apply',{userId:user.id,role,vehicleType:vehId,track});
      setAppStatus('applied');
      toast$('Application submitted! Admin reviews within 48hrs');
    }catch(e){
      setAppStatus('active');
      toast$('Drive to Own demo activated!');
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:'100vh',background:t.bg}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:'linear-gradient(90deg,#1e3a5f,#2563eb)',color:'#fff',padding:'14px 16px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:20}}>
        {onBack&&<button onClick={onBack} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'#fff',borderRadius:8,padding:6,cursor:'pointer',fontSize:16}}>{'<'}</button>}
        <div>
          <p style={{fontFamily:'Syne,sans-serif',fontWeight:900,fontSize:17,margin:0}}>{'🏍️ Drive to Own'}</p>
          <p style={{fontSize:10,margin:0,opacity:0.8}}>Own your vehicle through earnings</p>
        </div>
      </div>
      <div style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>

        {appStatus==='done'&&(
          <div style={{background:'linear-gradient(135deg,#14532d,#16a34a)',borderRadius:20,padding:32,color:'#fff',textAlign:'center'}}>
            <div style={{fontSize:56,marginBottom:12}}>{'🎉'}</div>
            <p style={{fontFamily:'Syne,sans-serif',fontWeight:900,fontSize:22,margin:'0 0 8px'}}>You OWN Your Vehicle!</p>
            <p style={{fontSize:13,opacity:0.9,margin:0}}>{selected&&selected.name} fully paid off. Documents released within 48hrs.</p>
          </div>
        )}

        {appStatus==='active'&&selected&&(
          <>
            <div style={{background:'linear-gradient(135deg,#1e3a5f,#2563eb)',borderRadius:20,padding:20,color:'#fff',textAlign:'center'}}>
              <div style={{fontSize:40,marginBottom:8}}>{selected.icon}</div>
              <p style={{fontWeight:900,fontSize:18,margin:'0 0 4px'}}>{selected.name}</p>
              <p style={{fontSize:12,opacity:0.85,margin:0}}>Track {track} - {track==='A'?'35% of daily earnings':'40% of owner share'}</p>
            </div>
            <div className={t.card+' rounded-2xl p-4 border '+t.bdr}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                <span className={'font-black text-sm '+t.text}>Ownership Progress</span>
                <span style={{fontWeight:900,color:'#2563eb'}}>{progress.toFixed(1)}%</span>
              </div>
              <div style={{height:14,borderRadius:999,background:dark?'#374151':'#e5e7eb',marginBottom:8}}>
                <div style={{height:14,borderRadius:999,width:progress+'%',background:'linear-gradient(90deg,#2563eb,#16a34a)',transition:'width 0.5s'}}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}>
                <span className={t.sub}>{'GH₵'+paid.toLocaleString()+' paid'}</span>
                <span className={t.sub}>{'GH₵'+selected.price.toLocaleString()+' total'}</span>
              </div>
            </div>
            <button onClick={()=>{
              const inc=Math.random()*5+1;
              const np=Math.min(progress+inc,100);
              const pa=Math.min(paid+(selected.price*inc/100),selected.price);
              setProgress(np);setPaid(pa);
              if(np>=100){setAppStatus('done');toast$('Vehicle FULLY PAID OFF!');}
              else toast$('Ride complete! +GH'+String.fromCharCode(8373)+(selected.price*inc/100).toFixed(2)+' toward your '+selected.name);
            }} style={{padding:'12px',background:dark?'#374151':'#f0fdf4',border:'1px dashed #16a34a',borderRadius:12,color:'#16a34a',fontWeight:700,fontSize:12,cursor:'pointer',width:'100%'}}>
              Simulate ride completion (demo)
            </button>
          </>
        )}

        {!appStatus&&(
          <>
            <div style={{background:'linear-gradient(135deg,#1e3a5f,#2563eb)',borderRadius:16,padding:16,color:'#fff'}}>
              <p style={{fontFamily:'Syne,sans-serif',fontWeight:900,fontSize:16,margin:'0 0 8px'}}>Own Your Vehicle Through Work</p>
              <p style={{fontSize:12,opacity:0.85,margin:'0 0 12px'}}>Your earnings automatically pay off your vehicle. No lump sums. No arguments. Just drive and own.</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,fontSize:11}}>
                {[['35%','of daily earnings'],['0','upfront (Track A)'],['🇬🇭','Made-in-Ghana']].map(([v,l])=>(
                  <div key={l} style={{background:'rgba(255,255,255,0.15)',borderRadius:10,padding:'10px 6px',textAlign:'center'}}>
                    <p style={{fontWeight:900,fontSize:18,margin:'0 0 4px'}}>{v}</p>
                    <p style={{fontSize:9,opacity:0.8,margin:0}}>{l}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[['A','Driver Direct','🏍️','35% daily earnings'],['B','Owner Assisted','🚗','30% down payment']].map(([tr,lb,ic,desc])=>(
                <button key={tr} onClick={()=>{setTrack(tr);setVehId('');}} style={{padding:14,borderRadius:14,textAlign:'left',border:'2px solid '+(track===tr?'#2563eb':'#e5e7eb'),background:track===tr?'#eff6ff':t.card,cursor:'pointer',fontFamily:'inherit'}}>
                  <div style={{fontSize:22,marginBottom:4}}>{ic}</div>
                  <p style={{fontWeight:700,color:track===tr?'#1d4ed8':dark?'#fff':'#111827',fontSize:13,margin:'0 0 2px'}}>{'Track '+tr+' - '+lb}</p>
                  <p style={{fontSize:10,color:dark?'#9ca3af':'#6b7280',margin:0}}>{desc}</p>
                </button>
              ))}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <p className={'font-black text-sm '+t.text}>Select Vehicle:</p>
              {vehicles.map(v=>(
                <div key={v.id} onClick={()=>setVehId(v.id)} style={{padding:14,borderRadius:14,cursor:'pointer',border:'2px solid '+(vehId===v.id?'#2563eb':'#e5e7eb'),background:vehId===v.id?'#eff6ff':t.card}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:26}}>{v.icon}</span>
                      <div>
                        <p style={{fontWeight:700,color:dark?'#fff':'#111827',fontSize:13,margin:0}}>{v.name}</p>
                        <p style={{fontSize:11,color:dark?'#9ca3af':'#6b7280',margin:0}}>{'GH'+String.fromCharCode(8373)+v.price.toLocaleString()+(track==='A'&&v.months?' - ~'+v.months+' months':'')}</p>
                      </div>
                    </div>
                    {vehId===v.id&&<CheckCircle style={{width:20,height:20,color:'#2563eb'}}/>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:12}}>
              <p style={{fontWeight:700,color:'#16a34a',fontSize:12,margin:'0 0 6px'}}>Eligibility Requirements</p>
              {['10+ rides on the platform','KYC verified (Ghana Card or Passport)','No active disputes'].map(r=>(
                <p key={r} style={{fontSize:11,color:'#374151',margin:'2px 0'}}>{'✓ '+r}</p>
              ))}
            </div>
            <button onClick={apply} disabled={loading||!vehId} style={{width:'100%',padding:'14px',borderRadius:14,fontWeight:900,fontSize:15,cursor:(!loading&&vehId)?'pointer':'not-allowed',opacity:(!loading&&vehId)?1:0.5,background:'#2563eb',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',gap:8,border:'none',fontFamily:'inherit'}}>
              {loading&&<Spin/>}
              Apply for Drive to Own
            </button>
          </>
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
  const [apiStatus,setApiStatus] = useState("checking");

  useEffect(()=>{
    fetch("https://us-central1-okada-online-ghana.cloudfunctions.net/api/health")
      .then(r=>r.json()).then(d=>setApiStatus(d.success?"ok":"error")).catch(()=>setApiStatus("error"));
  },[]);

  const login  = (u,token,r) => { api.token=token; setUser(u); setRole(r); };
  const logout = () => { setUser(null); setRole(null); api.token=null; };

  if(!user) return <AuthScreen onLogin={login} dark={dark} apiStatus={apiStatus}/>;
  const props = {user,onLogout:logout,dark,setDark};
  if(role==="passenger") return <PassengerApp {...props}/>;
  if(role==="driver")    return <DriverApp    {...props}/>;
  if(role==="owner")     return <OwnerApp     {...props}/>;
  if(role==="admin")     return <AdminApp     {...props}/>;
}
