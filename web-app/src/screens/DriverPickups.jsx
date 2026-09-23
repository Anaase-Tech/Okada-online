import { useState, useEffect } from "react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";

export function DriverPickups({user,dark,onBack}) {
  const t=T(dark);
  const [pickups,setPickups]=useState([]);
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  const DEMO=[
    {id:"p1",passengerName:"Ama Owusu",  from:"Akosombo",  to:"Kpong",           time:"07:30",date:"Today",   fare:"GH₵18.00",status:"upcoming"},
    {id:"p2",passengerName:"Kofi Mensah",from:"Atimpoku",  to:"Odumase-Krobo",   time:"08:00",date:"Today",   fare:"GH₵22.50",status:"upcoming"},
    {id:"p3",passengerName:"Abena Tetteh",from:"Senchi",   to:"Akosombo",        time:"17:30",date:"Today",   fare:"GH₵14.00",status:"later"},
    {id:"p4",passengerName:"James Wilson",from:"VRA Estate",to:"Akosombo Market",time:"09:00",date:"Tomorrow",fare:"GH₵8.50", status:"later"},
  ];

  useEffect(()=>{
    api.getTodaySchedules(user.id).then(r=>{
      if(r.trips&&r.trips.length>0) setPickups(r.trips);
      else setPickups(DEMO);
    }).catch(()=>setPickups(DEMO));
  },[user.id]);

  return (
    <div style={{minHeight:"100%"}} className={t.bg}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:"linear-gradient(135deg,#1d4ed8,#4f46e5)",color:"#fff",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:20}}>
        {onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"6px 10px",fontSize:14,cursor:"pointer"}}>←</button>}
        <div>
          <p style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:17,margin:0}}>📋 My Assigned Pickups</p>
          <p style={{fontSize:11,margin:0,opacity:0.8}}>Passengers who pre-booked you</p>
        </div>
      </div>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{background:"#eff6ff",borderRadius:14,padding:"12px 14px",border:"1px solid #bfdbfe"}}>
          <p style={{fontWeight:700,fontSize:13,color:"#2563eb",margin:"0 0 4px"}}>ℹ️ How it works</p>
          <p style={{fontSize:12,color:"#1e40af",margin:0}}>Passengers set recurring routes. You get notified 30 mins early and routed toward them automatically.</p>
        </div>
        {pickups.length===0?(
          <div style={{textAlign:"center",padding:"40px 0"}}>
            <div style={{fontSize:48,marginBottom:12}}>📋</div>
            <p className={"font-bold "+t.text}>No assigned pickups yet</p>
            <p className={"text-xs "+t.sub+" mt-1"}>Go online to receive scheduled assignments</p>
          </div>
        ):pickups.map(p=>(
          <div key={p.id} className={t.card+" rounded-2xl p-4 border-2"} style={{borderColor:p.status==="upcoming"?"#16a34a":"#2563eb"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <p className={"font-black "+t.text}>{p.passengerName||"Passenger"}</p>
                <p className={"text-xs "+t.sub}>{p.from||p.pickupAddress} → {p.to||p.destAddress}</p>
                <p className={"text-xs "+t.sub}>⏰ {p.time||p.departTime} · {p.date||"Today"}</p>
              </div>
              <div style={{textAlign:"right"}}>
                <p style={{fontWeight:900,color:"#16a34a",fontSize:16}}>{p.fare||"—"}</p>
                <span style={{fontSize:10,fontWeight:700,color:p.status==="upcoming"?"#16a34a":"#2563eb"}}>{p.status==="upcoming"?"● Soon":"Scheduled"}</span>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <button onClick={()=>toast$("Navigating to pickup... 📍")} style={{padding:"9px",background:"#2563eb",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,border:"none",cursor:"pointer"}}>📍 Navigate</button>
              <button onClick={()=>toast$("Calling passenger... 📞")} style={{padding:"9px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,border:"none",cursor:"pointer"}}>📞 Call</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
