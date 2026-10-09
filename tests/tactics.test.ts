import {test} from 'node:test';
import assert from 'node:assert/strict';
import {move,emptyTactics,pressure,story,type Game,type Tactic} from '../src/lib/game';
import {LocalStore} from '../src/lib/local-store';
const fresh=():Game=>({id:'tactics',player_x_id:'x',player_o_id:'o',player_x_name:'Alice',player_o_name:'Bob',status:'playing',board:Array(16).fill(''),current_turn:'O',winner_id:null,winning_cells:[],created_at:'',updated_at:'',finished_at:null,finish_reason:null,mode:'tactics',move_order:[],move_count:0,tactics:emptyTactics()});
const play=(g:Game,cell:number,tactic:Tactic='place')=>move(g,g.current_turn==='X'?'x':'o',cell,[],tactic);
test('capture replaces a rival mark and spends the single power; shield prevents capture',()=>{
  let g=play(fresh(),0);g=play(g,0,'capture');assert.equal(g.board[0],'X');assert.deepEqual(g.move_order,[0]);assert.equal(g.tactics?.used.X,true);
  g=play(g,1,'shield');assert.throws(()=>play(g,1,'capture'),/already been spent/);assert.throws(()=>play(g,2,'shield'),/already been spent/);
  const h=play(fresh(),0,'shield');assert.throws(()=>play(h,0,'capture'),/shielded/);assert.throws(()=>play(h,1,'capture'),/opponent/);assert.equal(h.tactics?.used.X,false);
  assert.throws(()=>move(h,'outsider',1),/not a player/);assert.throws(()=>move(h,'o',1),/turn/);assert.throws(()=>play(h,-1),/valid square/);
});
test('oldest marks expire before victory, including shields; capture can complete a line',()=>{
  let g=fresh();for(const [i,cell] of [0,4,1,6,2,9,5,11,3].entries())g=play(g,cell,i===0?'shield':'place');
  assert.equal(g.board[0],'');assert.equal(g.board[3],'O');assert.equal(g.status,'playing');assert.deepEqual(g.tactics?.shields,[]);assert.equal(g.board.filter(m=>m==='O').length,4);assert.equal(g.tactics?.events.at(-1)?.type,'fade');
  g=fresh();for(const cell of [0,3,1,4,2,6])g=play(g,cell);g=play(g,3,'capture');assert.equal(g.winner_id,'o');assert.deepEqual(g.winning_cells,[0,1,2,3]);
});
test('pressure counts only unblocked threats; move 40 can award the nonmover and ties draw',()=>{
  let g=fresh();g.board[0]=g.board[1]=g.board[2]='O';assert.equal(pressure(g.board,'O'),3);g.board[3]='X';assert.equal(pressure(g.board,'O'),0);
  g=fresh();g.current_turn='X';g.move_count=39;g.board[0]=g.board[1]=g.board[2]='O';g.move_order=[0,1,2];g=play(g,14);assert.equal(g.winner_id,'o');assert.equal(g.finish_reason,'pressure');assert.match(story(g),/Bob won; Alice lost/);
  g=fresh();g.current_turn='X';g.move_count=39;g=play(g,14);assert.equal(g.winner_id,null);assert.equal(g.finish_reason,'draw');assert.match(story(g),/Equal pressure/);
});
test('local multiplayer saves tactics, starts with joiner, rejects invalid moves atomically and keeps history',()=>{
  const db=new LocalStore(':memory:');try{
    const x=db.register('tx@example.test','password123','Alice').user,o=db.register('to@example.test','password123','Bob').user;
    const g=db.create(x,'tactics');db.join(o,g.id);assert.equal(db.game(g.id).current_turn,'O');assert.throws(()=>db.play(x,g.id,0),/turn/);
    db.play(o,g.id,0,'shield');assert.deepEqual(db.snapshot(x).active?.tactics?.shields,[0]);assert.throws(()=>db.play(x,g.id,0,'capture'),/shielded/);assert.equal(db.game(g.id).move_count,1);
    db.play(x,g.id,3);db.play(o,g.id,1);db.play(x,g.id,4);db.play(o,g.id,2);db.play(x,g.id,6);db.play(o,g.id,5);db.play(x,g.id,7,'shield');
    db.resign(x,g.id);assert.equal(db.snapshot(o).stats.wins,1);assert.equal(db.snapshot(x).history[0].tactics?.events.length,2);
  }finally{db.db.close();}
});
