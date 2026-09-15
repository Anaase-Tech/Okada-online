import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";
import { Loader } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";

export function ShareRide({user,dark,onBack}) {
  const t=T(dark);
  const [view,setView]=useState("browse");
  const [trips,setTrips]=useState([]);
  const [loading,setLoading]=useState(false);
  const [toast,setToast]=useState(null);
  const toast$=(msg,type="success")=>setToast({msg,type});
  const [pickup,setPickup]=useState("");
  const [dest,setDest]=useState("");
  const [vehicle,setVehicle]=useState("car");
  const [departTime,setDepartTime]=useState("07:30");
  const [departDate,setDepartDate]=useState(new Date().toISOString().slice(0,10));
  const [maxPass,setMaxPass]=useState(3);
  const [farePerPerson,setFarePerPerson]=useState("");

  const DEMO=[
    {id:"t1",creatorId:"u2",pickupAddress:"Akosombo",destAddress:"Koforidua",vehicleType:"car",departTime:"07:30",departDate:"Today",maxPassengers:4,farePerPerson:15,passengers:["u2","u3"],status:"open"},
    {id:"t2",creatorId:"u4",pickupAddress:"Kpong",destAddress:"Odumase-Krobo",vehicleType:"car",departTime:"08:00",departDate:"Today",maxPassengers:3,farePerPerson:8,passengers:["u4"],status:"open"},
    {id:"t3",creatorId:"u5",pickupAddress:"Atimpoku",destAddress:"Somanya",vehicleType:"tricycle",departTime:"09:30",departDate:"Today",maxPassengers:3,farePerPerson:6,passengers:["u5","u6","u7"],status:"full"},
  ];

  useEffect(()=>{
    try{
      const q=query(collection(db,"shared_trips"),where("status","==","open"),limit(10));
      const unsub=onSnapshot(q,(snap)=>{
        if(!snap.empty) setTrips(snap.docs.map(d=>({id:d.id,...d.data()})));
        else setTrips(DEMO);
      },()=>setTrips(DEMO));
      return()=>unsub();
    }catch(err){console.warn(err);setTrips(DEMO);}
  },[]);

  const createTrip=async()=>{
    if(!pickup||!dest||!farePerPerson){toast$("Fill all fields","error");return;}
    setLoading(true);
    try{
      await api.createSharedTrip({creatorId:user.id,pickupAddress:pickup,destAddress:dest,vehicleType:vehicle,departTime,departDate,maxPassengers:maxPass,farePerPerson:parseFloat(farePerPerson)});
      toast$("Shared trip created! Others can now join");setView("browse");
    }catch(err){
      console.warn(err);
      setTrips(prev=>[{id:"t"+Date.now(),creatorId:user.id,pickupAddress:pickup,destAddress:dest,vehicleType:vehicle,departTime,departDate,maxPassengers:maxPass,farePerPerson:parseFloat(farePerPerson),passengers:[user.id],status:"open"},...prev]);
      toast$("Shared trip created! (demo)");setView("browse");
    }
    setLoading(false);
  };

  const joinTrip=async(trip)=>{
    if(trip.passengers.includes(user.id)){toast$("Already joined","error");return;}
    try{await api.joinSharedTrip(trip.id,user.id);}catch(err){console.warn(err);}
    toast$("Joined! GH\u20B5"+trip.farePerPerson+" per person");
    setTrips(prev=>prev.map(t=>t.id===trip.id?{...t,passengers:[...t.passengers,user.id]}:t));
  };

  const vIcon={car:"\u{1F697}",okada:"\u{1F6F5}",tricycle:"\u{1F6FA}",ev_car:"\u26A1\u{1F697}"};

  return (
    <div style={{minHeight:"100%"}} className={t.bg}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:"linear-gradient(135deg,#0d9488,#0284c7)",color:"#fff",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:20}}>
        {onBack&&<button onClick={onBack} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"6px 10px",fontSize:14,cursor:"pointer"}}>\u2190</button>}
        <div>
          <p style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:17,margin:0}}>Share a Ride</p>
          <p style={{fontSize:11,margin:0,opacity:0.8}}>Split the fare \xB7 Same route \xB7 Save money</p>
        </div>
        <button onClick={()=>setView(view==="browse"?"create":"browse")} style={{marginLeft:"auto",padding:"8px 14px",background:"rgba(255,255,255,0.2)",borderRadius:10,fontWeight:700,fontSize:12,color:"#fff",border:"none",cursor:"pointer"}}>
          {view==="browse"?"+ Create":"\u2715 Cancel"}
        </button>
      </div>
      <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
        {view==="browse"&&(
          <>
            {trips.length===0&&(
              <div style={{textAlign:"center",padding:"40px 0"}}>
                <div style={{fontSize:48,marginBottom:12}}>\U0001F91D</div>
                <p className={"font-bold "+t.text}>No shared trips right now</p>
                <button onClick={()=>setView("create")} style={{marginTop:16,padding:"12px 24px",background:"#0d9488",color:"#fff",borderRadius:14,fontWeight:900}}>Create Shared Trip</button>
              </div>
            )}
            {trips.map(trip=>(
              <div key={trip.id} className={t.card+" rounded-2xl p-4 border-2"} style={{borderColor:trip.status==="full"?"#9ca3af":"#0d9488"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <p className={"font-black "+t.text}>{trip.pickupAddress} \u2192 {trip.destAddress}</p>
                    <p className={"text-xs "+t.sub}>{"\u23F0"} {trip.departTime} \xB7 {trip.departDate}</p>
                    <p className={"text-xs "+t.sub}>{"👥"} {trip.passengers.length}/{trip.maxPassengers} seats</p>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <p style={{fontWeight:900,color:"#0d9488",fontSize:18}}>GH\u20B5{trip.farePerPerson}</p>
                    <p className={"text-xs "+t.sub}>per person</p>
                  </div>
                </div>
                <button disabled={trip.status==="full"||trip.passengers.includes(user.id)} onClick={()=>joinTrip(trip)}
                  style={{width:"100%",padding:"10px",borderRadius:12,fontWeight:700,fontSize:13,border:"none",cursor:"pointer",background:trip.passengers.includes(user.id)?"#0d9488":trip.status==="full"?"#9ca3af":"#0d9488",color:"#fff",opacity:(trip.status==="full"&&!trip.passengers.includes(user.id))?0.5:1}}>
                  {trip.passengers.includes(user.id)?"Joined \u2705":trip.status==="full"?"Trip Full":"Join \u2014 GH\u20B5"+trip.farePerPerson}
                </button>
              </div>
            ))}
          </>
        )}
        {view==="create"&&(
          <>
            <div className={t.card+" rounded-2xl p-4 border "+t.bdr}>
              <p className={"font-black mb-3 "+t.text}>Route Details</p>
              <input value={pickup} onChange={e=>setPickup(e.target.value)} list="locs" placeholder="Pickup location"
                className={"w-full px-4 py-3 border rounded-xl text-sm focus:outline-none "+t.inp} style={{display:"block",width:"100%",marginBottom:10}}/>
              <input value={dest} onChange={e=>setDest(e.target.value)} list="locs" placeholder="Destination"
                className={"w-full px-4 py-3 border rounded-xl text-sm focus:outline-none "+t.inp} style={{display:"block",width:"100%",marginBottom:10}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <input type="date" value={departDate} onChange={e=>setDepartDate(e.target.value)}
                  className={"w-full px-3 py-3 border rounded-xl text-sm focus:outline-none "+t.inp} style={{display:"block",width:"100%"}}/>
                <input type="time" value={departTime} onChange={e=>setDepartTime(e.target.value)}
                  className={"w-full px-3 py-3 border rounded-xl text-sm focus:outline-none "+t.inp} style={{display:"block",width:"100%"}}/>
              </div>
            </div>
            <div className={t.card+" rounded-2xl p-4 border "+t.bdr}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <p className={"text-xs font-bold mb-1 "+t.sub}>MAX PASSENGERS</p>
                  <select value={maxPass} onChange={e=>setMaxPass(parseInt(e.target.value))}
                    className={"w-full px-3 py-3 border rounded-xl text-sm focus:outline-none "+t.inp} style={{display:"block",width:"100%"}}>
                    {[2,3,4,5,6].map(n=><option key={n} value={n}>{n} people</option>)}
                  </select>
                </div>
                <div>
                  <p className={"text-xs font-bold mb-1 "+t.sub}>FARE / PERSON (GH\u20B5)</p>
                  <input value={farePerPerson} onChange={e=>setFarePerPerson(e.target.value)} type="number" placeholder="e.g. 12"
                    className={"w-full px-3 py-3 border rounded-xl text-sm focus:outline-none "+t.inp} style={{display:"block",width:"100%"}}/>
                </div>
              </div>
            </div>
            <button onClick={createTrip} disabled={loading}
              style={{width:"100%",padding:"14px",background:"#0d9488",color:"#fff",borderRadius:16,fontWeight:900,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,border:"none",cursor:"pointer",opacity:loading?0.7:1}}>
              {loading&&<Loader className="w-4 h-4 animate-spin"/>} Create Shared Trip
            </button>
          </>
        )}
      </div>
    </div>
  );
}


// -- DRIVER PICKUPS --------------------------------------------
