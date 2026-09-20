import { useState, useEffect } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
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
  const [restoring, setRestoring] = useState(true);

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

  // Restore a real, previously-verified session on page load/refresh.
  // Firebase itself already persists the phone-auth session in the browser —
  // the app just never checked for it before, so every reload looked like a
  // brand new login even for a real, already-verified user. Demo-mode
  // sessions have no underlying Firebase session, so they correctly still
  // require a fresh login after a refresh — only real logins are restored.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { setRestoring(false); return; }
      try {
        const token = await fbUser.getIdToken();
        api.token = token;
        const res = await api.req("GET", `/auth/profile/${fbUser.uid}`);
        setUser(res.user);
        setRole(res.user.role);
      } catch (e) {
        console.warn("Session restore failed:", e);
        api.token = null;
      }
      setRestoring(false);
    });
    return unsub;
  }, []);

  const login  = (u, token, r) => { api.token = token; setUser(u); setRole(r); };
  const logout = () => {
    setUser(null); setRole(null); api.token = null;
    auth.signOut().catch(() => {});
  };

  if (restoring) {
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#f9fafb"}}>
        <div style={{width:40,height:40,border:"4px solid #16a34a",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      </div>
    );
  }

  if (!user) return <AuthScreen onLogin={login} dark={dark} apiStatus={apiStatus} />;

  const props = { user, onLogout: logout, dark, setDark };
  if (role === "passenger") return <PassengerApp {...props} />;
  if (role === "driver")    return <DriverApp    {...props} />;
  if (role === "owner")     return <OwnerApp     {...props} />;
  if (role === "admin")     return <AdminApp     {...props} />;
}
