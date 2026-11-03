import { z } from 'zod';
import { address } from '../../domain/src/index.js';
export interface SocketLike {onopen:((event:unknown)=>void)|null;onmessage:((event:{data:unknown})=>void)|null;onerror:((event:unknown)=>void)|null;onclose:((event:unknown)=>void)|null;send(data:string):void;close():void}
export function startReadSubscriptions(endpoint:string,wallets:string[],onData:(value:{kind:'SLOT'|'WALLET';slot:string|null})=>void,onStatus:(status:'OK'|'DEGRADED',reason:string|null)=>void,factory:(url:string)=>SocketLike=url=>new WebSocket(url) as SocketLike){
 const url=new URL(endpoint);if(url.protocol!=='wss:'&&!(url.protocol==='ws:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('WSS_REQUIRED');
 if(wallets.length>2||new Set(wallets).size!==wallets.length||wallets.some(w=>!address.safeParse(w).success))throw new Error('WATCHLIST_LIMIT');
 let stopped=false,socket:SocketLike|undefined,timer:ReturnType<typeof setTimeout>|undefined,failures=0,lastData=Date.now();let closed=true;let retireActive:((reason:string)=>void)|undefined;
 const detach=(target:SocketLike)=>{target.onopen=null;target.onmessage=null;target.onerror=null;target.onclose=null;};
 const connect=()=>{
  if(stopped)return;lastData=Date.now();closed=false;let current:SocketLike;try{current=factory(endpoint);}catch{closed=true;onStatus('DEGRADED','WS_NETWORK_ERROR');timer=setTimeout(connect,Math.min(30000,500*2**Math.min(failures++,6)));return;}socket=current;const subscriptions=new Map<number,number>(),expected=wallets.length+1;
  let retired=false;const retire=(reason:string)=>{if(retired||stopped||current!==socket)return;retired=true;closed=true;socket=undefined;detach(current);onStatus('DEGRADED',reason);try{current.close();}catch{/* failed/connecting transport may reject close; it is already retired */}clearTimeout(timer);if(!stopped)timer=setTimeout(connect,Math.min(30000,500*2**Math.min(failures++,6)));};retireActive=retire;
  const reject=retire;
  current.onopen=()=>{if(stopped||closed||current!==socket)return;try{onStatus('DEGRADED','SUBSCRIPTION_PENDING');current.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'slotSubscribe'}));wallets.forEach((wallet,i)=>current.send(JSON.stringify({jsonrpc:'2.0',id:i+2,method:'logsSubscribe',params:[{mentions:[wallet]},{commitment:'finalized'}]})));}catch{retire('WS_NETWORK_ERROR');}};
  current.onmessage=event=>{
   if(stopped||closed||current!==socket)return;if(typeof event.data!=='string'||Buffer.byteLength(event.data)>1000000){reject('INVALID_WS_PAYLOAD');return;}
   let raw:unknown;try{raw=JSON.parse(event.data);}catch{onStatus('DEGRADED','INVALID_WS_PAYLOAD');return;}
   const message=z.object({jsonrpc:z.literal('2.0'),id:z.number().int().optional(),result:z.unknown().optional(),method:z.string().optional(),error:z.unknown().optional(),params:z.object({subscription:z.number().int().nonnegative(),result:z.unknown()}).optional()}).safeParse(raw);
   if(!message.success||message.data.error!==undefined){reject('SUBSCRIPTION_REJECTED');return;}const m=message.data;
   if(m.id!==undefined){
    const sub=z.number().int().safe().nonnegative().safeParse(m.result);if(m.id<1||m.id>expected||!sub.success){reject('SUBSCRIPTION_REJECTED');return;}
    if((subscriptions.has(m.id)&&subscriptions.get(m.id)!==sub.data)||[...subscriptions].some(([id,value])=>id!==m.id&&value===sub.data)){reject('SUBSCRIPTION_ID_MISMATCH');return;}
    subscriptions.set(m.id,sub.data);onStatus(subscriptions.size===expected?'OK':'DEGRADED',subscriptions.size===expected?'SUBSCRIPTIONS_ACKNOWLEDGED':'SUBSCRIPTIONS_PARTIAL');return;
   }
   const requestId=[...subscriptions].find(([,id])=>id===m.params?.subscription)?.[0];if(requestId===undefined){reject('SUBSCRIPTION_ID_MISMATCH');return;}
   if(m.method==='slotNotification'&&requestId===1){const result=z.object({slot:z.number().int().safe().nonnegative()}).safeParse(m.params?.result);if(!result.success){reject('INVALID_WS_PAYLOAD');return;}lastData=Date.now();failures=0;onData({kind:'SLOT',slot:String(result.data.slot)});onStatus(subscriptions.size===expected?'OK':'DEGRADED',subscriptions.size===expected?null:'SUBSCRIPTIONS_PARTIAL');}
   else if(m.method==='logsNotification'&&requestId>1){const result=z.object({context:z.object({slot:z.number().int().safe().nonnegative()})}).safeParse(m.params?.result);if(!result.success){reject('INVALID_WS_PAYLOAD');return;}lastData=Date.now();onData({kind:'WALLET',slot:String(result.data.context.slot)});}
   else reject('SUBSCRIPTION_ID_MISMATCH');
  };
  current.onerror=()=>retire('WS_NETWORK_ERROR');
  current.onclose=()=>retire('WS_DISCONNECTED_BACKFILL_REQUIRED');
 };
 const watchdog=setInterval(()=>{if(!closed&&Date.now()-lastData>20000){retireActive?.('WS_STALE');}},5000);connect();
 return()=>{stopped=true;clearTimeout(timer);clearInterval(watchdog);closed=true;const target=socket;socket=undefined;if(target){detach(target);try{target.close();}catch{/* shutdown remains bounded even if transport close throws */}}};
}
