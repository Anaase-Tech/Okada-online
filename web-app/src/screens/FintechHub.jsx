import { useState } from "react";
import { X, AlertCircle, PiggyBank, ArrowDownCircle } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";
import { Badge } from "../components/Badge";

export function FintechHub({user,role,dark}) {
  const t=T(dark);
  const [tab,setTab]=useState("savings");
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});

  //  Savings state
  const [savBal,setSavBal]=useState(role==="driver"?320.50:role==="owner"?1840.00:45.00);
  const [savInt,setSavInt]=useState(role==="driver"?12.40:role==="owner"?87.20:1.80);
  const [autoRate,setAutoRate]=useState(10);
  const [savStep,setSavStep]=useState("home");
  const [savInput,setSavInput]=useState("");
  const savHistory=[
    {date:"Mar 2026",deposited:85.20,interest:2.10,balance:savBal},
    {date:"Feb 2026",deposited:92.40,interest:1.90,balance:233.20},
    {date:"Jan 2026",deposited:78.60,interest:1.60,balance:139.20},
  ];
  const monthlyEst=(savBal*0.08/12).toFixed(2);

  //  Loan state
  const creditScore=role==="driver"?680:role==="owner"?780:role==="passenger"?520:0;
  const maxLoan=role==="driver"?1500:role==="owner"?5000:role==="passenger"?200:0;
  const loanEligible=role!=="admin"&&(role==="passenger"?true:true);
  const [activeLoan,setActiveLoan]=useState(
    role==="driver"?{amount:800,remaining:520,repaid:280,monthly:65,purpose:"Okada Repair",progress:35,deductRate:3}:null
  );
  const [loanAmount,setLoanAmount]=useState("");
  const [loanPurpose,setLoanPurpose]=useState("");
  const [loanStep,setLoanStep]=useState("home");

  //  Insurance state
  const insPlans=[
    {id:"basic",   name:"Basic Rider",   price:15, cover:2000,  desc:"Personal accident cover",           color:"#16a34a"},
    {id:"standard",name:"Standard",      price:35, cover:8000,  desc:"Accident + vehicle damage (partial)",color:"#2563eb"},
    {id:"premium", name:"Premium Fleet", price:80, cover:25000, desc:"Full cover: accident, vehicle, 3rd party",color:"#7c3aed"},
  ];
  const [activePlan,setActivePlan]=useState(role==="driver"?"basic":role==="owner"?"premium":null);
  const [claimType,setClaimType]=useState("");
  const [claimDesc,setClaimDesc]=useState("");
  const [claimStep,setClaimStep]=useState("home");

  //  Pay Later state (passengers)
  const [plLimit]=useState(50);
  const [plUsed,setPlUsed]=useState(12.50);
  const plAvail=plLimit-plUsed;
  const plHistory=[
    {date:"Mar 7",amount:12.50,route:"Akosombo  Atimpoku",status:"due"},
    {date:"Feb 28",amount:9.00,route:"Kpong  Asesewa",status:"paid"},
    {date:"Feb 20",amount:7.50,route:"Odumase  Somanya",status:"paid"},
  ];

  const tabs=[
    {id:"savings",  icon:"🏍️", label:"Savings"},
    {id:"loans",    icon:"🏍️", label:"Loans"},
    {id:"insurance",icon:"🏍️", label:"Insure"},
    ...(role==="passenger"?[{id:"paylater",icon:"🏍️",label:"Pay Later"}]:[]),
  ];

  return (
    <div className={`${t.bg}`} style={{minHeight:"100%"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5,#2563eb)",color:"#fff",padding:"16px 16px 0"}}>
        <p style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:18,marginBottom:1}}> Okada Fintech</p>
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

        {/*  SAVINGS  */}
        {tab==="savings"&&(<>
          <div style={{background:"linear-gradient(135deg,#4f46e5,#7c3aed)",borderRadius:20,padding:"20px",color:"#fff"}}>
            <p style={{fontSize:12,color:"#c7d2fe",fontWeight:600}}>Savings Balance</p>
            <p style={{fontWeight:900,fontSize:38,margin:"4px 0"}}>GH{savBal.toFixed(2)}</p>
            <div style={{display:"flex",gap:20,marginTop:8}}>
              <div><p style={{fontSize:10,color:"#c7d2fe"}}>Interest Earned</p><p style={{fontWeight:700,fontSize:14}}>GH{savInt.toFixed(2)}</p></div>
              <div><p style={{fontSize:10,color:"#c7d2fe"}}>Monthly Est.</p><p style={{fontWeight:700,fontSize:14}}>+GH{monthlyEst}</p></div>
              <div><p style={{fontSize:10,color:"#c7d2fe"}}>Rate p.a.</p><p style={{fontWeight:700,fontSize:14}}>8%</p></div>
            </div>
          </div>

          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div><p className={`font-black text-sm ${t.text}`}> Auto-Save from Earnings</p><p className={`text-xs ${t.sub}`}>{autoRate}% of each payout saved automatically</p></div>
              <span style={{fontWeight:900,color:"#7c3aed",fontSize:22}}>{autoRate}%</span>
            </div>
            <input type="range" min="0" max="30" value={autoRate} onChange={e=>setAutoRate(Number(e.target.value))} style={{width:"100%",accentColor:"#7c3aed"}}/>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:10}} className={t.sub}><span>0%</span><span>10%</span><span>20%</span><span>30%</span></div>
            <button onClick={async()=>{try{await api.setSavingsRate(user.id,autoRate);}catch(err){ console.warn("Error:",err); }toast$(`Auto-save set to ${autoRate}% `);}}
              style={{width:"100%",padding:"10px",background:"#7c3aed",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>Save Setting</button>
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
                <p className={`font-black ${t.text}`}>{savStep==="deposit"?" Deposit":" Withdraw"} Savings</p>
                <button onClick={()=>{setSavStep("home");setSavInput("");}}><X style={{width:18,height:18,color:"#9ca3af"}}/></button>
              </div>
              <input value={savInput} onChange={e=>setSavInput(e.target.value)} type="number" placeholder="Amount GH"
                className={`w-full px-4 py-3 border rounded-xl text-lg font-black focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",marginBottom:10}}/>
              <button onClick={async()=>{
                const amt=parseFloat(savInput);
                if(!amt||amt<1){toast$("Enter valid amount","error");return;}
                try{if(savStep==="deposit") await api.depositSavings(user.id,amt); else await api.withdrawSavings(user.id,amt);}catch(err){ console.warn("Error:",err); }
                setSavBal(b=>savStep==="deposit"?+(b+amt).toFixed(2):+(b-amt).toFixed(2));
                if(savStep==="deposit") setSavInt(i=>+(i+amt*0.08/12).toFixed(2));
                toast$(savStep==="deposit"?`GH${amt} deposited `:`GH${amt} withdrawn `);
                setSavStep("home");setSavInput("");
              }} style={{width:"100%",padding:"12px",background:"#7c3aed",color:"#fff",borderRadius:12,fontWeight:900}}>
                Confirm
              </button>
            </div>
          )}

          <div className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
              <p className={`font-black text-sm ${t.text}`}> Monthly History</p>
            </div>
            {savHistory.map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
                <div><p className={`font-bold text-sm ${t.text}`}>{h.date}</p><p className={`text-xs ${t.sub}`}>Saved GH{h.deposited}  Interest +GH{h.interest}</p></div>
                <p style={{fontWeight:900,color:"#7c3aed"}}>GH{h.balance.toFixed(2)}</p>
              </div>
            ))}
          </div>

          <div style={{background:dark?"#1e1b4b":"#eef2ff",borderRadius:14,padding:"12px 14px"}}>
            <p style={{color:"#4f46e5",fontWeight:700,fontSize:12,marginBottom:4}}> How savings earn interest</p>
            <p style={{fontSize:11,color:dark?"#a5b4fc":"#4338ca"}}>8% annual interest calculated monthly. Save for 3+ months to unlock loan eligibility. Your savings history determines your credit score. Funds always accessible.</p>
          </div>
        </>)}

        {/*  LOANS  */}
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
                <p style={{fontWeight:900,fontSize:24,color:"#4ade80"}}>GH{maxLoan.toLocaleString()}</p>
                <p style={{fontSize:10,color:"#94a3b8"}}>at 5%/month</p>
              </div>
            </div>
            <div style={{marginTop:14,height:6,borderRadius:999,background:"#334155"}}>
              <div style={{height:6,borderRadius:999,width:`${Math.min((creditScore-300)/550*100,100)}%`,background:creditScore>=650?"#4ade80":creditScore>=500?"#facc15":"#f87171"}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#64748b",marginTop:3}}><span>300</span><span>500</span><span>650</span><span>850</span></div>
          </div>

          {/* Eligibility checklist */}
          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black text-sm mb-3 ${t.text}`}> Your Eligibility</p>
            {(role==="driver"
              ?[" 4 months savings history"," 1,247 completed rides"," 4.9 star rating"," Ghana Card verified"," 0 payment disputes"]
              :role==="owner"
              ?[" 6 months savings history"," Fleet revenue GH18,200"," Ghana Card verified"," 2 vehicles registered"]
              :role==="passenger"
              ?[" 34 verified rides"," KYC verified"," 0 disputed payments"," 2 more months savings to maximize limit"]
              :[" Admin accounts not eligible"]
            ).map((r,i)=>(
              <p key={i} style={{fontSize:12,marginBottom:4,color:r.startsWith("")?"#16a34a":r.startsWith("")?"#ca8a04":"#ef4444"}}>{r}</p>
            ))}
          </div>

          {/* Active loan */}
          {activeLoan&&(
            <div className={`${t.card} rounded-2xl p-4 border-2 border-purple-400`}>
              <p style={{color:"#7c3aed",fontWeight:900,fontSize:13,marginBottom:12}}> Active Loan</p>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <div><p className={`font-bold ${t.text}`}>GH{activeLoan.amount}  {activeLoan.purpose}</p><p className={`text-xs ${t.sub}`}>GH{activeLoan.monthly}/month interest</p></div>
                <div style={{textAlign:"right"}}><p style={{color:"#7c3aed",fontWeight:900,fontSize:16}}>GH{activeLoan.remaining}</p><p className={`text-xs ${t.sub}`}>remaining</p></div>
              </div>
              <div style={{height:8,borderRadius:999,background:dark?"#374151":"#e5e7eb",marginBottom:6}}>
                <div style={{height:8,borderRadius:999,width:`${activeLoan.progress}%`,background:"#7c3aed"}}/>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                <span className={t.sub}>{activeLoan.progress}% repaid  GH{activeLoan.repaid} paid back</span>
                <span style={{color:"#7c3aed",fontWeight:700}}>Auto-deduct {activeLoan.deductRate}%/ride </span>
              </div>
            </div>
          )}

          {/* Apply */}
          {!activeLoan&&loanStep==="home"&&loanEligible&&(
            <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
              <p className={`font-black text-sm mb-2 ${t.text}`}> Apply for a Loan</p>
              <p className={`text-xs ${t.sub} mb-4`}>Repayment auto-deducted from earnings  no manual payments ever.</p>
              <input value={loanAmount} onChange={e=>setLoanAmount(e.target.value)} type="number"
                placeholder={`Amount  max GH${maxLoan}`}
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",marginBottom:10}}/>
              <select value={loanPurpose} onChange={e=>setLoanPurpose(e.target.value)}
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",marginBottom:10}}>
                <option value="">Select purpose</option>
                {["Vehicle Repair","Fuel Stock","Medical Emergency","School Fees","Business Expansion","Drive to Own Down Payment","Ride Fare (Pay Later)","Other"].map(p=>(
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {loanAmount&&loanPurpose&&(
                <div style={{background:dark?"#1e1b4b":"#eef2ff",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
                  {[["Loan Amount",`GH${loanAmount}`,"#7c3aed"],["Monthly Interest (5%)",`GH${(parseFloat(loanAmount||0)*0.05).toFixed(2)}`,t.text],["Est. repayment per ride","~3% of earnings","#16a34a"]].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                      <span className={t.sub}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={async()=>{
                if(!loanAmount||!loanPurpose){toast$("Fill all fields","error");return;}
                if(parseFloat(loanAmount)>maxLoan){toast$(`Max loan is GH${maxLoan}`,"error");return;}
                setLoanStep("processing");
                try{await api.applyLoan(user.id,parseFloat(loanAmount),loanPurpose);}catch(err){ console.warn("Error:",err); }
                setTimeout(()=>{
                  setActiveLoan({amount:parseFloat(loanAmount),remaining:parseFloat(loanAmount),repaid:0,monthly:+(parseFloat(loanAmount)*0.05).toFixed(2),purpose:loanPurpose,progress:0,deductRate:3});
                  setLoanStep("approved");
                },2500);
              }} disabled={!loanAmount||!loanPurpose}
                style={{width:"100%",padding:"13px",background:(!loanAmount||!loanPurpose)?"#9ca3af":"#7c3aed",color:"#fff",borderRadius:14,fontWeight:900}}>
                Apply for Loan 
              </button>
            </div>
          )}

          {loanStep==="processing"&&(
            <div style={{textAlign:"center",padding:"32px 0"}}>
              <div style={{width:52,height:52,border:"4px solid #7c3aed",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
              <p className={`font-black ${t.text}`}>Checking Credit Profile</p>
            </div>
          )}
          {loanStep==="approved"&&(
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <div style={{fontSize:52,marginBottom:12}}></div>
              <p className={`font-black text-lg ${t.text}`}>Loan Approved!</p>
              <p className={`text-sm mt-2 ${t.sub}`}>GH{loanAmount} added to your wallet</p>
              <p className={`text-xs mt-1 ${t.sub}`}>Auto-repayment starts from next ride earning</p>
              <button onClick={()=>setLoanStep("home")} style={{marginTop:16,padding:"12px 28px",background:"#7c3aed",color:"#fff",borderRadius:14,fontWeight:900}}>Done </button>
            </div>
          )}
        </>)}

        {/*  INSURANCE  */}
        {tab==="insurance"&&(<>
          <div style={{background:"linear-gradient(135deg,#0369a1,#0284c7)",borderRadius:20,padding:"20px",color:"#fff"}}>
            <p style={{fontSize:12,color:"#bae6fd",fontWeight:600}}>Active Coverage</p>
            <p style={{fontWeight:900,fontSize:26,margin:"4px 0"}}>{activePlan?insPlans.find(p=>p.id===activePlan)?.name:"No Active Plan"}</p>
            <p style={{fontSize:12,color:"#bae6fd"}}>
              {activePlan?`Cover up to GH${insPlans.find(p=>p.id===activePlan)?.cover?.toLocaleString()}`:"Select a plan below"}
            </p>
          </div>

          {insPlans.map(plan=>(
            <div key={plan.id} className={`${t.card} rounded-2xl p-4 border-2`} style={{borderColor:activePlan===plan.id?plan.color:dark?"#374151":"#e5e7eb"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <p className={`font-black ${t.text}`}>{plan.name}</p>
                    {activePlan===plan.id&&<Badge color="green">Active </Badge>}
                  </div>
                  <p className={`text-xs ${t.sub}`}>{plan.desc}</p>
                </div>
                <div style={{textAlign:"right"}}><p style={{fontWeight:900,color:plan.color,fontSize:18}}>GH{plan.price}</p><p className={`text-xs ${t.sub}`}>/month</p></div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 10px",background:dark?"#374151":"#f9fafb",borderRadius:10,marginBottom:10}}>
                <span className={`text-xs ${t.sub}`}>Max payout</span>
                <span style={{fontWeight:700,color:plan.color}}>GH{plan.cover.toLocaleString()}</span>
              </div>
              {activePlan!==plan.id?(
                <button onClick={async()=>{
                  try{await api.buyInsurance(user.id,plan.id,"v1");}catch(err){ console.warn("Error:",err); }
                  setActivePlan(plan.id);toast$(`${plan.name} plan activated `);
                }} style={{width:"100%",padding:"10px",background:plan.color,color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>
                  Activate  GH{plan.price}/mo
                </button>
              ):(
                <button onClick={()=>setClaimStep("file")} style={{width:"100%",padding:"10px",border:`2px solid ${plan.color}`,color:plan.color,borderRadius:12,fontWeight:700,fontSize:13}}>
                   File a Claim
                </button>
              )}
            </div>
          ))}

          {claimStep==="file"&&(
            <div className={`${t.card} rounded-2xl p-4 border-2 border-blue-400`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <p className={`font-black ${t.text}`}> File Claim</p>
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
                placeholder="Describe what happened  when, where, how"
                className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                style={{display:"block",width:"100%",minHeight:80,resize:"none",marginBottom:12}}/>
              <button onClick={async()=>{
                if(!claimType||!claimDesc){toast$("Fill all fields","error");return;}
                try{await api.fileInsuranceClaim(user.id,claimType,claimDesc);}catch(err){ console.warn("Error:",err); }
                setClaimStep("done");toast$("Claim submitted! Review within 24hrs ");
              }} style={{width:"100%",padding:"12px",background:"#0284c7",color:"#fff",borderRadius:14,fontWeight:900}}>Submit Claim</button>
            </div>
          )}
          {claimStep==="done"&&(
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:48,marginBottom:8}}></div>
              <p className={`font-black ${t.text}`}>Claim Submitted!</p>
              <p className={`text-xs mt-1 ${t.sub}`}>Ref: CLM-{Math.random().toString(36).substr(2,8).toUpperCase()}</p>
              <p className={`text-xs mt-1 ${t.sub}`}>Our team contacts you within 24 hours</p>
              <button onClick={()=>setClaimStep("home")} style={{marginTop:14,padding:"10px 24px",background:"#0284c7",color:"#fff",borderRadius:12,fontWeight:700}}>Done</button>
            </div>
          )}

          <div style={{background:dark?"#0c1a2e":"#f0f9ff",borderRadius:14,padding:"12px 14px"}}>
            <p style={{color:"#0284c7",fontWeight:700,fontSize:12,marginBottom:4}}> Powered by licensed Ghanaian insurers</p>
            <p style={{fontSize:11,color:dark?"#7dd3fc":"#0369a1"}}>Insurance underwritten by licensed partners. Okada Online is the distribution agent. All claims processed by the underwriting partner within 5 business days.</p>
          </div>
        </>)}

        {/*  PAY LATER (passengers only)  */}
        {tab==="paylater"&&(<>
          <div style={{background:"linear-gradient(135deg,#047857,#059669)",borderRadius:20,padding:"20px",color:"#fff"}}>
            <p style={{fontSize:12,color:"#a7f3d0",fontWeight:600}}>Pay Later Available</p>
            <p style={{fontWeight:900,fontSize:38,margin:"4px 0"}}>GH{plAvail.toFixed(2)}</p>
            <p style={{fontSize:12,color:"#a7f3d0"}}>of GH{plLimit} limit</p>
            <div style={{marginTop:12,height:6,borderRadius:999,background:"rgba(255,255,255,0.25)"}}>
              <div style={{height:6,borderRadius:999,width:`${(plUsed/plLimit)*100}%`,background:"#fff"}}/>
            </div>
            <p style={{fontSize:11,color:"#a7f3d0",marginTop:4}}>GH{plUsed.toFixed(2)} used  Due Mar 14, 2026</p>
          </div>

          {plUsed>0&&(
            <div style={{background:dark?"#1c1917":"#fef3c7",borderRadius:14,padding:"12px 14px",border:"1px solid #fde68a",display:"flex",gap:10,alignItems:"flex-start"}}>
              <AlertCircle style={{width:16,height:16,color:"#ca8a04",flexShrink:0,marginTop:1}}/>
              <div>
                <p style={{fontWeight:700,fontSize:13,color:"#92400e"}}>Payment Due: GH{plUsed.toFixed(2)}</p>
                <p style={{fontSize:11,color:"#92400e",marginTop:2}}>Due Mar 14. Auto-charged to MoMo. Missing payment permanently suspends Pay Later.</p>
                <button onClick={async()=>{
                  try{await api.repayLater(user.id,plUsed);}catch(err){ console.warn("Error:",err); }
                  setPlUsed(0);toast$("Pay Later cleared  Limit restored!");
                }} style={{marginTop:8,padding:"8px 16px",background:"#ca8a04",color:"#fff",borderRadius:10,fontWeight:700,fontSize:12}}>
                  Repay Now  GH{plUsed.toFixed(2)}
                </button>
              </div>
            </div>
          )}

          <div className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}>
            <p className={`font-black text-sm mb-3 ${t.text}`}> How Pay Later Works</p>
            {[["","Book ride  choose Pay Later at checkout"],["","Ride now  payment deferred up to 7 days"],["","Auto-charged to your MoMo on due date"],["","Build credit history with on-time payments"],["","Missed payment permanently removes access"]].map(([icon,text])=>(
              <p key={text} style={{fontSize:12,marginBottom:5,color:icon===""?"#ef4444":dark?"#d1d5db":"#374151"}}>{icon} {text}</p>
            ))}
          </div>

          <div className={`${t.card} rounded-2xl border ${t.bdr} overflow-hidden`}>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
              <p className={`font-black text-sm ${t.text}`}> Pay Later History</p>
            </div>
            {plHistory.map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${dark?"#374151":"#e5e7eb"}`}}>
                <div><p className={`font-bold text-sm ${t.text}`}>{h.route}</p><p className={`text-xs ${t.sub}`}>{h.date}</p></div>
                <div style={{textAlign:"right"}}><p style={{fontWeight:900,color:"#16a34a"}}>GH{h.amount}</p><Badge color={h.status==="paid"?"green":"yellow"}>{h.status}</Badge></div>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
    </div>
  );
}
// --- AUTH SCREEN ---
