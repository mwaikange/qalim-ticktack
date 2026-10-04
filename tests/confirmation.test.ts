import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmationRedirect,confirmEmail } from '../src/lib/confirmation';
const verified = {getUser:async()=>({data:{user:{id:'verified-player'}},error:null}),exchangeCodeForSession:async()=>({error:null})};
test('confirmation returns to the current site, including production and localhost',()=>{
  assert.equal(confirmationRedirect('https://qalim-ticktack.vercel.app'),'https://qalim-ticktack.vercel.app/auth/confirm');
  assert.equal(confirmationRedirect('http://127.0.0.1:3000'),'http://127.0.0.1:3000/auth/confirm');
});
test('confirmed session succeeds; a missing session never shows success',async()=>{
  await confirmEmail(verified,'https://qalim-ticktack.vercel.app/auth/confirm#access_token=example');
  await assert.rejects(confirmEmail({...verified,getUser:async()=>({data:{user:null},error:null})},'https://qalim-ticktack.vercel.app/auth/confirm'),/expired, or already used/);
});
test('expired links in hash or query surface their error',async()=>{
  for(const delimiter of ['#','?'])await assert.rejects(confirmEmail(verified,`https://qalim-ticktack.vercel.app/auth/confirm${delimiter}error=access_denied&error_description=Email+link+has+expired`),/Email link has expired/);
});
test('code callback exchanges before validating the user and handles exchange failures',async()=>{
  const calls:string[]=[];
  await confirmEmail({getUser:async()=>{calls.push('user');return verified.getUser();},exchangeCodeForSession:async(code)=>{calls.push(code);return {error:null};}},'https://qalim-ticktack.vercel.app/auth/confirm?code=confirmation-code');
  assert.deepEqual(calls,['confirmation-code','user']);
  await assert.rejects(confirmEmail({...verified,exchangeCodeForSession:async()=>({error:{message:'Invalid code'}})},'https://qalim-ticktack.vercel.app/auth/confirm?code=bad'),/Invalid code/);
});
