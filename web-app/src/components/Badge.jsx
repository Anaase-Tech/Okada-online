export const Badge = ({ color, children }) => {
  const c = {
    green:  "bg-green-100 text-green-700",
    red:    "bg-red-50 text-red-500",
    yellow: "bg-yellow-400 text-gray-900",
    blue:   "bg-blue-50 text-blue-600",
    gray:   "bg-gray-100 text-gray-600",
    purple: "bg-purple-600 text-white",
    orange: "bg-orange-500 text-white",
    teal:   "bg-teal-100 text-teal-700",
    indigo: "bg-indigo-100 text-indigo-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c[color] || c.gray}`}>
      {children}
    </span>
  );
};
