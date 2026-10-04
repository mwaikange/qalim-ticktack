'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { movesPlayed, type Game } from '@/lib/game';

export function useGameSounds(game:Game|null) {
  const [muted,setMuted]=useState(false);
  const audio=useRef<AudioContext|null>(null);
  const previous=useRef<{id:string;count:number;status:Game['status']}|null>(null);
  const unlock=useCallback(()=>{
    try{
      if(!audio.current)audio.current=new AudioContext();
      if(audio.current.state==='suspended')void audio.current.resume().catch(()=>{});
    }catch{/* Sound is optional when the device does not support Web Audio. */}
  },[]);
  useEffect(()=>{
    try{setMuted(localStorage.getItem('qalim-sound-muted')==='true');}catch{}
    return()=>{if(audio.current)void audio.current.close().catch(()=>{});audio.current=null;};
  },[]);
  useEffect(()=>{
    const activate=()=>{if(!muted)unlock();};
    document.addEventListener('click',activate);document.addEventListener('keydown',activate);
    return()=>{document.removeEventListener('click',activate);document.removeEventListener('keydown',activate);};
  },[muted,unlock]);
  useEffect(()=>{
    const before=previous.current;
    const count=game?movesPlayed(game):0;
    const context=audio.current;
    if(game&&before?.id===game.id&&before.status==='playing'&&count>before.count&&!muted&&context?.state==='running'&&!document.hidden){
      // A brief noise transient plus damped resonances sounds like wood, not a beep.
      const buffer=context.createBuffer(1,Math.round(context.sampleRate*.075),context.sampleRate);
      const samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++){
        const t=i/context.sampleRate;const attack=Math.min(1,t/.001);
        samples[i]=attack*((Math.random()*2-1)*Math.exp(-t*150)*.4+Math.sin(2*Math.PI*180*t)*Math.exp(-t*75)*.45+Math.sin(2*Math.PI*430*t)*Math.exp(-t*110)*.2);
      }
      const source=context.createBufferSource();const gain=context.createGain();
      gain.gain.value=.24;source.buffer=buffer;source.connect(gain);gain.connect(context.destination);
      source.onended=()=>{source.disconnect();gain.disconnect();};source.start();
    }
    previous.current=game?{id:game.id,count,status:game.status}:null;
  },[game,muted]);
  const toggleMute=()=>{
    const next=!muted;setMuted(next);if(!next)unlock();
    try{localStorage.setItem('qalim-sound-muted',String(next));}catch{}
  };
  return {muted,toggleMute};
}
