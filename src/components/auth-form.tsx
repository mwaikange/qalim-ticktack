'use client';
import { useState } from 'react';
import { ArrowUpRight, LoaderCircle, LockKeyhole } from 'lucide-react';
import { authenticate, isSupabase } from '@/lib/backend';
import type { Player } from '@/lib/game';
export function AuthForm({onUser}:{onUser:(user:Player)=>void}){
  const [register,setRegister]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  return <section className="auth-card"><div className="eyebrow"><LockKeyhole size={14}/> YOUR SEAT AT THE BOARD</div><h2>{register?'Make your first move.':'Welcome back.'}</h2><p>{register?'Create an account and find your next opponent.':'Sign in, find a challenger, and make it a good game.'}</p><form onSubmit={async e=>{e.preventDefault();setError('');setBusy(true);const fields=new FormData(e.currentTarget);try{const user=await authenticate(register,String(fields.get('email')),String(fields.get('password')),String(fields.get('username')||''));if(user)onUser(user);}catch(e){setError(e instanceof Error?e.message:'Unable to sign in.');}finally{setBusy(false);}}}>
  {register&&<label>Player name<input name="username" placeholder="What should we call you?" minLength={2} maxLength={24} autoComplete="nickname" required/></label>}
  <label>Email address<input name="email" type="email" placeholder="you@example.com" autoComplete="email" maxLength={254} required/></label>
  <label>Password<input name="password" type="password" placeholder="At least 8 characters" minLength={8} maxLength={128} autoComplete={register?'new-password':'current-password'} required/></label>
  {error&&<div className="form-error" role="alert">{error}</div>}
  <button className="primary wide" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:<>{register?'Create account':'Sign in'}<ArrowUpRight size={18}/></>}</button>
  </form><div className="auth-switch">{register?'Already a player?':'New to tickTack?'} <button onClick={()=>{setRegister(!register);setError('');}} disabled={busy}>{register?'Sign in':'Create an account'}</button></div><div className="local-note">{isSupabase?'Secure sign-in · Supabase connected':'Localhost edition · Accounts and games stay on this computer'}</div></section>;
}
