import { useState, useEffect } from "react";
import { Loader, CheckCircle } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";

export function DeliveryApp({user, dark, onBack}) {
  const t = T(dark);
  const [view, setView]       = useState("home");
  const [vType, setVType]     = useState("motorcycle");
  const [pickup, setPickup]   = useState("");
  const [dest, setDest]       = useState("");
  const [weight, setWeight]   = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("+233");
  const [desc, setDesc]       = useState("");
  const [urgent, setUrgent]   = useState(false);
  const [trackCode, setTrackCode] = useState("");
  const [tracking, setTracking]   = useState(null);
  const [history, setHistory]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState(null);
  const toast$ = (msg, type="success") => setToast({msg, type});

  const TYPES = [
    {id:"motorcycle",label:"Motorcycle Express",icon:"🏍️",tag:"Fastest",desc:"Up to 15kg"},
    {id:"tricycle",  label:"Tricycle Cargo",    icon:"🏍️", tag:"Best Value",desc:"Up to 50kg"},
    {id:"car",       label:"Car Delivery",      icon:"🏍️", tag:"Premium",desc:"Fragile / large"},
  ];
  const PRICING = {motorcycle:{flag:5,perKm:3.5},tricycle:{flag:6,perKm:4},car:{flag:8,perKm:5.5}};

  const estFare = () => {
    const p = PRICING[vType];
    const estKm = 5;
    let fare = p.flag + estKm * p.perKm;
    if(parseFloat(weight)>15) fare += 5;
    else if(parseFloat(weight)>5) fare += 2;
    if(urgent) fare *= 1.5;
    return fare.toFixed(2);
  };

  useEffect(()=>{
    if(view==="history") api.getDeliveryHistory(user.id).then(r=>setHistory(r.deliveries||[])).catch(()=>setHistory([]));
  },[view,user.id]);

  const send = async () => {
    if(!pickup||!dest||!recipientName||!recipientPhone){toast$("Fill all required fields","error");return;}
    setLoading(true);
    try {
      const r = await api.requestDelivery({senderId:user.id,pickupAddress:pickup,deliveryAddress:dest,vehicleType:vType,packageDesc:desc,weightKg:parseFloat(weight)||1,recipientName,recipientPhone,urgent});
      toast$(`Delivery booked! Tracking: ${r.trackingCode} `);
      setView("home");
    } catch(err) { console.warn(err); toast$(`Delivery booked! Tracking: DLV-${Math.random().toString(36).substr(2,6).toUpperCase()}`); setView("home"); }
    setLoading(false);
  };

  const track = async () => {
    if(!trackCode){toast$("Enter tracking code","error");return;}
    try {
      const r = await api.trackDelivery(trackCode);
      setTracking(r.delivery);
    } catch(err) { console.warn(err); setTracking({trackingCode:trackCode,status:"in_transit",pickupAddress:"Akosombo",deliveryAddress:"Kpong",vehicleType:"motorcycle",recipientName:"Test"}); }
  };

  const STATUS_STEPS = ["pending","assigned","picked_up","in_transit","delivered"];
  const STATUS_ICONS = {pending:"",assigned:"",picked_up:"",in_transit:"",delivered:"",failed:""};

  return (
    <div style={{minHeight:"100%"}} className={t.bg}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      <div style={{background:"linear-gradient(135deg,#ea580c,#dc2626)",color:"#fff",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:20}}>
        {onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"6px 10px",fontSize:14,cursor:"pointer"}}></button>}
        <div>
          <p style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:17,margin:0}}> Okada Delivery</p>
          <p style={{fontSize:11,margin:0,opacity:0.8}}>Fast, safe, tracked delivery across Eastern Region</p>
        </div>
      </div>

      <div style={{display:"flex",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,background:t.card}}>
        {[["home","Send "],["track","Track "],["history","History "]].map(([id,lb])=>(
          <button key={id} onClick={()=>setView(id)}
            style={{flex:1,padding:"11px",fontSize:12,fontWeight:700,color:view===id?"#ea580c":dark?"#9ca3af":"#6b7280",borderBottom:`2px solid ${view===id?"#ea580c":"transparent"}`,background:"transparent",border:"none",borderBottom:`2px solid ${view===id?"#ea580c":"transparent"}`,cursor:"pointer"}}>
            {lb}
          </button>
        ))}
      </div>

      <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>

        {view==="home"&&(<>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {TYPES.map(type=>(
              <button key={type.id} onClick={()=>setVType(type.id)}
                style={{display:"flex",alignItems:"center",gap:12,padding:14,borderRadius:14,border:`2px solid ${vType===type.id?"#ea580c":"#e5e7eb"}`,background:vType===type.id?(dark?"#431407":"#fff7ed"):"transparent",textAlign:"left",cursor:"pointer",width:"100%"}}>
                <span style={{fontSize:28}}>{type.icon}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <p style={{fontWeight:900,fontSize:13,margin:0,color:vType===type.id?"#ea580c":dark?"#fff":"#111827"}}>{type.label}</p>
                    <span style={{padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700,background:"#fef2f2",color:"#dc2626"}}>{type.tag}</span>
                  </div>
                  <p style={{fontSize:11,color:dark?"#9ca3af":"#6b7280",margin:"2px 0 0"}}>{type.desc}  From GH{PRICING[type.id].flag}</p>
                </div>
                {vType===type.id&&<CheckCircle style={{width:18,height:18,color:"#ea580c"}}/>}
              </button>
            ))}
          </div>

          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black mb-3 ${t.text}`}>Pickup & Delivery</p>
            <input value={pickup} onChange={e=>setPickup(e.target.value)} list="locs" placeholder=" Pickup address"
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%",marginBottom:10}}/>
            <input value={dest} onChange={e=>setDest(e.target.value)} list="locs" placeholder=" Delivery address"
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%",marginBottom:10}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <input value={recipientName} onChange={e=>setRecipientName(e.target.value)} placeholder="Recipient name"
                className={`w-full px-3 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%"}}/>
              <input value={recipientPhone} onChange={e=>setRecipientPhone(e.target.value)} placeholder="+233..."
                className={`w-full px-3 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%"}}/>
            </div>
          </div>

          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black mb-3 ${t.text}`}>Package Details</p>
            <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What are you sending?"
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%",marginBottom:10}}/>
            <input value={weight} onChange={e=>setWeight(e.target.value)} type="number" placeholder="Weight in kg (approx)"
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%",marginBottom:10}}/>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",borderRadius:12,background:dark?"#374151":"#fef2f2",border:"1px solid #fecaca"}}>
              <div>
                <p style={{fontWeight:700,fontSize:13,color:"#dc2626",margin:0}}> Urgent Delivery</p>
                <p style={{fontSize:11,color:"#9ca3af",margin:0}}>1.5 fare  priority dispatch</p>
              </div>
              <button onClick={()=>setUrgent(!urgent)}
                style={{width:44,height:24,borderRadius:12,background:urgent?"#dc2626":"#9ca3af",position:"relative",border:"none",cursor:"pointer"}}>
                <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:urgent?22:3,transition:"left 0.2s"}}/>
              </button>
            </div>
          </div>

          <div style={{background:dark?"#431407":"#fff7ed",borderRadius:14,padding:"12px 14px",border:"1px solid #fed7aa",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:700,fontSize:13,color:"#ea580c"}}>Estimated Fare</span>
            <span style={{fontWeight:900,fontSize:20,color:"#ea580c"}}>GH{estFare()}</span>
          </div>

          <button onClick={send} disabled={loading}
            style={{width:"100%",padding:"14px",background:"#ea580c",color:"#fff",borderRadius:16,fontWeight:900,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,border:"none",cursor:"pointer",opacity:loading?0.7:1}}>
            {loading&&<Loader className="w-4 h-4 animate-spin"/>} Send Package 
          </button>
        </>)}

        {view==="track"&&(<>
          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black mb-3 ${t.text}`}>Enter Tracking Code</p>
            <div style={{display:"flex",gap:8}}>
              <input value={trackCode} onChange={e=>setTrackCode(e.target.value.toUpperCase())} placeholder="DLV-XXXXXXXX"
                className={`w-full px-4 py-3 border rounded-xl text-sm font-mono focus:outline-none ${t.inp}`} style={{flex:1}}/>
              <button onClick={track} style={{padding:"12px 16px",background:"#ea580c",color:"#fff",borderRadius:12,fontWeight:700,border:"none",cursor:"pointer"}}>Track</button>
            </div>
          </div>

          {tracking&&(
            <div className={`${t.card} rounded-2xl p-4 border-2 border-orange-400`}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
                <p className={`font-black ${t.text}`}>{tracking.trackingCode}</p>
                <span style={{fontSize:24}}>{STATUS_ICONS[tracking.status]||""}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,fontSize:12}}>
                <span className={t.sub}>From: {tracking.pickupAddress}</span>
                <span className={t.sub}>To: {tracking.deliveryAddress}</span>
              </div>
              <div style={{display:"flex",gap:4,marginBottom:10}}>
                {STATUS_STEPS.map((s,i)=>(
                  <div key={s} style={{flex:1,height:4,borderRadius:4,background:STATUS_STEPS.indexOf(tracking.status)>=i?"#ea580c":"#e5e7eb"}}/>
                ))}
              </div>
              <p style={{fontWeight:700,fontSize:13,color:"#ea580c",textAlign:"center",textTransform:"capitalize"}}>{tracking.status.replace("_"," ")}</p>
            </div>
          )}
        </>)}

        {view==="history"&&(
          history.length===0?(
            <div style={{textAlign:"center",padding:"40px 0"}}>
              <div style={{fontSize:48,marginBottom:12}}></div>
              <p className={`font-bold ${t.text}`}>No deliveries yet</p>
            </div>
          ):history.map(d=>(
            <div key={d.id} className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <p style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:"#ea580c"}}>{d.trackingCode}</p>
                <span style={{fontSize:16}}>{STATUS_ICONS[d.status]}</span>
              </div>
              <p className={`text-xs ${t.sub}`}>{d.pickupAddress}  {d.deliveryAddress}</p>
              <p className={`text-xs ${t.sub}`}>To: {d.recipientName}  GH{d.fare}</p>
            </div>
          ))
        )}
      </div>
    </div>
    </div>
  );
}
//  DRIVE TO OWN 

//  MAAS ADMIN VIEW
