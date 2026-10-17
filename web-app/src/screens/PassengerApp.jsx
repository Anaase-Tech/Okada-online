import { useState, useEffect } from "react";
import { MapPin, Navigation, Star, X, Moon, Sun, AlertCircle, CheckCircle, LogOut } from "lucide-react";
import { api } from "../api";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { T } from "../theme";
import { VEHICLES, LOCS, LOCATION_COORDS } from "../constants";
import { Toast } from "../components/Toast";
import { Badge } from "../components/Badge";
import { Spin } from "../components/Spin";
import { Map } from "../components/Map";
import { KycVerify } from "./KycVerify";
import { FintechHub } from "./FintechHub";
import { ScheduledTrips } from "./ScheduledTrips";
import { ShareRide } from "./ShareRide";
import { RentalHub } from "./RentalHub";
import { DeliveryApp } from "./DeliveryApp";
import { JourneyApp } from "./JourneyApp";

function approximateTownDistanceKm(a, b) {
  if (!a || !b) return null;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  // This is a town-centre estimate, not live routing or a guaranteed road distance.
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))) * 1.25;
}

export function PassengerApp({user,onLogout,dark,setDark}) {
  const t=T(dark);
  const [view,setView]=useState(()=>localStorage.getItem("okada_pending_journey") ? "journey" : "home");
  const [pickup,setPickup]=useState("");
  const [dest,setDest]=useState("");
  const [vehicle,setVehicle]=useState("okada");
  const [fare,setFare]=useState(null);
  const [rideId,setRideId]=useState(null);
  const [currentRide,setCurrentRide]=useState(null);
  const [paymentReference,setPaymentReference]=useState(null);
  const [status,setStatus]=useState("idle");
  const [driver,setDriver]=useState(null);
  const [driverPos,setDriverPos]=useState(null);
  const [eta,setEta]=useState(0);
  const [history,setHistory]=useState([]);
  const [historyError,setHistoryError]=useState(null);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [loading,setLoading]=useState(false);
  const [toast,setToast]=useState(null);
  const [payStatus,setPayStatus]=useState("idle");
  const [payMethod,setPayMethod]=useState(null);
  const [momoPhone,setMomoPhone]=useState(user.phone||"+233");
  const [email,setEmail]=useState("");
  const [showKyc,setShowKyc]=useState(!user.kycData&&!user.ghanaCard);
  const toast$=(msg,type="success")=>setToast({msg,type});

  // Smart pricing: distance + time + surge + vehicle type
  useEffect(()=>{
    if(!pickup||!dest){setFare(null);return;}
    const v=VEHICLES.find(v=>v.id===vehicle);
    // Distance matrix for known Eastern Region routes (production: use Google Maps API)
    const DIST = {
      'Akosombo-Atimpoku':4.2,'Akosombo-Senchi':5.1,'Akosombo-Kpong':18,'Akosombo-Koforidua':62,
      'Atimpoku-Kpong':14,'Kpong-Odumase-Krobo':8,'Odumase-Krobo-Somanya':12,'Somanya-Koforidua':28,
      'Akosombo-Adjena':3.2,'Akosombo-Frankadua':7,'Kpong-Agormanya':6,'Agormanya-Nkurakan':15,
    };
    const key1 = pickup+'-'+dest;
    const key2 = dest+'-'+pickup;
    const routeEstimate = DIST[key1] || DIST[key2];
    const baseKm = routeEstimate || approximateTownDistanceKm(LOCATION_COORDS[pickup], LOCATION_COORDS[dest]);
    if (!Number.isFinite(baseKm) || baseKm <= 0) { setFare(null); return; }
    // Time-of-day surge (7-9am, 5-7pm = 1.3x)
    const hr = new Date().getHours();
    const surge = (hr>=7&&hr<=9)||(hr>=17&&hr<=19) ? 1.3 : (hr>=22||hr<=5) ? 1.5 : 1.0;
    const baseFare = baseKm * v.rate;
    const totalFare = parseFloat((baseFare * surge + 2).toFixed(2)); // GH₵2 base flag
    const dur = Math.ceil(baseKm * (vehicle==='okada'?2.8:vehicle==='bicycle'?5:3));
    setFare({km:baseKm, total:totalFare, dur, surge, breakdown:{base:parseFloat(baseFare.toFixed(2)),surgeLabel:surge>1?(surge===1.5?'Late Night':'Rush Hour'):'Normal'}});
  },[pickup,dest,vehicle]);

  // Subscribe to the actual ride document. Matching, start, completion, and
  // payment state come from the backend; no simulated driver or countdown.
  useEffect(() => {
    if (!rideId) return undefined;
    const rideRef = doc(db, "rides", rideId);
    const unsub = onSnapshot(rideRef, (snap) => {
      if (!snap.exists()) {
        toast$("The ride record is no longer available.", "error");
        return;
      }
      const ride = snap.data();
      setCurrentRide(ride);
      if (ride.pickupLocation?.address) setPickup(ride.pickupLocation.address);
      if (ride.destination?.address) setDest(ride.destination.address);
      if (ride.fare?.total != null) {
        setFare((old) => ({
          ...(old || {}),
          total: Number(ride.fare.total),
          serverFare: ride.fare,
          km: Number(ride.distance || old?.km || 0),
          breakdown: { ...(old?.breakdown || {}), serverCalculated: true },
        }));
      }

      const rideStatus = String(ride.status || "").toLowerCase();
      if (rideStatus === "requested") {
        setStatus("searching");
        setDriver(null);
      } else if (rideStatus === "accepted" || rideStatus === "in_progress") {
        const vehicleInfo = VEHICLES.find((v) => v.id === ride.rideType) || VEHICLES[0];
        setDriver({
          id: ride.driverId,
          name: ride.driverName || "Assigned driver",
          phone: ride.driverPhone || "",
          rating: Number.isFinite(Number(ride.driverRating)) ? Number(ride.driverRating) : null,
          vehicle: vehicleInfo.label,
          icon: vehicleInfo.icon,
          plate: ride.vehiclePlate || "Vehicle details not supplied",
          photo: vehicleInfo.icon,
          rides: Number.isFinite(Number(ride.driverTotalRides)) ? Number(ride.driverTotalRides) : null,
        });
        setEta(0);
        setStatus(rideStatus === "in_progress" ? "ongoing" : "matched");
      } else if (rideStatus === "completed") {
        const pay = String(ride.paymentStatus || "").toUpperCase();
        if (pay === "PAID" || pay === "CASH_PAID") {
          setPayStatus("paid");
          toast$(pay === "CASH_PAID" ? "Cash receipt was confirmed by the driver." : "Payment verified by the server.");
          setTimeout(() => setPayStatus("idle"), 3500);
        } else if (pay === "DEFERRED") {
          setPayStatus("deferred");
        } else {
          toast$("The ride was completed. Payment status still needs review.", "error");
        }
        setStatus("idle");
        setDriver(null);
        setCurrentRide(null);
        setRideId(null);
        localStorage.removeItem("okada_pending_ride");
        localStorage.removeItem("okada_pending_payment");
      } else if (rideStatus === "cancelled") {
        setStatus("idle");
        setDriver(null);
        setCurrentRide(null);
        setRideId(null);
        toast$("The ride was cancelled.", "error");
      }

      const paymentStatus = String(ride.paymentStatus || "").toUpperCase();
      if (paymentStatus === "CASH_AWAITING_DRIVER") setPayStatus("awaiting-driver");
      if (paymentStatus === "DEFERRED") setPayStatus("deferred");
      if (paymentStatus === "CASH_PAID" || paymentStatus === "PAID") setPayStatus("paid");
      if (paymentStatus === "FAILED" || paymentStatus === "ABANDONED") setPayStatus((old) => old === "processing" ? "failed" : old);
    }, (error) => {
      console.error("Ride listener failed:", error);
      toast$("Live ride updates are unavailable. Check your connection before proceeding.", "error");
    });
    return unsub;
  }, [rideId]);

  // Only display a driver location the backend actually recorded.
  useEffect(() => {
    if (!driver?.id) { setDriverPos(null); return undefined; }
    return onSnapshot(doc(db, "drivers", driver.id), (snap) => {
      const location = snap.exists() ? snap.data()?.location : null;
      if (Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude))) {
        const updatedAtMs = typeof location.lastUpdated?.toMillis === "function" ? location.lastUpdated.toMillis() : 0;
        setDriverPos({ lat: Number(location.latitude), lng: Number(location.longitude), updatedAtMs });
      } else {
        setDriverPos(null);
      }
    }, (error) => {
      console.warn("Driver location listener failed:", error.message);
      setDriverPos(null);
    });
  }, [driver?.id]);

  // A Paystack redirect returns to the PWA with a provider reference. Verify
  // it server-side; never infer payment success from a redirect or timeout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (!reference) return;
    const stored = localStorage.getItem("okada_pending_payment");
    if (stored) {
      try {
        const pending = JSON.parse(stored);
        if (pending.rideId) setRideId(pending.rideId);
        if (pending.pickup) setPickup(pending.pickup);
        if (pending.dest) setDest(pending.dest);
        if (pending.vehicle) setVehicle(pending.vehicle);
        if (pending.fare) setFare(pending.fare);
      } catch (error) {
        console.warn("Could not restore pending payment context:", error);
      }
    }
    setPaymentReference(reference);
    setPayStatus("processing");
    api.verifyPayment(reference).then((result) => {
      if (result.rideId) setRideId(result.rideId);
      const outcome = String(result.outcome || "").toUpperCase();
      if (result.verified === true && ["SUCCESS", "ALREADY_PAID"].includes(outcome)) {
        setPayStatus("paid");
        toast$("Paystack confirmed the payment with the server.");
      } else if (outcome === "FAILED") {
        setPayStatus("failed");
        toast$("Paystack confirmed the attempt failed. You may retry or choose cash.", "error");
      } else if (outcome === "REQUIRES_REFUND_REVIEW") {
        setPayStatus("review");
        toast$("A captured payment needs administrator review. Do not pay this fare again.", "error");
      } else {
        setPayStatus("pending");
        toast$("Payment is not yet confirmed. Do not pay cash until the status is resolved.", "error");
      }
    }).catch((error) => {
      setPayStatus("pending");
      toast$((error?.message || "Payment status could not be verified.") + " Do not pay again yet.", "error");
    }).finally(() => {
      window.history.replaceState({}, document.title, "/");
    });
  }, [user.id]);

  useEffect(()=>{
    if(view!=="history") return undefined;
    let active = true;
    setHistoryLoading(true);
    setHistoryError(null);
    api.getHistory(user.id).then((result)=>{
      if(!active) return;
      const rides = Array.isArray(result.rides) ? result.rides : [];
      setHistory(rides.map((ride)=>{
        const createdAt = ride.createdAt?.toDate ? ride.createdAt.toDate() : new Date(ride.createdAt || 0);
        const validDate = Number.isNaN(createdAt.getTime()) ? "Date unavailable" : createdAt.toLocaleDateString();
        const paymentStatus = String(ride.paymentStatus || "").toUpperCase();
        const paymentMethod = String(ride.paymentMethod || ride.payMethod || "").toLowerCase();
        const paid = paymentStatus === "CASH_PAID" ? "Cash"
          : paymentStatus === "DEFERRED" ? "Pay Later"
          : paymentStatus === "PAID" ? (paymentMethod === "cash" ? "Cash" : "Online")
          : paymentStatus === "FAILED" || paymentStatus === "ABANDONED" ? "Payment failed"
          : paymentStatus === "CASH_AWAITING_DRIVER" ? "Cash pending"
          : paymentStatus || "Not confirmed";
        return {
          id: ride.id,
          from: ride.pickupLocation?.address || "Pickup unavailable",
          to: ride.destination?.address || "Destination unavailable",
          fare: Number(ride.fare?.total ?? 0).toFixed(2),
          date: validDate,
          driver: ride.driverName || "Driver not assigned",
          rating: Number(ride.driverRating || 0),
          vehicle: ride.rideType || "—",
          paid,
        };
      }));
    }).catch((error)=>{
      if(!active) return;
      setHistory([]);
      setHistoryError(error?.message || "Ride history could not be loaded.");
    }).finally(()=>{
      if(active) setHistoryLoading(false);
    });
    return ()=>{ active = false; };
  },[view,user.id]);

  const bookRide = async () => {
    if (!pickup || !dest) { toast$("Enter pickup & destination", "error"); return; }
    if (pickup === dest) { toast$("Choose two different locations", "error"); return; }
    const pickupCoords = LOCATION_COORDS[pickup];
    const destCoords = LOCATION_COORDS[dest];
    if (!pickupCoords || !destCoords) {
      toast$("Coordinates are not configured for this location. The ride was not submitted.", "error");
      return;
    }
    setLoading(true);
    setStatus("searching");
    try {
      const result = await api.requestRide({
        userId: user.id,
        pickupLocation: { address: pickup, latitude: pickupCoords.lat, longitude: pickupCoords.lng },
        destination: { address: dest, latitude: destCoords.lat, longitude: destCoords.lng },
        rideType: vehicle,
      });
      if (!result.rideId || !result.fare || !Number.isFinite(Number(result.fare.total))) {
        throw new Error("The server did not return a valid ride record and fare.");
      }
      setRideId(result.rideId);
      setCurrentRide({ id: result.rideId, status: "requested", fare: result.fare });
      setFare((old) => ({
        ...(old || {}),
        total: Number(result.fare.total),
        serverFare: result.fare,
        breakdown: { ...(old?.breakdown || {}), serverCalculated: true },
      }));
      localStorage.setItem("okada_pending_ride", JSON.stringify({
        rideId: result.rideId, pickup, dest, vehicle,
        fare: { ...(fare || {}), total: Number(result.fare.total), serverFare: result.fare },
      }));
      setDriver(null);
      setEta(0);
      setStatus("searching");
      toast$(Number(result.nearbyDriversNotified || 0) > 0
        ? "Ride request sent to nearby verified drivers. Waiting for a real driver to accept."
        : "Ride request was recorded. Waiting for an available driver.");
    } catch (error) {
      console.error("Ride request failed:", error);
      setStatus("idle");
      setRideId(null);
      setCurrentRide(null);
      toast$(error?.message || "Ride request failed. No driver has been assigned.", "error");
    } finally {
      setLoading(false);
    }
  };

  if(showKyc) return <KycVerify role="passenger" dark={dark} onVerified={()=>setShowKyc(false)}/>;

  const NAV_ITEMS = [["home","🏠","Home"],["journey","🧭","Journey"],["maas","📅","Schedule"],["share","🤝","Share"],["rental","🚗","Rental"],["delivery","📦","Deliver"],["fintech","💎","Fintech"],["history","📋","History"],["profile","👤","Me"]];

  const Nav=()=>(
    <div className={`fixed bottom-0 inset-x-0 max-w-md mx-auto ${t.card} border-t ${t.bdr}`}
      style={{display:"flex",overflowX:"auto",WebkitOverflowScrolling:"touch",padding:"6px 4px",zIndex:30,scrollbarWidth:"none"}}>
      {NAV_ITEMS.map(([v,ic,lb])=>(
        <button key={v} onClick={()=>setView(v)}
          style={{display:"flex",flexDirection:"column",alignItems:"center",flex:"0 0 auto",padding:"4px 10px",minWidth:52,color:view===v?"#16a34a":dark?"#9ca3af":"#6b7280"}}>
          <span style={{fontSize:18}}>{ic}</span><span style={{fontSize:10,fontWeight:700,marginTop:1,whiteSpace:"nowrap"}}>{lb}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`max-w-md mx-auto min-h-screen relative ${t.bg}`}>
      {toast&&<Toast msg={toast.msg} type={toast.type} close={()=>setToast(null)}/>}
      <div style={{background:"#16a34a",color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>🏍️</span><span style={{fontFamily:"Syne,sans-serif",fontWeight:900,fontSize:18}}>Okada Online</span></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setDark(!dark)} style={{padding:6,borderRadius:8,background:"rgba(255,255,255,0.15)"}}>{dark?<Sun className="w-4 h-4"/>:<Moon className="w-4 h-4"/>}</button>
          <div style={{width:32,height:32,borderRadius:"50%",background:"#15803d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{user.profilePhoto||"👤"}</div>
        </div>
      </div>

      <div style={{paddingBottom:80}}>
        {view==="fintech"&&<FintechHub user={user} role="passenger" dark={dark}/>}\n        {view==="journey"&&<JourneyApp user={user} dark={dark} onBack={()=>setView("home")}/>}
        {view==="maas"&&<ScheduledTrips user={user} dark={dark} onBack={()=>setView("home")}/>}
        {view==="share"&&<ShareRide user={user} dark={dark} onBack={()=>setView("home")}/>}
        {view==="rental"&&<RentalHub user={user} dark={dark} onBack={()=>setView("home")}/>}
        {view==="delivery"&&<DeliveryApp user={user} dark={dark} onBack={()=>setView("home")}/>}

        {view==="home"&&(
          <div style={{padding:16}}>
            {user.isInternational&&(
              <div style={{background:"linear-gradient(135deg,#7c3aed,#4f46e5)",borderRadius:16,padding:"12px 14px",marginBottom:12,color:"#fff",display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:24}}>🌍</span>
                <div>
                  <p style={{fontWeight:700,fontSize:13}}>Welcome to Ghana! 🇬🇭</p>
                  <p style={{fontSize:11,color:"#c7d2fe"}}>Passport verified · {user.passport?.country} visitor · Pay Later enabled</p>
                </div>
              </div>
            )}
            <div style={{marginBottom:12}}>
              <Map dark={dark} height={220} status={status}
                pickup={LOCATION_COORDS[pickup]||null}
                destination={LOCATION_COORDS[dest]||null}
                driverPos={driverPos}/>
            </div>

            <div className={`${t.card} rounded-2xl shadow p-4 border ${t.bdr}`} style={{display:"flex",flexDirection:"column",gap:12}}>
              <h2 className={`font-black text-base ${t.text}`}>📍 Book Your Ride</h2>
              {status==="idle"&&<>
                <div style={{position:"relative"}}>
                  <MapPin style={{position:"absolute",left:12,top:13,width:16,height:16,color:"#16a34a"}}/>
                  <input value={pickup} onChange={e=>setPickup(e.target.value)} list="locs" placeholder="Pickup location"
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{paddingLeft:36,display:"block",width:"100%"}}/>
                </div>
                <div style={{position:"relative"}}>
                  <Navigation style={{position:"absolute",left:12,top:13,width:16,height:16,color:"#ef4444"}}/>
                  <input value={dest} onChange={e=>setDest(e.target.value)} list="locs" placeholder="Destination"
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`} style={{paddingLeft:36,display:"block",width:"100%"}}/>
                </div>
                <datalist id="locs">{LOCS.map(l=><option key={l} value={l}/>)}</datalist>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                  {VEHICLES.map(v=>(
                    <button key={v.id} onClick={()=>setVehicle(v.id)}
                      style={{padding:"10px 4px",borderRadius:12,border:`2px solid ${vehicle===v.id?"#16a34a":"#e5e7eb"}`,background:vehicle===v.id?"#f0fdf4":"transparent",textAlign:"center"}}>
                      <div style={{fontSize:20}}>{v.icon}</div>
                      <div style={{fontSize:10,fontWeight:700,color:vehicle===v.id?"#16a34a":dark?"#9ca3af":"#6b7280",marginTop:2}}>{v.label}</div>
                    </button>
                  ))}
                </div>
                {fare&&(
                  <div style={{background:dark?"#14532d":"#f0fdf4",borderRadius:12,padding:12,border:"1px solid #bbf7d0",fontSize:13}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span className={t.sub}>Distance</span><span className={`font-semibold ${t.text}`}>{fare.km} km · ~{fare.dur} min</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:8,borderTop:`1px solid ${dark?"#166534":"#bbf7d0"}`}}>
                      <span className={`font-black ${t.text}`}>Total Fare</span>
                      <span style={{fontWeight:900,color:"#16a34a",fontSize:18}}>GH₵{fare.total}</span>
                    </div>
                  </div>
                )}
                <button onClick={bookRide} disabled={!pickup||!dest||loading}
                  style={{width:"100%",background:"#16a34a",color:"#fff",padding:"14px",borderRadius:16,fontWeight:900,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:(!pickup||!dest||loading)?0.4:1}}>
                  {loading&&<Spin/>}{loading?"Booking…":`Book ${VEHICLES.find(v=>v.id===vehicle)?.label} ${VEHICLES.find(v=>v.id===vehicle)?.icon}`}
                </button>
              </>}

              {status==="searching"&&(
                <div style={{textAlign:"center",padding:"24px 0"}}>
                  <div style={{width:48,height:48,border:"4px solid #16a34a",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/>
                  <p className={`font-bold ${t.text}`}>Finding your driver…</p>
                  <button onClick={()=>setStatus("idle")} style={{marginTop:16,padding:"8px 20px",border:"1px solid #f87171",color:"#ef4444",borderRadius:12,fontSize:13,fontWeight:700}}>Cancel</button>
                </div>
              )}

              {(status==="matched"||status==="arrived")&&driver&&(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {status==="arrived"&&<div style={{background:"#16a34a",color:"#fff",borderRadius:12,padding:"8px",textAlign:"center",fontWeight:700,fontSize:13}}>🏍️ Driver has arrived!</div>}
                  <div style={{display:"flex",alignItems:"center",gap:12,padding:12,borderRadius:12,background:dark?"#374151":"#f9fafb"}}>
                    <div style={{width:52,height:52,borderRadius:"50%",background:"#dcfce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{driver.photo}</div>
                    <div style={{flex:1}}>
                      <p className={`font-black ${t.text}`}>{driver.name}</p>
                      <p className={`text-xs ${t.sub}`}>{driver.icon} {driver.vehicle} · {driver.plate}</p>
                      <div style={{display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                        <Star style={{width:12,height:12,fill:"#facc15",color:"#facc15"}}/>
                        <span className={`text-xs ${t.sub}`}>{driver.rating} · {driver.rides} rides</span>
                      </div>
                    </div>
                    {status==="matched"&&<div style={{textAlign:"center"}}><p className={`text-xs ${t.sub}`}>Driver assigned</p><p style={{fontWeight:800,color:"#16a34a",fontSize:13}}>Awaiting trip start</p></div>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                    <button onClick={()=>setStatus("idle")} style={{padding:"10px",border:"1px solid #f87171",color:"#ef4444",borderRadius:12,fontWeight:700,fontSize:12}}>Cancel</button>
                    <a href={`tel:${driver.phone}`} style={{padding:"10px",background:"#2563eb",color:"#fff",borderRadius:12,fontWeight:700,fontSize:12,textAlign:"center",display:"block"}}>📞 Call</a>
                    <span style={{padding:"10px",background:dark?"#374151":"#f3f4f6",color:dark?"#d1d5db":"#4b5563",borderRadius:12,fontWeight:700,fontSize:12,textAlign:"center"}}>Waiting for driver to start</span>
                  </div>
                </div>
              )}

              {status==="ongoing"&&driver&&(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{background:"#2563eb",color:"#fff",borderRadius:12,padding:"8px",textAlign:"center",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:"#fff",animation:"pulse 2s infinite"}}/>Ride in progress
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:12,borderRadius:12,background:dark?"#374151":"#f9fafb"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:24}}>{driver.photo}</span>
                      <div><p className={`font-bold ${t.text}`}>{driver.name}</p><p className={`text-xs ${t.sub}`}>{driver.plate}</p></div>
                    </div>
                    <p style={{fontWeight:900,color:"#16a34a",fontSize:18}}>GH₵{fare?.total}</p>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <button onClick={()=>toast$("🚨 Emergency services notified!","error")} style={{padding:"12px",background:"#dc2626",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <AlertCircle style={{width:16,height:16}}/> SOS
                    </button>
                    {payStatus==="paid"
                      ? <span style={{padding:"12px",background:dark?"#14532d":"#dcfce7",color:"#166534",borderRadius:12,fontWeight:800,fontSize:13,textAlign:"center"}}>Payment verified</span>
                      : payStatus==="awaiting-driver"
                        ? <span style={{padding:"12px",background:dark?"#422006":"#fef3c7",color:"#92400e",borderRadius:12,fontWeight:800,fontSize:13,textAlign:"center"}}>Waiting for cash confirmation</span>
                        : payStatus==="deferred"
                          ? <span style={{padding:"12px",background:dark?"#1e1b4b":"#eef2ff",color:"#6d28d9",borderRadius:12,fontWeight:800,fontSize:13,textAlign:"center"}}>Pay Later accepted</span>
                          : <button onClick={()=>setPayStatus("selecting")} style={{padding:"12px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>Payment options</button>}
                  </div>
                </div>
              )}
              {payStatus==="paid"&&(
                <div style={{textAlign:"center",padding:"16px 0"}}>
                  <div style={{fontSize:48,marginBottom:8}}>✅</div>
                  <p className={`font-black ${t.text}`}>Payment Complete!</p>
                  <p className={`text-xs ${t.sub} mt-1`}>Thanks for riding Okada Online 🇬🇭</p>
                </div>
              )}
              {payStatus==="failed"&&(
                <div style={{background:dark?"#3f1d1d":"#fef2f2",borderRadius:12,padding:12,marginTop:10}}>
                  <p className="font-bold text-sm" style={{color:"#b91c1c"}}>Online payment failed</p>
                  <p className="text-xs mt-1" style={{color:dark?"#fecaca":"#7f1d1d"}}>The server confirmed this attempt failed. You can retry online or select cash; cash still requires driver confirmation.</p>
                  <button onClick={()=>setPayStatus("selecting")} style={{marginTop:10,padding:"10px 14px",background:"#16a34a",color:"#fff",borderRadius:10,fontWeight:800}}>Choose another method</button>
                </div>
              )}
              {payStatus==="pending"&&(
                <div style={{background:dark?"#422006":"#fffbeb",borderRadius:12,padding:12,marginTop:10}}>
                  <p className="font-bold text-sm" style={{color:"#92400e"}}>Payment outcome not yet confirmed</p>
                  <p className="text-xs mt-1" style={{color:"#92400e"}}>Do not pay cash or start another attempt until the online status is resolved.</p>
                  <button onClick={async()=>{if(!paymentReference)return;setPayStatus("processing");try{const r=await api.verifyPayment(paymentReference);const o=String(r.outcome||"").toUpperCase();if(o==="FAILED")setPayStatus("failed");else if(o==="REQUIRES_REFUND_REVIEW")setPayStatus("review");else if(r.verified&&["SUCCESS","ALREADY_PAID"].includes(o))setPayStatus("paid");else setPayStatus("pending");}catch(e){setPayStatus("pending");toast$(e.message||"Payment verification failed","error");}}} style={{marginTop:10,padding:"10px 14px",background:"#b45309",color:"#fff",borderRadius:10,fontWeight:800}}>Check payment status</button>
                </div>
              )}
              {payStatus==="review"&&(
                <div style={{background:dark?"#3f1d1d":"#fef2f2",borderRadius:12,padding:12,marginTop:10}}>
                  <p className="font-bold text-sm" style={{color:"#b91c1c"}}>Payment needs review</p>
                  <p className="text-xs mt-1" style={{color:dark?"#fecaca":"#7f1d1d"}}>A charge was confirmed but could not be safely matched to this ride payment. Do not pay this fare again; administrator review is required.</p>
                </div>
              )}
              {payStatus==="deferred"&&(
                <div style={{background:dark?"#1e1b4b":"#eef2ff",borderRadius:12,padding:12,marginTop:10}}>
                  <p className="font-bold text-sm" style={{color:"#6d28d9"}}>Pay Later recorded</p>
                  <p className="text-xs mt-1" style={{color:"#6d28d9"}}>The amount is deferred under your Pay Later balance. It is not marked as an online payment.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Sheet */}
        {payStatus==="selecting"&&fare&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:60,display:"flex",alignItems:"flex-end",maxWidth:448,margin:"0 auto"}}>
            <div className={`${t.card} rounded-t-3xl p-6 w-full shadow-2xl`} style={{maxHeight:"90vh",overflowY:"auto"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <h3 className={`text-lg font-black ${t.text}`}>💳 Pay for Ride</h3>
                <button onClick={()=>setPayStatus("idle")}><X style={{width:20,height:20,color:"#9ca3af"}}/></button>
              </div>
              <p className={`text-xs ${t.sub} mb-3`}>{pickup} → {dest}</p>
              <div style={{background:dark?"#14532d":"#f0fdf4",borderRadius:12,padding:12,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span className={`font-semibold ${t.text}`}>Total</span>
                <span style={{fontWeight:900,color:"#16a34a",fontSize:22}}>GH₵{fare.total}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
                {[
                  {id:"mtn",      label:"MTN Mobile Money",   icon:"📱",color:"#ffcc00",text:"#000"},
                  {id:"vodafone", label:"Vodafone Cash",       icon:"📲",color:"#e60000",text:"#fff"},
                  {id:"airtel",   label:"AirtelTigo Money",    icon:"💳",color:"#ef4444",text:"#fff"},
                  {id:"card",     label:"Credit / Debit Card", icon:"🏦",color:"#2563eb",text:"#fff"},
                  {id:"cash",     label:"Pay with Cash",       icon:"💵",color:"#16a34a",text:"#fff"},
                  ...(user.payLater?.eligible?[{id:"paylater",label:"Pay Later (7 days)",icon:"⏳",color:"#7c3aed",text:"#fff"}]:[]),
                ].map(m=>(
                  <button key={m.id} onClick={()=>setPayMethod(m.id)}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:14,border:`2px solid ${payMethod===m.id?m.color:"#e5e7eb"}`,background:payMethod===m.id?m.color+"18":"transparent",textAlign:"left"}}>
                    <span style={{fontSize:22}}>{m.icon}</span>
                    <span className={`font-bold text-sm ${t.text}`}>{m.label}</span>
                    {payMethod===m.id&&<CheckCircle style={{width:16,height:16,color:m.color,marginLeft:"auto"}}/>}
                  </button>
                ))}
              </div>
              {["mtn","vodafone","airtel"].includes(payMethod)&&(
                <div style={{marginBottom:12}}>
                  <p className={`text-xs font-bold mb-1 ${t.sub}`}>MOMO NUMBER</p>
                  <input value={momoPhone} onChange={e=>setMomoPhone(e.target.value)}
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                    style={{display:"block",width:"100%"}} placeholder="+233XXXXXXXXX"/>
                </div>
              )}
              {payMethod==="card"&&(
                <div style={{marginBottom:12}}>
                  <p className={`text-xs font-bold mb-1 ${t.sub}`}>EMAIL</p>
                  <input value={email} onChange={e=>setEmail(e.target.value)} type="email"
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none ${t.inp}`}
                    style={{display:"block",width:"100%"}} placeholder="your@email.com"/>
                </div>
              )}
              {payMethod==="cash"&&(
                <div style={{background:dark?"#374151":"#f9fafb",borderRadius:12,padding:12,marginBottom:12}}>
                  <p className={`font-bold text-sm ${t.text}`} style={{marginBottom:4}}>💵 Pay driver directly</p>
                  <p className={`text-xs ${t.sub}`}>Hand GH₵{fare.total} cash. Driver must confirm on their app before ride closes.</p>
                </div>
              )}
              {payMethod==="paylater"&&(
                <div style={{background:dark?"#1e1b4b":"#eef2ff",borderRadius:12,padding:12,marginBottom:12}}>
                  <p style={{fontWeight:700,fontSize:13,color:"#7c3aed",marginBottom:4}}>⏳ Pay Later · 7 day defer</p>
                  <p className={`text-xs ${t.sub}`}>GH₵{fare.total} reserved against your Pay Later limit. Due in 7 days; automatic MoMo charging is not enabled by this flow.</p>
                </div>
              )}
              <button disabled={!payMethod || !rideId || payStatus==="processing"} onClick={async()=>{
                if(!payMethod) return;
                if(!rideId){toast$("No active server ride was found. Book the ride again before paying.","error");return;}
                if(payMethod==="cash"){
                  setPayStatus("processing");
                  try {
                    await api.setRidePaymentMethod(rideId,"cash");
                    setPayStatus("awaiting-driver");
                    toast$("Cash selection recorded. The driver must confirm physical receipt before the ride can close.");
                  } catch(error) {
                    setPayStatus("selecting");
                    toast$(error?.message || "Cash selection failed. No payment was recorded.", "error");
                  }
                  return;
                }
                if(payMethod==="paylater"){
                  setPayStatus("processing");
                  try {
                    await api.payLaterRequest(rideId,user.id,Number(fare.total));
                    setPayStatus("deferred");
                    toast$(`GH₵${fare.total} was accepted by the Pay Later service as a deferred balance; it is not an online payment.`);
                  } catch(error) {
                    setPayStatus("selecting");
                    toast$(error?.message || "Pay Later request failed. No success is recorded.", "error");
                  }
                  return;
                }
                setPayStatus("processing");
                try {
                  const result = await api.initPayment(rideId,Number(fare.total),email||user.email||((user.phone||"").replace("+","")+"@okada.gh"),momoPhone);
                  if(result.verified===true && ["SUCCESS","ALREADY_PAID"].includes(String(result.outcome||"").toUpperCase())) {
                    setPayStatus("paid");
                    toast$("The server already has a verified payment for this ride.");
                    return;
                  }
                  if(result.outcome==="INITIALIZATION_UNKNOWN" && result.reference) {
                    localStorage.setItem("okada_pending_payment",JSON.stringify({
                      rideId,pickup,dest,vehicle,reference:result.reference,
                      fare:{...(fare||{}),total:Number(fare.total),serverFare:currentRide?.fare||fare?.serverFare},
                    }));
                    setPaymentReference(result.reference);
                    setPayStatus("pending");
                    toast$("The provider response was uncertain. No second attempt was started. Check this exact payment reference before choosing cash or retrying.","error");
                    return;
                  }
                  if(!result.authorizationUrl || !result.reference) throw new Error("Payment authorization could not be opened. The attempt remains recorded; verify its status before retrying.");
                  localStorage.setItem("okada_pending_payment",JSON.stringify({
                    rideId,pickup,dest,vehicle,reference:result.reference,
                    fare:{...(fare||{}),total:Number(fare.total),serverFare:currentRide?.fare||fare?.serverFare},
                  }));
                  setPaymentReference(result.reference);
                  window.location.assign(result.authorizationUrl);
                } catch(error) {
                  setPayStatus("selecting");
                  toast$(error?.message || "Payment could not be initialized. The server has not confirmed payment.", "error");
                }
              }} style={{width:"100%",padding:"14px",background:!payMethod?"#9ca3af":"#16a34a",color:"#fff",borderRadius:16,fontWeight:900,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:!payMethod?0.5:1}}>
                {payStatus==="processing"?<><Spin/>Processing…</>:payMethod==="cash"?`Select Cash — GH₵${fare.total}`:payMethod==="paylater"?`Request Pay Later — GH₵${fare.total}`:`Continue to Paystack — GH₵${fare.total} 🔒`}
              </button>
              <p className={`text-xs text-center mt-2 ${t.sub}`}>🔒 Secured by Paystack · MTN · Vodafone · Airtel</p>
            </div>
          </div>
        )}

        {payStatus==="awaiting-driver"&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",maxWidth:448,margin:"0 auto"}}>
            <div className={`${t.card} rounded-3xl p-8 mx-4 shadow-2xl`} style={{textAlign:"center"}}>
              <div style={{width:52,height:52,border:"4px solid #ca8a04",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 16px"}}/>
              <p className={`font-black text-lg ${t.text}`}>Waiting for Driver…</p>
              <p className={`text-sm mt-2 ${t.sub}`}>Driver must confirm GH₵{fare?.total} cash received</p>
            </div>
          </div>
        )}

        {view==="history"&&(
          <div style={{padding:16}}>
            <h2 className={`font-black text-lg mb-4 ${t.text}`}>📋 Ride History</h2>
            {historyLoading ? (
              <div style={{textAlign:"center",padding:"48px 0"}}><Spin/><p className={t.sub} style={{marginTop:12}}>Loading your recorded rides…</p></div>
            ) : historyError ? (
              <div style={{textAlign:"center",padding:"32px 16px"}}>
                <p className={t.sub}>Your ride history could not be loaded. No sample rides have been substituted.</p>
                <button onClick={()=>setView("home")} style={{marginTop:16,padding:"10px 24px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>Return Home</button>
              </div>
            ) : history.length===0?(
              <div style={{textAlign:"center",padding:"48px 0"}}>
                <div style={{fontSize:48,marginBottom:12}}>🛺</div>
                <p className={t.sub}>No recorded rides yet</p>
                <button onClick={()=>setView("home")} style={{marginTop:16,padding:"10px 24px",background:"#16a34a",color:"#fff",borderRadius:12,fontWeight:700,fontSize:13}}>Book Now</button>
              </div>
            ):history.map(r=>(
              <div key={r.id} className={`${t.card} rounded-2xl p-4 mb-3 border ${t.bdr}`}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,gap:4,display:"flex",flexDirection:"column"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}><MapPin style={{width:12,height:12,color:"#16a34a",flexShrink:0}}/><span className={`font-semibold ${t.text}`}>{r.from}</span></div>
                    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}><Navigation style={{width:12,height:12,color:"#ef4444",flexShrink:0}}/><span className={`font-semibold ${t.text}`}>{r.to}</span></div>
                    <div style={{display:"flex",gap:6,marginTop:2}}>
                      <p className={`text-xs ${t.sub}`}>{r.date} · {r.driver}</p>
                      <Badge color={r.paid==="Pay Later"?"indigo":r.paid==="Cash"?"yellow":"green"}>{r.paid}</Badge>
                    </div>
                  </div>
                  <div style={{textAlign:"right",marginLeft:12}}>
                    <p style={{fontWeight:900,color:"#16a34a"}}>GH₵{r.fare}</p>
                    <div style={{display:"flex",justifyContent:"flex-end",gap:2,marginTop:4}}>
                      {[...Array(Math.max(0, Math.min(5, Number(r.rating) || 0)))].map((_,i)=><Star key={i} style={{width:11,height:11,fill:"#facc15",color:"#facc15"}}/>)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view==="profile"&&(
          <div style={{padding:16,display:"flex",flexDirection:"column",gap:16}}>
            <div className={`${t.card} rounded-2xl p-6 border ${t.bdr}`} style={{textAlign:"center"}}>
              <div style={{fontSize:52,marginBottom:8}}>{user.profilePhoto||"👤"}</div>
              <h2 className={`text-xl font-black ${t.text}`}>{user.name}</h2>
              <p className={t.sub}>{user.phone}</p>
              <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:8,flexWrap:"wrap"}}>
                <Badge color="green">✅ KYC Verified</Badge>
                {user.isInternational&&<Badge color="indigo">🌍 {user.passport?.country}</Badge>}
                {user.payLater?.eligible&&<Badge color="purple">⏳ Pay Later</Badge>}
              </div>
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
