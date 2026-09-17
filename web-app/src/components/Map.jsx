import { useState, useEffect } from "react";
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from "@react-google-maps/api";
import { Badge } from "./Badge";

const MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY || "";
const LIBRARIES = ["places"];
const AKOSOMBO = { lat: 6.2966, lng: 0.0568 };

const DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#98a5be" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#023e58" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6d70" }] },
];

const dot = (color) => ({
  url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><circle cx="13" cy="13" r="9" fill="${color}" stroke="#fff" stroke-width="3"/></svg>`
  ),
});
const driverIcon = {
  url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38"><circle cx="19" cy="19" r="15" fill="#2563eb" stroke="#fff" stroke-width="3"/><text x="19" y="26" text-anchor="middle" font-size="17">🏍️</text></svg>`
  ),
};

const STATUS_LABEL = {
  idle: "Eastern Region · Ready",
  searching: "📡 Finding nearby drivers…",
  matched: "🏍️ Driver on the way",
  arrived: "✅ Driver has arrived",
  ongoing: "🟢 Ride in progress",
  done: "✅ Ride complete",
};

// Real Google Map. Falls back to a themed status panel if no API key is
// configured (REACT_APP_GOOGLE_MAPS_KEY), so the app never breaks without it.
export function Map({ dark, pickup, destination, driverPos, status = "idle", height = 220, onPickupClick }) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: MAPS_KEY, libraries: LIBRARIES });
  const [directions, setDirections] = useState(null);
  const label = STATUS_LABEL[status] || "Live";

  useEffect(() => {
    if (!isLoaded || !window.google || !pickup?.lat || !destination?.lat) { setDirections(null); return; }
    const svc = new window.google.maps.DirectionsService();
    svc.route(
      { origin: pickup, destination, travelMode: window.google.maps.TravelMode.DRIVING },
      (result, st) => setDirections(st === "OK" ? result : null)
    );
  }, [isLoaded, pickup, destination]);

  if (!MAPS_KEY) {
    return (
      <div style={{
        height, borderRadius: 16, border: `1px solid ${dark ? "#374151" : "#e5e7eb"}`,
        background: dark ? "#1f2937" : "linear-gradient(135deg,#f0fdf4,#eff6ff)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative",
      }}>
        <span style={{ fontSize: 40 }}>🗺️</span>
        <p style={{ fontSize: 13, fontWeight: 600, color: dark ? "#9ca3af" : "#6b7280", marginTop: 8 }}>{label}</p>
        <div style={{ position: "absolute", top: 8, right: 8 }}><Badge color="green">● GPS Live</Badge></div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={{ height, borderRadius: 16, background: dark ? "#1f2937" : "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 13, color: dark ? "#9ca3af" : "#6b7280" }}>Loading map…</span>
      </div>
    );
  }

  const center = pickup?.lat ? pickup : (driverPos?.lat ? driverPos : AKOSOMBO);

  return (
    <div style={{ position: "relative", borderRadius: 16, overflow: "hidden" }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height }}
        center={center}
        zoom={pickup?.lat && destination?.lat ? 12 : 13}
        options={{ styles: dark ? DARK_STYLE : [], disableDefaultUI: true, zoomControl: true, clickableIcons: false }}
        onClick={onPickupClick ? (e) => onPickupClick({ lat: e.latLng.lat(), lng: e.latLng.lng() }) : undefined}
      >
        {directions ? (
          <DirectionsRenderer directions={directions} options={{ suppressMarkers: false, polylineOptions: { strokeColor: "#16a34a", strokeWeight: 4 } }} />
        ) : (
          <>
            {pickup?.lat && <Marker position={pickup} icon={dot("#16a34a")} />}
            {destination?.lat && <Marker position={destination} icon={dot("#ef4444")} />}
          </>
        )}
        {driverPos?.lat && <Marker position={driverPos} icon={driverIcon} title="Driver" />}
      </GoogleMap>
      <div style={{ position: "absolute", top: 8, right: 8 }}><Badge color="green">● GPS Live</Badge></div>
      <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>{label}</div>
    </div>
  );
}
