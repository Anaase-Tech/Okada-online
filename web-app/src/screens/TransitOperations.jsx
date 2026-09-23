import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bus, CheckCircle, Clock3, MapPin, RefreshCw, Send, XCircle } from "lucide-react";
import { api } from "../api";
import { Badge } from "../components/Badge";
import { Spin } from "../components/Spin";

const EVENT_TYPES = [
  ["BOARDING", "Boarding"],
  ["DEPARTED", "Departed"],
  ["STOPPED", "Stopped"],
  ["STATION_ARRIVAL", "Station arrival"],
  ["DEPARTED_STATION", "Departed station"],
  ["ARRIVING", "Arriving"],
  ["TRAFFIC_DELAY", "Traffic delay"],
  ["ROAD_CLOSURE", "Road closure"],
  ["MECHANICAL_DELAY", "Mechanical delay"],
  ["ACCIDENT_REPORTED", "Incident reported"],
  ["COMPLETED", "Completed"],
  ["CANCELLED", "Cancelled"],
];

const STATUS_COLORS = {
  SCHEDULED: "blue",
  BOARDING: "yellow",
  DEPARTED: "indigo",
  IN_TRANSIT: "indigo",
  ARRIVING: "teal",
  DELAYED: "orange",
  COMPLETED: "green",
  CANCELLED: "red",
};

