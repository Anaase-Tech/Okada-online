import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { MapPin, Navigation, Moon, Sun, LogOut, Download, Landmark, ArrowDownCircle } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";
import { Badge } from "../components/Badge";
import { StatCard } from "../components/StatCard";
import { MaasAdminView } from "./MaasAdminView";
import { TransitOperations } from "./TransitOperations";

export function AdminApp({user,onLogout,dark,setDark}) {
  const t=T(dark);
  const [view,setView]=useState("overview");
  const [stats,setStats]=useState({totalRides:5432,activeRides:23,totalDrivers:87,onlineDrivers:34,revenue:18450,commission:2767,users:1247,owners:42,pendingKyc:14,totalLoans:32,activePolicies:67});
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});
  useEffect(()=>{
    // Fetch stats
    api.getStats().then(r=>setStats(r.data||r)).catch(()=>{});
    // Real-time active ride count via Firestore
    const tryRealtime = async () => {
      try {
        // db already imported at module level
        const q = query(collection(db,'rides'), where('status','in',['searching','accepted','ongoing']));
        const unsub = onSnapshot(q,(snap)=>{
          setStats(s=>({...s, activeRides:snap.size}));
        }, ()=>{});
        return unsub;
      } catch(err) { return null; }
    };
    let unsub;
    tryRealtime().then(u=>{unsub=u;});
    return ()=>{ if(unsub) unsub(); };
  },[]);

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
  const tabs=[["overview","📊","Overview"],["rides","🏍️","Rides"],["drivers","👥","Drivers"],["fintech","💎","Fintech"],["maas","🚗","MaaS"],["transit","🚌","Transit"],["kyc","🪪","KYC"]];

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
              {title:"Firebase Auth",icon:"🔥",items:[["OTP Provider","Firebase Phone Auth ✅"],["Free OTPs/mo","10,000"],["Ghana (+233)","Supported"]]},
              {title:"Firebase",icon:"⚡",items:[["Functions","Deployed ✅"],["USSD","*711# ready"],["Project","okada-online-ghana"]]},
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

        {view==="transit"&&(
          <div style={{padding:16}}>
            <TransitOperations dark={dark} t={t}/>
          </div>
        )}

        {view==="maas"&&(
          <div style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h2 className={`font-black text-lg ${t.text}`}>🚗 MaaS Overview</h2>
              <Badge color="green">● Live</Badge>
            </div>
            <MaasAdminView dark={dark} t={t}/>
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
