'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Game } from '@/lib/game';

export function ResultEffects({game,userId}:{game:Game|null;userId:string|null}) {
  const previous=useRef<{id:string;status:Game['status']} | null>(null);
  const seen=useRef(new Set<string>());
  const [effect,setEffect]=useState<{id:string;won:boolean}|null>(null);
  useEffect(()=>{
    const before=previous.current;
    if(game&&userId&&game.winner_id&&game.status==='finished'&&before?.id===game.id&&before.status==='playing'&&!seen.current.has(game.id)){
      seen.current.add(game.id);setEffect({id:game.id,won:game.winner_id===userId});
    }
    previous.current=game?{id:game.id,status:game.status}:null;
  },[game,userId]);
  useEffect(()=>{if(!effect)return;const timer=setTimeout(()=>setEffect(null),5000);return()=>clearTimeout(timer);},[effect]);
  if(!effect||effect.id!==game?.id)return null;
  return <div className={`result-effects ${effect.won?'result-celebration':'result-defeat'}`} aria-hidden="true">
    {effect.won?<>
      {Array.from({length:48},(_,i)=><span key={i} className="confetti-piece" style={{'--left':`${(i*37)%100}%`,'--delay':`${(i%9)*0.09}s`,'--drift':`${(i%2?1:-1)*(20+i%60)}px`,'--color':['#daf69b','#86a76a','#efc286','#b8d8d3','#f7f8f2'][i%5],'--spin':`${(i%2?1:-1)*720}deg`} as CSSProperties}/>)}
      {Array.from({length:6},(_,i)=><span key={i} className="celebration-balloon" style={{'--left':`${10+i*16}%`,'--delay':`${i*0.18}s`,'--color':['#daf69b','#86a76a','#efc286'][i%3]} as CSSProperties}/>)}
    </>:Array.from({length:4},(_,i)=><span key={i} className="defeat-ring" style={{'--left':`${15+i*24}%`,'--delay':`${i*0.35}s`,'--top':`${20+(i%2)*45}%`} as CSSProperties}/>)}
  </div>;
}
