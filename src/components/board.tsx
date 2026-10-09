import type { Game, Tactic } from '@/lib/game';
import { Bomb, Shield } from 'lucide-react';
export function Board({game,onMove,disabled=false,small=false,tactic='place',userMark}:{game:Game;onMove?:(cell:number)=>void;disabled?:boolean;small?:boolean;tactic?:Tactic;userMark?:'X'|'O'}){
  const size=game.board.length===16?4:3;
  const oldest=game.mode==='tactics'&&userMark&&(game.move_order||[]).filter(i=>game.board[i]===userMark);
  const fading=oldest&&oldest.length===4?oldest[0]:-1;
  return <div className={'board '+(size===4?'bomb-board ':'')+(small?'mini-board':'')} style={{gridTemplateColumns:'repeat('+size+',1fr)'}} role="group" aria-label={game.mode==='tactics'?'Tactics XO board':size===4?'4 by 4 bomb board':'Tic-tac-toe board'}>{game.board.map((mark,i)=>{
    const exploded=game.bomb_events?.find(event=>event.cell===i);
    const shielded=game.mode==='tactics'&&game.tactics?.shields.includes(i);
    const legal=tactic==='capture'?!!mark&&mark!==userMark&&!shielded:!mark;
    const classes='square '+mark.toLowerCase()+' '+(game.winning_cells.includes(i)?'winning ':'')+(i===fading?'fading-mark ':'')+(tactic==='capture'&&legal?'capture-target':'');
    const content=<>{mark&&<span>{mark==='X'?'×':'○'}</span>}{shielded&&<span className="shield-marker" title="Protected from capture"><Shield size={small?8:13}/></span>}{i===fading&&!small&&<small className="fade-label">NEXT OUT</small>}{exploded&&!small&&<span className={'bomb-marker bomb-'+exploded.type} title={exploded.type==='both'?'Double reset used':'Rival reset used'}><Bomb size={12}/></span>}</>;
    const label='Row '+(Math.floor(i/size)+1)+', column '+(i%size+1)+': '+(mark||'empty')+(shielded?', shielded':'')+(i===fading?', fades on your next move':'');
    return onMove?<button key={i} className={classes} disabled={disabled||!legal} aria-label={label} onClick={()=>onMove(i)}>{content}</button>:<div key={i} className={classes} aria-label={label}>{content}</div>;
  })}</div>;
}
