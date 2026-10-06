import { createClient } from 'npm:@supabase/supabase-js@2';
import { expoRequest,pushCopy,stalePush,ticketResults,type Kind,type PushGame,type Ticket } from './logic.ts';

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const access=Deno.env.get('EXPO_ACCESS_TOKEN');
function checked<T>({data,error}:{data:T;error:unknown}):T{if(error)throw error;return data;}
function reply(body:object,status=200){return Response.json(body,{status});}

async function deliver(id:string){
  const cutoff=new Date(Date.now()-120000).toISOString();
  const job=checked(await db.from('push_events').update({state:'sending',updated_at:new Date().toISOString(),error:null})
    .eq('id',id).or(`state.eq.pending,state.eq.failed,and(state.eq.sending,updated_at.lt.${cutoff})`).select('*').maybeSingle());
  if(!job)return;
  try{
    const game=checked(await db.from('games').select('id,player_x_id,player_o_id,player_x_name,player_o_name,status').eq('id',job.game_id).single()) as PushGame;
    const kind=job.kind as Kind;
    if(!stalePush(kind,game,job.created_at)){
      let cursor=job.cursor_token;
      const fresh=new Date(Date.now()-90*86400000).toISOString();
      while(true){
        let query=db.from('push_devices').select('token').gt('token',cursor).gte('updated_at',fresh).order('token').limit(100);
        query=kind==='created'?query.neq('user_id',game.player_x_id):query.eq('user_id',game.player_x_id);
        const devices=checked(await query)??[];
        if(!devices.length)break;
        const tokens=devices.map(device=>device.token);
        const tickets=await expoRequest('send',tokens.map(token=>({to:token,title:'QALIM tickTack',body:pushCopy(kind,game),
          sound:'default',channelId:'challenges',priority:'high',ttl:kind==='created'?300:900,
          data:{kind,gameId:game.id},collapseId:`${game.id}:${kind}`,tag:`${game.id}:${kind}`,
        })),access) as Ticket[];
        const results=ticketResults(tokens,tickets);
        if(results.invalid.length)checked(await db.from('push_devices').delete().in('token',results.invalid));
        if(results.receipts.length)checked(await db.from('push_receipts').upsert(results.receipts,{onConflict:'id'}));
        cursor=tokens[tokens.length-1];
        checked(await db.from('push_events').update({cursor_token:cursor,updated_at:new Date().toISOString()}).eq('id',id));
        // Keep below Expo's 600 notifications per second limit for this project.
        await new Promise(resolve=>setTimeout(resolve,200));
      }
    }
    checked(await db.from('push_events').update({state:'sent',updated_at:new Date().toISOString()}).eq('id',id));
  }catch(error){
    console.error('Challenge push failed',id,error);
    checked(await db.from('push_events').update({state:'failed',error:String(error).slice(0,500),updated_at:new Date().toISOString()}).eq('id',id));
    throw error;
  }
}

async function receipts(){
  const cutoff=new Date(Date.now()-15*60000).toISOString();
  const pending=checked(await db.from('push_receipts').select('id,token,created_at').lt('created_at',cutoff).order('created_at').limit(1000))??[];
  if(!pending.length)return;
  const results=await expoRequest('getReceipts',{ids:pending.map(row=>row.id)},access) as Record<string,Ticket>;
  const done:string[]=[];const invalid:string[]=[];
  for(const row of pending){
    const result=results[row.id];
    if(result){
      done.push(row.id);
      if(result.details?.error==='DeviceNotRegistered')invalid.push(row.token);
      else if(result.status==='error')console.error('Expo receipt error',result.details?.error||result.message);
    }else if(Date.now()-Date.parse(row.created_at)>24*3600000)done.push(row.id);
  }
  if(invalid.length)checked(await db.from('push_devices').delete().in('token',invalid));
  if(done.length)checked(await db.from('push_receipts').delete().in('id',done));
}

Deno.serve(async request=>{
  const secret=Deno.env.get('PUSH_WEBHOOK_SECRET');
  if(!secret)return reply({error:'Push webhook secret is not configured.'},503);
  if(request.headers.get('x-webhook-secret')!==secret)return reply({error:'Unauthorized'},401);
  if(request.method!=='POST')return reply({error:'POST required'},405);
  try{
    const body=await request.json();
    if(body.action==='maintenance'){
      const cutoff=new Date(Date.now()-120000).toISOString();
      const jobs=checked(await db.from('push_events').select('id').or(`state.eq.pending,state.eq.failed,and(state.eq.sending,updated_at.lt.${cutoff})`).order('created_at').limit(10))??[];
      for(const job of jobs){try{await deliver(job.id);}catch{/* Retried on the next maintenance run. */}}
      await receipts();
      // Keep private event audit rows for 30 days.
      checked(await db.from('push_events').delete().eq('state','sent').lt('created_at',new Date(Date.now()-30*86400000).toISOString()));
    }else{
      if(body.type!=='INSERT'||body.schema!=='public'||body.table!=='push_events'||typeof body.record?.id!=='string')return reply({error:'Invalid webhook'},400);
      await deliver(body.record.id);
    }
    return reply({ok:true});
  }catch(error){console.error('Push worker failed',error);return reply({error:'Push delivery failed. Check function logs.'},500);}
});
