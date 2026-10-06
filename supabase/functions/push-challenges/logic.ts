export type Kind='created'|'accepted';
export type PushGame={id:string;player_x_id:string;player_o_id:string|null;player_x_name:string;player_o_name:string|null;status:string};
export function pushCopy(kind:Kind,game:PushGame){
  return kind==='created'
    ? `${game.player_x_name} has created a challenge, up for it?`
    : `${game.player_o_name} has accepted your challenge, log in and play!`;
}
export function recipientMatches(kind:Kind,game:PushGame,userId:string){
  return kind==='created'?userId!==game.player_x_id:userId===game.player_x_id;
}
export function stalePush(kind:Kind,game:PushGame,createdAt:string,now=Date.now()){
  return now-Date.parse(createdAt)>(kind==='created'?300:900)*1000
    ||(kind==='created'?game.status!=='waiting':game.status!=='playing'||!game.player_o_id);
}
export type Ticket={status:'ok'|'error';id?:string;message?:string;details?:{error?:string}};
export function ticketResults(tokens:string[],tickets:Ticket[]){
  if(tokens.length!==tickets.length)throw new Error('Expo returned an incomplete ticket batch.');
  const receipts:{id:string;token:string}[]=[];const invalid:string[]=[];
  tickets.forEach((ticket,index)=>{
    if(ticket.status==='ok'&&ticket.id)receipts.push({id:ticket.id,token:tokens[index]});
    else if(ticket.details?.error==='DeviceNotRegistered')invalid.push(tokens[index]);
    else throw new Error(`Expo push error: ${ticket.details?.error||ticket.message||'Invalid ticket'}`);
  });
  return {receipts,invalid};
}
export async function expoRequest(path:'send'|'getReceipts',body:unknown,accessToken?:string){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(`https://exp.host/--/api/v2/push/${path}`,{
        method:'POST',headers:{'Content-Type':'application/json',...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})},
        body:JSON.stringify(body),signal:AbortSignal.timeout(10000),
      });
      if(response.status===429||response.status>=500)throw new Error(`Expo unavailable: ${response.status}`);
      if(!response.ok)throw new Error(`Expo rejected push request: ${response.status}`);
      const result=await response.json();
      if(result.errors?.length)throw new Error(`Expo rejected push request: ${result.errors[0].code||'Invalid request'}`);
      return result.data;
    }catch(error){
      if(attempt===2||(error instanceof Error&&error.message.startsWith('Expo rejected')))throw error;
      await new Promise(resolve=>setTimeout(resolve,250*2**attempt));
    }
  }
}
