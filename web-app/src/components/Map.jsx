import { useState, useEffect, useRef } from "react";
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
  matched: "🏍️ Driver assigned",
  arrived: "✅ Driver has arrived",
  ongoing: "🟢 Ride in progress",
  done: "✅ Ride complete",
};

function asPoint(point) {
  if (!point) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    ? { lat, lng } : null;
}

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (n) => n * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

// With navigationTarget, this shows a road-route overlay from the driver's
// live GPS to the next stop. This is not turn-by-turn or voice navigation.
export function Map({ dark, pickup, destination, driverPos, status = "idle", height = 220, onPickupClick, navigationTarget = null }) {
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: MAPS_KEY, libraries: LIBRARIES });
  const [directions, setDirections] = useState(null);
  const [routeState, setRouteState] = useState("idle");
  const [now, setNow] = useState(Date.now());
  const requestSequence = useRef(0);
  const lastDriverRoute = useRef(null);

  const pickupPoint = asPoint(pickup);
  const destinationPoint = asPoint(destination);
  const driverPoint = asPoint(driverPos);
  const targetPoint = asPoint(navigationTarget);
  const navigationMode = !!targetPoint;
  const routeOrigin = navigationMode ? driverPoint : pickupPoint;
  const routeDestination = navigationMode ? targetPoint : destinationPoint;
  const routeOriginLat = navigationMode ? driverPoint?.lat : pickupPoint?.lat;
  const routeOriginLng = navigationMode ? driverPoint?.lng : pickupPoint?.lng;
  const routeDestinationLat = navigationMode ? targetPoint?.lat : destinationPoint?.lat;
  const routeDestinationLng = navigationMode ? targetPoint?.lng : destinationPoint?.lng;
  const routeOriginUpdatedAtMs = navigationMode ? driverPos?.updatedAtMs : undefined;

  useEffect(() => {
    if (!driverPos) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [!!driverPos]);

  const locationAgeMs = Number.isFinite(Number(driverPos?.updatedAtMs))
    ? Math.max(0, now - Number(driverPos.updatedAtMs)) : Infinity;
  const gpsFresh = !!driverPoint && locationAgeMs <= 35000;
  const gpsStale = !!driverPoint && !gpsFresh;

  useEffect(() => {
    if (!MAPS_KEY || !isLoaded || !window.google || !routeOrigin || !routeDestination) {
      requestSequence.current += 1;
      setDirections(null);
      setRouteState(!MAPS_KEY ? "map-key-missing" : loadError ? "map-load-error" : "unavailable");
      return undefined;
    }

    const targetChanged = !lastDriverRoute.current
      || distanceMeters(lastDriverRoute.current.target, routeDestination) > 20;
    const driverMoved = !lastDriverRoute.current
      || distanceMeters(lastDriverRoute.current.origin, routeOrigin) > 250;
    const routeTimedOut = !lastDriverRoute.current
      || Date.now() - lastDriverRoute.current.requestedAt >= 30000;
    if (navigationMode && !targetChanged && !driverMoved && !routeTimedOut) return undefined;

    const requestId = ++requestSequence.current;
    setRouteState("loading");
    const timer = setTimeout(() => {
      if (navigationMode) {
        lastDriverRoute.current = { origin: routeOrigin, target: routeDestination, requestedAt: Date.now() };
      }
      const service = new window.google.maps.DirectionsService();
      service.route({
        origin: routeOrigin,
        destination: routeDestination,
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (result, resultStatus) => {
        if (requestId !== requestSequence.current) return;
        if (resultStatus === "OK" && result) {
          setDirections(result);
          setRouteState("ready");
        } else {
          setDirections(null);
          setRouteState("unavailable");
        }
      });
    }, navigationMode ? 500 : 200);

    return () => clearTimeout(timer);
  }, [
    isLoaded, loadError, navigationMode,
    routeOriginLat, routeOriginLng,
    routeDestinationLat, routeDestinationLng,
    routeOriginUpdatedAtMs,
  ]);

  const label = STATUS_LABEL[status] || "Ride status unavailable";
  const gpsBadge = gpsFresh
    ? <Badge color="green">● GPS live</Badge>
    : gpsStale
      ? <Badge color="yellow">● GPS stale</Badge>
      : <Badge color="red">● GPS unavailable</Badge>;

  if (!MAPS_KEY) {
    return (
      <div style={{
        height, borderRadius: 16, border: `1px solid ${dark ? "#374151" : "#e5e7eb"}`,
        background: dark ? "#1f2937" : "linear-gradient(135deg,#f0fdf4,#eff6ff)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative",
      }}>
        <span style={{ fontSize: 40 }}>🗺️</span>
        <p style={{ fontSize: 13, fontWeight: 700, color: dark ? "#d1d5db" : "#374151", marginTop: 8 }}>Google Maps is not configured</p>
        <p style={{ fontSize: 11, textAlign: "center", padding: "0 12px", color: dark ? "#9ca3af" : "#6b7280" }}>Set REACT_APP_GOOGLE_MAPS_KEY to enable the live map and road-route overlay.</p>
        <div style={{ position: "absolute", top: 8, right: 8 }}>{gpsBadge}</div>
        <p style={{ position: "absolute", bottom: 8, left: 8, right: 8, textAlign: "center", fontSize: 11, color: dark ? "#9ca3af" : "#6b7280" }}>{label}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ height, borderRadius: 16, background: dark ? "#1f2937" : "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, textAlign: "center" }}>
        <span style={{ fontSize: 12, color: dark ? "#fca5a5" : "#b91c1c" }}>Google Maps failed to load. Check the key, API enablement, billing, and domain restrictions.</span>
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

  const center = navigationMode && driverPoint ? driverPoint : pickupPoint || driverPoint || AKOSOMBO;
  const zoom = navigationMode ? 14 : pickupPoint && destinationPoint ? 12 : 13;

  return (
    <div style={{ position: "relative", borderRadius: 16, overflow: "hidden" }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height }}
        center={center}
        zoom={zoom}
        options={{ styles: dark ? DARK_STYLE : [], disableDefaultUI: true, zoomControl: true, clickableIcons: false }}
        onClick={onPickupClick ? (e) => onPickupClick({ lat: e.latLng.lat(), lng: e.latLng.lng() }) : undefined}
      >
        {pickupPoint && <Marker position={pickupPoint} icon={dot("#16a34a")} title="Pickup" />}
        {destinationPoint && <Marker position={destinationPoint} icon={dot("#ef4444")} title="Destination" />}
        {driverPoint && <Marker position={driverPoint} icon={driverIcon} title={gpsFresh ? "Driver GPS (fresh)" : "Driver GPS (stale)"} />}
        {directions && <DirectionsRenderer directions={directions} options={{ suppressMarkers: true, polylineOptions: { strokeColor: "#16a34a", strokeWeight: 4 } }} />}
      </GoogleMap>
      <div style={{ position: "absolute", top: 8, right: 8 }}>{gpsBadge}</div>
      <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>{label}</div>
      {navigationMode && routeState === "unavailable" && <div style={{ position: "absolute", bottom: 36, left: 8, right: 8, background: "rgba(127,29,29,0.9)", color: "#fff", fontSize: 11, padding: "5px 8px", borderRadius: 8 }}>Road route unavailable. Use the map markers and confirm the route before moving.</div>}
    </div>
  );
}
