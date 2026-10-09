'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { movesPlayed, type Game } from '@/lib/game';
export function useGameSounds(game:Game|null,userId?:string) {
  const [muted,setMuted]=useState(false);
  const audio=useRef<AudioContext|null>(null);
  const buffers=useRef<Partial<Record<'self'|'opponent',AudioBuffer>>>({});
  const loading=useRef(false);
  const previous=useRef<{id:string;userId?:string;count:number;status:Game['status']}|null>(null);
  const unlock=useCallback(()=>{
    try{
      const context=audio.current ||= new AudioContext();
      if(context.state==='suspended')void context.resume().catch(()=>{});
      if(!loading.current){
        loading.current=true;
        void Promise.all((['self','opponent'] as const).map(async kind=>{
          const response=await fetch(kind==='self'?'/move-self.mp3':'/capture.mp3');
          if(!response.ok)throw new Error('Sound unavailable');
          const buffer=await context.decodeAudioData(await response.arrayBuffer());
          // Raise both recordings to a strong level while keeping their peaks below clipping.
          let peak=0;
          for(let channel=0;channel<buffer.numberOfChannels;channel++)for(const sample of buffer.getChannelData(channel))peak=Math.max(peak,Math.abs(sample));
          if(peak>0){
            const gain=Math.min(3,.95/peak);
            for(let channel=0;channel<buffer.numberOfChannels;channel++){const samples=buffer.getChannelData(channel);for(let i=0;i<samples.length;i++)samples[i]*=gain;}
          }
          if(audio.current===context)buffers.current[kind]=buffer;
        })).catch(()=>{loading.current=false;});
      }
    }catch{/* Sound is optional on devices without Web Audio. */}
  },[]);
  useEffect(()=>{
    try{setMuted(localStorage.getItem('qalim-sound-muted')==='true');}catch{}
    return()=>{if(audio.current)void audio.current.close().catch(()=>{});audio.current=null;buffers.current={};loading.current=false;};
  },[]);
  useEffect(()=>{
    const activate=()=>{if(!muted)unlock();};
    document.addEventListener('click',activate);document.addEventListener('keydown',activate);
    return()=>{document.removeEventListener('click',activate);document.removeEventListener('keydown',activate);};
  },[muted,unlock]);
  useEffect(()=>{
    const before=previous.current;const count=game?movesPlayed(game):0;const context=audio.current;
    if(game&&userId&&before?.userId===userId&&before.id===game.id&&before.status==='playing'&&count>before.count&&!muted&&context?.state==='running'&&!document.hidden){
      // Every mode toggles the turn after a confirmed move, including the winning move.
      const mover=game.current_turn==='O'?game.player_x_id:game.player_o_id;
      const buffer=buffers.current[mover===userId?'self':'opponent'];
      if(buffer){const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.onended=()=>source.disconnect();source.start();}
    }
    previous.current=game?{id:game.id,userId,count,status:game.status}:null;
  },[game,userId,muted]);
  const toggleMute=()=>{const next=!muted;setMuted(next);if(!next)unlock();try{localStorage.setItem('qalim-sound-muted',String(next));}catch{}};
  return {muted,toggleMute};
}
