import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { MapPin, Navigation, Star, X, Moon, Sun, AlertCircle, CheckCircle, LogOut, Eye, EyeOff, Copy, Fuel, Wrench, ArrowDownCircle, Clock } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";
import { Badge } from "../components/Badge";
import { StatCard } from "../components/StatCard";
import { Map } from "../components/Map";
import { KycVerify } from "./KycVerify";
import { FintechHub } from "./FintechHub";
import { WithdrawSheet } from "./WithdrawSheet";
import { DriverPickups } from "./DriverPickups";
import { DriveToOwn } from "./DriveToOwn";

export function DriverApp({user,onLogout,dark,setDark}) {
  const t=T(dark);
  const [view,setView]=useState("home");
  const [online,setOnline]=useState(false);
  const [driverSelfPos,setDriverSelfPos]=useState(null);
  const [incoming,setIncoming]=useState(null);
  const [activeRide,setActiveRide]=useState(null);
  const [cashConfirm,setCashConfirm]=useState(null);
  const [completing,setCompleting]=useState(false);
  const [earnings,setEarnings]=useState({today:0,week:0,total:0,rides:0});
  const [wallet,setWallet]=useState({available:0,pending:0});
  const [showWithdraw,setShowWithdraw]=useState(false);
  const [showFuelCode,setShowFuelCode]=useState(false);
  const [fuelCode]=useState("FUEL-"+Math.random().toString(36).substr(2,4).toUpperCase()+"-"+Math.random().toString(36).substr(2,4).toUpperCase());
  const [showKyc,setShowKyc]=useState(!user.kycData&&!user.ghanaCard);
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  // Load real earnings/wallet from the backend on mount, instead of
  // always starting from zero. Falls back to whatever the profile object
  // already carried (e.g. from a demo session) if the fetch fails.
  useEffect(()=>{
    api.req("GET",`/auth/profile/${user.firebaseUid||user.id}`)
      .then(r=>{
        const u = r.user||{};
        setEarnings(u.earnings || {today:0,week:0,total:0,rides:u.totalRides||0});
        setWallet(u.wallet || {available:0,pending:0});
      })
      .catch(()=>{
        setEarnings(user.earnings || {today:0,week:0,total:0,rides:0});
        setWallet(user.wallet || {available:0,pending:0});
      });
  },[user.id, user.firebaseUid]);

  // Real-time ride requests via Firestore
  useEffect(()=>{
    if(!online||incoming||activeRide||cashConfirm) return;
    // Try real Firestore listener first
    let unsub = null;
    const tryRealtime = async () => {
      try {
        // db already imported at module level
        const q = query(
          collection(db, 'rides'),
          where('status','==','requested'),
          where('rideType','==','okada'),
          orderBy('createdAt','desc'),
          limit(1)
        );
        unsub = onSnapshot(q, (snap) => {
          if(!snap.empty) {
            const doc = snap.docs[0];
            const r = doc.data();
            setIncoming({
              id: doc.id,
              passenger: r.userName || 'Passenger',
              phone: r.userPhone || '',
              from: r.pickupLocation?.address || 'Pickup',
              to: r.destination?.address || 'Destination',
              dist: r.distance ? `${r.distance} km` : '—',
              dur: r.estimatedDuration ? `${r.estimatedDuration} min` : '—',
              fare: 'GH₵' + (r.fare?.total || '0'),
              // Displayed estimate only — the real, authoritative split
              // (including any female/EV bonus) is computed server-side
              // when the ride is actually completed via calcFareSplits.
              earn: 'GH₵' + (r.fare?.driver ?? ((r.fare?.total||0) * 0.25)).toFixed(2),
              payMethod: r.payMethod || 'mtn',
            });
          }
        }, () => {
          // Firestore unavailable — demo simulation fallback
          const tm = setTimeout(()=>setIncoming({id:'demo_ride_'+Date.now(),demo:true,passenger:'Ama Owusu',phone:'+233205556789',from:'Akosombo',to:'Atimpoku',dist:'4.2 km',dur:'12 min',fare:'GH₵13.50',earn:'GH₵3.38',payMethod:['mtn','cash','vodafone'][Math.floor(Math.random()*3)]}),5000);
          return ()=>clearTimeout(tm);
        });
      } catch(err) {
        // Demo fallback
        const tm = setTimeout(()=>setIncoming({id:'demo_ride_'+Date.now(),demo:true,passenger:'Ama Owusu',phone:'+233205556789',from:'Akosombo',to:'Atimpoku',dist:'4.2 km',dur:'12 min',fare:'GH₵13.50',earn:'GH₵3.38',payMethod:['mtn','cash','vodafone'][Math.floor(Math.random()*3)]}),5000);
        return ()=>clearTimeout(tm);
      }
    };
    tryRealtime();
    return ()=>{ if(unsub) unsub(); };
  },[online,incoming,activeRide,cashConfirm]);

  // Broadcast live GPS while online — also drives the on-screen map pin
  useEffect(()=>{
    if(!online){ setDriverSelfPos(null); return; }
    const tick=()=>{
      const lat=6.2966+(Math.random()-0.5)*0.01, lng=0.0568+(Math.random()-0.5)*0.01;
      setDriverSelfPos({lat,lng});
      api.updateLocation(user.id,lat,lng).catch(()=>{});
    };
    tick();
    const iv=setInterval(tick,5000);
    return()=>clearInterval(iv);
  },[online,user.id]);

  useEffect(()=>{
    if(!activeRide||activeRide.payMethod!=="cash") return;
    const tm=setTimeout(()=>setCashConfirm(activeRide),8000);
    return()=>clearTimeout(tm);
  },[activeRide]);

  const toggleOnline=async()=>{
    try{await api.toggleOnline(user.id,!online,"okada");}catch(err){ console.warn("Error:",err); }
    setOnline(!online);
    toast$(online?"You're offline":"Online! Waiting for rides 🏍️");
  };

  const accept=async()=>{
    try{await api.acceptRide(incoming.id,user.id);}catch(err){ console.warn("Error:",err); }
    setActiveRide(incoming);setIncoming(null);
    toast$("Ride accepted! Navigate to passenger 📍");
  };

  // Finishes a ride for real: calls the backend's /rides/:id/complete,
  // which is what actually moves money — credits the driver's real
  // share (with any female/EV bonus applied), pays the owner, deducts
  // any active Drive to Own or loan installment, and tops up the fuel
  // and maintenance pools. Demo rides (no backend record) still get the
  // old client-side simulation so the demo experience keeps working.
  const finishRide = async (ride) => {
    setCompleting(true);
    try {
      if (!ride.demo) {
        const res = await api.completeRide(ride.id);
        setEarnings(e=>({
          today: +(e.today + res.netDriverEarnings).toFixed(2),
          week:  +(e.week  + res.netDriverEarnings).toFixed(2),
          total: +(e.total + res.netDriverEarnings).toFixed(2),
          rides: e.rides + 1,
        }));
        setWallet(w=>({ ...w, pending: +(w.pending + res.netDriverEarnings).toFixed(2) }));
        toast$(`Ride complete! +GH₵${res.netDriverEarnings.toFixed(2)} (24hr hold) 💰`);
      } else {
        const earned=parseFloat((ride.earn||"GH₵3.38").replace("GH₵",""));
        setEarnings(e=>({today:+(e.today+earned).toFixed(2),week:+(e.week+earned).toFixed(2),total:+(e.total+earned).toFixed(2),rides:e.rides+1}));
        setWallet(w=>({available:w.available,pending:+(w.pending+earned).toFixed(2)}));
        setTimeout(()=>setWallet(w=>({available:+(w.available+earned).toFixed(2),pending:Math.max(0,+(w.pending-earned).toFixed(2))})),5000);
        toast$(`Ride complete! +GH₵${earned.toFixed(2)} (demo) 💰`);
      }
    } catch (e) {
      console.error("completeRide failed:", e);
      toast$(`Couldn't complete the ride on the server (${e.message}) — nothing was charged`, "error");
    }
    setCompleting(false);
    setCashConfirm(null);
    setActiveRide(null);
  };

  const confirmCash = () => finishRide(cashConfirm);
  const complete    = () => finishRide(activeRide);

  if(showKyc) return <KycVerify role="driver" dark={dark} onVerified={()=>setShowKyc(false)}/>;

  const NAV_ITEMS = [["home","🏠","Home"],["pickups","📋","Pickups"],["fintech","💎","Fintech"],["dto","🏍️","Own"],["earnings","💰","Earn"],["profile","👤","Me"]];

  const Nav=()=>(
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr}`}
      style={{display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"6px 4px",zIndex:30}}>
      {NAV_ITEMS.map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)}
          style={{display:"flex",flexDirection:"column",alignItems:"center",flex:"0 0 auto",padding:"4px 10px",minWidth:52,color:view===v?"#16a34a":dark?"#9ca3af":"#6b7280"}}>
          <span style={{fontSize:18}}>{ic}</span><span style={{fontSize:10,fontWeight:700,marginTop:1,whiteSpace:"nowrap"}}>{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`max-w-md mx-auto min-h-screen ${t.bg}`}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      {showWithdraw&&<WithdrawSheet available={wallet.available} pending={wallet.pending} userId={user.id} onClose={()=>setShowWithdraw(false)} dark={dark}/>}

      {/* Cash confirm overlay */}
      {cashConfirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",maxWidth:448,margin:"0 auto",padding:"0 20px"}}>
          <div className={`${t.card} rounded-3xl p-6 w-full shadow-2xl`}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:44,marginBottom:8}}>💵</div>
              <h3 className={`font-black text-lg ${t.text}`}>Cash Confirmation</h3>
              <p className={`text-sm ${t.sub} mt-1`}>{cashConfirm.passenger} says they paid cash</p>
            </div>
            <div style={{background:dark?"#374151":"#f0fdf4",borderRadius:14,padding:"16px",textAlign:"center",marginBottom:14}}>
              <p style={{fontWeight:900,color:"#16a34a",fontSize:32}}>GH₵{cashConfirm.fare?.replace("GH₵","")}</p>
              <p className={`text-xs ${t.sub}`}>{cashConfirm.from} → {cashConfirm.to}</p>
            </div>
            <div style={{background:dark?"#1c1917":"#fef3c7",borderRadius:12,padding:"10px 12px",marginBottom:14,display:"flex",gap:8}}>
              <AlertCircle style={{width:14,height:14,color:"#ca8a04",flexShrink:0,marginTop:1}}/>
              <p style={{fontSize:11,color:"#92400e"}}>Only confirm if cash physically received. Cannot be undone.</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>{setCashConfirm(null);toast$("Dispute raised — admin will review","error");}}
                style={{padding:"12px",border:"1px solid #f87171",color:"#ef4444",borderRadius:14,fontWeight:700,fontSize:13}}>❌ Not Received</button>
              <button onClick={confirmCash} disabled={completing}
                style={{padding:"12px",background:"#16a34a",color:"#fff",borderRadius:14,fontWeight:900,fontSize:13,opacity:completing?0.6:1}}>
                {completing?"Confirming…":"✅ Confirm Cash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming ride */}
      {incoming&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:50,display:"flex",alignItems:"flex-end",maxWidth:448,margin:"0 auto"}}>
          <div className={`${t.card} rounded-t-3xl p-6 w-full shadow-2xl`}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
              <div><h3 className={`text-lg font-black ${t.text}`}>🏍️ New Ride!</h3><p className={t.sub} style={{fontSize:12}}>Respond in 30 seconds</p></div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <Badge color="green">+{incoming.earn}</Badge>
                <Badge color={incoming.payMethod==="cash"?"yellow":"blue"}>{incoming.payMethod==="cash"?"💵 Cash":"💳 MoMo"}</Badge>
              </div>
            </div>
            <div className={`${dark?"bg-gray-700":"bg-gray-50"} rounded-2xl p-3 mb-4`} style={{display:"flex",flexDirection:"column",gap:8,fontSize:13}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><MapPin style={{width:14,height:14,color:"#16a34a"}}/><span className={t.text}>{incoming.from}</span></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}><Navigation style={{width:14,height:14,color:"#ef4444"}}/><span className={t.text}>{incoming.to}</span></div>
              <div style={{display:"flex",gap:16,paddingTop:4}}>
                <span className={t.sub}>📏 {incoming.dist}</span><span className={t.sub}>⏱️ {incoming.dur}</span>
                <span style={{color:"#16a34a",fontWeight:700}}>{incoming.fare}</span>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <button onClick={()=>setIncoming(null)} style={{padding:"14px",border:"1px solid #f87171",color:"#ef4444",borderRadius:16,fontWeight:700}}>Decline</button>
              <button onClick={accept} style={{padding:"14px",background:"#16a34a",color:"#fff",borderRadius:16,fontWeight:700}}>Accept ✅</button>
            </div>
          </div>
        </div>
      )}

      <div style={{background:"#166534",color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>🏍️</span><span style={{fontFamily:"Syne,sans-serif",fontWeight:900}}>Driver Portal</span></div>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",borderRadius:999,background:online?"#16a34a":"#4b5563",fontSize:11,fontWeight:900}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:online?"#fff":"#9ca3af"}}/>{online?"ONLINE":"OFFLINE"}
        </div>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="fintech"&&<FintechHub user={user} role="driver" dark={dark}/>}
        {view==="pickups"&&<DriverPickups user={user} dark={dark} onBack={()=>setView("home")}/>}
        {view==="dto"&&<DriveToOwn user={user} role="driver" dark={dark} onBack={()=>setView("home")}/>}

        {view==="home"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
            <Map dark={dark} height={150} status={online?"ongoing":"idle"} driverPos={driverSelfPos}/>
            <button onClick={toggleOnline} style={{width:"100%",padding:"14px",borderRadius:16,fontWeight:900,fontSize:16,color:"#fff",background:online?"#dc2626":"#16a34a"}}>
              {online?"🔴 Go Offline":"🟢 Go Online — Start Earning"}
            </button>

            {/* Wallet */}
            <div className={`${t.card} rounded-2xl p-4 border-2 border-green-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <p style={{color:"#16a34a",fontWeight:900,fontSize:13}}>💰 My Wallet</p>
                <button onClick={()=>setShowWithdraw(true)} style={{padding:"6px 12px",background:"#16a34a",color:"#fff",borderRadius:10,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                  <ArrowDownCircle style={{width:12,height:12}}/> Withdraw
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{background:"#f0fdf4",borderRadius:12,padding:"10px",textAlign:"center"}}>
                  <p style={{fontSize:10,color:"#16a34a",fontWeight:700}}>AVAILABLE</p>
                  <p style={{fontWeight:900,color:"#16a34a",fontSize:20}}>GH₵{wallet.available.toFixed(2)}</p>
                </div>
                <div style={{background:dark?"#374151":"#fefce8",borderRadius:12,padding:"10px",textAlign:"center"}}>
                  <p style={{fontSize:10,color:"#ca8a04",fontWeight:700}}>PENDING 24H</p>
                  <p style={{fontWeight:900,color:"#ca8a04",fontSize:20}}>GH₵{wallet.pending.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <StatCard icon="💰" label="Today" value={"GH₵"+earnings.today} color="green" dark={dark}/>
              <StatCard icon="🏍️" label="Rides" value={earnings.rides} color="blue" dark={dark}/>
            </div>

            {activeRide&&(
              <div className={`${t.card} rounded-2xl p-4 border-2 border-green-500`}>
                <p style={{color:"#16a34a",fontWeight:900,fontSize:13,marginBottom:10}}>● Active Ride</p>
                <div style={{background:dark?"#374151":"#f9fafb",borderRadius:12,padding:12,marginBottom:10,display:"flex",flexDirection:"column",gap:6,fontSize:13}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><MapPin style={{width:12,height:12,color:"#16a34a"}}/><span className={t.text}>{activeRide.from}</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><Navigation style={{width:12,height:12,color:"#ef4444"}}/><span className={t.text}>{activeRide.to}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{color:"#16a34a",fontWeight:700}}>Earn: {activeRide.earn}</span>
                    <Badge color={activeRide.payMethod==="cash"?"yellow":"blue"}>{activeRide.payMethod==="cash"?"💵 Cash":"💳 MoMo"}</Badge>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <a href={`tel:${activeRide.phone}`} style={{padding:"10px",background:"#2563eb",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,textAlign:"center",display:"block"}}>📞 Call</a>
                  <button onClick={complete} disabled={completing}
                    style={{padding:"10px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,opacity:completing?0.6:1}}>
                    {completing?"Completing…":"✅ Complete"}
                  </button>
                </div>
              </div>
            )}

            {/* Fuel Pool */}
            <div className={`${t.card} rounded-2xl p-4 border-2 border-yellow-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:22}}>⛽</span><span className={`font-black ${t.text}`}>Fuel Pool</span></div>
                <span style={{fontWeight:900,color:"#ca8a04",fontSize:20}}>GH₵{(earnings.total*0.05).toFixed(2)}</span>
              </div>
              <p className={`text-xs ${t.sub} mb-3`}>5% of every ride. Use at registered stations.</p>
              <button onClick={()=>setShowFuelCode(!showFuelCode)}
                style={{width:"100%",padding:"10px",background:"#ca8a04",color:"#fff",borderRadius:12,fontWeight:900,fontSize:13}}>
                {showFuelCode?"Hide Code":"⛽ Show Fuel Code"}
              </button>
              {showFuelCode&&(
                <div style={{marginTop:10,textAlign:"center",padding:"14px",background:dark?"#374151":"#fefce8",borderRadius:12,border:"2px dashed #ca8a04"}}>
                  <p className={`text-xs ${t.sub} mb-1`}>Station code · valid 10 minutes</p>
                  <p style={{fontFamily:"monospace",fontSize:24,fontWeight:900,color:"#ca8a04",letterSpacing:"0.15em"}}>{fuelCode}</p>
                </div>
              )}
            </div>

            {/* Maintenance Pool */}
            <div className={`${t.card} rounded-2xl p-4 border-2 border-orange-500`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:22}}>🔧</span><span className={`font-black ${t.text}`}>Maintenance Pool</span></div>
                <span style={{fontWeight:900,color:"#ea580c",fontSize:20}}>GH₵{(earnings.total*0.05).toFixed(2)}</span>
              </div>
              <p className={`text-xs ${t.sub}`}>5% auto-collected. Owner approves mechanic payments.</p>
            </div>
          </div>
        )}

        {view==="earnings"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 className={`font-black text-lg ${t.text}`}>💰 Earnings & Wallet</h2>
              <button onClick={()=>setShowWithdraw(true)} style={{padding:"8px 12px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                <ArrowDownCircle style={{width:12,height:12}}/> Withdraw
              </button>
            </div>
            <div className={`${t.card} rounded-2xl p-5 border ${t.bdr}`} style={{textAlign:"center"}}>
              <p className={`text-sm ${t.sub}`}>Total Lifetime (your 25%)</p>
              <p style={{fontSize:40,fontWeight:900,color:"#16a34a",margin:"4px 0"}}>GH₵{earnings.total}</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div className={`${t.card} rounded-2xl p-4 border-2 border-green-500`} style={{textAlign:"center"}}>
                <p style={{fontSize:10,color:"#16a34a",fontWeight:700}}>AVAILABLE NOW</p>
                <p style={{fontWeight:900,color:"#16a34a",fontSize:22}}>GH₵{wallet.available.toFixed(2)}</p>
              </div>
              <div className={`${t.card} rounded-2xl p-4 border-2 border-yellow-400`} style={{textAlign:"center"}}>
                <p style={{fontSize:10,color:"#ca8a04",fontWeight:700}}>PENDING 24H</p>
                <p style={{fontWeight:900,color:"#ca8a04",fontSize:22}}>GH₵{wallet.pending.toFixed(2)}</p>
              </div>
            </div>
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`} style={{display:"flex",gap:8}}>
              <Clock style={{width:16,height:16,color:"#ca8a04",flexShrink:0,marginTop:2}}/>
              <p className={`text-xs ${t.sub}`}>Earnings held 24 hours before withdrawal — fraud protection, payment verification, dispute resolution. Your money is always safe and recorded.</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {[["Today","GH₵"+earnings.today],["This Week","GH₵"+earnings.week],["Rides",earnings.rides]].map(([l,v])=>(
                <div key={l} className={`${t.card} rounded-2xl p-4 border ${t.bdr}`} style={{textAlign:"center"}}>
                  <p className={`text-lg font-black ${t.text}`}>{v}</p>
                  <p className={`text-xs ${t.sub}`}>{l}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {view==="profile"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
            <div className={`${t.card} rounded-2xl p-6 border ${t.bdr}`} style={{textAlign:"center"}}>
              <div style={{fontSize:52,marginBottom:8}}>{user.profilePhoto||"👨🏿"}</div>
              <h2 className={`text-xl font-black ${t.text}`}>{user.name}</h2>
              <p className={t.sub}>{user.phone}</p>
              <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:8,flexWrap:"wrap"}}>
                <Badge color="green">✅ KYC Verified</Badge>
                <Badge color="blue">🪪 Ghana Card</Badge>
              </div>
              {user.ownerCode&&<p className={`text-xs mt-2 ${t.sub}`}>Owner: <span style={{fontFamily:"monospace",color:"#16a34a"}}>{user.ownerCode}</span></p>}
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
