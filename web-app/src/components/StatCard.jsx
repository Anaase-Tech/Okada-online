import { T } from "../theme";

export const StatCard = ({ icon, label, value, sub, color, dark }) => {
  const t = T(dark);
  const c = {
    green:  "text-green-600",
    blue:   "text-blue-600",
    purple: "text-purple-600",
    yellow: "text-yellow-600",
    orange: "text-orange-500",
    teal:   "text-teal-600",
    indigo: "text-indigo-600",
  };
  return (
    <div
      className={`${t.card} rounded-2xl p-4 border ${t.bdr}`}
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <span style={{ fontSize: 28 }}>{icon}</span>
      <span className={`text-2xl font-black ${c[color] || c.green}`}>{value}</span>
      <span className={`text-xs font-semibold ${t.text}`}>{label}</span>
      {sub && <span className={`text-xs ${t.sub}`}>{sub}</span>}
    </div>
  );
};
