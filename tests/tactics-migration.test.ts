import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {move,pressure,type Game,type Tactic} from '../src/lib/game';
test('Tactics SQL preserves old games, enforces powers and matches JS across seeded multiplayer games',async()=>{
  const db=new PGlite();try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated;grant execute on function auth.uid() to authenticated;create publication supabase_realtime;`);
    for(const name of ['202610040001_ticktack.sql','202610040002_bombs.sql','202610060003_push_and_joiner_first.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
    const x='11111111-1111-4111-8111-111111111111',o='22222222-2222-4222-8222-222222222222';
    for(const [id,username]of [[x,'Alice'],[o,'Bob']])await db.query('insert into auth.users values($1,$2)',[id,JSON.stringify({username})]);
    const as=async(id:string)=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
    const rpc=async(sql:string,args:unknown[]=[])=>(await db.query<{g:Game}>('select to_jsonb('+sql+') as g',args)).rows[0].g;
    await as(x);const classic=await rpc('public.create_challenge()');await as(o);await rpc('public.join_challenge($1)',[classic.id]);const before=await rpc('public.make_move($1,0)',[classic.id]);
    const sql=readFileSync(new URL('../supabase/migrations/202610090004_tactics.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
    const after=(await db.query<Game>('select * from public.games where id=$1',[classic.id])).rows[0];assert.deepEqual(after.board,before.board);assert.equal(after.current_turn,before.current_turn);
    await as(x);await rpc('public.resign_game($1)',[classic.id]);
    // Test invalid requests under the same restricted role as the production client.
    await db.exec('set role authenticated');
    await as(x);const guarded=await rpc('public.create_tactics_challenge()');await as(o);await rpc('public.join_challenge($1)',[guarded.id]);
    await rpc('public.make_tactics_move($1,0,$2)',[guarded.id,'shield']);await as(x);
    await assert.rejects(rpc('public.make_tactics_move($1,0,$2)',[guarded.id,'capture']),/shielded/);
    await assert.rejects(rpc('public.make_tactics_move($1,16,$2)',[guarded.id,'place']),/valid square/);
    await assert.rejects(rpc('public.make_tactics_move($1,1,$2)',[guarded.id,'unknown']),/valid tactic/);
    await rpc('public.make_move($1,4)',[guarded.id]);await as(o);
    await assert.rejects(rpc('public.make_tactics_move($1,4,$2)',[guarded.id,'capture']),/already been spent/);
    await rpc('public.resign_game($1)',[guarded.id]);await db.exec('reset role');
    let seed=7621;const random=(n:number)=>{seed=(seed*1664525+1013904223)>>>0;return seed%n;};let caps=0,captures=0,shields=0;
    for(let match=0;match<24;match++){
      await as(x);let g=await rpc('public.create_tactics_challenge()');await as(o);g=await rpc('public.join_challenge($1)',[g.id]);assert.equal(g.current_turn,'O');
      await as(x);await assert.rejects(rpc('public.make_tactics_move($1,0)',[g.id]),/turn/);
      while(g.status==='playing'){
        const mark=g.current_turn,id=mark==='X'?x:o,rival=mark==='X'?'O':'X';await as(id);
        let tactic:Tactic='place';const empty=g.board.flatMap((m,i)=>m?[]:[i]);const targets=g.board.flatMap((m,i)=>m===rival&&!g.tactics!.shields.includes(i)?[i]:[]);
        if(!g.tactics!.used[mark]&&random(3)===0){tactic=targets.length&&random(2)===0?'capture':'shield';}
        const choices=tactic==='capture'?targets:empty,cell=choices[random(choices.length)];
        const expected=move(g,id,cell,[],tactic);
        // Exercise old RPC routing too, so it cannot bypass expiry or the turn limit.
        const legacy=tactic==='place'&&random(2)===0;
        const next=await rpc(legacy?'public.make_move($1,$2)':'public.make_tactics_move($1,$2,$3)',legacy?[g.id,cell]:[g.id,cell,tactic]);
        for(const key of ['board','move_order','move_count','tactics','current_turn','status','winner_id','winning_cells','finish_reason'] as const)assert.deepEqual(next[key],expected[key],key);
        assert.equal((await db.query<{n:number}>('select public.tactics_pressure($1,$2) n',[next.board,'X'])).rows[0].n,pressure(next.board,'X'));
        captures+=Number(tactic==='capture');shields+=Number(tactic==='shield');g=next;
      }
      caps+=Number(g.move_count===40);
    }
    assert.ok(caps>0&&captures>0&&shields>0);
    await db.exec('set role anon');await assert.rejects(rpc('public.create_tactics_challenge()'),/permission denied/);
  }finally{await db.close();}
});
