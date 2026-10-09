import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {LocalStore} from '../src/lib/local-store';
test('public challenger count exposes only the registration total, without opening account tables',async()=>{
  const db=new PGlite();try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public to anon;grant usage on schema auth,public to authenticated;create publication supabase_realtime;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/202610040001_ticktack.sql',import.meta.url),'utf8'));
    const migration=readFileSync(new URL('../supabase/migrations/202610090005_challenger_count.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
    const total=async()=>Number((await db.query<{total:number}>('select public.get_challenger_count() total')).rows[0].total);
    await db.exec('set role anon');assert.equal(await total(),0);
    await assert.rejects(db.query('select * from public.profiles'),/permission denied/);
    await assert.rejects(db.query('select * from auth.users'),/permission denied/);await db.exec('reset role');
    const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
    for(const id of ids)await db.query('insert into auth.users values($1,$2)',[id,JSON.stringify({username:'Challenger'})]);
    await db.exec('set role anon');assert.equal(await total(),2);await db.exec('reset role');
    await db.query('delete from auth.users where id=$1',[ids[0]]);await db.exec('set role authenticated');assert.equal(await total(),1);
  }finally{await db.close();}
});
test('localhost counts registered users rather than sessions, online players or matches',()=>{
  const db=new LocalStore(':memory:');try{
    assert.equal(db.challengerCount(),0);db.register('count@example.test','password123','Count');assert.equal(db.challengerCount(),1);
    db.login('count@example.test','password123');db.login('count@example.test','password123');assert.equal(db.challengerCount(),1);
    db.register('count2@example.test','password123','Count Two');assert.equal(db.challengerCount(),2);
  }finally{db.db.close();}
});
