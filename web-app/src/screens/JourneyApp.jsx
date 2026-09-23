import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bus, CheckCircle, Clock3, CreditCard, MapPin, RefreshCw, Ticket, XCircle } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Badge } from "../components/Badge";
import { Spin } from "../components/Spin";

const HUB = "Koforidua";

function cleanDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value === "object" && typeof value._seconds === "number") {
    return new Date(value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6));
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTime(value) {
  const d = cleanDate(value);
  return d ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Time not available";
}

function stateLabel(state) {
  return String(state || "UNKNOWN").replaceAll("_", " ");
}

export function JourneyApp({ user, dark, onBack }) {
  const t = T(dark);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [viaHub, setViaHub] = useState(true);
  const [serviceClass, setServiceClass] = useState("STANDARD");
  const [seatCount, setSeatCount] = useState(1);
  const [leg1Results, setLeg1Results] = useState([]);
  const [leg2Results, setLeg2Results] = useState([]);
  const [selected1, setSelected1] = useState(null);
  const [selected2, setSelected2] = useState(null);
  const [journeyId, setJourneyId] = useState(null);
  const [journey, setJourney] = useState(null);
  const [journeyStatus, setJourneyStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState(null);

  const usesTwoLegs = viaHub && origin && destination &&
    origin.toLowerCase() !== HUB.toLowerCase() &&
    destination.toLowerCase() !== HUB.toLowerCase();

  const selectedLegs = useMemo(() => {
    const list = [];
    if (selected1) {
      list.push({
        mode: "TRANSIT",
        tripId: selected1.tripId,
        origin: selected1.pickupStop,
        destination: selected1.dropoffStop,
        serviceClass,
        fare: selected1.fare,
      });
    }
    if (usesTwoLegs && selected2) {
      list.push({
        mode: "TRANSIT",
        tripId: selected2.tripId,
        origin: selected2.pickupStop,
        destination: selected2.dropoffStop,
        serviceClass,
        fare: selected2.fare,
      });
    }
    return list;
  }, [selected1, selected2, serviceClass, usesTwoLegs]);

  const estimatedFare = selectedLegs.reduce((sum, leg) => sum + Number(leg.fare || 0) * seatCount, 0);

  async function searchJourneys() {
    const from = origin.trim();
    const to = destination.trim();
    if (!from || !to) {
      setMessage({ type: "error", text: "Enter both origin and destination." });
      return;
    }
    if (from.toLowerCase() === to.toLowerCase()) {
      setMessage({ type: "error", text: "Origin and destination must be different." });
      return;
    }

    setSearching(true);
    setMessage(null);
    setSelected1(null);
    setSelected2(null);
    try {
      if (usesTwoLegs) {
        const [first, second] = await Promise.all([
          api.searchTransit(from, HUB, serviceClass),
          api.searchTransit(HUB, to, serviceClass),
        ]);
        setLeg1Results(first.results || []);
        setLeg2Results(second.results || []);
        if (!(first.results || []).length || !(second.results || []).length) {
          setMessage({
            type: "info",
            text: "A complete Koforidua connection is not currently available in the configured schedules.",
          });
        }
      } else {
        const result = await api.searchTransit(from, to, serviceClass);
        setLeg1Results(result.results || []);
        setLeg2Results([]);
        if (!(result.results || []).length) {
          setMessage({ type: "info", text: "No configured transit trip matched this route." });
        }
      }
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to search transit." });
      setLeg1Results([]);
      setLeg2Results([]);
    } finally {
      setSearching(false);
    }
  }

  async function refreshJourney(id = journeyId) {
    if (!id) return;
    try {
      const [j, s, e] = await Promise.all([
        api.getJourney(id),
        api.getJourneyStatus(id),
        api.getJourneyEvents(id),
      ]);
      setJourney(j.journey || null);
      setJourneyStatus(s.status || null);
      setEvents(e.events || []);

      if (s.status?.paymentStatus === "PAID") {
        const p = await api.getJourneyPass(id);
        setPass(p.pass || null);
        localStorage.removeItem("okada_pending_journey");
      }
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to refresh Journey." });
    }
  }

  useEffect(() => {
    const pending = localStorage.getItem("okada_pending_journey");
    if (pending && !journeyId) {
      setJourneyId(pending);
      refreshJourney(pending);
    }
  }, []);

  useEffect(() => {
    if (!journeyId) return undefined;
    const interval = setInterval(() => refreshJourney(journeyId), 5000);
    return () => clearInterval(interval);
  }, [journeyId]);

  async function book() {
    if (!selected1 || (usesTwoLegs && !selected2)) {
      setMessage({ type: "error", text: "Select every transit leg before booking." });
      return;
    }
    if (selectedLegs.some((leg) => !leg.tripId || !Number.isFinite(Number(leg.fare)))) {
      setMessage({ type: "error", text: "One or more selected trips do not have a configured fare." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await api.bookJourney({
        origin: origin.trim(),
        destination: destination.trim(),
        serviceClass,
        seatCount,
        legs: selectedLegs,
        pickup: null,
        finalMile: null,
      });
      setJourneyId(result.journeyId);
      setJourney({
        id: result.journeyId,
        journeyCode: result.journeyCode,
        origin: origin.trim(),
        destination: destination.trim(),
        serviceClass,
        totalFare: result.totalFare,
        currency: "GHS",
        status: result.status,
        paymentStatus: result.paymentStatus,
        bookingIds: result.bookingIds,
      });
      localStorage.setItem("okada_pending_journey", result.journeyId);

      const payment = await api.payJourney(result.journeyId, user.email || "", user.phone || "");
      if (!payment.authorizationUrl) {
        throw new Error("Payment authorization was not returned by the server.");
      }

      setMessage({ type: "info", text: "Payment page opened. Return to Okada Online after payment and your Journey will update automatically." });
      window.location.assign(payment.authorizationUrl);
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to book Journey." });
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    if (!journeyId) return;
    setLoading(true);
    try {
      await api.cancelJourney(journeyId, "Passenger requested cancellation");
      await refreshJourney(journeyId);
      setMessage({ type: "info", text: "Journey cancelled. Any paid refund is handled separately according to the payment/refund workflow." });
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to cancel Journey." });
    } finally {
      setLoading(false);
    }
  }

  const connectionCount = journeyStatus?.connections?.length || 0;

  if (pass) {
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, alignSelf: "flex-start" }}>
          <ArrowLeft style={{ width: 16, height: 16 }} /> Back
        </button>

        <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <p className={`text-xs font-bold ${t.sub}`}>JOURNEY PASS</p>
              <h2 className={`text-xl font-black ${t.text}`}>{pass.journeyCode}</h2>
            </div>
            <Badge color="green"><CheckCircle style={{ width: 13, height: 13 }} /> PAID</Badge>
          </div>

          <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: dark ? "#111827" : "#f0fdf4" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin style={{ width: 16, height: 16, color: "#16a34a" }} />
              <strong>{pass.origin}</strong>
              <ArrowRight style={{ width: 16, height: 16 }} />
              <strong>{pass.destination}</strong>
            </div>
            <p className={`text-xs ${t.sub}`} style={{ marginTop: 6 }}>
              {pass.serviceClass} · {pass.passenger?.name || user.name || "Passenger"}
            </p>
          </div>

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {(pass.transitLegs || []).map((leg) => (
              <div key={leg.sequence} style={{ border: `1px solid ${dark ? "#374151" : "#e5e7eb"}`, borderRadius: 14, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <strong>Leg {leg.sequence}: {leg.origin} → {leg.destination}</strong>
                  <Badge color={leg.tripStatus === "DELAYED" ? "orange" : "green"}>{stateLabel(leg.tripStatus || "UNKNOWN")}</Badge>
                </div>
                <p className={`text-xs ${t.sub}`} style={{ marginTop: 5 }}>Departure: {formatTime(leg.departureAt)}</p>
                <p className={`text-xs ${t.sub}`} style={{ marginTop: 3 }}>Ticket: {leg.ticketCode || "Not issued"}</p>
                <div style={{ marginTop: 8, padding: 9, borderRadius: 10, background: dark ? "#1f2937" : "#f9fafb", fontSize: 11, wordBreak: "break-all" }}>
                  QR payload: {leg.qrPayload || "Unavailable"}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: dark ? "#1f2937" : "#f9fafb", fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Ticket style={{ width: 15, height: 15 }} /> Journey QR payload
            </div>
            <div style={{ marginTop: 7, wordBreak: "break-all", fontFamily: "monospace", fontSize: 11 }}>{pass.qrPayload}</div>
            <div style={{ marginTop: 9, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <span className={`text-xs ${t.sub}`}>Journey state</span>
                <div style={{ fontWeight: 900, marginTop: 2 }}>{stateLabel(pass.journeyStatus)}</div>
              </div>
              <div>
                <span className={`text-xs ${t.sub}`}>Current leg</span>
                <div style={{ fontWeight: 900, marginTop: 2 }}>{pass.currentSegmentSequence || "—"}</div>
              </div>
            </div>
            {pass.nextAction && <div style={{ marginTop: 8, fontWeight: 800 }}>Next action: {stateLabel(pass.nextAction)}</div>}
            {pass.operationalIssue && <div style={{ marginTop: 8, color: "#dc2626", fontWeight: 800 }}>Operational attention: {stateLabel(pass.operationalIssue)}</div>}
          </div>
        </div>

        <button onClick={() => refreshJourney(journeyId)} disabled={loading}
          style={{ width: "100%", border: `1px solid ${dark ? "#374151" : "#d1d5db"}`, borderRadius: 14, padding: 12, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, fontWeight: 800 }}>
          <RefreshCw style={{ width: 15, height: 15 }} /> Refresh Journey
        </button>
      </div>
    );
  }

  if (journeyId && journey) {
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, alignSelf: "flex-start" }}>
          <ArrowLeft style={{ width: 16, height: 16 }} /> Back
        </button>

        <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <p className={`text-xs font-bold ${t.sub}`}>JOURNEY</p>
              <h2 className={`text-xl font-black ${t.text}`}>{journey.journeyCode || journey.id}</h2>
            </div>
            <Badge color={journey.paymentStatus === "PAID" ? "green" : "orange"}>
              {stateLabel(journey.paymentStatus || "PENDING")}
            </Badge>
          </div>

          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <MapPin style={{ width: 16, height: 16, color: "#16a34a" }} />
            <strong>{journey.origin}</strong>
            <ArrowRight style={{ width: 16, height: 16 }} />
            <strong>{journey.destination}</strong>
          </div>

          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: dark ? "#1f2937" : "#f9fafb" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock3 style={{ width: 15, height: 15 }} />
              <strong>Journey status: {stateLabel(journeyStatus?.journeyStatus || journey.status)}</strong>
            </div>
            <div style={{ marginTop: 9, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <span className={`text-xs ${t.sub}`}>Current leg</span>
                <div style={{ fontWeight: 900, marginTop: 2 }}>{journeyStatus?.currentSegmentSequence || "—"}</div>
              </div>
              <div>
                <span className={`text-xs ${t.sub}`}>Next action</span>
                <div style={{ fontWeight: 900, marginTop: 2 }}>{stateLabel(journeyStatus?.nextAction || "MONITOR")}</div>
              </div>
            </div>
            <p className={`text-xs ${t.sub}`} style={{ marginTop: 7 }}>
              {journeyStatus?.liveDataAvailable ? "Live operational data is available for part of this Journey." : "Using recorded Journey and trip data."}
            </p>
            {journeyStatus?.lastOperationalEventType && (
              <p className={`text-xs ${t.sub}`} style={{ marginTop: 4 }}>
                Last operational event: {stateLabel(journeyStatus.lastOperationalEventType)}
              </p>
            )}
            {journeyStatus?.operationalIssue && (
              <div style={{ marginTop: 8, padding: 9, borderRadius: 10, background: dark ? "#450a0a" : "#fef2f2", color: "#dc2626", fontSize: 12, fontWeight: 800 }}>
                Operational attention: {stateLabel(journeyStatus.operationalIssue)}
                {journeyStatus.operationalIssueSequence ? " · Leg " + journeyStatus.operationalIssueSequence : ""}
              </div>
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            {(journeyStatus?.segments || []).map((segment) => (
              <div key={segment.sequence} style={{ padding: "10px 0", borderBottom: `1px solid ${dark ? "#374151" : "#e5e7eb"}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 800 }}>Leg {segment.sequence}</span>
                  <Badge color={segment.segmentStatus === "DELAYED" ? "orange" : segment.segmentStatus === "IN_TRANSIT" ? "indigo" : "green"}>
                    {stateLabel(segment.segmentStatus)}
                  </Badge>
                </div>
                <p className={`text-xs ${t.sub}`} style={{ marginTop: 4 }}>{segment.origin} → {segment.destination}</p>
                {segment.currentStop && <p className={`text-xs ${t.sub}`} style={{ marginTop: 4 }}>Recorded current stop: {segment.currentStop}</p>}
              </div>
            ))}
          </div>

          {!!events.length && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Clock3 style={{ width: 15, height: 15 }} />
                <h3 className={`font-black ${t.text}`}>Operational timeline</h3>
              </div>
              <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 8 }}>
                {events.slice(0, 8).map((event) => (
                  <div key={event.id} style={{ padding: 10, borderRadius: 12, background: dark ? "#111827" : "#f9fafb", border: `1px solid ${dark ? "#374151" : "#e5e7eb"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 12 }}>{stateLabel(event.type)}</strong>
                      <span className={`text-xs ${t.sub}`}>{formatTime(event.recordedAt)}</span>
                    </div>
                    <p className={`text-xs ${t.sub}`} style={{ marginTop: 4 }}>Leg {event.sequence}: {event.origin} → {event.destination}</p>
                    {event.currentStop && <p className={`text-xs ${t.sub}`} style={{ marginTop: 3 }}>Stop: {event.currentStop}</p>}
                    {event.note && <p className={`text-xs ${t.sub}`} style={{ marginTop: 3 }}>{event.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {connectionCount > 0 && (
            <div style={{ marginTop: 14 }}>
              <h3 className={`font-black ${t.text}`}>Connections</h3>
              {journeyStatus.connections.map((connection) => (
                <div key={connection.connectionIndex} style={{ marginTop: 9, padding: 11, borderRadius: 12, background: dark ? "#111827" : "#f9fafb" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 800 }}>{connection.hub || "Transfer"} </span>
                    <Badge color={connection.state === "AT_RISK" || connection.state === "MISSED" ? "orange" : connection.state === "FEASIBLE" ? "green" : "indigo"}>
                      {stateLabel(connection.state)}
                    </Badge>
                  </div>
                  <p className={`text-xs ${t.sub}`} style={{ marginTop: 4 }}>
                    {connection.timingKnown ? `${connection.bufferMinutes} min connection buffer` : "Connection timing is not yet known"}
                  </p>
                  <p className={`text-xs ${t.sub}`} style={{ marginTop: 3 }}>Timing basis: {connection.timingBasis}</p>
                </div>
              ))}
            </div>
          )}

          {journey.paymentStatus !== "PAID" && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: dark ? "#422006" : "#fff7ed" }}>
              <strong>Payment pending</strong>
              <p className="text-xs" style={{ marginTop: 4 }}>Complete the payment flow before your Journey Pass is issued.</p>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={() => refreshJourney(journeyId)} disabled={loading}
            style={{ border: `1px solid ${dark ? "#374151" : "#d1d5db"}`, borderRadius: 14, padding: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <RefreshCw style={{ width: 15, height: 15 }} /> Refresh
          </button>
          <button onClick={cancel} disabled={loading || ["BOARDING","IN_TRANSIT","FINAL_MILE","COMPLETED","CANCELLED"].includes(journey.status)}
            style={{ border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 14, padding: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <XCircle style={{ width: 15, height: 15 }} /> Cancel
          </button>
        </div>
      </div>
    );
  }

  function ResultCard({ result, selected, onSelect }) {
    const fareConfigured = result.fareConfigured !== false && Number.isFinite(Number(result.fare));
    return (
      <button onClick={() => fareConfigured && onSelect(result)} disabled={!fareConfigured || result.seatsAvailable < seatCount}
        style={{ width: "100%", textAlign: "left", padding: 12, borderRadius: 14, border: `2px solid ${selected ? "#16a34a" : dark ? "#374151" : "#e5e7eb"}`, background: selected ? (dark ? "#14532d" : "#f0fdf4") : "transparent", opacity: !fareConfigured || result.seatsAvailable < seatCount ? 0.55 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <strong>{formatTime(result.trip?.departureAt)}</strong>
          {selected && <CheckCircle style={{ width: 17, height: 17, color: "#16a34a" }} />}
        </div>
        <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <Bus style={{ width: 14, height: 14 }} /> {result.pickupStop} → {result.dropoffStop}
        </div>
        <div style={{ marginTop: 7, display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
          <span className={t.sub}>{result.seatsAvailable} seat{result.seatsAvailable === 1 ? "" : "s"} available</span>
          <strong>{fareConfigured ? `GH₵${Number(result.fare).toFixed(2)} / seat` : "Fare not configured"}</strong>
        </div>
        {!fareConfigured && <div style={{ marginTop: 6, color: "#dc2626", fontSize: 11 }}>Operator has not configured a payable fare for this trip.</div>}
      </button>
    );
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, alignSelf: "flex-start" }}>
        <ArrowLeft style={{ width: 16, height: 16 }} /> Back
      </button>

      <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "#16a34a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bus style={{ width: 20, height: 20 }} />
          </div>
          <div>
            <p className={`text-xs font-bold ${t.sub}`}>OKADA JOURNEY</p>
            <h2 className={`text-xl font-black ${t.text}`}>One booking. One Journey.</h2>
          </div>
        </div>

        {message && (
          <div style={{ marginTop: 12, padding: 11, borderRadius: 12, background: message.type === "error" ? (dark ? "#450a0a" : "#fef2f2") : (dark ? "#172554" : "#eff6ff"), color: message.type === "error" ? "#dc2626" : "#2563eb", fontSize: 12 }}>
            {message.text}
          </div>
        )}

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className={`text-xs font-bold ${t.sub}`}>Origin</label>
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Akosombo" className={`w-full px-4 py-3 border rounded-xl text-sm ${t.inp}`} style={{ marginTop: 5 }} />
          </div>
          <div>
            <label className={`text-xs font-bold ${t.sub}`}>Destination</label>
            <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Kumasi" className={`w-full px-4 py-3 border rounded-xl text-sm ${t.inp}`} style={{ marginTop: 5 }} />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 9, padding: 10, borderRadius: 12, background: dark ? "#1f2937" : "#f9fafb" }}>
            <input type="checkbox" checked={viaHub} onChange={(e) => { setViaHub(e.target.checked); setSelected1(null); setSelected2(null); }} />
            <span style={{ fontSize: 13, fontWeight: 800 }}>Connect through Koforidua Hub</span>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select value={serviceClass} onChange={(e) => { setServiceClass(e.target.value); setSelected1(null); setSelected2(null); }} className={`border rounded-xl px-3 py-3 text-sm ${t.inp}`}>
              <option value="STANDARD">Standard</option>
              <option value="COMFORT">Comfort</option>
              <option value="VIP">VIP</option>
              <option value="EXECUTIVE">Executive</option>
              <option value="PRIVATE">Private</option>
            </select>
            <select value={seatCount} onChange={(e) => setSeatCount(Number(e.target.value))} className={`border rounded-xl px-3 py-3 text-sm ${t.inp}`}>
              {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n} seat{n > 1 ? "s" : ""}</option>)}
            </select>
          </div>

          <button onClick={searchJourneys} disabled={searching || !origin || !destination}
            style={{ width: "100%", background: "#16a34a", color: "#fff", borderRadius: 14, padding: 13, fontWeight: 900, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, opacity: searching || !origin || !destination ? 0.55 : 1 }}>
            {searching ? <Spin /> : <RefreshCw style={{ width: 16, height: 16 }} />}
            {searching ? "Searching…" : "Search Journey"}
          </button>
        </div>
      </div>

      {!!leg1Results.length && (
        <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Bus style={{ width: 16, height: 16 }} />
            <h3 className={`font-black ${t.text}`}>{usesTwoLegs ? `Leg 1 · ${origin} → ${HUB}` : `Transit · ${origin} → ${destination}`}</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {leg1Results.map((result) => (
              <ResultCard key={result.tripId} result={result} selected={selected1?.tripId === result.tripId} onSelect={setSelected1} />
            ))}
          </div>
        </div>
      )}

      {usesTwoLegs && !!leg2Results.length && (
        <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Bus style={{ width: 16, height: 16 }} />
            <h3 className={`font-black ${t.text}`}>Leg 2 · {HUB} → {destination}</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {leg2Results.map((result) => (
              <ResultCard key={result.tripId} result={result} selected={selected2?.tripId === result.tripId} onSelect={setSelected2} />
            ))}
          </div>
        </div>
      )}

      {selectedLegs.length > 0 && (
        <div className={`${t.card} rounded-2xl border ${t.bdr}`} style={{ padding: 14, position: "sticky", bottom: 66 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span className={`font-bold ${t.sub}`}>{selectedLegs.length} leg{selectedLegs.length > 1 ? "s" : ""} · {seatCount} seat{seatCount > 1 ? "s" : ""}</span>
            <strong style={{ fontSize: 18, color: "#16a34a" }}>GH₵{estimatedFare.toFixed(2)}</strong>
          </div>
          <p className={`text-xs ${t.sub}`} style={{ marginTop: 4 }}>Estimated from configured transit fares. The server recalculates the final charge.</p>
          <button onClick={book} disabled={loading || (usesTwoLegs && !selected2)}
            style={{ marginTop: 9, width: "100%", background: "#111827", color: "#fff", borderRadius: 14, padding: 13, fontWeight: 900, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, opacity: loading || (usesTwoLegs && !selected2) ? 0.55 : 1 }}>
            {loading ? <Spin /> : <CreditCard style={{ width: 16, height: 16 }} />}
            {loading ? "Starting payment…" : "Book & Pay"}
          </button>
        </div>
      )}
    </div>
  );
}
