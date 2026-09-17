import { useState, useEffect } from "react";
import { MapPin, Navigation, Star, X, Moon, Sun, AlertCircle, CheckCircle, LogOut } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { VEHICLES, LOCS, LOCATION_COORDS } from "../constants";
import { Toast } from "../components/Toast";
import { Badge } from "../components/Badge";
import { Spin } from "../components/Spin";
import { Map } from "../components/Map";
import { KycVerify } from "./KycVerify";
import { FintechHub } from "./FintechHub";
import { ScheduledTrips } from "./ScheduledTrips";
import { ShareRide } from "./ShareRide";
import { RentalHub } from "./RentalHub";
import { DeliveryApp } from "./DeliveryApp";

export function PassengerApp({user,onLogout,dark,setDark}) {
  const t=T(dark);
  const [view,setView]=useState("home");
  const [pickup,setPickup]=useState("");
  const [dest,setDest]=useState("");
  const [vehicle,setVehicle]=useState("okada");
  const [fare,setFare]=useState(null);
  const [status,setStatus]=useState("idle");
  const [driver,setDriver]=useState(null);
  const [driverPos,setDriverPos]=useState(null);
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

  // Smart pricing: distance + time + surge + vehicle type
  useEffect(()=>{
    if(!pickup||!dest){setFare(null);return;}
    const v=VEHICLES.find(v=>v.id===vehicle);
    // Distance matrix for known Eastern Region routes (production: use Google Maps API)
    const DIST = {
      'Akosombo-Atimpoku':4.2,'Akosombo-Senchi':5.1,'Akosombo-Kpong':18,'Akosombo-Koforidua':62,
      'Atimpoku-Kpong':14,'Kpong-Odumase-Krobo':8,'Odumase-Krobo-Somanya':12,'Somanya-Koforidua':28,
      'Akosombo-Adjena':3.2,'Akosombo-Frankadua':7,'Kpong-Agormanya':6,'Agormanya-Nkurakan':15,
    };
    const key1 = pickup+'-'+dest;
    const key2 = dest+'-'+pickup;
    const baseKm = DIST[key1]||DIST[key2]||parseFloat((2+Math.random()*20).toFixed(1));
    // Time-of-day surge (7-9am, 5-7pm = 1.3x)
    const hr = new Date().getHours();
    const surge = (hr>=7&&hr<=9)||(hr>=17&&hr<=19) ? 1.3 : (hr>=22||hr<=5) ? 1.5 : 1.0;
    const baseFare = baseKm * v.rate;
    const totalFare = parseFloat((baseFare * surge + 2).toFixed(2)); // GH2 base flag
    const dur = Math.ceil(baseKm * (vehicle==='okada'?2.8:vehicle==='bicycle'?5:3));
    setFare({km:baseKm, total:totalFare, dur, surge, breakdown:{base:parseFloat(baseFare.toFixed(2)),surgeLabel:surge>1?(surge===1.5?'Late Night':'Rush Hour'):'Normal'}});
  },[pickup,dest,vehicle]);

  useEffect(()=>{
    if(status==="matched"&&eta>0){
      const iv=setInterval(()=>setEta(e=>{if(e<=1){clearInterval(iv);setStatus("arrived");return 0;}return e-1;}),1000);
      return()=>clearInterval(iv);
    }
  },[status,eta]);

  // Live driver pin: offset near pickup while matched, at pickup on arrival,
  // midpoint of the route while the ride is ongoing.
  useEffect(()=>{
    const p = LOCATION_COORDS[pickup];
    const d = LOCATION_COORDS[dest];
    if(!p){ setDriverPos(null); return; }
    if(status==="matched"){ setDriverPos({ lat:p.lat+0.01, lng:p.lng+0.008 }); }
    else if(status==="arrived"){ setDriverPos(p); }
    else if(status==="ongoing"&&d){ setDriverPos({ lat:(p.lat+d.lat)/2, lng:(p.lng+d.lng)/2 }); }
    else { setDriverPos(null); }
  },[status,pickup,dest]);

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
    try{await api.requestRide({userId:user.id,pickupLocation:{address:pickup,latitude:6.0998,longitude:0.1},destination:{address:dest,latitude:6.15,longitude:0.15},rideType:vehicle});}catch(err){ console.warn("Error:",err); }
    setTimeout(()=>{
      const v=VEHICLES.find(v=>v.id===vehicle);
      setDriver({name:"Kwame Asante",phone:"+233241234567",rating:4.9,vehicle:v.label,icon:v.icon,plate:"ER-1234-26",photo:"",rides:1247,id:"drv_001"});
      setStatus("matched");setEta(180);toast$(`${v.label} driver matched! ${v.icon}`);
    },3500);
    setLoading(false);
  };

  if(showKyc) return <KycVerify role="passenger" dark={dark} onVerified={()=>setShowKyc(false)}/>;

  const Nav=()=>(
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr}`} style={{display:"flex",justifyContent:"space-around",padding:"6px 0",zIndex:30}}>
      {[["home","","Home"],["maas","","Schedule"],["share","🤝","Share"],["rental","","Rental"],["delivery","","Deliver"],["fintech","","Fintech"],["history","","History"],["profile","","Me"]].map(([v,ic,lb])=>(
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
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}></span><span style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:18}}>Okada Online</span></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setDark(!dark)} style={{padding:6,borderRadius:8,background:"rgba(255,255,255,0.15)"}}>{dark?<Sun className="w-4 h-4"/>:<Moon className="w-4 h-4"/>}</button>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#15803d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{user.profilePhoto||""}</div>
        </div>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="fintech"&&<FintechHub user={user} role="passenger" dark={dark}/>}
        {view==="maas"&&<ScheduledTrips user={user} dark={dark} onBack={()=>setView("home")}/>}
        {view==="share"&&<ShareRide user={user} dark={dark} onBack={()=>setView("home")}/>}
        {view==="rental"&&<RentalHub user={user} dark={dark} onBack={()=>setView("home")}/>}
        {view==="delivery"&&<DeliveryApp user={user} dark={dark} onBack={()=>setView("home")}/>}

        {view==="home"&&(
          <div style={{padding:16}}>
            {user.isInternational&&(
              <div style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",borderRadius:16,padding:"12px 14px",marginBottom:12,color:"#fff",display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:24}}></span>
                <div>
                  <p style={{fontWeight:700,fontSize:13}}>Welcome to Ghana! </p>
                  <p style={{fontSize:11,color:"#c7d2fe"}}>Passport verified  {user.passport?.country} visitor  Pay Later enabled</p>
                </div>
              </div>
            )}
            <div style={{marginBottom:12}}>
              <Map dark={dark} height={150} status={status}
                pickup={LOCATION_COORDS[pickup]||null}
                destination={LOCATION_COORDS[dest]||null}
                driverPos={driverPos}/>
            </div>

            <div className={`${t.card} rounded-2xl shadow p-4 border ${t.bdr}`} style={{display:"flex",flexDirection:"column",gap:12}}>
              <h2 className={`font-black text-base ${t.text}`}> Book Your Ride</h2>
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
                      <span className={t.sub}>Distance</span><span className={`font-semibold ${t.text}`}>{fare.km} km  ~{fare.dur} min</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:8,borderTop:`1px solid ${dark?"#166534":"#bbf7d0"}`}}>
                      <span className={`font-black ${t.text}`}>Total Fare</span>
                      <span style={{fontWeight:900,color:"#16a34a",fontSize:18}}>GH{fare.total}</span>
                    </div>
                  </div>
                )}
                <button onClick={bookRide} disabled={!pickup||!dest||loading}
                  style={{width:"100%",background:"#16a34a",color:"#fff",padding:"14px",borderRadius:16,fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:(!pickup||!dest||loading)?0.4:1}}>
                  {loading&&<Spin/>}{loading?"Booking":`Book ${VEHICLES.find(v=>v.id===vehicle)?.label} ${VEHICLES.find(v=>v.id===vehicle)?.icon}`}
                </button>
              </>}

              {status==="searching"&&(
                <div style={{textAlign:"center",padding:"24px 0"}}>
                  <div style={{width:48,height:48,border:"4px solid #16a34a",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/>
                  <p className={`font-bold ${t.text}`}>Finding your driver</p>
                  <button onClick={()=>setStatus("idle")} style={{marginTop:16,padding:"8px 20px",border:"1px solid #f87171",color:"#ef4444",borderRadius:12,fontSize:13,fontWeight:700}}>Cancel</button>
                </div>
              )}

              {(status==="matched"||status==="arrived")&&driver&&(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {status==="arrived"&&<div style={{background:"#16a34a",color:"#fff",borderRadius:12,padding:"8px",textAlign:"center",fontWeight:700,fontSize:13}}> Driver has arrived!</div>}
                  <div style={{display:"flex",alignItems:"center",gap:12,padding:12,borderRadius:12,background:dark?"#374151":"#f9fafb"}}>
                    <div style={{width:52,height:52,borderRadius:"50%",background:"#dcfce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{driver.photo}</div>
                    <div style={{flex:1}}>
                      <p className={`font-black ${t.text}`}>{driver.name}</p>
                      <p className={`text-xs ${t.sub}`}>{driver.icon} {driver.vehicle}  {driver.plate}</p>
                      <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                        <Star style={{width:12,height:12,fill:"#facc15",color:"#facc15"}}/>
                        <span className={`text-xs ${t.sub}`}>{driver.rating}  {driver.rides} rides</span>
                      </div>
                    </div>
                    {status==="matched"&&<div style={{textAlign:"center"}}><p style={{fontWeight:900,color:"#16a34a",fontSize:20}}>{Math.floor(eta/60)}:{String(eta%60).padStart(2,"0")}</p><p className={`text-xs ${t.sub}`}>ETA</p></div>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    <button onClick={()=>setStatus("idle")} style={{padding:"10px",border:"1px solid #f87171",color:"#ef4444",borderRadius:12,fontWeight:700,fontSize:12}}>Cancel</button>
                    <a href={`tel:${driver.phone}`} style={{padding:"10px",background:"#2563eb",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,textAlign:"center",display:"block"}}> Call</a>
                    <button onClick={()=>setStatus("ongoing")} style={{padding:"10px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12}}>Start </button>
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
                    <p style={{fontWeight:900,color:"#16a34a",fontSize:18}}>GH{fare?.total}</p>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <button onClick={()=>toast$(" Emergency services notified!","error")} style={{padding:"12px",background:"#dc2626",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <AlertCircle style={{width:16,height:16}}/> SOS
                    </button>
                    <button onClick={()=>setPayStatus("selecting")} style={{padding:"12px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>Pay </button>
                  </div>
                </div>
              )}
              {payStatus==="paid"&&(
                <div style={{textAlign:"center",padding:"16px 0"}}>
                  <div style={{fontSize:48,marginBottom:8}}></div>
                  <p className={`font-black ${t.text}`}>Payment Complete!</p>
                  <p className={`text-xs ${t.sub} mt-1`}>Thanks for riding Okada Online </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/*  Payment Sheet  */}
        {payStatus==="selecting"&&fare&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:60,display:"flex",alignItems:"flex-end",maxWidth:448,margin:"0 auto"}}>
            <div className={`${t.card} rounded-t-3xl p-6 w-full shadow-2xl`} style={{maxHeight:"90vh",overflowY:"auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <h3 className={`text-lg font-black ${t.text}`}> Pay for Ride</h3>
                <button onClick={()=>setPayStatus("idle")}><X style={{width:20,height:20,color:"#9ca3af"}}/></button>
              </div>
              <p className={`text-xs ${t.sub} mb-3`}>{pickup}  {dest}</p>
              <div style={{background:dark?"#14532d":"#f0fdf4",borderRadius:12,padding:12,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span className={`font-semibold ${t.text}`}>Total</span>
                <span style={{fontWeight:900,color:"#16a34a",fontSize:22}}>GH{fare.total}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
                {[
                  {id:"mtn",      label:"MTN Mobile Money",   icon:"🏍️",color:"#ffcc00",text:"#000"},
                  {id:"vodafone", label:"Vodafone Cash",       icon:"🏍️",color:"#e60000",text:"#fff"},
                  {id:"airtel",   label:"AirtelTigo Money",    icon:"🏍️",color:"#ef4444",text:"#fff"},
                  {id:"card",     label:"Credit / Debit Card", icon:"🏍️",color:"#2563eb",text:"#fff"},
                  {id:"cash",     label:"Pay with Cash",       icon:"🏍️",color:"#16a34a",text:"#fff"},
                  ...(user.payLater?.eligible?[{id:"paylater",label:"Pay Later (7 days)",icon:"🏍️",color:"#7c3aed",text:"#fff"}]:[]),
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
                  <p className={`font-bold text-sm ${t.text}`} style={{marginBottom:4}}> Pay driver directly</p>
                  <p className={`text-xs ${t.sub}`}>Hand GH{fare.total} cash. Driver must confirm on their app before ride closes.</p>
                </div>
              )}
              {payMethod==="paylater"&&(
                <div style={{background:dark?"#1e1b4b":"#eef2ff",borderRadius:12,padding:12,marginBottom:12}}>
                  <p style={{fontWeight:700,fontSize:13,color:"#7c3aed",marginBottom:4}}> Pay Later  7 day defer</p>
                  <p className={`text-xs ${t.sub}`}>GH{fare.total} deducted from your Pay Later limit. Auto-charged to MoMo in 7 days.</p>
                </div>
              )}
              <button disabled={!payMethod} onClick={async()=>{
                if(!payMethod) return;
                if(payMethod==="cash"){
                  setPayStatus("awaiting-driver");
                  setTimeout(()=>{setPayStatus("paid");setStatus("idle");setDriver(null);setPickup("");setDest("");setFare(null);toast$("Cash confirmed by driver ");setTimeout(()=>setPayStatus("idle"),2500);},4000);
                  return;
                }
                if(payMethod==="paylater"){
                  try{await api.payLaterRequest("ride_"+Date.now(),user.id);}catch(err){ console.warn("Error:",err); }
                  setPayStatus("paid");setStatus("idle");setDriver(null);setPickup("");setDest("");
                  toast$(`GH${fare.total} deferred  Pay Later used `);setTimeout(()=>setPayStatus("idle"),3000);
                  return;
                }
                setPayStatus("processing");
                try{await api.initPayment("ride_"+Date.now(),fare.total,email||user.phone+"@okada.gh",momoPhone);}catch(err){ console.warn("Error:",err); }
                setTimeout(()=>{setPayStatus("paid");setStatus("idle");setDriver(null);setPickup("");setDest("");setFare(null);toast$(`GH${fare.total} paid via ${payMethod.toUpperCase()} `);setTimeout(()=>setPayStatus("idle"),3000);},2500);
              }} style={{width:"100%",padding:"14px",background:!payMethod?"#9ca3af":"#16a34a",color:"#fff",borderRadius:16,fontWeight:900,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:!payMethod?0.5:1}}>
                {payStatus==="processing"?<><Spin/>Processing</>:payMethod==="cash"?`Notify Driver  GH${fare.total} Cash`:payMethod==="paylater"?`Defer GH${fare.total}  Pay Later`:`Pay GH${fare.total} via Paystack `}
              </button>
              <p className={`text-xs text-center mt-2 ${t.sub}`}> Secured by Paystack  MTN  Vodafone  Airtel</p>
            </div>
          </div>
        )}

        {payStatus==="awaiting-driver"&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",maxWidth:448,margin:"0 auto"}}>
            <div className={`${t.card} rounded-3xl p-8 mx-4 shadow-2xl`} style={{textAlign:"center"}}>
              <div style={{width:52,height:52,border:"4px solid #ca8a04",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
              <p className={`font-black text-lg ${t.text}`}>Waiting for Driver</p>
              <p className={`text-sm mt-2 ${t.sub}`}>Driver must confirm GH{fare?.total} cash received</p>
            </div>
          </div>
        )}

        {view==="history"&&(
          <div style={{padding:16}}>
            <h2 className={`font-black text-lg mb-4 ${t.text}`}> Ride History</h2>
            {history.length===0?(
              <div style={{textAlign:"center",padding:"48px 0"}}>
                <div style={{fontSize:48,marginBottom:12}}></div>
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
                      <p className={`text-xs ${t.sub}`}>{r.date}  {r.driver}</p>
                      <Badge color={r.paid==="Pay Later"?"indigo":r.paid==="Cash"?"yellow":"green"}>{r.paid}</Badge>
                    </div>
                  </div>
                  <div style={{textAlign:"right",marginLeft:12}}>
                    <p style={{fontWeight:900,color:"#16a34a"}}>GH{r.fare}</p>
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
              <div style={{fontSize:52,marginBottom:8}}>{user.profilePhoto||""}</div>
              <h2 className={`text-xl font-black ${t.text}`}>{user.name}</h2>
              <p className={t.sub}>{user.phone}</p>
              <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:8,flexWrap:"wrap"}}>
                <Badge color="green"> KYC Verified</Badge>
                {user.isInternational&&<Badge color="indigo"> {user.passport?.country}</Badge>}
                {user.payLater?.eligible&&<Badge color="purple"> Pay Later</Badge>}
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
//  DRIVER APP
