'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, History as HistoryIcon, X } from 'lucide-react';
import { resultText, story, type Game } from '@/lib/game';
import { Board } from './board';
export function History({games,userId}:{games:Game[];userId:string}){
  const [filter,setFilter]=useState('All matches');const [selected,setSelected]=useState<Game|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(selected&&dialog.current&&!dialog.current.open)dialog.current.showModal();},[selected]);
  const visible=games.filter(g=>filter==='All matches'||(filter==='Wins'?g.winner_id===userId:filter==='Losses'?!!g.winner_id&&g.winner_id!==userId:!g.winner_id));
  return <><div className="section-heading"><div><div className="eyebrow">EVERY MATCH HAS A STORY</div><h2>Match history<span className="count">{games.length}</span></h2></div><select aria-label="Filter match history" value={filter} onChange={e=>setFilter(e.target.value)}>{['All matches','Wins','Losses','Draws'].map(x=><option key={x}>{x}</option>)}</select></div>
  {games.length>=100&&<p className="muted">Showing your most recent 100 matches.</p>}
  {visible.length===0?<div className="empty"><HistoryIcon size={28}/><h3>{games.length?'No matches in this filter.':'Your story starts here.'}</h3><p>{games.length?'Try another result filter.':'Play your first match. The result and final board will be saved here.'}</p></div>:<div className="history-list">{visible.map(g=><button key={g.id} className="history-row" onClick={()=>setSelected(g)}><Board game={g} small/><div className="history-main"><strong>{g.player_x_name} <span>vs</span> {g.player_o_name}</strong><p>{new Date(g.finished_at||g.updated_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})} · {g.board.filter(Boolean).length} moves{g.finish_reason==='resignation'?' · Resignation':''}</p><span className="history-story">{g.winner_id?`${g.winner_id===g.player_x_id?g.player_x_name:g.player_o_name} won · ${g.winner_id===g.player_x_id?g.player_o_name:g.player_x_name} lost`:'Both players drew'}</span></div><span className={`result-pill ${!g.winner_id?'draw':g.winner_id===userId?'win':'loss'}`}>{resultText(g,userId)}</span><ArrowUpRight size={18}/></button>)}</div>}
  {selected&&<dialog ref={dialog} className="result-dialog" aria-labelledby="history-title" onCancel={()=>setSelected(null)}><div className="dialog-backdrop" onClick={()=>setSelected(null)}/><div className="dialog-card"><button className="icon-button close-dialog" autoFocus aria-label="Close match details" onClick={()=>setSelected(null)}><X size={22}/></button><div className="eyebrow">MATCH RECAP</div><h2 id="history-title">{resultText(selected,userId)}</h2><p>{selected.player_x_name} <b>×</b> vs {selected.player_o_name} <b>○</b></p><Board game={selected}/><p className="recap-story">{story(selected)}</p><small>{new Date(selected.finished_at||selected.updated_at).toLocaleString()}</small></div></dialog>}</>;
}