function formatTime(value) {
  if (!value) return "Time unavailable";
  const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? "Time unavailable" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function TransitOperations({ dark, t }) {
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState("");
  const [events, setEvents] = useState([]);
  const [eventType, setEventType] = useState("BOARDING");
  const [currentStop, setCurrentStop] = useState("");
  const [note, setNote] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [loading, setLoading] = useState(false);
  const [eventLoading, setEventLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) || null,
    [trips, selectedTripId]
  );

  async function loadTrips(preferredId = selectedTripId) {
    setLoading(true);
    try {
      const result = await api.getTransitTrips();
      const next = result.trips || [];
      setTrips(next);
      const id = preferredId && next.some((trip) => trip.id === preferredId)
        ? preferredId
        : next[0]?.id || "";
      setSelectedTripId(id);
      if (id) await loadEvents(id);
      else setEvents([]);
      setMessage(null);
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to load transit trips." });
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents(tripId) {
    if (!tripId) return;
    try {
      const result = await api.getTransitTripEvents(tripId);
      setEvents(result.events || []);
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to load trip events." });
    }
  }

  useEffect(() => {
    loadTrips();
    const timer = setInterval(() => loadTrips(), 20000);
    return () => clearInterval(timer);
  }, []);

  async function selectTrip(id) {
    setSelectedTripId(id);
    setMessage(null);
    await loadEvents(id);
  }

  async function recordEvent() {
    if (!selectedTripId) {
      setMessage({ type: "error", text: "Select a transit trip first." });
      return;
    }

    const hasLat = latitude.trim() !== "";
    const hasLng = longitude.trim() !== "";
    if (hasLat !== hasLng) {
      setMessage({ type: "error", text: "Enter both latitude and longitude, or leave both blank." });
      return;
    }

    const body = {
      type: eventType,
      currentStop: currentStop.trim() || undefined,
      note: note.trim() || undefined,
      ...(hasLat && hasLng ? { latitude: Number(latitude), longitude: Number(longitude) } : {}),
    };

    setEventLoading(true);
    setMessage(null);
    try {
      await api.recordTransitEvent(selectedTripId, body);
      setNote("");
      await Promise.all([loadTrips(selectedTripId), loadEvents(selectedTripId)]);
      setMessage({ type: "success", text: "Operational event recorded." });
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to record event." });
    } finally {
      setEventLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <p className={`text-xs font-bold ${t.sub}`}>TRANSIT CONTROL</p>
          <h2 className={`font-black text-lg ${t.text}`}>Operations Console</h2>
        </div>
        <button
          onClick={() => loadTrips()}
          disabled={loading}
          style={{ border: `1px solid ${dark ? "#374151" : "#d1d5db"}`, borderRadius: 11, padding: 8 }}
          aria-label="Refresh transit trips"
        >
          <RefreshCw style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {message && (
        <div style={{
          padding: 11,
          borderRadius: 12,
          background: message.type === "error" ? (dark ? "#450a0a" : "#fef2f2") : (dark ? "#052e16" : "#f0fdf4"),
          color: message.type === "error" ? "#dc2626" : "#15803d",
          fontSize: 12,
        }}>
          {message.text}
        </div>
      )}

      <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{ padding: 14 }}>
        <label className={`text-xs font-bold ${t.sub}`}>Transit trip</label>
        <select
          value={selectedTripId}
          onChange={(e) => selectTrip(e.target.value)}
          className={`w-full border rounded-xl px-3 py-3 text-sm ${t.inp}`}
          style={{ marginTop: 6 }}
        >
          <option value="">Select trip</option>
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.id.slice(0, 10)} · {trip.status || "UNKNOWN"} · {formatTime(trip.departureAt)}
            </option>
          ))}
        </select>

        {selectedTrip && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: dark ? "#111827" : "#f9fafb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Bus style={{ width: 16, height: 16 }} />
                <strong>{selectedTrip.id.slice(0, 12)}</strong>
              </div>
              <Badge color={STATUS_COLORS[selectedTrip.status] || "gray"}>
                {selectedTrip.status || "UNKNOWN"}
              </Badge>
            </div>
            <p className={`text-xs ${t.sub}`} style={{ marginTop: 5 }}>
              Departure: {formatTime(selectedTrip.departureAt)}
            </p>
            <p className={`text-xs ${t.sub}`} style={{ marginTop: 3 }}>
              Current stop: {selectedTrip.currentStop || "Not recorded"}
            </p>
            {selectedTrip.currentLocation && (
              <p className={`text-xs ${t.sub}`} style={{ marginTop: 3 }}>
                Recorded location: {selectedTrip.currentLocation.latitude}, {selectedTrip.currentLocation.longitude}
              </p>
            )}
          </div>
        )}
      </div>

      <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Send style={{ width: 16, height: 16 }} />
          <h3 className={`font-black ${t.text}`}>Record operational event</h3>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 11 }}>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={`border rounded-xl px-3 py-3 text-sm ${t.inp}`}>
            {EVENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>

          <input value={currentStop} onChange={(e) => setCurrentStop(e.target.value)} placeholder="Current stop (optional)" className={`border rounded-xl px-3 py-3 text-sm ${t.inp}`} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Operational note (optional)" className={`border rounded-xl px-3 py-3 text-sm ${t.inp}`} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input value={latitude} onChange={(e) => setLatitude(e.target.value)} inputMode="decimal" placeholder="Latitude (optional)" className={`border rounded-xl px-3 py-3 text-sm ${t.inp}`} />
            <input value={longitude} onChange={(e) => setLongitude(e.target.value)} inputMode="decimal" placeholder="Longitude (optional)" className={`border rounded-xl px-3 py-3 text-sm ${t.inp}`} />
          </div>

          <button onClick={recordEvent} disabled={eventLoading || !selectedTripId}
            style={{ width: "100%", background: "#111827", color: "#fff", padding: 13, borderRadius: 14, fontWeight: 900, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, opacity: eventLoading || !selectedTripId ? 0.5 : 1 }}>
            {eventLoading ? <Spin /> : <CheckCircle style={{ width: 16, height: 16 }} />}
            {eventLoading ? "Recording…" : "Record event"}
          </button>
        </div>
      </div>

      <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Clock3 style={{ width: 16, height: 16 }} />
          <h3 className={`font-black ${t.text}`}>Recent events</h3>
        </div>

        {!events.length ? (
          <p className={`text-xs ${t.sub}`} style={{ marginTop: 10 }}>No recorded operational events for this trip.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {events.slice(0, 12).map((event) => {
              const risk = ["TRAFFIC_DELAY", "ROAD_CLOSURE", "MECHANICAL_DELAY", "ACCIDENT_REPORTED"].includes(event.type);
              return (
                <div key={event.id} style={{ padding: 10, borderRadius: 12, background: dark ? "#111827" : "#f9fafb", border: `1px solid ${dark ? "#374151" : "#e5e7eb"}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      {risk ? <AlertTriangle style={{ width: 15, height: 15, color: "#d97706" }} /> : <CheckCircle style={{ width: 15, height: 15, color: "#16a34a" }} />}
                      <strong style={{ fontSize: 12 }}>{event.type.replaceAll("_", " ")}</strong>
                    </div>
                    <span className={`text-xs ${t.sub}`}>{formatTime(event.recordedAt)}</span>
                  </div>
                  {event.currentStop && <p className={`text-xs ${t.sub}`} style={{ marginTop: 4 }}>Stop: {event.currentStop}</p>}
                  {event.note && <p className={`text-xs ${t.sub}`} style={{ marginTop: 3 }}>{event.note}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
