'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, LoaderCircle, Mail } from 'lucide-react';
import { supabase } from '@/lib/backend';
import { confirmEmail } from '@/lib/confirmation';
import { useNotification } from '@/components/notifications';
export default function ConfirmPage() {
  const [status,setStatus]=useState<'loading'|'confirmed'|'error'>('loading');
  const [message,setMessage]=useState('');
  const notify=useNotification();
  useEffect(()=>{
    let active=true;
    async function check() {
      try {
        if(!supabase)throw new Error('Email verification is available on the online app. Localhost accounts do not need it.');
        await confirmEmail(supabase.auth,window.location.href);
        if(active){window.history.replaceState(null,'',window.location.pathname);setStatus('confirmed');notify('Email confirmed. You’re ready to play.','success');}
      }catch(e){if(active){const message=e instanceof Error?e.message:'Unable to verify this link.';setMessage(message);setStatus('error');notify(message,'error');}}
    }
    void check();return()=>{active=false;};
  },[notify]);
  return <div className="app-shell"><header><a className="brand" href="/"><span className="brand-icon"><span>×</span><span>○</span></span><span className="brand-name"><small>QALIM</small>tickTack<span className="brand-dot">.</span></span></a></header><main className="confirmation-layout"><section className="auth-card" aria-live="polite"><div className="eyebrow"><Mail size={15}/> EMAIL CONFIRMATION</div><div className="confirmation-symbol">{status==='loading'?<LoaderCircle className="spin" size={32}/>:status==='confirmed'?<Check size={32}/>:<Mail size={32}/>}</div><h2>{status==='loading'?'Checking your email…':status==='confirmed'?'Email confirmed.':'Let’s get you signed in.'}</h2><p>{status==='loading'?'Just a moment while we verify your link.':status==='confirmed'?'Your email is verified. Your seat at the board is ready.':message}</p>{status!=='loading'&&<a className="primary wide" href="/">{status==='confirmed'?'Continue to play':'Back to sign in'}<ArrowUpRight size={18}/></a>}</section></main></div>;
}
