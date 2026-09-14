import { useState, useEffect } from "react";
import { api } from "./api";
import { AuthScreen }   from "./screens/AuthScreen";
import { PassengerApp } from "./screens/PassengerApp";
import { DriverApp }    from "./screens/DriverApp";
import { OwnerApp }     from "./screens/OwnerApp";
import { AdminApp }     from "./screens/AdminApp";

export default function App() {
  const [dark, setDark]         = useState(false);
  const [user, setUser]         = useState(null);
  const [role, setRole]         = useState(null);
  const [apiStatus, setApiStatus] = useState("checking");

  useEffect(() => {
    fetch("https://us-central1-okada-online-ghana.cloudfunctions.net/api/health")
      .then(r => r.json())
      .then(d => setApiStatus(d.success ? "ok" : "error"))
      .catch(() => setApiStatus("error"));
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
