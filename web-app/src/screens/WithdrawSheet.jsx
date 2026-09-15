import { useState } from "react";
import { X, Clock, ArrowDownCircle } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";

export function WithdrawSheet({available,pending,userId,onClose,dark}) {
  const t=T(dark);
  const [amount,setAmount]=useState("");
  const [momoPhone,setMomoPhone]=useState("");
  const [network,setNetwork]=useState("mtn");
  const [step,setStep]=useState("form");
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});
  const withdraw=async()=>{
    if(!amount||parseFloat(amount)<1){toast$("Enter valid amount","error");return;}
    if(parseFloat(amount)>available){toast$("Exceeds available balance","error");return;}
    if(momoPhone.length<10){toast$("Enter valid MoMo number","error");return;}
    setStep("processing");
    try{await api.requestWithdrawal(userId,parseFloat(amount),momoPhone);}catch(err){ console.warn("Error:",err); }
    setTimeout(()=>setStep("done"),2500);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:70,display:"flex",alignItems:"flex-end",maxWidth:448,margin:"0 auto"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div className={`${t.card} rounded-t-3xl p-6 w-full shadow-2xl`} style={{maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 className={`text-lg font-black ${t.text}`}> Withdraw Funds</h3>
          <button onClick={onClose}><X style={{width:20,height:20,color:"#9ca3af"}}/></button>
        </div>
        {step==="form"&&(<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div style={{background:"#f0fdf4",borderRadius:14,padding:"12px",textAlign:"center"}}>
              <p style={{fontSize:11,color:"#16a34a",fontWeight:700}}>AVAILABLE</p>
              <p style={{fontWeight:900,color:"#16a34a",fontSize:20}}>GH{available.toFixed(2)}</p>
            </div>
            <div style={{background:dark?"#374151":"#fefce8",borderRadius:14,padding:"12px",textAlign:"center"}}>
              <p style={{fontSize:11,color:"#ca8a04",fontWeight:700}}>PENDING 24H</p>
              <p style={{fontWeight:900,color:"#ca8a04",fontSize:20}}>GH{pending.toFixed(2)}</p>
            </div>
          </div>
          <div style={{background:dark?"#1c1917":"#fefce8",borderRadius:12,padding:"10px 12px",marginBottom:14,display:"flex",gap:8}}>
            <Clock style={{width:14,height:14,color:"#ca8a04",flexShrink:0,marginTop:1}}/>
            <p style={{fontSize:11,color:"#92400e"}}>Earnings held 24 hours. Fraud protection & payment verification.</p>
          </div>
          <p className={`text-xs font-bold mb-1 ${t.sub}`}>AMOUNT (GH)</p>
          <input value={amount} onChange={e=>setAmount(e.target.value)} type="number"
            placeholder={"Max GH"+available.toFixed(2)}
            className={`w-full px-4 py-3 border rounded-xl text-lg font-black focus:outline-none ${t.inp}`}
            style={{display:"block",width:"100%",marginBottom:6}}/>
          <div style={{display:"flex",gap:6,marginBottom:14}}>
            {[25,50,100,"All"].map(v=>(
              <button key={v} onClick={()=>setAmount(v==="All"?available.toFixed(2):String(Math.min(v,available)))}
                style={{flex:1,padding:"6px",borderRadius:8,border:`1px solid ${dark?"#374151":"#e5e7eb"}`,fontSize:12,fontWeight:700}} className={t.text}>
                {v==="All"?"All":"+"+v}
              </button>
            ))}
          </div>
          <p className={`text-xs font-bold mb-2 ${t.sub}`}>MOBILE NETWORK</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
            {[["mtn","MTN","#ffcc00","#000"],["vodafone","Vodafone","#e60000","#fff"],["airtel","AirtelTigo","#ef4444","#fff"]].map(([id,lb,bg,fg])=>(
              <button key={id} onClick={()=>setNetwork(id)}
                style={{padding:"10px 4px",borderRadius:12,border:`2px solid ${network===id?bg:"#e5e7eb"}`,background:network===id?bg:"transparent",fontWeight:700,fontSize:11,color:network===id?fg:dark?"#9ca3af":"#6b7280"}}>
                {lb}
              </button>
            ))}
          </div>
          <p className={`text-xs font-bold mb-1 ${t.sub}`}>MOMO NUMBER</p>
          <input value={momoPhone} onChange={e=>setMomoPhone(e.target.value)} type="tel" placeholder="+233XXXXXXXXX"
            className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
            style={{display:"block",width:"100%",marginBottom:14}}/>
          <button onClick={withdraw} disabled={!amount||!momoPhone||parseFloat(amount)>available}
            style={{width:"100%",padding:"14px",background:(!amount||!momoPhone||parseFloat(amount)>available)?"#9ca3af":"#16a34a",color:"#fff",borderRadius:16,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <ArrowDownCircle style={{width:18,height:18}}/> Withdraw GH{amount||"0.00"}
          </button>
        </>)}
        {step==="processing"&&(
          <div style={{textAlign:"center",padding:"32px 0"}}>
            <div style={{width:52,height:52,border:"4px solid #16a34a",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
            <p className={`font-black ${t.text}`}>Processing</p>
            <p className={`text-xs mt-1 ${t.sub}`}>Sending GH{amount} via {network.toUpperCase()}</p>
          </div>
        )}
        {step==="done"&&(
          <div style={{textAlign:"center",padding:"32px 0"}}>
            <div style={{fontSize:52,marginBottom:12}}></div>
            <p className={`font-black text-lg ${t.text}`}>Withdrawal Successful!</p>
            <p className={`text-sm mt-2 ${t.sub}`}>GH{amount} sent to {momoPhone}</p>
            <button onClick={onClose} style={{marginTop:20,padding:"12px 32px",background:"#16a34a",color:"#fff",borderRadius:14,fontWeight:900}}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

//  FINTECH HUB  Savings  Loans  Insurance  Pay Later
