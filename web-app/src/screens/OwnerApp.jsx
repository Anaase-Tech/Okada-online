import { useState, useEffect } from "react";
import { Building2, Moon, Sun, Eye, EyeOff, Copy, Fuel, Wrench, ArrowDownCircle, LogOut } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { VEHICLES } from "../constants";
import { Toast } from "../components/Toast";
import { Badge } from "../components/Badge";
import { StatCard } from "../components/StatCard";
import { KycVerify } from "./KycVerify";
import { FintechHub } from "./FintechHub";
import { WithdrawSheet } from "./WithdrawSheet";
import { DriveToOwn } from "./DriveToOwn";

export function OwnerApp({user,onLogout,dark,setDark}) {
  const t=T(dark);
  const [view,setView]=useState("dashboard");
  const [stats,setStats]=useState({today:0,week:0,total:0,activeDrivers:0,totalDrivers:0,pools:{fuel:0,maintenance:0}});
  const [wallet,setWallet]=useState({available:0,pending:0});
  const [showCode,setShowCode]=useState(false);
  const [showWithdraw,setShowWithdraw]=useState(false);
  // Real accounts carry kycStatus ('pending'|'submitted'|'approved'|
  // 'rejected'); only demo accounts carry kycData/ghanaCard. The old
  // check here (!user.kycData && !user.ghanaCard) is always true for a
  // real account regardless of actual status, since those fields never
  // exist on one — meaning every real owner got sent back through the
  // full KYC flow on every single login, even after being approved.
  const [showKyc,setShowKyc]=useState(
    user.kycStatus ? user.kycStatus==="pending" : !(user.kycData||user.ghanaCard)
  );
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  useEffect(()=>{
    api.getOwnerDash(user.id).then(r=>{
      const d = r.data||{};
      setStats({
        today: d.today||0, week: d.week||0, total: d.total||0,
        activeDrivers: d.activeDrivers||0, totalDrivers: d.totalDrivers||0,
        verifiedDrivers: d.verifiedDrivers||0,
        pools: d.pools||{fuel:0,maintenance:0},
      });
      setWallet(d.wallet||{available:0,pending:0});
    }).catch(err=>console.warn("Owner dashboard fetch failed:",err));
  },[user.id]);

  if(showKyc) return <KycVerify role="owner" dark={dark} onVerified={()=>setShowKyc(false)}/>;

  const NAV_ITEMS = [["dashboard","📊","Dashboard"],["fintech","💎","Fintech"],["dto","🏍️","Own"],["fleet","🚗","Fleet"],["pools","⛽","Pools"]];

  const Nav=()=>(
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr}`}
      style={{display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"6px 4px",zIndex:30}}>
      {NAV_ITEMS.map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)}
          style={{display:"flex",flexDirection:"column",alignItems:"center",flex:"0 0 auto",padding:"4px 10px",minWidth:52,color:view===v?"#2563eb":dark?"#9ca3af":"#6b7280"}}>
          <span style={{fontSize:18}}>{ic}</span><span style={{fontSize:10,fontWeight:700,marginTop:1,whiteSpace:"nowrap"}}>{lb}</span>
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
              <StatCard icon="💰" label="Today (50%)" value={"GH₵"+stats.today.toFixed(2)} color="green" dark={dark}/>
              <StatCard icon="📅" label="This Week" value={"GH₵"+stats.week.toFixed(2)} color="blue" dark={dark}/>
              <StatCard icon="🏆" label="Total Earned" value={"GH₵"+stats.total.toFixed(2)} color="purple" dark={dark}/>
              <StatCard icon="👥" label="Drivers" value={`${stats.activeDrivers}/${stats.totalDrivers}`} sub="Online/Total" color="yellow" dark={dark}/>
            </div>
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <h3 className={`font-bold mb-3 ${t.text}`}>Revenue Split (GH₵{stats.total.toFixed(2)})</h3>
              {[["Your share (50%)","GH₵"+(stats.total*0.50).toFixed(0),"#16a34a"],["Driver earnings (25%)","GH₵"+(stats.total*0.25).toFixed(0),"#2563eb"],["Fuel pool (5%)","GH₵"+(stats.total*0.05).toFixed(0),"#ca8a04"],["Maintenance (5%)","GH₵"+(stats.total*0.05).toFixed(0),"#ea580c"],["Platform (15%)","GH₵"+(stats.total*0.15).toFixed(0),"#9ca3af"]].map(([l,v,c])=>(
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
            {(user.vehicles||[]).length===0?(
              <div style={{textAlign:"center",padding:"48px 0"}}>
                <div style={{fontSize:48,marginBottom:12}}>🚗</div>
                <p className={t.sub}>No vehicles added yet</p>
              </div>
            ):(user.vehicles||[]).map(v=>(
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
            {[{icon:<Fuel style={{width:20,height:20,color:"#ca8a04"}}/>,label:"Fuel Pool",val:stats.pools.fuel,color:"#ca8a04",border:"border-yellow-500",items:["🔒 Locked — fuel stations only","⛽ Driver code at pump","📊 Full transaction log"]},
              {icon:<Wrench style={{width:20,height:20,color:"#ea580c"}}/>,label:"Maintenance Pool",val:stats.pools.maintenance,color:"#ea580c",border:"border-orange-500",items:["🔧 Service due alerts","✅ You approve payments","📱 Direct to garages"]}
            ].map(p=>(
              <div key={p.label} className={`${t.card} rounded-2xl p-4 border-2 ${p.border}`}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>{p.icon}<span className={`font-black ${t.text}`}>{p.label}</span></div>
                  <span style={{fontSize:22,fontWeight:900,color:p.color}}>GH₵{p.val.toFixed(2)}</span>
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
