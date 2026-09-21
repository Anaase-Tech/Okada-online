import { useState, useEffect } from "react";
import { X, AlertCircle, PiggyBank, ArrowDownCircle, Loader } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";
import { Badge } from "../components/Badge";

// Firestore Timestamps come back over JSON as {_seconds,_nanoseconds} —
// this turns any of the shapes we might see into a short display date.
function fmtDate(ts) {
  if (!ts) return "";
  const d = ts._seconds ? new Date(ts._seconds * 1000)
          : ts.seconds  ? new Date(ts.seconds * 1000)
          : new Date(ts);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function FintechHub({user,role,dark}) {
  const t=T(dark);
  const [tab,setTab]=useState("savings");
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  // ── Savings ──────────────────────────────────────────
  const [savBal,setSavBal]=useState(0);
  const [savDeposited,setSavDeposited]=useState(0);
  const [savInt,setSavInt]=useState(0);
  const [autoRate,setAutoRate]=useState(0);
  const [savHistory,setSavHistory]=useState([]);
  const [savStep,setSavStep]=useState("home");
  const [savInput,setSavInput]=useState("");
  const [savBusy,setSavBusy]=useState(false);
  const monthlyEst=(savBal*0.08/12).toFixed(2);

  const refreshSavings = async () => {
    try {
      const r = await api.getSavingsBalance(user.id);
      setSavBal(r.balance||0);
      setSavDeposited(r.totalDeposited||0);
      setSavInt(r.interestEarned||0);
      setAutoRate(r.savingsRate||0);
      setSavHistory(r.history||[]);
    } catch(err) { console.warn("Savings fetch failed:", err); }
  };

  // ── Loans ────────────────────────────────────────────
  const [creditScore,setCreditScore]=useState(300);
  const [maxLoan,setMaxLoan]=useState(0);
  const [eligible,setEligible]=useState(false);
  const [reasons,setReasons]=useState([]);
  const [activeLoan,setActiveLoan]=useState(null);
  const [loanAmount,setLoanAmount]=useState("");
  const [loanPurpose,setLoanPurpose]=useState("");
  const [loanStep,setLoanStep]=useState("home");

  const refreshLoans = async () => {
    try {
      const el = await api.getLoanEligibility(user.id);
      setCreditScore(el.creditScore||300);
      setMaxLoan(el.maxLoan||0);
      setEligible(!!el.eligible);
      setReasons(el.reasons||[]);
    } catch(err) { console.warn("Loan eligibility fetch failed:", err); }
    try {
      const st = await api.getLoanStatus(user.id);
      setActiveLoan(st.activeLoan||null);
    } catch(err) { console.warn("Loan status fetch failed:", err); }
  };

  // ── Insurance ────────────────────────────────────────
  const insPlans=[
    {id:"basic",   name:"Basic Rider",   price:15, cover:2000,  desc:"Personal accident cover",           color:"#16a34a"},
    {id:"standard",name:"Standard",      price:35, cover:8000,  desc:"Accident + vehicle damage (partial)",color:"#2563eb"},
    {id:"premium", name:"Premium Fleet", price:80, cover:25000, desc:"Full cover: accident, vehicle, 3rd party",color:"#7c3aed"},
  ];
  const [policy,setPolicy]=useState(null);
  const [claims,setClaims]=useState([]);
  const [claimType,setClaimType]=useState("");
  const [claimDesc,setClaimDesc]=useState("");
  const [claimStep,setClaimStep]=useState("home");
  const [insBusy,setInsBusy]=useState(false);

  const refreshInsurance = async () => {
    try {
      const r = await api.getInsurancePolicy(user.id);
      setPolicy(r.policy||null);
      setClaims(r.claims||[]);
    } catch(err) { console.warn("Insurance fetch failed:", err); }
  };

  // ── Pay Later (passenger only) ───────────────────────
  const [plLimit,setPlLimit]=useState(50);
  const [plUsed,setPlUsed]=useState(0);
  const [plHistory,setPlHistory]=useState([]);
  const [plBusy,setPlBusy]=useState(false);
  const plAvail=plLimit-plUsed;

  const refreshPayLater = async () => {
    try {
      const r = await api.getPayLaterHistory(user.id);
      setPlLimit(r.limit||50);
      setPlUsed(r.used||0);
      setPlHistory(r.history||[]);
    } catch(err) { console.warn("Pay Later fetch failed:", err); }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([
        refreshSavings(),
        refreshLoans(),
        refreshInsurance(),
        ...(role==="passenger" ? [refreshPayLater()] : []),
      ]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, role]);

  const tabs=[
    {id:"savings",  icon:"🏦", label:"Savings"},
    {id:"loans",    icon:"💳", label:"Loans"},
    {id:"insurance",icon:"🛡️", label:"Insure"},
    ...(role==="passenger"?[{id:"paylater",icon:"⏳",label:"Pay Later"}]:[]),
  ];

  if (loading) {
    return (
      <div style={{minHeight:300,display:"flex",alignItems:"center",justifyContent:"center"}} className={t.bg}>
        <Loader className="w-6 h-6 animate-spin" style={{color:"#7c3aed"}}/>
      </div>
    );
  }

  return (
    <div className={`${t.bg}`} style={{minHeight:"100%"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      <div style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5,#2563eb)",color:"#fff",padding:"16px 16px 0"}}>
        <p style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:18,marginBottom:1}}>💎 Okada Fintech</p>
        <p style={{fontSize:11,color:"#c7d2fe",marginBottom:14}}>Banking built for Ghana's transport workers</p>
        <div style={{display:"flex",gap:2}}>
          {tabs.map(tb=>(
            <button key={tb.id} onClick={()=>setTab(tb.id)}
              style={{flex:1,padding:"8px 2px",fontSize:10,fontWeight:700,borderRadius:"10px 10px 0 0",background:tab===tb.id?"#fff":"rgba(255,255,255,0.15)",color:tab===tb.id?"#7c3aed":"#fff",textAlign:"center",transition:"all 0.15s"}}>
              <div style={{fontSize:16}}>{tb.icon}</div>{tb.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>

        {tab==="savings"&&(<>
          <div style={{background:"linear-gradient(135deg,#4f46e5,#7c3aed)",borderRadius:20,padding:"20px",color:"#fff"}}>
            <p style={{fontSize:12,color:"#c7d2fe",fontWeight:600}}>Savings Balance</p>
            <p style={{fontWeight:900,fontSize:38,margin:"4px 0"}}>GH₵{savBal.toFixed(2)}</p>
            <div style={{display:"flex",gap:20,marginTop:8}}>
              <div><p style={{fontSize:10,color:"#c7d2fe"}}>Interest Earned</p><p style={{fontWeight:700,fontSize:14}}>GH₵{savInt.toFixed(2)}</p></div>
              <div><p style={{fontSize:10,color:"#c7d2fe"}}>Monthly Est.</p><p style={{fontWeight:700,fontSize:14}}>+GH₵{monthlyEst}</p></div>
              <div><p style={{fontSize:10,color:"#c7d2fe"}}>Rate p.a.</p><p style={{fontWeight:700,fontSize:14}}>8%</p></div>
            </div>
          </div>

          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div><p className={`font-black text-sm ${t.text}`}>⚙️ Auto-Save from Earnings</p><p className={`text-xs ${t.sub}`}>{autoRate}% of each payout saved automatically</p></div>
              <span style={{fontWeight:900,color:"#7c3aed",fontSize:22}}>{autoRate}%</span>
            </div>
            <input type="range" min="0" max="30" value={autoRate} onChange={e=>setAutoRate(Number(e.target.value))} style={{width:"100%",accentColor:"#7c3aed"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:10}} className={t.sub}><span>0%</span><span>10%</span><span>20%</span><span>30%</span></div>
            <button onClick={async()=>{
              try{ await api.setSavingsRate(user.id,autoRate); toast$(`Auto-save set to ${autoRate}% ✅`); }
              catch(err){ toast$(`Couldn't save (${err.message})`,"error"); }
            }} style={{width:"100%",padding:"10px",background:"#7c3aed",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>Save Setting</button>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <button onClick={()=>setSavStep("deposit")} style={{padding:"14px",background:"#7c3aed",color:"#fff",borderRadius:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontSize:13}}>
              <PiggyBank style={{width:16,height:16}}/> Deposit
            </button>
            <button onClick={()=>setSavStep("withdraw")} style={{padding:"14px",border:"2px solid #7c3aed",color:"#7c3aed",borderRadius:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontSize:13}}>
              <ArrowDownCircle style={{width:16,height:16}}/> Withdraw
            </button>
          </div>

          {(savStep==="deposit"||savStep==="withdraw")&&(
            <div className={`${t.card} rounded-2xl p-4 border-2 border-purple-400`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <p className={`font-black ${t.text}`}>{savStep==="deposit"?"💰 Deposit":"💸 Withdraw"} Savings</p>
                <button onClick={()=>{setSavStep("home");setSavInput("");}}><X style={{width:18,height:18,color:"#9ca3af"}}/></button>
              </div>
              <input value={savInput} onChange={e=>setSavInput(e.target.value)} type="number" placeholder="Amount GH₵"
                className={`w-full px-4 py-3 border rounded-xl text-lg font-black focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",marginBottom:10}}/>
              <button disabled={savBusy} onClick={async()=>{
                const amt=parseFloat(savInput);
                if(!amt||amt<1){toast$("Enter valid amount","error");return;}
                if(savStep==="withdraw" && amt>savBal){toast$(`Only GH₵${savBal.toFixed(2)} available`,"error");return;}
                setSavBusy(true);
                try{
                  if(savStep==="deposit") await api.depositSavings(user.id,amt);
                  else await api.withdrawSavings(user.id,amt,user.phone);
                  await refreshSavings();
                  toast$(savStep==="deposit"?`GH₵${amt} deposited ✅`:`GH₵${amt} withdrawal requested ✅`);
                  setSavStep("home");setSavInput("");
                }catch(err){ toast$(`Failed: ${err.message}`,"error"); }
                setSavBusy(false);
              }} style={{width:"100%",padding:"12px",background:"#7c3aed",color:"#fff",borderRadius:12,fontWeight:900,opacity:savBusy?0.6:1}}>
                {savBusy?"Processing…":"Confirm"}
              </button>
            </div>
          )}

          <div className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
              <p className={`font-black text-sm ${t.text}`}>📈 Recent Activity</p>
            </div>
            {savHistory.length===0 ? (
              <div style={{padding:20,textAlign:"center"}}>
                <p className={`text-xs ${t.sub}`}>No savings activity yet</p>
              </div>
            ) : savHistory.map((h,i)=>(
              <div key={h.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
                <div>
                  <p className={`font-bold text-sm ${t.text}`}>
                    {h.type==="auto_deposit"?"Auto-save from ride":h.type==="manual_deposit"?"Deposit":h.type==="withdrawal"?"Withdrawal":h.type}
                  </p>
                  <p className={`text-xs ${t.sub}`}>{fmtDate(h.createdAt)} · {h.status}</p>
                </div>
                <p style={{fontWeight:900,color:h.type==="withdrawal"?"#ef4444":"#7c3aed"}}>
                  {h.type==="withdrawal"?"-":"+"}GH₵{h.amount?.toFixed(2)}
                </p>
              </div>
            ))}
          </div>

          <div style={{background:dark?"#1e1b4b":"#eef2ff",borderRadius:14,padding:"12px 14px"}}>
            <p style={{color:"#4f46e5",fontWeight:700,fontSize:12,marginBottom:4}}>💡 How savings earn interest</p>
            <p style={{fontSize:11,color:dark?"#a5b4fc":"#4338ca"}}>8% annual interest calculated monthly. Save for 3+ months to unlock loan eligibility. Total saved so far: GH₵{savDeposited.toFixed(2)}.</p>
          </div>
        </>)}

        {tab==="loans"&&(<>
          <div style={{background:"linear-gradient(135deg,#0f172a,#1e293b)",borderRadius:20,padding:"20px",color:"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <p style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>Credit Score</p>
                <p style={{fontWeight:900,fontSize:44,margin:"4px 0",color:creditScore>=650?"#4ade80":creditScore>=500?"#facc15":"#f87171"}}>{creditScore}</p>
                <Badge color={creditScore>=650?"green":creditScore>=500?"yellow":"red"}>
                  {creditScore>=650?"Good Standing":creditScore>=500?"Building Credit":"Low Score"}
                </Badge>
              </div>
              <div style={{textAlign:"right"}}>
                <p style={{fontSize:11,color:"#94a3b8"}}>Max Loan</p>
                <p style={{fontWeight:900,fontSize:24,color:"#4ade80"}}>GH₵{maxLoan.toLocaleString()}</p>
                <p style={{fontSize:10,color:"#94a3b8"}}>at 5%/month</p>
              </div>
            </div>
            <div style={{marginTop:14,height:6,borderRadius:999,background:"#334155"}}>
              <div style={{height:6,borderRadius:999,width:`${Math.min((creditScore-300)/550*100,100)}%`,background:creditScore>=650?"#4ade80":creditScore>=500?"#facc15":"#f87171"}}/>
            </div>
          </div>

          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black text-sm mb-3 ${t.text}`}>📋 Your Eligibility</p>
            {reasons.length===0 ? (
              <p className={`text-xs ${t.sub}`}>Complete a few rides to build your eligibility profile.</p>
            ) : reasons.map((r,i)=>(
              <p key={i} style={{fontSize:12,marginBottom:4,color:r.pass?"#16a34a":"#ef4444"}}>{r.pass?"✅":"❌"} {r.label}</p>
            ))}
          </div>

          {activeLoan&&(
            <div className={`${t.card} rounded-2xl p-4 border-2 border-purple-400`}>
              <p style={{color:"#7c3aed",fontWeight:900,fontSize:13,marginBottom:12}}>
                💳 {activeLoan.status==="pending"?"Loan Pending Review":"Active Loan"}
              </p>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <div><p className={`font-bold ${t.text}`}>GH₵{activeLoan.amount} — {activeLoan.purpose}</p><p className={`text-xs ${t.sub}`}>Deducts {(activeLoan.deductionRate*100).toFixed(0)}% of each ride's earnings</p></div>
                <div style={{textAlign:"right"}}><p style={{color:"#7c3aed",fontWeight:900,fontSize:16}}>GH₵{activeLoan.outstanding}</p><p className={`text-xs ${t.sub}`}>remaining</p></div>
              </div>
              {activeLoan.status==="active"&&(
                <div style={{height:8,borderRadius:999,background:dark?"#374151":"#e5e7eb",marginBottom:6}}>
                  <div style={{height:8,borderRadius:999,width:`${Math.min(((activeLoan.amount-activeLoan.outstanding)/activeLoan.amount)*100,100)}%`,background:"#7c3aed"}}/>
                </div>
              )}
              <p style={{fontSize:11,color:"#7c3aed",fontWeight:700}}>
                {activeLoan.status==="pending"?"Awaiting admin approval":"Repaying automatically ✅"}
              </p>
            </div>
          )}

          {!activeLoan&&loanStep==="home"&&eligible&&(
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <p className={`font-black text-sm mb-2 ${t.text}`}>📝 Apply for a Loan</p>
              <input value={loanAmount} onChange={e=>setLoanAmount(e.target.value)} type="number"
                placeholder={`Amount — max GH₵${maxLoan}`}
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",marginBottom:10}}/>
              <select value={loanPurpose} onChange={e=>setLoanPurpose(e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",marginBottom:10}}>
                <option value="">Select purpose…</option>
                {["Vehicle Repair","Fuel Stock","Medical Emergency","School Fees","Business Expansion","Drive to Own Down Payment","Other"].map(p=>(
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <button onClick={async()=>{
                if(!loanAmount||!loanPurpose){toast$("Fill all fields","error");return;}
                if(parseFloat(loanAmount)>maxLoan){toast$(`Max loan is GH₵${maxLoan}`,"error");return;}
                setLoanStep("processing");
                try{
                  await api.applyLoan(user.id,parseFloat(loanAmount),loanPurpose);
                  await refreshLoans();
                  setLoanStep("approved");
                }catch(err){
                  toast$(`Application failed: ${err.message}`,"error");
                  setLoanStep("home");
                }
              }} disabled={!loanAmount||!loanPurpose}
                style={{width:"100%",padding:"13px",background:(!loanAmount||!loanPurpose)?"#9ca3af":"#7c3aed",color:"#fff",borderRadius:14,fontWeight:900}}>
                Apply for Loan →
              </button>
            </div>
          )}
          {!activeLoan&&!eligible&&loanStep==="home"&&(
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`} style={{textAlign:"center"}}>
              <p className={`text-sm ${t.sub}`}>Not eligible yet — meet the criteria above to unlock a loan.</p>
            </div>
          )}
          {loanStep==="processing"&&(
            <div style={{textAlign:"center",padding:"32px 0"}}>
              <div style={{width:52,height:52,border:"4px solid #7c3aed",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
              <p className={`font-black ${t.text}`}>Checking Credit Profile…</p>
            </div>
          )}
          {loanStep==="approved"&&(
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <div style={{fontSize:52,marginBottom:12}}>🎉</div>
              <p className={`font-black text-lg ${t.text}`}>
                {activeLoan?.status==="pending"?"Application Submitted!":"Loan Approved!"}
              </p>
              <p className={`text-sm mt-2 ${t.sub}`}>
                {activeLoan?.status==="pending"
                  ?"An admin will review your loan shortly."
                  :`GH₵${loanAmount} is now active on your account`}
              </p>
              <button onClick={()=>{setLoanStep("home");setLoanAmount("");setLoanPurpose("");}} style={{marginTop:16,padding:"12px 28px",background:"#7c3aed",color:"#fff",borderRadius:14,fontWeight:900}}>Done ✅</button>
            </div>
          )}
        </>)}

        {tab==="insurance"&&(<>
          <div style={{background:"linear-gradient(135deg,#0369a1,#0284c7)",borderRadius:20,padding:"20px",color:"#fff"}}>
            <p style={{fontSize:12,color:"#bae6fd",fontWeight:600}}>Active Coverage</p>
            <p style={{fontWeight:900,fontSize:26,margin:"4px 0"}}>{policy?policy.planName:"No Active Plan"}</p>
            <p style={{fontSize:12,color:"#bae6fd"}}>
              {policy?`Cover up to GH₵${policy.cover?.toLocaleString()}`:"Select a plan below"}
            </p>
          </div>
          {insPlans.map(plan=>{
            const isActive = policy?.planId===plan.id;
            return (
            <div key={plan.id} className={`${t.card} rounded-2xl p-4 border-2`} style={{borderColor:isActive?plan.color:dark?"#374151":"#e5e7eb"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <p className={`font-black ${t.text}`}>{plan.name}</p>
                    {isActive&&<Badge color="green">Active ✅</Badge>}
                  </div>
                  <p className={`text-xs ${t.sub}`}>{plan.desc}</p>
                </div>
                <div style={{textAlign:"right"}}><p style={{fontWeight:900,color:plan.color,fontSize:18}}>GH₵{plan.price}</p><p className={`text-xs ${t.sub}`}>/month</p></div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:dark?"#374151":"#f9fafb",borderRadius:10,marginBottom:10}}>
                <span className={`text-xs ${t.sub}`}>Max payout</span>
                <span style={{fontWeight:700,color:plan.color}}>GH₵{plan.cover.toLocaleString()}</span>
              </div>
              {!isActive?(
                <button disabled={insBusy} onClick={async()=>{
                  setInsBusy(true);
                  try{
                    await api.buyInsurance(user.id,plan.id);
                    await refreshInsurance();
                    toast$(`${plan.name} plan activated ✅`);
                  }catch(err){ toast$(`Failed: ${err.message}`,"error"); }
                  setInsBusy(false);
                }} style={{width:"100%",padding:"10px",background:plan.color,color:"#fff",borderRadius:12,fontWeight:700,fontSize:13,opacity:insBusy?0.6:1}}>
                  {insBusy?"Activating…":`Activate — GH₵${plan.price}/mo`}
                </button>
              ):(
                <button onClick={()=>setClaimStep("file")} style={{width:"100%",padding:"10px",border:`2px solid ${plan.color}`,color:plan.color,borderRadius:12,fontWeight:700,fontSize:13}}>
                  📋 File a Claim
                </button>
              )}
            </div>
          );})}
          {claimStep==="file"&&(
            <div className={`${t.card} rounded-2xl p-4 border-2 border-blue-400`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <p className={`font-black ${t.text}`}>📋 File Claim</p>
                <button onClick={()=>setClaimStep("home")}><X style={{width:18,height:18,color:"#9ca3af"}}/></button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                {["Accident / Injury","Vehicle Damage","Third Party Damage","Theft","Medical Expenses","Other"].map(ct=>(
                  <button key={ct} onClick={()=>setClaimType(ct)}
                    style={{padding:"10px 12px",borderRadius:12,border:`2px solid ${claimType===ct?"#0284c7":dark?"#374151":"#e5e7eb"}`,background:claimType===ct?"#eff6ff":"transparent",fontWeight:600,fontSize:13,textAlign:"left",color:claimType===ct?"#0284c7":dark?"#d1d5db":"#374151"}}>
                    {ct}
                  </button>
                ))}
              </div>
              <textarea value={claimDesc} onChange={e=>setClaimDesc(e.target.value)}
                placeholder="Describe what happened…"
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",minHeight:80,resize:"none",marginBottom:12}}/>
              <button disabled={insBusy} onClick={async()=>{
                if(!claimType||!claimDesc){toast$("Fill all fields","error");return;}
                setInsBusy(true);
                try{
                  await api.fileInsuranceClaim(user.id,claimType,claimDesc,policy?.id);
                  await refreshInsurance();
                  setClaimStep("done");
                }catch(err){ toast$(`Failed: ${err.message}`,"error"); }
                setInsBusy(false);
              }} style={{width:"100%",padding:"12px",background:"#0284c7",color:"#fff",borderRadius:14,fontWeight:900,opacity:insBusy?0.6:1}}>
                {insBusy?"Submitting…":"Submit Claim"}
              </button>
            </div>
          )}
          {claimStep==="done"&&(
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:48,marginBottom:8}}>📋✅</div>
              <p className={`font-black ${t.text}`}>Claim Submitted!</p>
              <p className={`text-xs mt-1 ${t.sub}`}>Ref: {claims[0]?.claimRef||"pending"}</p>
              <button onClick={()=>{setClaimStep("home");setClaimType("");setClaimDesc("");}} style={{marginTop:14,padding:"10px 24px",background:"#0284c7",color:"#fff",borderRadius:12,fontWeight:700}}>Done</button>
            </div>
          )}
          {claimStep==="home"&&claims.length>0&&(
            <div className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
              <div style={{padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
                <p className={`font-black text-sm ${t.text}`}>📋 Your Claims</p>
              </div>
              {claims.map(c=>(
                <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
                  <div><p className={`font-bold text-sm ${t.text}`}>{c.claimType}</p><p className={`text-xs ${t.sub}`}>{c.claimRef} · {fmtDate(c.submittedAt)}</p></div>
                  <Badge color={c.status==="submitted"?"yellow":c.status==="approved"?"green":"red"}>{c.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </>)}

        {tab==="paylater"&&(<>
          <div style={{background:"linear-gradient(135deg,#047857,#059669)",borderRadius:20,padding:"20px",color:"#fff"}}>
            <p style={{fontSize:12,color:"#a7f3d0",fontWeight:600}}>Pay Later Available</p>
            <p style={{fontWeight:900,fontSize:38,margin:"4px 0"}}>GH₵{plAvail.toFixed(2)}</p>
            <p style={{fontSize:12,color:"#a7f3d0"}}>of GH₵{plLimit} limit</p>
            <div style={{marginTop:12,height:6,borderRadius:999,background:"rgba(255,255,255,0.25)"}}>
              <div style={{height:6,borderRadius:999,width:`${plLimit>0?(plUsed/plLimit)*100:0}%`,background:"#fff"}}/>
            </div>
            <p style={{fontSize:11,color:"#a7f3d0",marginTop:4}}>GH₵{plUsed.toFixed(2)} used</p>
          </div>
          {plUsed>0&&(
            <div style={{background:dark?"#1c1917":"#fef3c7",borderRadius:14,padding:"12px 14px",border:"1px solid #fde68a",display:"flex",gap:10,alignItems:"flex-start"}}>
              <AlertCircle style={{width:16,height:16,color:"#ca8a04",flexShrink:0,marginTop:1}}/>
              <div>
                <p style={{fontWeight:700,fontSize:13,color:"#92400e"}}>Payment Due: GH₵{plUsed.toFixed(2)}</p>
                <button disabled={plBusy} onClick={async()=>{
                  setPlBusy(true);
                  try{
                    await api.repayLater(user.id,plUsed);
                    await refreshPayLater();
                    toast$("Pay Later cleared ✅ Limit restored!");
                  }catch(err){ toast$(`Failed: ${err.message}`,"error"); }
                  setPlBusy(false);
                }} style={{marginTop:8,padding:"8px 16px",background:"#ca8a04",color:"#fff",borderRadius:10,fontWeight:700,fontSize:12,opacity:plBusy?0.6:1}}>
                  {plBusy?"Processing…":`Repay Now — GH₵${plUsed.toFixed(2)}`}
                </button>
              </div>
            </div>
          )}
          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black text-sm mb-3 ${t.text}`}>📋 How Pay Later Works</p>
            {[["✅","Book ride → choose Pay Later at checkout"],["✅","Ride now — payment deferred up to 7 days"],["✅","Auto-charged to your MoMo on due date"],["⚠️","Missed payment permanently removes access"]].map(([icon,text])=>(
              <p key={text} style={{fontSize:12,marginBottom:5,color:icon==="⚠️"?"#ef4444":dark?"#d1d5db":"#374151"}}>{icon} {text}</p>
            ))}
          </div>
          <div className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
              <p className={`font-black text-sm ${t.text}`}>🕐 Pay Later History</p>
            </div>
            {plHistory.length===0 ? (
              <div style={{padding:20,textAlign:"center"}}>
                <p className={`text-xs ${t.sub}`}>No Pay Later history yet</p>
              </div>
            ) : plHistory.map((h,i)=>(
              <div key={h.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
                <div><p className={`font-bold text-sm ${t.text}`}>Ride #{(h.rideId||"").slice(-6)||h.id?.slice(-6)}</p><p className={`text-xs ${t.sub}`}>{fmtDate(h.createdAt)}</p></div>
                <div style={{textAlign:"right"}}><p style={{fontWeight:900,color:"#16a34a"}}>GH₵{h.amount}</p><Badge color={h.status==="paid"?"green":h.status==="overdue"?"red":"yellow"}>{h.status}</Badge></div>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  );
}
