import { useEffect } from "react";
import { AlertCircle, CheckCircle, X } from "lucide-react";

export const Toast = ({msg,type,close}) => {
  useEffect(()=>{const t=setTimeout(close,3500);return()=>clearTimeout(t);},[close]);
  return (
    <div style={{zIndex:100}} className={`fixed top-4 inset-x-4 max-w-md mx-auto flex items-start gap-3 px-4 py-3 rounded-2xl shadow-2xl text-white text-sm font-bold ${type==="error"?"bg-red-600":"bg-green-600"}`}>
      {type==="error"?<AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5"/>:<CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5"/>}
      <span style={{flex:1}}>{msg}</span>
      <button onClick={close}><X className="w-4 h-4"/></button>
    </div>
  );
};
