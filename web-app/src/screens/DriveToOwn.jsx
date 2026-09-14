import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { api } from "../api";
import { T } from "../theme";
import { Toast } from "../components/Toast";
import { Spin } from "../components/Spin";

// ── DRIVE TO OWN ──────────────────────────────────────
export function DriveToOwn({ user, role, dark, onBack }) {
  const t = T(dark);
  const [track, setTrack] = useState("A");
  const [vehId, setVehId] = useState("");
  const [appStatus, setAppStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [paid, setPaid] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const toast$ = (msg, type = "success") => setToast({ msg, type });

  const DTV = {
    A: [
      { id: "okada", name: "Motorcycle (Okada)", price: 12000, icon: "🏍️", months: "9-10" },
      { id: "tricycle", name: "Tricycle (Pragya)", price: 18000, icon: "🛺", months: "13-14" },
      { id: "ev_bike", name: "Electric Motorcycle", price: 22000, icon: "⚡🏍️", months: "16-17" },
    ],
    B: [
      { id: "k71", name: "Kantanka K71 SUV", price: 105000, icon: "🚗" },
      { id: "omama", name: "Kantanka Omama 4x4", price: 150000, icon: "🚙" },
    ],
  };
  const vehicles = DTV[track] || DTV.A;
  const selected = vehicles.find((v) => v.id === vehId);

  const apply = async () => {
    if (!vehId) { toast$("Select a vehicle", "error"); return; }
    setLoading(true);
    try {
      await api.req("POST", "/dto/apply", { userId: user.id, role, vehicleType: vehId, track });
      setAppStatus("applied");
      toast$("Application submitted! Admin reviews within 48hrs");
    } catch (e) {
      setAppStatus("active");
      toast$("Drive to Own demo activated!");
    }
    setLoading(false);
  };

  return (
    <div className={t.bg} style={{ minHeight: "100vh" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} close={() => setToast(null)} />}

      <div
        style={{
          background: "linear-gradient(90deg,#1e3a5f,#2563eb)", color: "#fff", padding: "14px 16px",
          display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20,
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: 6, cursor: "pointer", fontSize: 16 }}
          >
            {"<"}
          </button>
        )}
        <div>
          <p style={{ fontFamily: "Syne,sans-serif", fontWeight: 900, fontSize: 17, margin: 0 }}>🏍️ Drive to Own</p>
          <p style={{ fontSize: 10, margin: 0, opacity: 0.8 }}>Own your vehicle through earnings</p>
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {appStatus === "done" && (
          <div style={{ background: "linear-gradient(135deg,#14532d,#16a34a)", borderRadius: 20, padding: 32, color: "#fff", textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <p style={{ fontFamily: "Syne,sans-serif", fontWeight: 900, fontSize: 22, margin: "0 0 8px" }}>You OWN Your Vehicle!</p>
            <p style={{ fontSize: 13, opacity: 0.9, margin: 0 }}>
              {selected && selected.name} fully paid off. Documents released within 48hrs.
            </p>
          </div>
        )}

        {appStatus === "active" && selected && (
          <>
            <div style={{ background: "linear-gradient(135deg,#1e3a5f,#2563eb)", borderRadius: 20, padding: 20, color: "#fff", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{selected.icon}</div>
              <p style={{ fontWeight: 900, fontSize: 18, margin: "0 0 4px" }}>{selected.name}</p>
              <p style={{ fontSize: 12, opacity: 0.85, margin: 0 }}>
                Track {track} - {track === "A" ? "35% of daily earnings" : "40% of owner share"}
              </p>
            </div>

            <div className={t.card + " rounded-2xl p-4 border " + t.bdr}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span className={"font-black text-sm " + t.text}>Ownership Progress</span>
                <span style={{ fontWeight: 900, color: "#2563eb" }}>{progress.toFixed(1)}%</span>
              </div>
              <div style={{ height: 14, borderRadius: 999, background: dark ? "#374151" : "#e5e7eb", marginBottom: 8 }}>
                <div
                  style={{
                    height: 14, borderRadius: 999, width: progress + "%",
                    background: "linear-gradient(90deg,#2563eb,#16a34a)", transition: "width 0.5s",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span className={t.sub}>{"GH₵" + paid.toLocaleString() + " paid"}</span>
                <span className={t.sub}>{"GH₵" + selected.price.toLocaleString() + " total"}</span>
              </div>
            </div>

            <button
              onClick={() => {
                const inc = Math.random() * 5 + 1;
                const np = Math.min(progress + inc, 100);
                const pa = Math.min(paid + (selected.price * inc) / 100, selected.price);
                setProgress(np);
                setPaid(pa);
                if (np >= 100) {
                  setAppStatus("done");
                  toast$("Vehicle FULLY PAID OFF!");
                } else {
                  toast$(
                    "Ride complete! +GH" + String.fromCharCode(8373) + ((selected.price * inc) / 100).toFixed(2) +
                    " toward your " + selected.name
                  );
                }
              }}
              style={{
                padding: "12px", background: dark ? "#374151" : "#f0fdf4", border: "1px dashed #16a34a",
                borderRadius: 12, color: "#16a34a", fontWeight: 700, fontSize: 12, cursor: "pointer", width: "100%",
              }}
            >
              Simulate ride completion (demo)
            </button>
          </>
        )}

        {!appStatus && (
          <>
            <div style={{ background: "linear-gradient(135deg,#1e3a5f,#2563eb)", borderRadius: 16, padding: 16, color: "#fff" }}>
              <p style={{ fontFamily: "Syne,sans-serif", fontWeight: 900, fontSize: 16, margin: "0 0 8px" }}>
                Own Your Vehicle Through Work
              </p>
              <p style={{ fontSize: 12, opacity: 0.85, margin: "0 0 12px" }}>
                Your earnings automatically pay off your vehicle. No lump sums. No arguments. Just drive and own.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
                {[["35%", "of daily earnings"], ["0", "upfront (Track A)"], ["🇬🇭", "Made-in-Ghana"]].map(([v, l]) => (
                  <div key={l} style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
                    <p style={{ fontWeight: 900, fontSize: 18, margin: "0 0 4px" }}>{v}</p>
                    <p style={{ fontSize: 9, opacity: 0.8, margin: 0 }}>{l}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["A", "Driver Direct", "🏍️", "35% daily earnings"], ["B", "Owner Assisted", "🚗", "30% down payment"]].map(
                ([tr, lb, ic, desc]) => (
                  <button
                    key={tr}
                    onClick={() => { setTrack(tr); setVehId(""); }}
                    style={{
                      padding: 14, borderRadius: 14, textAlign: "left",
                      border: "2px solid " + (track === tr ? "#2563eb" : "#e5e7eb"),
                      background: track === tr ? "#eff6ff" : t.card,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{ic}</div>
                    <p style={{ fontWeight: 700, color: track === tr ? "#1d4ed8" : (dark ? "#fff" : "#111827"), fontSize: 13, margin: "0 0 2px" }}>
                      {"Track " + tr + " - " + lb}
                    </p>
                    <p style={{ fontSize: 10, color: dark ? "#9ca3af" : "#6b7280", margin: 0 }}>{desc}</p>
                  </button>
                )
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p className={"font-black text-sm " + t.text}>Select Vehicle:</p>
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  onClick={() => setVehId(v.id)}
                  style={{
                    padding: 14, borderRadius: 14, cursor: "pointer",
                    border: "2px solid " + (vehId === v.id ? "#2563eb" : "#e5e7eb"),
                    background: vehId === v.id ? "#eff6ff" : t.card,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 26 }}>{v.icon}</span>
                      <div>
                        <p style={{ fontWeight: 700, color: dark ? "#fff" : "#111827", fontSize: 13, margin: 0 }}>{v.name}</p>
                        <p style={{ fontSize: 11, color: dark ? "#9ca3af" : "#6b7280", margin: 0 }}>
                          {"GH" + String.fromCharCode(8373) + v.price.toLocaleString() +
                            (track === "A" && v.months ? " - ~" + v.months + " months" : "")}
                        </p>
                      </div>
                    </div>
                    {vehId === v.id && <CheckCircle style={{ width: 20, height: 20, color: "#2563eb" }} />}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: 12 }}>
              <p style={{ fontWeight: 700, color: "#16a34a", fontSize: 12, margin: "0 0 6px" }}>Eligibility Requirements</p>
              {["10+ rides on the platform", "KYC verified (Ghana Card or Passport)", "No active disputes"].map((r) => (
                <p key={r} style={{ fontSize: 11, color: "#374151", margin: "2px 0" }}>{"✓ " + r}</p>
              ))}
            </div>

            <button
              onClick={apply}
              disabled={loading || !vehId}
              style={{
                width: "100%", padding: "14px", borderRadius: 14, fontWeight: 900, fontSize: 15,
                cursor: !loading && vehId ? "pointer" : "not-allowed",
                opacity: !loading && vehId ? 1 : 0.5,
                background: "#2563eb", color: "#fff", display: "flex",
                alignItems: "center", justifyContent: "center", gap: 8, border: "none", fontFamily: "inherit",
              }}
            >
              {loading && <Spin />}
              Apply for Drive to Own
            </button>
          </>
        )}
      </div>
    </div>
  );
}
