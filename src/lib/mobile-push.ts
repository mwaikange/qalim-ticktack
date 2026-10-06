import { supabase } from './backend';

type NativeWindow = Window & { ReactNativeWebView?: { postMessage(message:string):void } };
const TOKEN_KEY='qalim-expo-push-token';
let signingOut=false;
let pending:Promise<unknown>=Promise.resolve();
export function beginPushSession(){signingOut=false;}
function serialize<T>(operation:()=>Promise<T>):Promise<T>{
  const result=pending.then(operation);pending=result.catch(()=>{});return result;
}
export function nativeMessage(message:object) {
  (window as NativeWindow).ReactNativeWebView?.postMessage(JSON.stringify(message));
}
export function storedPushToken() { return localStorage.getItem(TOKEN_KEY); }
export async function registerPushToken(token:string) {
  return serialize(async()=>{
    if(signingOut||!supabase||!/^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]+\]$/.test(token))return;
    const {error}=await supabase.rpc('register_push_device',{p_token:token});
    if(error)throw new Error('Challenge alerts could not be enabled. Please try again later.');
    localStorage.setItem(TOKEN_KEY,token);
  });
}
export async function detachPushToken(logout=true) {
  if(logout)signingOut=true;
  try{await serialize(async()=>{
    const token=storedPushToken();
    if(token&&supabase){
      const {error}=await supabase.rpc('unregister_push_device',{p_token:token});
      if(error)throw new Error('Could not disconnect this device’s alerts. Check your connection and try signing out again.');
    }
    localStorage.removeItem(TOKEN_KEY);
    if(logout)nativeMessage({type:'qalim-push-signout'});
  });}catch(error){signingOut=false;throw error;}
}
