import type { Game } from '@/lib/game';
import { Bomb } from 'lucide-react';
export function Board({game,onMove,disabled=false,small=false}:{game:Game;onMove?:(cell:number)=>void;disabled?:boolean;small?:boolean}){
  const size=game.board.length===16?4:3;
  return <div className={`board ${size===4?'bomb-board':''} ${small?'mini-board':''}`} style={{gridTemplateColumns:`repeat(${size},1fr)`}} role="group" aria-label={size===4?'4 by 4 bomb board':'Tic-tac-toe board'}>{game.board.map((mark,i)=>{
    const exploded=game.bomb_events?.find(event=>event.cell===i);
    const content=<>{mark&&<span>{mark==='X'?'×':'○'}</span>}{exploded&&!small&&<span className={`bomb-marker bomb-${exploded.type}`} title={exploded.type==='both'?'Double reset used':'Rival reset used'}><Bomb size={12}/></span>}</>;
    return onMove?<button key={i} className={`square ${mark.toLowerCase()} ${game.winning_cells.includes(i)?'winning':''}`} disabled={disabled||!!mark} aria-label={`Row ${Math.floor(i/size)+1}, column ${i%size+1}: ${mark||'empty'}${exploded?', bomb already used':''}`} onClick={()=>onMove(i)}>{content}</button>:<div key={i} className={`square ${mark.toLowerCase()} ${game.winning_cells.includes(i)?'winning':''}`} aria-label={`Square ${i+1}: ${mark||'empty'}`}>{content}</div>;
  })}</div>;
}
