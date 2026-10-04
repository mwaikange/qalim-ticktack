'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, LockKeyhole } from 'lucide-react';
import { authCallbackHref, supabase } from '@/lib/backend';
import { preparePasswordReset, savePassword } from '@/lib/password-reset';
import { useNotification } from '@/components/notifications';

export default function ResetPasswordPage() {
  const [status,setStatus]=useState<'loading'|'ready'|'saved'|'error'>('loading');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const preparation=useRef<Promise<void> | null>(null);
  const notify=useNotification();
  useEffect(()=>{
    let active=true;
    if(!preparation.current)preparation.current=supabase
      ? preparePasswordReset(supabase.auth,authCallbackHref || window.location.href)
      : Promise.reject(new Error('Password reset is available in the online app.'));
    preparation.current.then(()=>{
      if(active){window.history.replaceState(null,'',window.location.pathname);setStatus('ready');}
    }).catch(error=>{
      if(active){const text=error instanceof Error?error.message:'This reset link could not be verified.';setMessage(text);setStatus('error');notify(text,'error');}
    });
    return()=>{active=false;};
  },[notify]);

  return <div className="app-shell"><header><div className="brand"><span className="brand-icon"><span>×</span><span>○</span></span><span className="brand-name"><small>QALIM</small>tickTack<span className="brand-dot">.</span></span></div></header><main className="confirmation-layout"><section className="auth-card" aria-live="polite">
    <div className="eyebrow"><LockKeyhole size={15}/> PASSWORD RESET</div>
    <div className="confirmation-symbol">{status==='loading'?<LoaderCircle className="spin" size={32}/>:status==='saved'?<Check size={32}/>:<LockKeyhole size={32}/>}</div>
    <h2>{status==='loading'?'Checking your link…':status==='ready'?'Choose a new password.':status==='saved'?'Password updated.':'Request a new link.'}</h2>
    <p>{status==='loading'?'Just a moment while we verify your reset link.':status==='ready'?'Use at least 8 characters for your new password.':status==='saved'?'Return to the QALIM tickTack app and sign in with your new password. You can close this page.':`${message} Return to the app and choose “Forgot password?” to try again.`}</p>
    {status==='ready'&&<form onInvalid={event=>{event.preventDefault();const input=event.target as HTMLInputElement;if(event.currentTarget.querySelector(':invalid')===input){notify(input.validationMessage,'error');input.focus();}}} onSubmit={async event=>{
      event.preventDefault();if(!supabase||busy)return;
      const fields=new FormData(event.currentTarget);setBusy(true);
      try{
        await savePassword(supabase.auth,String(fields.get('password')),String(fields.get('confirmation')));
        setStatus('saved');notify('Password updated. Return to the app and sign in.','success');
        // Clear only this email browser's session; the app is a separate browser.
        await supabase.auth.signOut({scope:'local'});
      }catch(error){notify(error instanceof Error?error.message:'Unable to update your password.','error');}
      finally{setBusy(false);}
    }}>
      <label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} placeholder="At least 8 characters" required disabled={busy}/></label>
      <label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} placeholder="Enter your new password again" required disabled={busy}/></label>
      <button className="primary wide" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:<>Save new password<Check size={18}/></>}</button>
    </form>}
  </section></main></div>;
}
