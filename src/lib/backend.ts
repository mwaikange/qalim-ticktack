import { createClient } from '@supabase/supabase-js';
import type { Game, Player } from './game';
import type { Snapshot } from './local-store';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const isSupabase = !!(url && key);
export const supabase = isSupabase ? createClient(url!, key!) : null;
async function local(body?: object) {
  const response=await fetch('/api/local',{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await response.json(); if(!response.ok) throw new Error(data.error || 'Unable to connect. Try again.'); return data;
}
export async function identity(): Promise<Player | null> {
  if(!supabase) {try{return (await local()).user;}catch{return null;}}
  const {data,error}=await supabase.auth.getUser();
  if(error||!data.user)return null;
  const {data:profile,error:profileError}=await supabase.from('profiles').select('id,username').eq('id',data.user.id).single();
  if(profileError)throw new Error('Your profile is unavailable. Check the database migration.');
  return profile;
}
export async function authenticate(register: boolean, email: string, password: string, username: string) {
  if(!supabase)return (await local({action:register?'register':'login',email,password,username})).user as Player;
  const result=register?await supabase.auth.signUp({email,password,options:{data:{username}}}):await supabase.auth.signInWithPassword({email,password});
  if(result.error)throw new Error(result.error.message);
  if(!result.data.session)throw new Error('Account created. Check your email to confirm it, then sign in.');
  return identity();
}
export async function signOut() {if(supabase){const {error}=await supabase.auth.signOut();if(error)throw error;}else await local({action:'logout'});}
export async function snapshot(user: Player, onlineIds: string[] = []): Promise<Snapshot> {
  if(!supabase)return local();
  const q=await supabase.rpc('get_snapshot');if(q.error)throw new Error(q.error.message);
  return { ...q.data, user, onlineIds };
}
export async function act(action: 'create'|'join'|'move'|'cancel'|'resign', gameId?: string, cell?: number): Promise<Game | null> {
  if(!supabase)return (await local({action,gameId,cell})).game;
  const functions={create:'create_challenge',join:'join_challenge',move:'make_move',cancel:'cancel_challenge',resign:'resign_game'};
  const args=action==='create'?{}:action==='move'?{p_game_id:gameId,p_cell:cell}:{p_game_id:gameId};
  const {data,error}=await supabase.rpc(functions[action],args);if(error)throw new Error(error.message);return data;
}
export function subscribe(user: Player, onUpdate: () => void, onConnection: (connected: boolean) => void, onPresence: (ids: string[]) => void) {
  if(!supabase){const stream=new EventSource('/api/local?stream=1');stream.onopen=()=>{onConnection(true);onUpdate();};stream.onmessage=()=>onUpdate();stream.onerror=()=>onConnection(false);return()=>stream.close();}
  const channel=supabase.channel('qalim-lobby',{config:{presence:{key:user.id}}})
    .on('postgres_changes',{event:'*',schema:'public',table:'games'},onUpdate)
    .on('presence',{event:'sync'},()=>onPresence(Object.keys(channel.presenceState())))
    .subscribe(async status=>{onConnection(status==='SUBSCRIBED');if(status==='SUBSCRIBED'){await channel.track({id:user.id});onUpdate();}});
  return()=>{void supabase!.removeChannel(channel);};
}
