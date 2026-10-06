import { test } from 'node:test';
import assert from 'node:assert/strict';

test('device registration is serialized with logout so late tokens cannot reconnect a signed-out account',async()=>{
  const values=new Map<string,string>(),messages:string[]=[],calls:string[]=[];
  const originalFetch=globalThis.fetch;
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const originalUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,originalKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://push-test.invalid';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-key';
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{href:'https://qalim-ticktack.vercel.app/'},ReactNativeWebView:{postMessage:(message:string)=>messages.push(message)}}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
  globalThis.fetch=async(request)=>{
    calls.push(String(request));
    await new Promise(resolve=>setTimeout(resolve,15));
    return new Response('null',{headers:{'Content-Type':'application/json'}});
  };
  try{
    const push=await import('../src/lib/mobile-push');
    const token='ExpoPushToken[device-123]';
    push.beginPushSession();await push.registerPushToken(token);assert.equal(push.storedPushToken(),token);
    assert.ok(calls[0].endsWith('/rpc/register_push_device'));
    const logout=push.detachPushToken();const lateToken=push.registerPushToken(token);
    await Promise.all([logout,lateToken]);assert.equal(push.storedPushToken(),null);
    assert.equal(calls.filter(call=>call.endsWith('/rpc/register_push_device')).length,1);
    assert.equal(calls.filter(call=>call.endsWith('/rpc/unregister_push_device')).length,1);
    assert.equal(JSON.parse(messages[0]).type,'qalim-push-signout');
    push.beginPushSession();await push.registerPushToken(token);assert.equal(push.storedPushToken(),token);
    await push.detachPushToken(false);assert.equal(push.storedPushToken(),null);assert.equal(messages.length,1);
  }finally{
    globalThis.fetch=originalFetch;
    if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');
    if(originalStorage)Object.defineProperty(globalThis,'localStorage',originalStorage);else Reflect.deleteProperty(globalThis,'localStorage');
    if(originalUrl)process.env.NEXT_PUBLIC_SUPABASE_URL=originalUrl;else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if(originalKey)process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=originalKey;else delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
});
