import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { move, type Game, type Bomb } from '../src/lib/game';
test('PostgreSQL migration: authentication, atomic lifecycle, move validation, RLS and private results',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated;
      create publication supabase_realtime;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/202610040001_ticktack.sql',import.meta.url),'utf8'));
    const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
    for(const [id,name] of [[a,'Alice'],[b,'Bob'],[c,'Charlie']])await db.query('insert into auth.users values($1,$2)',[id,JSON.stringify({username:name})]);
    await assert.rejects(db.query('select public.create_challenge()'),/sign in/);
    async function as(id:string){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
    async function rpc<T>(sql:string,args:unknown[]=[]){return (await db.query<{value:T}>(`select to_jsonb(${sql}) as value`,args)).rows[0].value;}
    await as(a);const g=await rpc<Game>('public.create_challenge()');assert.equal(g.status,'waiting');
    await assert.rejects(db.query('select public.create_challenge()'),/current match/);
    await assert.rejects(db.query('select public.join_challenge($1)',[g.id]));
    await as(b);await assert.rejects(db.query('select public.cancel_challenge($1)',[g.id]),/creator/);await rpc('public.join_challenge($1)',[g.id]);
    await as(c);await assert.rejects(db.query('select public.join_challenge($1)',[g.id]),/already joined/);await assert.rejects(db.query('select public.make_move($1,0)',[g.id]),/not a player/);
    await db.exec('set role authenticated');assert.equal((await db.query('select * from public.games')).rows.length,0);await assert.rejects(db.query("update public.games set status='finished'"),/permission denied/);await db.exec('reset role');
    await as(b);await assert.rejects(db.query('select public.make_move($1,0)',[g.id]),/turn/);
    await as(a);await assert.rejects(db.query('select public.make_move($1,9)',[g.id]),/valid square/);await rpc('public.make_move($1,0)',[g.id]);
    await assert.rejects(db.query('select public.make_move($1,1)',[g.id]),/turn/);
    await as(b);await assert.rejects(db.query('select public.make_move($1,0)',[g.id]),/occupied/);await rpc('public.make_move($1,3)',[g.id]);
    await as(a);await rpc('public.make_move($1,1)',[g.id]);await as(b);await rpc('public.make_move($1,4)',[g.id]);await as(a);
    const won=await rpc<Game>('public.make_move($1,2)',[g.id]);assert.equal(won.winner_id,a);assert.deepEqual(won.winning_cells,[0,1,2]);assert.equal(won.status,'finished');
    await db.exec(readFileSync(new URL('../supabase/migrations/202610040002_bombs.sql',import.meta.url),'utf8'));
    const preserved=await db.query<Game>('select * from public.games where id=$1',[g.id]);assert.equal(preserved.rows[0].move_count,5);assert.deepEqual(preserved.rows[0].board,won.board);assert.equal(preserved.rows[0].winner_id,a);
    await assert.rejects(db.query('select public.make_move($1,5)',[g.id]),/not accepting/);
    const own=await rpc<{history:Game[];stats:{wins:number}}>('public.get_snapshot()');assert.equal(own.history[0].id,g.id);assert.equal(own.stats.wins,1);
    await as(b);const other=await rpc<{stats:{losses:number}}>('public.get_snapshot()');assert.equal(other.stats.losses,1);
    await as(c);const outsider=await rpc<{history:Game[]}>('public.get_snapshot()');assert.equal(outsider.history.length,0);
    await as(a);const cancelled=await rpc<Game>('public.create_challenge()');await rpc('public.cancel_challenge($1)',[cancelled.id]);await as(b);await assert.rejects(db.query('select public.join_challenge($1)',[cancelled.id]),/cancelled/);
    await as(a);const draw=await rpc<Game>('public.create_challenge()');await as(b);await rpc('public.join_challenge($1)',[draw.id]);
    let result:Game|null=null;for(const [i,cell] of [0,1,2,4,3,5,7,6,8].entries()){await as(i%2?b:a);result=await rpc<Game>('public.make_move($1,$2)',[draw.id,cell]);}
    assert.equal(result?.finish_reason,'draw');assert.equal(result?.winner_id,null);
    await as(a);const resigned=await rpc<Game>('public.create_challenge()');await as(b);await rpc('public.join_challenge($1)',[resigned.id]);await as(a);await rpc('public.resign_game($1)',[resigned.id]);const recap=await rpc<{history:Game[]}>('public.get_snapshot()');assert.equal(recap.history[0].finish_reason,'resignation');assert.equal(recap.history[0].winner_id,b);
    await as(a);const bombGame=await rpc<Game>('public.create_bomb_challenge()');assert.equal(bombGame.board.length,16);assert.equal(bombGame.mode,'bombs');assert.deepEqual(bombGame.bomb_events,[]);
    const bombs:Bomb[]=[{cell:5,type:'opponent'},{cell:10,type:'both'}];
    await db.query('delete from public.game_bombs where game_id=$1',[bombGame.id]);
    for(const bomb of bombs)await db.query('insert into public.game_bombs(game_id,cell,type) values($1,$2,$3)',[bombGame.id,bomb.cell,bomb.type]);
    await db.exec('set role authenticated');await assert.rejects(db.query('select * from public.game_bombs'),/permission denied/);await db.exec('reset role');
    await as(b);let expected=await rpc<Game>('public.join_challenge($1)',[bombGame.id]);
    for(const [index,cell] of [0,4,1,6,5,8,2,9,10,4,0,8,1,12,3].entries()){
      const id=index%2?b:a;await as(id);expected=move(expected,id,cell,bombs);
      const actual=await rpc<Game>('public.make_move($1,$2)',[bombGame.id,cell]);
      for(const key of ['board','current_turn','move_order','move_count','bomb_events','status','winner_id','winning_cells'] as const)assert.deepEqual(actual[key],expected[key],`SQL/JS mismatch for ${key} on turn ${index+1}`);
    }
    assert.equal(expected.move_count,15);assert.equal(expected.winner_id,a);assert.deepEqual(expected.winning_cells,[0,1,2,3]);assert.equal(expected.bomb_events?.length,2);
    const bombHistory=await rpc<{history:Game[]}>('public.get_snapshot()');assert.equal(bombHistory.history[0].bomb_events?.length,2);
    await as(a);const repeat=await rpc<Game>('public.create_bomb_challenge()');await db.query('delete from public.game_bombs where game_id=$1',[repeat.id]);await db.query("insert into public.game_bombs(game_id,cell,type) values($1,10,'both')",[repeat.id]);
    await as(b);await rpc('public.join_challenge($1)',[repeat.id]);await as(a);const cleared=await rpc<Game>('public.make_move($1,10)',[repeat.id]);assert.equal(cleared.board[10],'');
    await as(b);const reused=await rpc<Game>('public.make_move($1,10)',[repeat.id]);assert.equal(reused.board[10],'O');assert.equal(reused.bomb_events?.length,1);
  } finally {await db.close();}
});
