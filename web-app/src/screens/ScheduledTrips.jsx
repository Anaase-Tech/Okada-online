import { useState, useEffect } from "react";
import { Loader } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";

export function ScheduledTrips({user, dark, onBack}) {
  const t = T(dark);
  const [view, setView]       = useState("list");
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState(null);
  const toast$ = (msg, type="success") => setToast({msg, type});

  // Form state
  const [name, setName]           = useState("");
  const [pickup, setPickup]       = useState("");
  const [dest, setDest]           = useState("");
  const [vehicle, setVehicle]     = useState("car");
  const [departTime, setDepartTime] = useState("07:30");
  const [returnTime, setReturnTime] = useState("17:30");
  const [days, setDays]           = useState([1,2,3,4,5]);
  const [category, setCategory]   = useState("work");
  const [payFromSavings, setPayFromSavings] = useState(false);

  // Adjust sheet state
  const [adjusting, setAdjusting]   = useState(null); // the schedule being adjusted
  const [adjustDate, setAdjustDate] = useState("");
  const [adjustTime, setAdjustTime] = useState("");
  const [adjustBusy, setAdjustBusy] = useState(false);

  const DAYS_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const RENTAL_VEHICLES = [
    {id:"car",label:"Car",icon:"🚗"},{id:"okada",label:"Okada",icon:"🏍️"},
    {id:"tricycle",label:"Tricycle",icon:"🛺"},{id:"ev_car",label:"EV Car",icon:"⚡🚗"},
  ];
  const CATS = [
    {id:"work",label:"Work",icon:"💼"},{id:"school",label:"School",icon:"🎒"},
    {id:"church",label:"Church",icon:"⛪"},{id:"lunch",label:"Lunch",icon:"🍽️"},
    {id:"gym",label:"Gym",icon:"💪"},{id:"custom",label:"Custom",icon:"📍"},
  ];

  useEffect(() => {
    api.getTodaySchedules(user.id)
      .then(r => setSchedules(r.trips || []))
      .catch(() => setSchedules([
        {id:"s1",name:"Work Commute",pickupAddress:"Akosombo",destAddress:"Kpong",departTime:"07:30",days:[1,2,3,4,5],category:"work",active:true,paused:false,vehicleType:"car"},
        {id:"s2",name:"Church Run",pickupAddress:"Home",destAddress:"St. Peter's Church",departTime:"09:00",days:[0],category:"church",active:true,paused:false,vehicleType:"okada"},
      ]));
  }, [user.id]);

  const createSchedule = async () => {
    if(!pickup||!dest||!days.length){toast$("Fill all fields","error");return;}
    setLoading(true);
    try {
      await api.createSchedule({userId:user.id,name,pickupAddress:pickup,destAddress:dest,vehicleType:vehicle,departTime,returnTime,days,category,payFromSavings});
      toast$("Schedule created ✅ Driver will be matched 30 min before departure");
      setView("list");
    } catch(err) { console.warn(err); toast$("Schedule saved (demo mode)"); setView("list"); }
    setLoading(false);
  };

  const toggleDay = (d) => setDays(prev => prev.includes(d) ? prev.filter(x=>x!==d) : [...prev,d]);

  const openAdjust = (s) => {
    setAdjusting(s);
    setAdjustDate(new Date().toISOString().slice(0,10));
    setAdjustTime(s.departTime);
  };

  const submitSkip = async () => {
    if(!adjustDate){toast$("Pick a date","error");return;}
    setAdjustBusy(true);
    try{
      await api.adjustSchedule(adjusting.id, {userId:user.id, date:adjustDate, skip:true});
      toast$(`${adjusting.name} skipped on ${adjustDate} ✅`);
    }catch(err){
      console.warn(err);
      toast$(`Couldn't reach the server (${err.message}) — not saved`, "error");
      setAdjustBusy(false);
      return;
    }
    setAdjustBusy(false);
    setAdjusting(null);
  };

  const submitTimeChange = async () => {
    if(!adjustDate||!adjustTime){toast$("Pick a date and time","error");return;}
    setAdjustBusy(true);
    try{
      await api.adjustSchedule(adjusting.id, {userId:user.id, date:adjustDate, newTime:adjustTime});
      toast$(`${adjusting.name} moved to ${adjustTime} on ${adjustDate} ✅`);
    }catch(err){
      console.warn(err);
      toast$(`Couldn't reach the server (${err.message}) — not saved`, "error");
      setAdjustBusy(false);
      return;
    }
    setAdjustBusy(false);
    setAdjusting(null);
  };

  return (
    <div style={{minHeight:"100%"}} className={t.bg}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      <div style={{background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",color:"#fff",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:20}}>
        {onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"6px 10px",fontSize:14,cursor:"pointer"}}>←</button>}
        <div>
          <p style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:17,margin:0}}>📅 Scheduled Trips</p>
          <p style={{fontSize:11,margin:0,opacity:0.8}}>Set it once — we handle the rest</p>
        </div>
        <button onClick={()=>setView(view==="list"?"create":"list")}
          style={{marginLeft:"auto",padding:"8px 14px",background:"rgba(255,255,255,0.2)",borderRadius:10,fontWeight:700,fontSize:12,color:"#fff",border:"none",cursor:"pointer"}}>
          {view==="list"?"+ New":"✕ Cancel"}
        </button>
      </div>

      <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>

        {view==="list"&&(<>
          {schedules.length===0&&(
            <div style={{textAlign:"center",padding:"48px 0"}}>
              <div style={{fontSize:48,marginBottom:12}}>📅</div>
              <p className={`font-bold ${t.text}`}>No schedules yet</p>
              <p className={`text-xs ${t.sub} mt-1`}>Set up your daily commute, school run, or church route once — drivers come to you automatically.</p>
              <button onClick={()=>setView("create")} style={{marginTop:16,padding:"12px 24px",background:"#1d4ed8",color:"#fff",borderRadius:14,fontWeight:900}}>Create First Schedule</button>
            </div>
          )}
          {schedules.map(s=>(
            <div key={s.id} className={`${t.card} rounded-2xl p-4 border-2`} style={{borderColor:s.paused?"#9ca3af":"#1d4ed8"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <p className={`font-black ${t.text}`}>{s.name}</p>
                  <p className={`text-xs ${t.sub}`}>{s.pickupAddress} → {s.destAddress}</p>
                  <p className={`text-xs ${t.sub}`}>⏰ {s.departTime} · {s.days.map(d=>DAYS_LABELS[d]).join(", ")}</p>
                </div>
                <span style={{padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:s.paused?"#f3f4f6":"#eff6ff",color:s.paused?"#6b7280":"#1d4ed8"}}>{s.paused?"Paused":"Active"}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button onClick={async()=>{try{await api.pauseSchedule(s.id);}catch(err){console.warn(err);}setSchedules(prev=>prev.map(x=>x.id===s.id?{...x,paused:!x.paused}:x));toast$(s.paused?"Resumed":"Paused");}}
                  style={{padding:"9px",borderRadius:12,fontWeight:700,fontSize:12,background:s.paused?"#16a34a":"#fef2f2",color:s.paused?"#fff":"#ef4444",border:"none",cursor:"pointer"}}>
                  {s.paused?"▶ Resume":"⏸ Pause"}
                </button>
                <button onClick={()=>openAdjust(s)}
                  style={{padding:"9px",borderRadius:12,fontWeight:700,fontSize:12,background:"#eff6ff",color:"#1d4ed8",border:"none",cursor:"pointer"}}>
                  ✏️ Adjust
                </button>
              </div>
            </div>
          ))}
        </>)}

        {view==="create"&&(<>
          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black mb-3 ${t.text}`}>Trip Name & Route</p>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:12}}>
              {CATS.map(c=>(
                <button key={c.id} onClick={()=>{setCategory(c.id);setName(c.id.charAt(0).toUpperCase()+c.id.slice(1)+" Trip");}}
                  style={{padding:"8px 14px",borderRadius:20,fontSize:12,fontWeight:700,border:"2px solid",borderColor:category===c.id?"#1d4ed8":"#e5e7eb",background:category===c.id?"#eff6ff":"transparent",color:category===c.id?"#1d4ed8":dark?"#9ca3af":"#6b7280",cursor:"pointer"}}>
                  {c.icon} {c.id.charAt(0).toUpperCase()+c.id.slice(1)}
                </button>
              ))}
            </div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Schedule name (e.g. Morning Commute)"
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%",marginBottom:10}}/>
            <input value={pickup} onChange={e=>setPickup(e.target.value)} list="locs" placeholder="📍 Pickup location"
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%",marginBottom:10}}/>
            <input value={dest} onChange={e=>setDest(e.target.value)} list="locs" placeholder="🏁 Destination"
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%"}}/>
          </div>

          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black mb-3 ${t.text}`}>Vehicle & Times</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
              {RENTAL_VEHICLES.map(v=>(
                <button key={v.id} onClick={()=>setVehicle(v.id)}
                  style={{padding:"10px 4px",borderRadius:12,textAlign:"center",border:"2px solid",borderColor:vehicle===v.id?"#1d4ed8":"#e5e7eb",background:vehicle===v.id?"#eff6ff":"transparent",cursor:"pointer"}}>
                  <div style={{fontSize:20}}>{v.icon}</div>
                  <div style={{fontSize:10,fontWeight:700,color:vehicle===v.id?"#1d4ed8":dark?"#9ca3af":"#6b7280",marginTop:2}}>{v.label}</div>
                </button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <p className={`text-xs font-bold mb-1 ${t.sub}`}>DEPART TIME</p>
                <input type="time" value={departTime} onChange={e=>setDepartTime(e.target.value)}
                  className={`w-full px-3 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%"}}/>
              </div>
              <div>
                <p className={`text-xs font-bold mb-1 ${t.sub}`}>RETURN TIME</p>
                <input type="time" value={returnTime} onChange={e=>setReturnTime(e.target.value)}
                  className={`w-full px-3 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%"}}/>
              </div>
            </div>
          </div>

          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black mb-3 ${t.text}`}>Repeat Days</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
              {DAYS_LABELS.map((d,i)=>(
                <button key={i} onClick={()=>toggleDay(i)}
                  style={{padding:"10px 2px",borderRadius:10,textAlign:"center",fontSize:11,fontWeight:700,border:"2px solid",borderColor:days.includes(i)?"#1d4ed8":"#e5e7eb",background:days.includes(i)?"#1d4ed8":"transparent",color:days.includes(i)?"#fff":dark?"#9ca3af":"#6b7280",cursor:"pointer"}}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`} style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <p className={`font-bold text-sm ${t.text}`}>💰 Pay from Savings</p>
              <p className={`text-xs ${t.sub}`}>Auto-deduct trip fares from savings balance</p>
            </div>
            <button onClick={()=>setPayFromSavings(!payFromSavings)}
              style={{width:44,height:24,borderRadius:12,background:payFromSavings?"#1d4ed8":"#9ca3af",position:"relative",border:"none",cursor:"pointer",transition:"background 0.2s"}}>
              <div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:payFromSavings?22:3,transition:"left 0.2s"}}/>
            </button>
          </div>

          <button onClick={createSchedule} disabled={loading}
            style={{width:"100%",padding:"14px",background:"#1d4ed8",color:"#fff",borderRadius:16,fontWeight:900,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,border:"none",cursor:"pointer",opacity:loading?0.7:1}}>
            {loading&&<Loader className="w-4 h-4 animate-spin"/>} Create Schedule ✅
          </button>
        </>)}
      </div>

      {/* Adjust sheet */}
      {adjusting&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:60,display:"flex",alignItems:"flex-end",maxWidth:448,margin:"0 auto"}}>
          <div className={`${t.card} rounded-t-3xl p-6 w-full shadow-2xl`}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <h3 className={`text-lg font-black ${t.text}`}>✏️ Adjust {adjusting.name}</h3>
              <button onClick={()=>setAdjusting(null)} style={{background:"none",border:"none",fontSize:18,color:dark?"#9ca3af":"#6b7280",cursor:"pointer"}}>✕</button>
            </div>
            <p className={`text-xs ${t.sub} mb-4`}>{adjusting.pickupAddress} → {adjusting.destAddress} · usually {adjusting.departTime}</p>

            <p className={`text-xs font-bold mb-1 ${t.sub}`}>DATE</p>
            <input type="date" value={adjustDate} onChange={e=>setAdjustDate(e.target.value)}
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%",marginBottom:12}}/>

            <p className={`text-xs font-bold mb-1 ${t.sub}`}>NEW TIME (leave as-is to only skip)</p>
            <input type="time" value={adjustTime} onChange={e=>setAdjustTime(e.target.value)}
              className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{display:"block",width:"100%",marginBottom:16}}/>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={submitSkip} disabled={adjustBusy}
                style={{padding:"12px",border:"1px solid #f87171",color:"#ef4444",borderRadius:14,fontWeight:700,fontSize:13,opacity:adjustBusy?0.6:1}}>
                {adjustBusy?"…":"Skip this date"}
              </button>
              <button onClick={submitTimeChange} disabled={adjustBusy}
                style={{padding:"12px",background:"#1d4ed8",color:"#fff",borderRadius:14,fontWeight:900,fontSize:13,opacity:adjustBusy?0.6:1}}>
                {adjustBusy?"…":"Change time"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
