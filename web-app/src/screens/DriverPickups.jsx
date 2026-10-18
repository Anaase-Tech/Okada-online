import { useState, useEffect } from "react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";

export function DriverPickups({user,dark,onBack}) {
  const t=T(dark);
  const [pickups,setPickups]=useState([]);
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  const [pickupsLoading,setPickupsLoading]=useState(true);
  const [pickupsError,setPickupsError]=useState(false);
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    setPickupsLoading(true);setPickupsError(false);
    api.getTodaySchedules(user.id).then(r=>{
      if(!cancelled)setPickups(r.trips||[]);
    }).catch(err=>{
      console.warn("Scheduled route load failed:",err);
      if(cancelled)return;
      setPickups([]);setPickupsError(true);
      setToast({msg:"Saved schedules are unavailable. No assigned-pickup status was confirmed.",type:"error"});
    }).finally(()=>{if(!cancelled)setPickupsLoading(false);});
    return ()=>{cancelled=true;};
  },[user.id,reload]);

  return (
    <div style={{minHeight:"100%"}} className={t.bg}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:"linear-gradient(135deg,#1d4ed8,#4f46e5)",color:"#fff",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:20}}>
        {onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"6px 10px",fontSize:14,cursor:"pointer"}}>←</button>}
        <div>
          <p style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:17,margin:0}}>📋 Scheduled Routes</p>
          <p style={{fontSize:11,margin:0,opacity:0.8}}>Saved schedule records — assignment status is not yet available in this view</p>
        </div>
      </div>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
        <div style={{background:"#eff6ff",borderRadius:14,padding:"12px 14px",border:"1px solid #bfdbfe"}}>
          <p style={{fontWeight:700,fontSize:13,color:"#2563eb",margin:"0 0 4px"}}>ℹ️ How it works</p>
          <p style={{fontSize:12,color:"#1e40af",margin:0}}>This view loads saved schedules, not a verified driver-assignment feed. Confirm assignment status before travelling.</p>
        </div>
        {pickupsLoading?(
          <div style={{textAlign:"center",padding:"40px 0"}}><p className={"font-bold "+t.text}>Loading saved schedules…</p></div>
        ):pickupsError?(
          <div style={{textAlign:"center",padding:"40px 0"}}><p className={"font-bold "+t.text}>Saved schedules unavailable</p><button onClick={()=>setReload(v=>v+1)} style={{marginTop:14,padding:"10px 18px",borderRadius:12,background:"#2563eb",color:"#fff",fontWeight:700}}>Retry</button></div>
        ):pickups.length===0?(
          <div style={{textAlign:"center",padding:"40px 0"}}><div style={{fontSize:48,marginBottom:12}}>📋</div><p className={"font-bold "+t.text}>No saved schedules returned</p><p className={"text-xs "+t.sub+" mt-1"}>This is not confirmation that no driver assignments exist.</p></div>
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
              <button onClick={()=>toast$("Live navigation is not connected in this view; no route was started.","error")} style={{padding:"9px",background:"#2563eb",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,border:"none",cursor:"pointer"}}>📍 Navigate</button>
              <button onClick={()=>toast$("Calling is not connected in this view; no call was placed.","error")} style={{padding:"9px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,border:"none",cursor:"pointer"}}>📞 Call</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
