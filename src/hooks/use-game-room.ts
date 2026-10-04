'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { act, identity, signOut, snapshot, subscribe, supabase } from '@/lib/backend';
import type { Snapshot } from '@/lib/local-store';
import { resultText, type Game, type Player } from '@/lib/game';
import { useNotification } from '@/components/notifications';
export function useGameRoom() {
  const [user,setUser]=useState<Player|null>(null);
  const [data,setData]=useState<Snapshot|null>(null);
  const [ready,setReady]=useState(false); const [connected,setConnected]=useState(false);
  const notify=useNotification();const [busy,setBusy]=useState(false);
  const lastFetchError=useRef('');const previousGame=useRef<Game|null>(null);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const presence=useRef<string[]>([]); const requestNumber=useRef(0); const mounted=useRef(true);
  const refresh=useCallback(async()=>{
    if(!user)return;
    const request=++requestNumber.current;
    try{const next=await snapshot(user,presence.current);if(mounted.current&&request===requestNumber.current){lastFetchError.current='';setData(next);if(next.active)setSelectedId(next.active.id);}}
    catch(e){if(mounted.current&&request===requestNumber.current){const message=e instanceof Error?e.message:'Connection interrupted.';if(lastFetchError.current!==message){notify(message,'error');lastFetchError.current=message;}setConnected(false);}}
  },[user,notify]);
  useEffect(()=>{mounted.current=true;identity().then(setUser).catch(e=>notify(e.message,'error')).finally(()=>setReady(true));const auth=supabase?.auth.onAuthStateChange((event,session)=>{if(!session){requestNumber.current++;setUser(null);setData(null);setSelectedId(null);}else if(event==='SIGNED_IN'){setTimeout(()=>{void identity().then(setUser).catch(e=>notify(e.message,'error'));},0);}});return()=>{mounted.current=false;auth?.data.subscription.unsubscribe();};},[notify]);
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
    if(busy)return;setBusy(true);
    try{const game=await act(action,gameId,cell);if(game)setSelectedId(game.id);if(action==='cancel')setSelectedId(null);if(action==='create')notify('Challenge created. Waiting for an opponent.','success');if(action==='join')notify('Match joined. You’re playing O.','success');if(action==='cancel')notify('Challenge cancelled.','info');if(action==='resign')notify('You resigned. The result is saved in match history.','info');await refresh();}
    catch(e){notify(e instanceof Error?e.message:'Please try again.','error');await refresh();}finally{setBusy(false);}
  };
  const logout=async()=>{setBusy(true);try{await signOut();requestNumber.current++;setUser(null);setData(null);setSelectedId(null);notify('You’re signed out.','info');}catch(e){notify(e instanceof Error?e.message:'Unable to sign out.','error');}finally{setBusy(false);}};
  const game=data?.active || data?.history.find(g=>g.id===selectedId)||null;
  useEffect(()=>{const previous=previousGame.current;if(game&&previous?.id===game.id){if(previous.status==='waiting'&&game.status==='playing')notify('Your opponent joined. The match is ready.','success');if(previous.status==='playing'&&game.status==='finished')notify(`${resultText(game,user?.id)}. Your match is saved.`,'info');}previousGame.current=game;},[game,user?.id,notify]);
  return {user,setUser,data,ready,connected,busy,game,perform,logout,refresh,back:()=>setSelectedId(null)};
}
