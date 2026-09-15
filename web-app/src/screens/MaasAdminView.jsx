import { useState, useEffect } from "react";
import { Loader } from "lucide-react";
import { api } from "../api";

export function MaasAdminView({dark, t}) {
  const [stats, setStats] = useState(null);
  useEffect(()=>{
    api.getMaasStats().then(r=>setStats(r)).catch(()=>setStats({
      activeSchedules:42,activeRentals:8,activeSubscriptions:23,
      pendingDeliveries:17,corporateAccounts:4,upcomingEvents:6,
      monthlyRevenue:{rentals:28400,subscriptions:37500,total:65900}
    }));
  },[]);
  if(!stats) return <div style={{textAlign:'center',padding:'32px 0'}}><Loader className="w-6 h-6 animate-spin" style={{margin:'0 auto',color:'#16a34a'}}/></div>;
  return (
    <>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {[
          ['',stats.activeSchedules,'Active Schedules','blue'],
          ['',stats.activeRentals,'Active Rentals','green'],
          ['',stats.activeSubscriptions,'Subscriptions','purple'],
          ['',stats.pendingDeliveries,'Pending Deliveries','orange'],
          ['',stats.corporateAccounts,'Corporate Accounts','teal'],
          ['',stats.upcomingEvents,'Upcoming Events','yellow'],
        ].map(([i,v,l,c])=>(
          <div key={l} className={t.card+' rounded-2xl p-3 border '+t.bdr}>
            <span style={{fontSize:22}}>{i}</span>
            <p style={{fontSize:22,fontWeight:900,color:{blue:'#2563eb',green:'#16a34a',purple:'#9333ea',orange:'#ea580c',teal:'#0d9488',yellow:'#ca8a04'}[c]||'#16a34a',margin:'4px 0 2px'}}>{v}</p>
            <p style={{fontSize:10,color:dark?'#9ca3af':'#6b7280',margin:0}}>{l}</p>
          </div>
        ))}
      </div>
      <div className={t.card+' rounded-2xl p-4 border '+t.bdr}>
        <p className={'font-bold mb-3 '+t.text}>MaaS Monthly Revenue</p>
        {[['Rentals','GH'+stats.monthlyRevenue.rentals.toLocaleString(),'#2563eb'],
          ['Subscriptions','GH'+stats.monthlyRevenue.subscriptions.toLocaleString(),'#9333ea'],
          ['Total','GH'+stats.monthlyRevenue.total.toLocaleString(),'#16a34a']
        ].map(([l,v,c])=>(
          <div key={l} style={{display:'flex',justifyContent:'space-between',paddingBottom:8,borderBottom:'1px solid '+(dark?'#374151':'#e5e7eb'),marginBottom:8,fontSize:13}}>
            <span style={{color:dark?'#9ca3af':'#6b7280'}}>{l}</span>
            <span style={{fontWeight:700,color:c}}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:12}}>
        <p style={{fontWeight:700,color:'#16a34a',fontSize:12,margin:'0 0 6px'}}>MaaS Services Active</p>
        {['Scheduled Trips (commute planner)','Vehicle Rental (Kantanka + EV only)','Personal Driver Subscriptions','Package Delivery (motorcycle/tricycle/car)','Trip Sharing','Corporate & School Accounts','Event Rides'].map(s=>(
          <p key={s} style={{fontSize:11,color:'#374151',margin:'2px 0'}}>{' '+s}</p>
        ))}
      </div>
    </>
  );
}
