import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bus, CalendarDays, MapPin, Ticket, CheckCircle, RefreshCw } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Spin } from "../components/Spin";

export function TransitHub({ user, dark, onBack }) {
  const t = T(dark);
  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [trips, setTrips] = useState([]);
  const [trip, setTrip] = useState(null);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [seats, setSeats] = useState(1);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getTransitRoutes().then(r => {
      const list = r.routes || [];
      setRoutes(list);
      if (list[0]) setRouteId(list[0].id);
    }).catch(e => setError(e.message || "Could not load routes")).finally(() => setLoading(false));
  }, []);

  const selectedRoute = useMemo(() => routes.find(r => r.id === routeId), [routes, routeId]);

  useEffect(() => {
    if (!routeId || !date) return;
    setLoading(true); setError(""); setTrip(null); setTicket(null);
    api.searchTransit(routeId, date).then(r => setTrips(r.trips || []))
      .catch(e => setError(e.message || "Could not search trips"))
      .finally(() => setLoading(false));
  }, [routeId, date]);

  const stops = selectedRoute?.stops || trip?.stops || [];
  const canBook = trip && pickup && dropoff && pickup !== dropoff && !booking;

  const book = async () => {
    if (!canBook) return;
    setBooking(true); setError("");
    try {
      const r = await api.bookTransit({
        tripId: trip.id,
        pickupStopId: pickup,
        dropoffStopId: dropoff,
        seatCount: seats,
        serviceClass: trip.serviceClass || selectedRoute?.serviceClass || "STANDARD",
      });
      setTicket(r.booking);
    } catch (e) {
      setError(e.message || "Booking failed");
    } finally { setBooking(false); }
  };

  if (ticket) return (
    <div style={{padding:16}}>
      <button onClick={onBack} className={t.sub} style={{display:"flex",alignItems:"center",gap:6,marginBottom:14}}>
        <ArrowLeft size={18}/> Back
      </button>
      <div className={`${t.card} rounded-2xl border ${t.bdr} p-5 shadow`}>
        <div style={{textAlign:"center"}}>
          <CheckCircle size={52} color="#16a34a" style={{margin:"0 auto 10px"}}/>
          <h2 className={`font-black text-xl ${t.text}`}>Journey booked</h2>
          <p className={`text-sm ${t.sub}`} style={{marginTop:4}}>Keep this booking code for boarding.</p>
        </div>
        <div style={{marginTop:20,padding:16,borderRadius:14,background:dark?"#1f2937":"#f9fafb"}}>
          <p className={`text-xs ${t.sub}`}>BOOKING CODE</p>
          <p style={{fontSize:24,fontWeight:900,letterSpacing:2}}>{ticket.bookingCode}</p>
          <p className={`text-sm ${t.text}`} style={{marginTop:10}}>{selectedRoute?.origin} → {selectedRoute?.destination}</p>
          <p className={`text-sm ${t.sub}`}>{pickup} → {dropoff} · {ticket.seatCount} seat(s)</p>
        </div>
        <button onClick={onBack} style={{width:"100%",marginTop:16,padding:13,borderRadius:14,background:"#16a34a",color:"#fff",fontWeight:800}}>Done</button>
      </div>
    </div>
  );

  return (
    <div style={{padding:16,paddingBottom:90}}>
      <button onClick={onBack} className={t.sub} style={{display:"flex",alignItems:"center",gap:6,marginBottom:14}}>
        <ArrowLeft size={18}/> Back
      </button>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div style={{width:44,height:44,borderRadius:14,background:"#dcfce7",display:"flex",alignItems:"center",justifyContent:"center"}}><Bus color="#16a34a"/></div>
        <div><h2 className={`font-black text-xl ${t.text}`}>Okada Transit</h2><p className={`text-xs ${t.sub}`}>Scheduled journeys · seat reservation</p></div>
      </div>

      {error && <div style={{padding:10,borderRadius:10,background:"#fee2e2",color:"#b91c1c",fontSize:13,marginBottom:12}}>{error}</div>}

      <div className={`${t.card} rounded-2xl border ${t.bdr} p-4`}>
        <label className={`text-xs font-bold ${t.sub}`}>ROUTE</label>
        <select value={routeId} onChange={e=>setRouteId(e.target.value)} className={`${t.inp} w-full border rounded-xl p-3 mt-1`}>
          {routes.length===0 && <option value="">No routes published yet</option>}
          {routes.map(r=><option key={r.id} value={r.id}>{r.origin} → {r.destination}</option>)}
        </select>
        <label className={`text-xs font-bold ${t.sub}`} style={{display:"block",marginTop:12}}>DATE</label>
        <div style={{position:"relative"}}>
          <CalendarDays size={16} style={{position:"absolute",left:12,top:13}}/>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className={`${t.inp} w-full border rounded-xl p-3 mt-1`} style={{paddingLeft:36}}/>
        </div>
      </div>

      <div style={{marginTop:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <h3 className={`font-black ${t.text}`}>Departures</h3>
          {loading && <Spin/>}
        </div>
        {trips.length===0 && !loading && <div className={`${t.card} border ${t.bdr} rounded-xl p-4 text-sm ${t.sub}`}>No scheduled trip published for this route and date yet.</div>}
        {trips.map(x=>(
          <button key={x.id} onClick={()=>{setTrip(x);setPickup("");setDropoff("");}} style={{width:"100%",textAlign:"left",marginBottom:8,padding:14,borderRadius:14,border:`2px solid ${trip?.id===x.id?"#16a34a":dark?"#374151":"#e5e7eb"}`,background:dark?"#111827":"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span className={`font-black ${t.text}`}>{x.departureTime || "Time TBA"}</span>
              <span style={{fontSize:12,fontWeight:800,color:"#16a34a"}}>{x.availableSeats} seats</span>
            </div>
            <p className={`text-xs ${t.sub}`} style={{marginTop:4}}>{x.serviceClass || "STANDARD"} · {x.vehicleId ? "Assigned vehicle" : "Vehicle TBA"}</p>
          </button>
        ))}
      </div>

      {trip && <div className={`${t.card} border ${t.bdr} rounded-2xl p-4`} style={{marginTop:8}}>
        <h3 className={`font-black ${t.text}`} style={{marginBottom:10}}>Choose your segment</h3>
        <label className={`text-xs font-bold ${t.sub}`}>PICK UP</label>
        <select value={pickup} onChange={e=>setPickup(e.target.value)} className={`${t.inp} w-full border rounded-xl p-3 mt-1`}>
          <option value="">Select stop</option>
          {stops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className={`text-xs font-bold ${t.sub}`} style={{display:"block",marginTop:10}}>DROP OFF</label>
        <select value={dropoff} onChange={e=>setDropoff(e.target.value)} className={`${t.inp} w-full border rounded-xl p-3 mt-1`}>
          <option value="">Select stop</option>
          {stops.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:12}}>
          <span className={`text-sm font-bold ${t.text}`}>Seats</span>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>setSeats(Math.max(1,seats-1))} style={{width:32,height:32,borderRadius:8,border:"1px solid #d1d5db"}}>−</button>
            <b>{seats}</b>
            <button onClick={()=>setSeats(Math.min(8,seats+1))} style={{width:32,height:32,borderRadius:8,border:"1px solid #d1d5db"}}>+</button>
          </div>
        </div>
        <button disabled={!canBook} onClick={book} style={{width:"100%",marginTop:14,padding:14,borderRadius:14,background:"#16a34a",color:"#fff",fontWeight:900,opacity:canBook?1:.45,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          {booking && <Spin/>}<Ticket size={17}/> {booking?"Booking…":"Reserve seat"}
        </button>
      </div>}
    </div>
  );
}
