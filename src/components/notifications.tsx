'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
type Kind = 'success' | 'error' | 'info';
type Toast = { id: number; message: string; kind: Kind };
const Context = createContext<(message: string, kind?: Kind) => void>(() => {});
let nextId = 0;
export function useNotification() { return useContext(Context); }
function Notification({toast,remove}:{toast:Toast;remove:()=>void}) {
  const [leaving,setLeaving]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setLeaving(true),5280);return()=>clearTimeout(timer);},[]);
  useEffect(()=>{if(!leaving)return;const timer=setTimeout(remove,280);return()=>clearTimeout(timer);},[leaving,remove]);
  const Icon=toast.kind==='success'?CheckCircle2:toast.kind==='error'?CircleAlert:Info;
  return <div className={`notification notification-${toast.kind} ${leaving?'notification-leaving':''}`} role={toast.kind==='error'?'alert':'status'} aria-atomic="true"><Icon size={21}/><div><span className="notification-label">{toast.kind==='error'?'LET’S TRY THAT AGAIN':toast.kind==='success'?'GOOD TO GO':'QALIM TICKTACK'}</span><p>{toast.message}</p></div><button aria-label="Dismiss notification" className="notification-close" onClick={()=>setLeaving(true)}><X size={16}/></button></div>;
}
export function NotificationProvider({children}:{children:React.ReactNode}) {
  const [toasts,setToasts]=useState<Toast[]>([]);
  const notify=useCallback((message:string,kind:Kind='info')=>{
    if(!message)return;
    setToasts(current=>current.some(t=>t.message===message&&t.kind===kind)?current:[...current,{id:++nextId,message,kind}]);
  },[]);
  return <Context.Provider value={notify}>{children}<div className="notification-viewport" aria-label="Notifications">{toasts.slice(0,3).map(toast=><Notification key={toast.id} toast={toast} remove={()=>setToasts(current=>current.filter(t=>t.id!==toast.id))}/>)}</div></Context.Provider>;
}
