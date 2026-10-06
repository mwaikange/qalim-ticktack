import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Game } from '../src/lib/game';
test('push upgrade: O joins and immediately moves first; event deduplication and private device registration',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
    for(const name of ['202610040001_ticktack.sql','202610040002_bombs.sql'])await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
    const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333';
    for(const [id,name] of [[a,'Alice'],[b,'Bob'],[c,'Charlie']])await db.query('insert into auth.users values($1,$2)',[id,JSON.stringify({username:name})]);
    async function as(id:string){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
    async function rpc(sql:string,args:unknown[]=[]){return (await db.query<{value:Game}>(`select to_jsonb(${sql}) as value`,args)).rows[0].value;}
    await as(a);const old=await rpc('public.create_challenge()');await as(b);await rpc('public.join_challenge($1)',[old.id]);
    await as(a);await rpc('public.make_move($1,0)',[old.id]);await as(b);const before=await rpc('public.make_move($1,3)',[old.id]);
    const upgrade=readFileSync(new URL('../supabase/migrations/202610060003_push_and_joiner_first.sql',import.meta.url),'utf8');
    await db.exec(upgrade);await db.exec(upgrade);
    const preserved=(await db.query<Game>('select * from public.games where id=$1',[old.id])).rows[0];
    assert.equal(preserved.current_turn,before.current_turn);assert.deepEqual(preserved.board,before.board);
    assert.equal((await db.query('select * from public.push_events')).rows.length,0);
    await as(a);await rpc('public.resign_game($1)',[old.id]);
    const classic=await rpc('public.create_challenge()');await as(b);const joined=await rpc('public.join_challenge($1)',[classic.id]);assert.equal(joined.current_turn,'O');
    await as(c);await assert.rejects(rpc('public.join_challenge($1)',[classic.id]),/already joined/);
    await as(a);await assert.rejects(rpc('public.make_move($1,0)',[classic.id]),/turn/);
    let result:Game=joined;
    for(const [index,cell] of [0,3,1,4,2].entries()){await as(index%2?a:b);result=await rpc('public.make_move($1,$2)',[classic.id,cell]);}
    assert.equal(result.winner_id,b);assert.equal(result.board[0],'O');
    assert.deepEqual((await db.query<{kind:string}>('select kind from public.push_events where game_id=$1 order by kind',[classic.id])).rows.map(row=>row.kind),['accepted','created']);
    await as(a);const bomb=await rpc('public.create_bomb_challenge()');await as(b);assert.equal((await rpc('public.join_challenge($1)',[bomb.id])).current_turn,'O');
    assert.equal((await rpc('public.make_move($1,0)',[bomb.id])).move_count,1);
    const token='ExpoPushToken[device-123]';
    await db.exec('set role authenticated');await assert.rejects(db.query('select * from public.push_devices'),/permission denied/);
    await assert.rejects(db.query('select * from public.push_events'),/permission denied/);
    await assert.rejects(db.query("select public.register_push_device('invalid')"),/Invalid push token/);
    await db.query('select public.register_push_device($1)',[token]);await db.exec('reset role');
    assert.equal((await db.query<{user_id:string}>('select user_id from public.push_devices')).rows[0].user_id,b);
    await as(a);await db.query('select public.unregister_push_device($1)',[token]);assert.equal((await db.query('select * from public.push_devices')).rows.length,1);
    await db.query('select public.register_push_device($1)',[token]);assert.equal((await db.query<{user_id:string}>('select user_id from public.push_devices')).rows[0].user_id,a);
    await db.query('select public.unregister_push_device($1)',[token]);assert.equal((await db.query('select * from public.push_devices')).rows.length,0);
    await db.exec('set role anon');await assert.rejects(db.query('select public.register_push_device($1)',[token]),/permission denied/);
  }finally{await db.close();}
});
