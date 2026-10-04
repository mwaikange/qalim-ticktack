import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/local-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const tokenOf = (req: NextRequest) => req.cookies.get('qalim_session')?.value || '';
const configured = () => !!process.env.VERCEL || !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const buckets = new Map<string,{ count:number; until:number }>();
function limit(key: string, max: number) { const now=Date.now(); if(buckets.size>10000) for(const [k,v] of buckets) if(v.until<now)buckets.delete(k); const item=buckets.get(key); if(!item || item.until<now) {buckets.set(key,{count:1,until:now+60000});return;} if(++item.count>max) throw new Error('Too many requests. Try again in a minute.'); }
export async function GET(req: NextRequest) {
  if (configured()) return NextResponse.json({error:'Local mode is disabled.'},{status:404});
  const user = store().user(tokenOf(req));
  if(!user) return NextResponse.json({error:'Please sign in.'},{status:401});
  if(req.nextUrl.searchParams.get('stream') === '1') {
    let cleanup = () => {};
    const stream = new ReadableStream({ start(controller) {
      const encoder = new TextEncoder(); let closed = false;
      const send = () => { if(closed)return; if(!store().user(tokenOf(req))){cleanup();try{controller.close();}catch{}return;} try { controller.enqueue(encoder.encode('data: refresh\n\n')); } catch { cleanup(); } };
      const timer=setInterval(send,10000); store().listeners.add(send);
      cleanup = () => { closed=true; clearInterval(timer); store().listeners.delete(send); req.signal.removeEventListener('abort',cleanup); };
      req.signal.addEventListener('abort',cleanup); send();
    }, cancel() {cleanup();} });
    return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive'}});
  }
  return NextResponse.json(store().snapshot(user),{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req: NextRequest) {
  if(configured()) return NextResponse.json({error:'Local mode is disabled.'},{status:404});
  // Next's internal URL can normalize 127.0.0.1 to localhost. Compare the
  // browser origin to the actual HTTP Host while keeping cross-site writes blocked.
  let sameOrigin = false;
  try { const origin = new URL(req.headers.get('origin') || ''); sameOrigin = origin.host === req.headers.get('host') && origin.protocol === req.nextUrl.protocol; } catch {}
  if(!sameOrigin) return NextResponse.json({error:'Invalid request origin.'},{status:403});
  try {
    if(Number(req.headers.get('content-length') || 0)>8192) throw new Error('Request too large.');
    const raw=await req.text(); if(raw.length>8192) throw new Error('Request too large.');
    const body=JSON.parse(raw); const action=body.action; const db=store();
    limit('all:'+tokenOf(req),120);
    if(action==='register'||action==='login') {
      limit('auth',20);
      if(typeof body.email!=='string'||typeof body.password!=='string'||(action==='register'&&typeof body.username!=='string')) throw new Error('Please complete all fields.');
      const result=action==='register'?db.register(body.email,body.password,body.username):db.login(body.email,body.password);
      const res=NextResponse.json({user:result.user});
      res.cookies.set('qalim_session',result.token,{httpOnly:true,sameSite:'lax',secure:req.nextUrl.protocol==='https:',path:'/',maxAge:7*86400}); return res;
    }
    const user=db.user(tokenOf(req)); if(!user)return NextResponse.json({error:'Please sign in.'},{status:401});
    if(action==='logout'){db.logout(tokenOf(req));const res=NextResponse.json({ok:true});res.cookies.delete('qalim_session');return res;}
    if(action!=='create'&&typeof body.gameId!=='string')throw new Error('Choose a valid game.');
    let game;
    switch(action){case 'create':game=db.create(user,body.mode);break;case 'join':game=db.join(user,body.gameId);break;case 'move':game=db.play(user,body.gameId,body.cell);break;case 'cancel':db.cancel(user,body.gameId);break;case 'resign':db.resign(user,body.gameId);break;default:throw new Error('Unknown action.');}
    return NextResponse.json({game:game||null});
  } catch(e) {return NextResponse.json({error:e instanceof Error?e.message:'Something went wrong.'},{status:400});}
}
