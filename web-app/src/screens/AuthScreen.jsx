import { useState } from "react";
import { auth } from "../firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { X, AlertCircle, CheckCircle, Loader } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";
import { Spin } from "../components/Spin";
import { KycVerify } from "./KycVerify";

export function AuthScreen({onLogin,dark,apiStatus="checking"}) {
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

  const [otpCooldown,setOtpCooldown]=useState(0);
  const [otpAttempts,setOtpAttempts]=useState(0);

  const sendOtp=async()=>{
    const cleaned = phone.replace(/\s/g,'');
    if(!/^\+233[0-9]{9}$/.test(cleaned)){
      toast$("Enter valid Ghana number: +233XXXXXXXXX","error");return;
    }
    if(role==="driver"&&!owner){toast$("Enter your owner's code","error");return;}
    if(otpCooldown>0){toast$("Wait "+otpCooldown+"s before retrying","error");return;}
    if(otpAttempts>=3){toast$("Too many attempts. Please wait 10 minutes.","error");return;}
    setLoading(true);
    setOtpAttempts(a=>a+1);
    try{
      if(!window.recaptchaVerifier){
        window.recaptchaVerifier=new RecaptchaVerifier(auth,"recaptcha-container",{size:"invisible"});
      }
      const conf=await signInWithPhoneNumber(auth,cleaned,window.recaptchaVerifier);
      window._otpConfirm=conf;
      setStep("otp");toast$("OTP sent! Check your SMS 📱");
      let cd=60; setOtpCooldown(cd);
      const iv=setInterval(()=>{cd--;setOtpCooldown(cd);if(cd<=0)clearInterval(iv);},1000);
    }catch(e){
      console.error("OTP error:",e);
      if(e.code==='auth/invalid-phone-number'){toast$("Invalid phone number","error");}
      else if(e.code==='auth/too-many-requests'){toast$("Too many OTP requests. Try in 10 minutes.","error");}
      else{ setStep("otp"); toast$("Demo mode — enter any 6 digits"); }
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
        setLoading(false);
        return;
      }catch(err){ console.warn("Profile error:",err); }
      api.token=fbToken;
    }catch(e){ console.error("verifyOtp:",e); }
    // Demo fallback
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
          <div style={{width:8,height:8,borderRadius:"50%",background:apiStatus==="ok"?"#4ade80":apiStatus==="demo"?"#60a5fa":"#facc15"}}/>
          <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{apiStatus==="ok"?"Connected ✅":apiStatus==="demo"?"Demo Mode":"Connecting…"}</span>
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
              </div>
            )}
            <button onClick={sendOtp} disabled={loading||otpCooldown>0}
              style={{width:"100%",background:otpCooldown>0?"#9ca3af":"#16a34a",color:"#fff",padding:"14px",borderRadius:16,fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:(loading||otpCooldown>0)?0.7:1}}>
              {loading&&<Spin/>}
              {loading?"Sending…":otpCooldown>0?"Resend in "+otpCooldown+"s":"Get OTP via SMS 📱"}
            </button>
            <p className={`text-xs text-center ${t.sub}`}>Demo mode: use 000000 as OTP code</p>
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
      <div id="recaptcha-container"/>
    </div>
  );
}
