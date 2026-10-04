'use client';
import { useState } from 'react';
import { ArrowUpRight, LoaderCircle, LockKeyhole } from 'lucide-react';
import { authenticate, isSupabase, resendConfirmation } from '@/lib/backend';
import type { Player } from '@/lib/game';
import { useNotification } from './notifications';
export function AuthForm({onUser}:{onUser:(user:Player)=>void}){
  const [register,setRegister]=useState(false);const [busy,setBusy]=useState(false);const [email,setEmail]=useState('');
  const notify=useNotification();
  return <section className="auth-card"><div className="eyebrow"><LockKeyhole size={14}/> YOUR SEAT AT THE BOARD</div><h2>{register?'Make your first move.':'Welcome back.'}</h2><p>{register?'Create an account and find your next opponent.':'Sign in, find a challenger, and make it a good game.'}</p><form onInvalid={event=>{event.preventDefault();const input=event.target as HTMLInputElement;if(event.currentTarget.querySelector(':invalid')===input){notify(input.validationMessage,'error');input.focus();}}} onSubmit={async e=>{e.preventDefault();setBusy(true);const fields=new FormData(e.currentTarget);try{const user=await authenticate(register,String(fields.get('email')),String(fields.get('password')),String(fields.get('username')||''));if(user){notify(register?`Account created. Welcome, ${user.username}.`:`Welcome back, ${user.username}.`,'success');onUser(user);}else{notify('Check your inbox to confirm your email, then return to sign in.','info');setRegister(false);}}catch(e){notify(e instanceof Error?e.message:'Unable to sign in.','error');}finally{setBusy(false);}}}>
  {register&&<label>Player name<input name="username" placeholder="What should we call you?" minLength={2} maxLength={24} autoComplete="nickname" required/></label>}
  <label>Email address<input name="email" type="email" placeholder="you@example.com" autoComplete="email" maxLength={254} required value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <label>Password<input name="password" type="password" placeholder="At least 8 characters" minLength={8} maxLength={128} autoComplete={register?'new-password':'current-password'} required/></label>
  <button className="primary wide" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:<>{register?'Create account':'Sign in'}<ArrowUpRight size={18}/></>}</button>
  </form>{isSupabase&&!register&&<button className="text-button wide" disabled={busy||!email.trim()} onClick={async()=>{setBusy(true);try{await resendConfirmation(email.trim());notify('If your account needs verification, a fresh confirmation link has been sent. Check your inbox.','info');}catch(e){notify(e instanceof Error?e.message:'Unable to resend.','error');}finally{setBusy(false);}}}>Resend verification email</button>}<div className="auth-switch">{register?'Already a player?':'New to tickTack?'} <button onClick={()=>setRegister(!register)} disabled={busy}>{register?'Sign in':'Create an account'}</button></div><div className="local-note">{isSupabase?'Secure sign-in · Supabase connected':'Localhost edition · Accounts and games stay on this computer'}</div></section>;
}
