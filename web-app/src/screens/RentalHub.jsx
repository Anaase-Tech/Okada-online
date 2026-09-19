import { useState, useEffect } from "react";
import { Loader, CheckCircle } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";
import { Badge } from "../components/Badge";

export function RentalHub({user, dark, onBack}) {
  const t = T(dark);
  const [tab, setTab]         = useState("browse");
  const [vehicle, setVehicle] = useState("kantanka_car");
  const [period, setPeriod]   = useState("daily");
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState(null);
  const [activeRentals, setActiveRentals] = useState([]);
  const toast$ = (msg, type="success") => setToast({msg, type});

  const VEHICLES = [
    {id:"kantanka_car", label:"Kantanka Car",  icon:"🚗",  brand:"Made in Ghana",  tag:"Most Popular"},
    {id:"kantanka_suv", label:"Kantanka SUV",  icon:"🚙",  brand:"Made in Ghana",  tag:"Premium"},
    {id:"ev_car",       label:"EV Car",        icon:"⚡🚗", brand:"Zero Emission",  tag:"Eco"},
    {id:"ev_motorcycle",label:"EV Motorcycle", icon:"⚡🏍️",brand:"Zero Emission",  tag:"Budget"},
  ];
  const PERIODS = [
    {id:"daily",  label:"Daily",   icon:"📅"},
    {id:"weekly", label:"Weekly",  icon:"🗓️"},
    {id:"monthly",label:"Monthly", icon:"📆"},
    {id:"annual", label:"Annual",  icon:"🗃️"},
  ];
  const PRICING = {
    kantanka_car:  {daily:{price:350,km:80},  weekly:{price:2100,km:560},  monthly:{price:7500,km:2400},  annual:{price:75000,km:30000}},
    kantanka_suv:  {daily:{price:500,km:100}, weekly:{price:3000,km:700},  monthly:{price:11000,km:3000}, annual:{price:110000,km:36000}},
    ev_car:        {daily:{price:420,km:120}, weekly:{price:2520,km:840},  monthly:{price:9000,km:3600},  annual:{price:90000,km:43200}},
    ev_motorcycle: {daily:{price:120,km:80},  weekly:{price:720,km:560},   monthly:{price:2500,km:2400},  annual:null},
  };

  useEffect(()=>{
    api.getActiveRentals(user.id).then(r=>setActiveRentals(r.rentals||[])).catch(()=>{});
  },[user.id]);

  const selected  = VEHICLES.find(v=>v.id===vehicle);
  const planPrice = PRICING[vehicle]?.[period];

  const book = async () => {
    if(!planPrice){toast$("This plan is not available","error");return;}
    setLoading(true);
    try {
      const r = await api.bookRental({userId:user.id,vehicleType:vehicle,period,startDate:new Date().toISOString(),driverIncluded:false});
      toast$(`${selected.label} booked for ${period}! GH₵${r.totalPrice} 🚗`);
      setTab("active");
    } catch(err) { console.warn(err); toast$(`${selected.label} rental booked (demo)! GH₵${planPrice.price}`); }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100%"}} className={t.bg}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      <div style={{background:"linear-gradient(135deg,#0f172a,#1e293b)",color:"#fff",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:20}}>
        {onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:8,padding:"6px 10px",fontSize:14,cursor:"pointer"}}>←</button>}
        <div>
          <p style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:17,margin:0}}>🚗 Okada Rentals</p>
          <p style={{fontSize:11,margin:0,color:"#94a3b8"}}>New Kantanka + EV only · Luxury · Comfort · Safety</p>
        </div>
      </div>

      <div style={{display:"flex",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`,background:t.card}}>
        {[["browse","Browse"],["active","My Rentals"]].map(([id,lb])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{flex:1,padding:"11px",fontSize:13,fontWeight:700,color:tab===id?"#1d4ed8":dark?"#9ca3af":"#6b7280",background:"transparent",border:"none",borderBottom:`2px solid ${tab===id?"#1d4ed8":"transparent"}`,cursor:"pointer"}}>
            {lb}
          </button>
        ))}
      </div>

      <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>

        {tab==="browse"&&(<>
          <div style={{background:"linear-gradient(135deg,#0f172a,#1e293b)",borderRadius:16,padding:16,color:"#fff"}}>
            <p style={{fontWeight:900,fontSize:14,marginBottom:4}}>🏆 Brand Standard</p>
            <p style={{fontSize:12,color:"#94a3b8",lineHeight:1.5}}>Only brand-new Kantanka (Made in Ghana 🇬🇭) and EV vehicles. Every rental comes fully insured, GPS-tracked, and regularly serviced.</p>
            <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
              {["Brand New","GPS Tracked","Fully Insured","EV Available","Made in Ghana"].map(f=>(
                <span key={f} style={{background:"rgba(255,255,255,0.1)",borderRadius:20,padding:"4px 10px",fontSize:10,fontWeight:700}}>{f}</span>
              ))}
            </div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {VEHICLES.map(v=>(
              <button key={v.id} onClick={()=>setVehicle(v.id)}
                style={{display:"flex",alignItems:"center",gap:14,padding:14,borderRadius:16,border:`2px solid ${vehicle===v.id?"#1d4ed8":"#e5e7eb"}`,background:vehicle===v.id?(dark?"#1e3a5f":"#eff6ff"):"transparent",textAlign:"left",cursor:"pointer",width:"100%"}}>
                <span style={{fontSize:32}}>{v.icon}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <p style={{fontWeight:900,color:vehicle===v.id?"#1d4ed8":dark?"#fff":"#111827",fontSize:14,margin:0}}>{v.label}</p>
                    <span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:"#0f172a",color:"#94a3b8"}}>{v.tag}</span>
                  </div>
                  <p style={{fontSize:11,color:dark?"#9ca3af":"#6b7280",margin:"2px 0 0"}}>🏭 {v.brand}</p>
                </div>
                {vehicle===v.id&&<CheckCircle style={{width:20,height:20,color:"#1d4ed8"}}/>}
              </button>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {PERIODS.map(p=>{
              const price = PRICING[vehicle]?.[p.id];
              return (
                <button key={p.id} onClick={()=>price&&setPeriod(p.id)}
                  style={{padding:"10px 4px",borderRadius:12,textAlign:"center",border:`2px solid ${period===p.id?"#1d4ed8":"#e5e7eb"}`,background:period===p.id?"#eff6ff":"transparent",opacity:price?1:0.4,cursor:price?"pointer":"not-allowed"}}>
                  <div style={{fontSize:18}}>{p.icon}</div>
                  <div style={{fontSize:10,fontWeight:700,color:period===p.id?"#1d4ed8":dark?"#9ca3af":"#6b7280",marginTop:2}}>{p.label}</div>
                  {price&&<div style={{fontSize:11,fontWeight:900,color:"#1d4ed8",marginTop:2}}>GH₵{price.price}</div>}
                </button>
              );
            })}
          </div>

          {planPrice&&(
            <div style={{background:dark?"#1e3a5f":"#eff6ff",borderRadius:14,padding:14,border:"1px solid #bfdbfe"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span className={t.sub} style={{fontSize:13}}>Rental fee</span>
                <span style={{fontWeight:900,color:"#1d4ed8",fontSize:16}}>GH₵{planPrice.price}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span className={t.sub} style={{fontSize:13}}>Included km</span>
                <span style={{fontWeight:700,fontSize:13}} className={t.text}>{planPrice.km} km</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span className={t.sub} style={{fontSize:13}}>Extra km rate</span>
                <span style={{fontWeight:700,fontSize:13}} className={t.text}>GH₵{(PRICING[vehicle]?.[period+"_extra"]||2.50).toFixed(2)}/km</span>
              </div>
            </div>
          )}

          <button onClick={book} disabled={loading||!planPrice}
            style={{width:"100%",padding:"14px",background:!planPrice?"#9ca3af":"#0f172a",color:"#fff",borderRadius:16,fontWeight:900,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,border:"none",cursor:planPrice?"pointer":"not-allowed",opacity:loading?0.7:1}}>
            {loading&&<Loader className="w-4 h-4 animate-spin"/>}
            {planPrice?`Book ${selected?.label} — GH₵${planPrice.price}`:"Select vehicle and period"}
          </button>
        </>)}

        {tab==="active"&&(<>
          {activeRentals.length===0?(
            <div style={{textAlign:"center",padding:"40px 0"}}>
              <div style={{fontSize:48,marginBottom:12}}>🚗</div>
              <p className={`font-bold ${t.text}`}>No active rentals</p>
              <button onClick={()=>setTab("browse")} style={{marginTop:14,padding:"10px 24px",background:"#0f172a",color:"#fff",borderRadius:12,fontWeight:700}}>Browse Vehicles</button>
            </div>
          ):activeRentals.map(r=>(
            <div key={r.id} className={`${t.card} rounded-2xl p-4 border-2 border-blue-500`}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <p className={`font-black ${t.text}`}>{r.vehicleType.replace("_"," ").toUpperCase()}</p>
                <span style={{padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:"#eff6ff",color:"#1d4ed8"}}>{r.status}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{background:"#f9fafb",borderRadius:10,padding:10,textAlign:"center"}}>
                  <p style={{fontSize:10,color:"#6b7280",fontWeight:700}}>KM USED</p>
                  <p style={{fontWeight:900,color:"#1d4ed8"}}>{r.kmUsed||0} / {r.includedKm}</p>
                </div>
                <div style={{background:"#f9fafb",borderRadius:10,padding:10,textAlign:"center"}}>
                  <p style={{fontSize:10,color:"#6b7280",fontWeight:700}}>ENDS</p>
                  <p style={{fontWeight:900,fontSize:12}} className={t.text}>{new Date(r.endDate?.seconds*1000||r.endDate).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          ))}
        </>)}
      </div>
    </div>
  );
}
