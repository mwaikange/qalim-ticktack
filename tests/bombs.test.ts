import {test} from 'node:test';
import assert from 'node:assert/strict';
import {move,outcome,movesPlayed,story,type Game,type Mark} from '../src/lib/game';
import {LocalStore} from '../src/lib/local-store';
const game=():Game=>({id:'bombs',player_x_id:'x',player_o_id:'o',player_x_name:'X player',player_o_name:'O player',status:'playing',board:Array(16).fill(''),current_turn:'X',winner_id:null,winning_cells:[],created_at:'',updated_at:'',finished_at:null,finish_reason:null,mode:'bombs',move_order:[],move_count:0,bomb_events:[]});
test('4 by 4 requires four marks, across every row, column and diagonal',()=>{
  const lines=[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12,13,14,15],[0,4,8,12],[1,5,9,13],[2,6,10,14],[3,7,11,15],[0,5,10,15],[3,6,9,12]];
  for(const cells of lines){const board:Mark[]=Array(16).fill('');cells.slice(0,3).forEach(cell=>board[cell]='X');assert.equal(outcome(board).winner,'');board[cells[3]]='X';assert.deepEqual(outcome(board).cells,cells);}
  assert.throws(()=>move(game(),'x',16),/valid square/);
});
test('oldest marks are cleared, explosions are one-shot, and played moves include cleared marks',()=>{
  const bombs=[{cell:5,type:'opponent'},{cell:10,type:'both'}] as const;let current=game();
  for(const [index,cell] of [0,4,1,6,5,8,2,9,10,4,0,8,1,12,3].entries())current=move(current,index%2?'o':'x',cell,[...bombs]);
  assert.deepEqual(current.bomb_events?.[0].removed,[4,6]);assert.deepEqual(current.bomb_events?.[1].removed,[0,1,8,9]);
  assert.equal(movesPlayed(current),15);assert.equal(current.winner_id,'x');assert.match(story(current),/four in a row in 15 moves/);
  const first=move(game(),'x',10,[{cell:10,type:'both'}]);assert.equal(first.board[10],'');
  const second=move(first,'o',10,[{cell:10,type:'both'}]);assert.equal(second.board[10],'O');assert.equal(second.bomb_events?.length,1);
});
test('local bomb positions stay outside snapshots, with matching atomic server resets',()=>{
  const db=new LocalStore(':memory:');try{
    const x=db.register('x@example.test','password123','X player').user;const o=db.register('o@example.test','password123','O player').user;
    const created=db.create(x,'bombs');const secrets=db.db.prepare('select cell,type from game_bombs where game_id=?').all(created.id);
    assert.equal(secrets.length,2);assert.equal(new Set(secrets.map(item=>item.cell)).size,2);assert.deepEqual(created.bomb_events,[]);
    assert.equal('game_bombs' in db.snapshot(x).active!,false);assert.equal('metadata' in db.snapshot(x).active!,false);
    db.db.prepare('delete from game_bombs where game_id=?').run(created.id);db.db.prepare('insert into game_bombs values(?,?,?)').run(created.id,10,'both');db.join(o,created.id);
    const cleared=db.play(x,created.id,10);assert.equal(cleared.board[10],'');assert.equal(cleared.bomb_events?.length,1);
    assert.throws(()=>db.play(x,created.id,10),/turn/);assert.equal(db.game(created.id).move_count,1);
    assert.equal(db.play(o,created.id,10).board[10],'O');assert.equal(db.game(created.id).bomb_events?.length,1);
  }finally{db.db.close();}
});
