'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Mail } from 'lucide-react';
import { authCallbackHref, supabase } from '@/lib/backend';
import { confirmEmail } from '@/lib/confirmation';
import { useNotification } from '@/components/notifications';
export default function ConfirmPage() {
  const [status,setStatus]=useState<'loading'|'confirmed'|'error'>('loading');
  const [message,setMessage]=useState('');
  const verification=useRef<Promise<void> | null>(null);
  const notify=useNotification();
  useEffect(()=>{
    let active=true;
    async function check() {
      try {
        if(!supabase)throw new Error('Email verification is available on the online app. Localhost accounts do not need it.');
        if(!verification.current)verification.current=confirmEmail(supabase.auth,authCallbackHref || window.location.href);
        await verification.current;
        if(active){window.history.replaceState(null,'',window.location.pathname);setStatus('confirmed');notify('Email confirmed. Return to the app and sign in.','success');}
      }catch(e){if(active){const message=e instanceof Error?e.message:'Unable to verify this link.';setMessage(message);setStatus('error');notify(message,'error');}}
    }
    void check();return()=>{active=false;};
  },[notify]);
  return <div className="app-shell"><header><div className="brand"><span className="brand-icon"><span>×</span><span>○</span></span><span className="brand-name"><small>QALIM</small>tickTack<span className="brand-dot">.</span></span></div></header><main className="confirmation-layout"><section className="auth-card" aria-live="polite"><div className="eyebrow"><Mail size={15}/> EMAIL CONFIRMATION</div><div className="confirmation-symbol">{status==='loading'?<LoaderCircle className="spin" size={32}/>:status==='confirmed'?<Check size={32}/>:<Mail size={32}/>}</div><h2>{status==='loading'?'Checking your email…':status==='confirmed'?'Email confirmed.':'Unable to confirm.'}</h2><p>{status==='loading'?'Just a moment while we verify your link.':status==='confirmed'?'Your email is verified. Return to the QALIM tickTack app and sign in. You can close this page.':`${message} Return to the app to sign in or request another verification email.`}</p></section></main></div>;
}
