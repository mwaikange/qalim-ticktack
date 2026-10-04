import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { Game } from '../src/lib/game';
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
    await assert.rejects(db.query('select public.make_move($1,5)',[g.id]),/not accepting/);
    const own=await rpc<{history:Game[];stats:{wins:number}}>('public.get_snapshot()');assert.equal(own.history[0].id,g.id);assert.equal(own.stats.wins,1);
    await as(b);const other=await rpc<{stats:{losses:number}}>('public.get_snapshot()');assert.equal(other.stats.losses,1);
    await as(c);const outsider=await rpc<{history:Game[]}>('public.get_snapshot()');assert.equal(outsider.history.length,0);
    await as(a);const cancelled=await rpc<Game>('public.create_challenge()');await rpc('public.cancel_challenge($1)',[cancelled.id]);await as(b);await assert.rejects(db.query('select public.join_challenge($1)',[cancelled.id]),/cancelled/);
    await as(a);const draw=await rpc<Game>('public.create_challenge()');await as(b);await rpc('public.join_challenge($1)',[draw.id]);
    let result:Game|null=null;for(const [i,cell] of [0,1,2,4,3,5,7,6,8].entries()){await as(i%2?b:a);result=await rpc<Game>('public.make_move($1,$2)',[draw.id,cell]);}
    assert.equal(result?.finish_reason,'draw');assert.equal(result?.winner_id,null);
    await as(a);const resigned=await rpc<Game>('public.create_challenge()');await as(b);await rpc('public.join_challenge($1)',[resigned.id]);await as(a);await rpc('public.resign_game($1)',[resigned.id]);const recap=await rpc<{history:Game[]}>('public.get_snapshot()');assert.equal(recap.history[0].finish_reason,'resignation');assert.equal(recap.history[0].winner_id,b);
  } finally {await db.close();}
});
