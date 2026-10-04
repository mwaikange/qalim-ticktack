import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordResetRedirect, recoveryCallbackRedirect, preparePasswordReset, savePassword } from '../src/lib/password-reset';
const verified = {getUser:async()=>({data:{user:{id:'player'}},error:null}),exchangeCodeForSession:async()=>({error:null})};
test('dashboard recovery links at the site root go to password reset with their tokens intact',()=>{
  const hash='#access_token=example&refresh_token=refresh&type=recovery';
  assert.equal(recoveryCallbackRedirect('https://qalim-ticktack.vercel.app/'+hash),'https://qalim-ticktack.vercel.app/auth/reset-password'+hash);
  assert.equal(recoveryCallbackRedirect('https://qalim-ticktack.vercel.app/#type=signup'),null);
  assert.equal(recoveryCallbackRedirect('https://qalim-ticktack.vercel.app/'),null);
});
test('password emails return to the reset page on the current site',()=>{
  assert.equal(passwordResetRedirect('https://qalim-ticktack.vercel.app'),'https://qalim-ticktack.vercel.app/auth/reset-password');
  assert.equal(passwordResetRedirect('http://127.0.0.1:3000'),'http://127.0.0.1:3000/auth/reset-password');
});
test('a valid recovery link requires a verified session',async()=>{
  const link='https://qalim-ticktack.vercel.app/auth/reset-password#type=recovery&access_token=example';
  await preparePasswordReset(verified,link);
  await assert.rejects(preparePasswordReset({...verified,getUser:async()=>({data:{user:null},error:null})},link));
  await assert.rejects(preparePasswordReset(verified,'https://qalim-ticktack.vercel.app/auth/reset-password'),/Open the password reset link/);
  await assert.rejects(preparePasswordReset(verified,link.replace('recovery','signup')),/Open the password reset link/);
});
test('expired recovery links do not accept an existing session; code links exchange once',async()=>{
  await assert.rejects(preparePasswordReset(verified,'https://qalim-ticktack.vercel.app/auth/reset-password#error=access_denied&error_description=Link+expired'),/Link expired/);
  const calls:string[]=[];
  await preparePasswordReset({...verified,exchangeCodeForSession:async(code)=>{calls.push(code);return {error:null};}},'https://qalim-ticktack.vercel.app/auth/reset-password?code=reset-code');
  assert.deepEqual(calls,['reset-code']);
});
test('password save rejects invalid input before making an update and reports server errors',async()=>{
  const calls:string[]=[];const auth={updateUser:async({password}:{password:string})=>{calls.push(password);return {error:null};}};
  await assert.rejects(savePassword(auth,'short','short'),/between 8 and 128/);
  await assert.rejects(savePassword(auth,'a'.repeat(129),'a'.repeat(129)),/between 8 and 128/);
  await assert.rejects(savePassword(auth,'long-password','different-password'),/do not match/);
  assert.deepEqual(calls,[]);
  await savePassword(auth,'new-password','new-password');assert.deepEqual(calls,['new-password']);
  await assert.rejects(savePassword({updateUser:async()=>({error:{message:'Session expired'}})},'new-password','new-password'),/Session expired/);
});
