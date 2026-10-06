import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expoRequest,pushCopy,recipientMatches,stalePush,ticketResults,type PushGame } from '../supabase/functions/push-challenges/logic';
const game:PushGame={id:'game',player_x_id:'creator',player_o_id:'joiner',player_x_name:'Alice',player_o_name:'Bob',status:'waiting'};
test('challenge copy and audiences: everyone except creator, acceptance only creator',()=>{
  assert.equal(pushCopy('created',game),'Alice has created a challenge, up for it?');
  assert.equal(pushCopy('accepted',game),'Bob has accepted your challenge, log in and play!');
  for(const user of ['creator','joiner','spectator']){
    assert.equal(recipientMatches('created',game,user),user!=='creator');
    assert.equal(recipientMatches('accepted',game,user),user==='creator');
  }
});
test('stale or cancelled challenges are not advertised and finished games are not recalled',()=>{
  const now=Date.now(),recent=new Date(now-1000).toISOString();
  assert.equal(stalePush('created',game,recent,now),false);
  assert.equal(stalePush('created',{...game,status:'playing'},recent,now),true);
  assert.equal(stalePush('created',game,new Date(now-301000).toISOString(),now),true);
  assert.equal(stalePush('accepted',{...game,status:'playing'},recent,now),false);
  assert.equal(stalePush('accepted',{...game,status:'finished'},recent,now),true);
});
test('Expo tickets retain receipt token associations and remove unregistered devices',()=>{
  assert.deepEqual(ticketResults(['a','b'],[{status:'ok',id:'receipt-a'},{status:'error',details:{error:'DeviceNotRegistered'}}]),{receipts:[{id:'receipt-a',token:'a'}],invalid:['b']});
  assert.throws(()=>ticketResults(['a'],[]),/incomplete/);
  assert.throws(()=>ticketResults(['a'],[{status:'error',details:{error:'InvalidCredentials'}}]),/InvalidCredentials/);
});
test('Expo network worker retries rate limits but stops on invalid credentials requests',async()=>{
  const original=globalThis.fetch;let count=0;
  try{
    globalThis.fetch=async()=>{count++;return count===1?new Response('',{status:429}):Response.json({data:[{status:'ok',id:'receipt'}]});};
    assert.deepEqual(await expoRequest('send',[{to:'token'}]),[{status:'ok',id:'receipt'}]);assert.equal(count,2);
    count=0;globalThis.fetch=async()=>{count++;return new Response('',{status:400});};
    await assert.rejects(expoRequest('send',[]),/rejected/);assert.equal(count,1);
  }finally{globalThis.fetch=original;}
});
