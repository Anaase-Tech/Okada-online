export const T = (dark) => ({
  bg:   dark ? "bg-gray-950" : "bg-gray-50",
  card: dark ? "bg-gray-800" : "bg-white",
  text: dark ? "text-white"  : "text-gray-900",
  sub:  dark ? "text-gray-400" : "text-gray-500",
  inp:  dark
    ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
    : "bg-white text-gray-900 border-gray-300 placeholder-gray-400",
  bdr:  dark ? "border-gray-700" : "border-gray-200",
});
