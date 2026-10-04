'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { act, identity, signOut, snapshot, subscribe, supabase } from '@/lib/backend';
import type { Snapshot } from '@/lib/local-store';
import type { Player } from '@/lib/game';
export function useGameRoom() {
  const [user,setUser]=useState<Player|null>(null);
  const [data,setData]=useState<Snapshot|null>(null);
  const [ready,setReady]=useState(false); const [connected,setConnected]=useState(false);
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const presence=useRef<string[]>([]); const requestNumber=useRef(0); const mounted=useRef(true);
  const refresh=useCallback(async()=>{
    if(!user)return;
    const request=++requestNumber.current;
    try{const next=await snapshot(user,presence.current);if(mounted.current&&request===requestNumber.current){setData(next);if(next.active)setSelectedId(next.active.id);}}
    catch(e){if(mounted.current&&request===requestNumber.current){setError(e instanceof Error?e.message:'Connection interrupted.');setConnected(false);}}
  },[user]);
  useEffect(()=>{mounted.current=true;identity().then(setUser).catch(e=>setError(e.message)).finally(()=>setReady(true));const auth=supabase?.auth.onAuthStateChange((event,session)=>{if(!session){requestNumber.current++;setUser(null);setData(null);setSelectedId(null);}else if(event==='SIGNED_IN'){setTimeout(()=>{void identity().then(setUser).catch(e=>setError(e.message));},0);}});return()=>{mounted.current=false;auth?.data.subscription.unsubscribe();};},[]);
  useEffect(()=>{
    if(!user)return;
    void refresh();
    const stop=subscribe(user,()=>void refresh(),setConnected,ids=>{presence.current=ids;setData(d=>d?{...d,onlineIds:ids}:d);});
    const timer=setInterval(()=>void refresh(),10000);
    const focus=()=>void refresh();window.addEventListener('focus',focus);window.addEventListener('online',focus);
    const offline=()=>setConnected(false);window.addEventListener('offline',offline);
    return()=>{stop();clearInterval(timer);window.removeEventListener('focus',focus);window.removeEventListener('online',focus);window.removeEventListener('offline',offline);requestNumber.current++;};
  },[user,refresh]);
  const perform=async(action:Parameters<typeof act>[0],gameId?:string,cell?:number)=>{
    if(busy)return;setBusy(true);setError('');
    try{const game=await act(action,gameId,cell);if(game)setSelectedId(game.id);if(action==='cancel')setSelectedId(null);await refresh();}
    catch(e){setError(e instanceof Error?e.message:'Please try again.');await refresh();}finally{setBusy(false);}
  };
  const logout=async()=>{setBusy(true);try{await signOut();requestNumber.current++;setUser(null);setData(null);setSelectedId(null);}catch(e){setError(e instanceof Error?e.message:'Unable to sign out.');}finally{setBusy(false);}};
  const game=data?.active || data?.history.find(g=>g.id===selectedId)||null;
  return {user,setUser,data,ready,connected,error,setError,busy,game,perform,logout,refresh,back:()=>setSelectedId(null)};
}
