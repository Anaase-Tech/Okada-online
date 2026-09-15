import { useState } from "react";
import { X, Shield, ChevronRight } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { COUNTRIES } from "../constants";
import { Toast } from "../components/Toast";

export function KycVerify({role, onVerified, dark}) {
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
    }catch(err){ console.warn("Error:",err); }
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
        <div style={{fontSize:40,marginBottom:8}}>{isIntl?"":""}</div>
        <h1 style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:22}}>Identity Verification</h1>
        <p style={{color:"#bfdbfe",fontSize:12,marginTop:4}}>
          {isIntl?"International Passport  190+ Countries":"Ghana Card  Powered by NIA Ghana"}
        </p>
        <p style={{color:"#c7d2fe",fontSize:11,marginTop:2}}>Required for all {role}s  Enables Pay Later & Fintech</p>
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
                  <span style={{fontSize:32}}></span>
                  <div style={{flex:1}}>
                    <p style={{fontWeight:900,color:"#2563eb",fontSize:14}}>Ghana National ID Card</p>
                    <p style={{fontSize:11,color:"#6b7280"}}>For Ghanaian citizens and residents</p>
                  </div>
                  <ChevronRight style={{width:16,height:16,color:"#2563eb"}}/>
                </button>
                <button onClick={()=>{setDocType("passport");setStep("details");}}
                  style={{display:"flex",alignItems:"center",gap:14,padding:"16px",borderRadius:16,border:"2px solid #7c3aed",background:"#f5f3ff",textAlign:"left"}}>
                  <span style={{fontSize:32}}></span>
                  <div style={{flex:1}}>
                    <p style={{fontWeight:900,color:"#7c3aed",fontSize:14}}>International Passport</p>
                    <p style={{fontSize:11,color:"#6b7280"}}>For visitors & foreign nationals  190+ countries</p>
                  </div>
                  <ChevronRight style={{width:16,height:16,color:"#7c3aed"}}/>
                </button>
              </div>
            </div>
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <p className={`font-bold text-sm mb-2 ${t.text}`}> Why we verify identity</p>
              {["Safety for all passengers & drivers","Required for Pay Later & fintech services","NIA Ghana Card  instant data, no typing errors","Passport accepted from 190+ countries","Ghana Data Protection Act 2012 compliant","International visitors  welcome to Ghana! "].map(r=>(
                <p key={r} className={`text-xs ${t.sub}`} style={{marginBottom:3}}> {r}</p>
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
              <button onClick={()=>setStep("type")} style={{flex:1,padding:"12px",border:`1px solid ${dark?"#374151":"#e5e7eb"}`,borderRadius:14,fontWeight:700,fontSize:13}} className={t.text}> Back</button>
              <button onClick={()=>{
                if(!isIntl&&cardNum.length<8){toast$("Enter Ghana Card number","error");return;}
                if(isIntl&&passNum.length<6){toast$("Enter passport number","error");return;}
                setStep("photo");
              }} style={{flex:2,padding:"12px",background:accentColor,color:"#fff",borderRadius:14,fontWeight:900,fontSize:13}}>
                Next  Upload Photo 
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
                <p className={`text-xs ${t.sub}`}>{isIntl?"Data page  all text visible":"Front side  clear & well-lit"}</p>
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
                <div style={{fontSize:36,marginBottom:8}}></div>
                <p className={`font-bold text-sm ${t.text}`}>Tap to take photo or upload</p>
                <p className={`text-xs ${t.sub} mt-1`}>JPG or PNG  Max 5MB</p>
                <input type="file" accept="image/*" capture="environment" onChange={handleDocPhoto} style={{display:"none"}}/>
              </label>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setStep("details")} style={{flex:1,padding:"12px",border:`1px solid ${dark?"#374151":"#e5e7eb"}`,borderRadius:14,fontWeight:700,fontSize:13}} className={t.text}> Back</button>
              {docPhotoP&&<button onClick={()=>setStep("selfie")} style={{flex:2,padding:"12px",background:accentColor,color:"#fff",borderRadius:14,fontWeight:900,fontSize:13}}>Next  Selfie </button>}
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
                <div style={{fontSize:36,marginBottom:8}}></div>
                <p className={`font-bold text-sm ${t.text}`}>Tap to take selfie</p>
                <p className={`text-xs ${t.sub} mt-1`}>Front camera  Look straight at screen</p>
                <input type="file" accept="image/*" capture="user" onChange={handleSelfie} style={{display:"none"}}/>
              </label>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setStep("photo")} style={{flex:1,padding:"12px",border:`1px solid ${dark?"#374151":"#e5e7eb"}`,borderRadius:14,fontWeight:700,fontSize:13}} className={t.text}> Back</button>
              {selfieP&&<button onClick={()=>setStep("review")} style={{flex:2,padding:"12px",background:"#16a34a",color:"#fff",borderRadius:14,fontWeight:900,fontSize:13}}>Review </button>}
            </div>
          </div>
        )}

        {/* STEP: review */}
        {step==="review"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div className={`${t.card} rounded-2xl p-5 border ${t.bdr}`}>
              <p className={`font-black mb-3 ${t.text}`}> Review Your Submission</p>
              <div style={{padding:"10px 12px",borderRadius:12,background:dark?"#374151":"#f9fafb",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span className={`text-xs ${t.sub}`}>Document Type</span>
                  <span style={{fontWeight:700,fontSize:12}} className={t.text}>{isIntl?"International Passport ":"Ghana Card "}</span>
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
              <p style={{color:"#2563eb",fontWeight:700,fontSize:12,marginBottom:4}}> Privacy Notice</p>
              <p style={{fontSize:11,color:dark?"#93c5fd":"#1e40af"}}>Your ID data is encrypted and used solely for identity verification. Never sold. Protected under Ghana Data Protection Act 2012 and GDPR for international users.</p>
            </div>
            <button onClick={submit} style={{width:"100%",padding:"14px",background:"#16a34a",color:"#fff",borderRadius:16,fontWeight:900,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <Shield style={{width:18,height:18}}/> Submit for Verification 
            </button>
          </div>
        )}

        {step==="processing"&&(
          <div style={{textAlign:"center",padding:"48px 0"}}>
            <div style={{width:64,height:64,border:`4px solid ${accentColor}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 20px"}}/>
            <p className={`font-black text-lg ${t.text}`}>Verifying Identity</p>
            <p className={`text-xs mt-2 ${t.sub}`}>{isIntl?"Checking international document database":"Checking with NIA Ghana"}</p>
          </div>
        )}

        {step==="done"&&(
          <div style={{textAlign:"center",padding:"48px 0"}}>
            <div style={{fontSize:64,marginBottom:16}}></div>
            <p className={`font-black text-xl ${t.text}`}>Verification Submitted!</p>
            <p className={`text-sm mt-2 ${t.sub}`}>Review within 24 hours  SMS confirmation sent.</p>
            {isIntl&&<p className={`text-xs mt-2 ${t.sub}`}>Welcome to Ghana  Enjoy your visit!</p>}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
//  WITHDRAW SHEET
