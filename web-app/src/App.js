import { useState, useEffect } from "react";
import { api } from "./api";
import { AuthScreen }   from "./screens/AuthScreen";
import { PassengerApp } from "./screens/PassengerApp";
import { DriverApp }    from "./screens/DriverApp";
import { OwnerApp }     from "./screens/OwnerApp";
import { AdminApp }     from "./screens/AdminApp";

export default function App() {
  const [dark, setDark]           = useState(false);
  const [user, setUser]           = useState(null);
  const [role, setRole]           = useState(null);
  const [apiStatus, setApiStatus] = useState("checking");

  useEffect(() => {
    // Try Firebase backend first, then Vercel backend.
    // If neither responds, the app still runs fully in demo mode —
    // so we show "demo" rather than a scary "offline" error.
    const checkHealth = async () => {
      try {
        const r = await fetch("https://us-central1-okada-online-ghana.cloudfunctions.net/api/health", { signal: AbortSignal.timeout(4000) });
        const d = await r.json();
        setApiStatus((d.success || d.status === "healthy") ? "ok" : "demo");
        return;
      } catch { /* try next */ }
      try {
        const r2 = await fetch("https://okada-online-backend.vercel.app/api/health", { signal: AbortSignal.timeout(4000) });
        const d2 = await r2.json();
        setApiStatus((d2.success || d2.status === "healthy") ? "ok" : "demo");
        return;
      } catch { /* fall through */ }
      setApiStatus("demo");
    };
    checkHealth();
  }, []);

  const login  = (u, token, r) => { api.token = token; setUser(u); setRole(r); };
  const logout = () => { setUser(null); setRole(null); api.token = null; };

  if (!user) return <AuthScreen onLogin={login} dark={dark} apiStatus={apiStatus} />;

  const props = { user, onLogout: logout, dark, setDark };
  if (role === "passenger") return <PassengerApp {...props} />;
  if (role === "driver")    return <DriverApp    {...props} />;
  if (role === "owner")     return <OwnerApp     {...props} />;
  if (role === "admin")     return <AdminApp     {...props} />;
}
