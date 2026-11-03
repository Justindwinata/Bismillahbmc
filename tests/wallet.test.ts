import { it,expect,vi } from 'vitest';
import { decodeWalletFlow,WalletReadRpc } from '../packages/connectors/src/wallet.js';
import { ReadTransport } from '../packages/connectors/src/index.js';
import { startReadSubscriptions,type SocketLike } from '../packages/connectors/src/websocket.js';
const wallet='11111111111111111111111111111111';
const mint='So11111111111111111111111111111111111111112';
const other='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const sig='2'.repeat(88);
const balance=(mint:string,index:number,amount:string)=>({accountIndex:index,mint,owner:wallet,uiTokenAmount:{amount,decimals:9}});
function receipt(){return {slot:1,blockTime:1000,meta:{err:null,fee:5000,preTokenBalances:[balance(mint,1,'10000'),balance(other,2,'0')],postTokenBalances:[balance(mint,1,'100'),balance(other,2,'1000000')]},transaction:{signatures:[sig],message:{instructions:[{programId:'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'}]}}};}
it('decodes owner-bound finalized receipt as candidate only, never a copy authorization',()=>{
  const flow=decodeWalletFlow(receipt(),wallet);
  expect(flow.status).toBe('SWAP_CANDIDATE');expect(flow.copyEligible).toBe(false);expect(flow.feeLamports).toBe('5000');
  expect(flow.deltas).toEqual([{mint,delta:'-9900',decimals:9},{mint:other,delta:'1000000',decimals:9}]);
});
it('fails closed on malformed, failed, owner missing, changed identity, unsupported route and incomplete native flow',()=>{
  expect(decodeWalletFlow(null,wallet).status).toBe('UNKNOWN');expect(decodeWalletFlow(receipt(),'bad').status).toBe('UNKNOWN');
  const failed=receipt();failed.meta.err=({InstructionError:[0,'Custom']} as unknown as null);expect(decodeWalletFlow(failed,wallet).status).toBe('FAILED');
  const missing=receipt();delete (missing.meta.preTokenBalances[0] as {owner?:string}).owner;expect(decodeWalletFlow(missing,wallet).reason).toBe('TOKEN_OWNER_UNKNOWN');
  const changed=receipt();changed.meta.postTokenBalances[0]!.mint=other;expect(decodeWalletFlow(changed,wallet).reason).toBe('ACCOUNT_IDENTITY_CHANGED');
  const route=receipt();route.transaction.message.instructions[0]!.programId=wallet;expect(decodeWalletFlow(route,wallet).status).toBe('UNKNOWN');
  const native=receipt();native.meta.preTokenBalances.shift();native.meta.postTokenBalances.shift();expect(decodeWalletFlow(native,wallet).status).toBe('UNKNOWN');
});
it('backfills chronologically, checks genesis/signature/slot and quarantines history gaps',async()=>{
  let gap=false;let wrongIdentity=false;
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async(_url,init)=>{
    const req=JSON.parse(String(init!.body)) as {method:string};
    const result=req.method==='getGenesisHash'?'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':req.method==='getSignaturesForAddress'?Array.from({length:gap?20:1},()=>({signature:sig,slot:1,err:null,confirmationStatus:'finalized',blockTime:1000})):{...receipt(),transaction:{...receipt().transaction,signatures:[wrongIdentity?'3'.repeat(88):sig]}};
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}));
  });
  const rpc=new WalletReadRpc('https://fixture',new ReadTransport(fetcher));
  const result=await rpc.backfill(wallet,null);expect(result.initial).toBe(true);expect(result.cursor).toBe(sig);expect(result.observations).toHaveLength(1);
  wrongIdentity=true;await expect(rpc.backfill(wallet,null)).rejects.toThrow('SIGNATURE_DISAGREEMENT');
  gap=true;await expect(rpc.backfill(wallet,sig)).rejects.toThrow('BACKFILL_GAP_REQUIRES_REVIEW');
});
it('WS sends bounded finalized wallet filters and reconnects after a dropped subscription',async()=>{
  vi.useFakeTimers();
  const sockets:SocketLike[]=[];const sent:string[]=[];const status=vi.fn();const data=vi.fn();
  const factory=()=>{const socket:SocketLike={onopen:null,onmessage:null,onerror:null,onclose:null,send:v=>sent.push(v),close:()=>socket.onclose?.({})};sockets.push(socket);return socket;};
  const stop=startReadSubscriptions('wss://fixture',[wallet],data,status,factory);
  try{
    sockets[0]!.onopen?.({});expect(sent.map(v=>(JSON.parse(v) as {method:string}).method)).toEqual(['slotSubscribe','logsSubscribe']);
    expect(sent[1]).toContain('finalized');
    sockets[0]!.onmessage?.({data:JSON.stringify({jsonrpc:'2.0',id:1,result:101})});sockets[0]!.onmessage?.({data:JSON.stringify({jsonrpc:'2.0',id:2,result:102})});sockets[0]!.onmessage?.({data:JSON.stringify({jsonrpc:'2.0',method:'slotNotification',params:{subscription:101,result:{slot:22}}})});expect(data).toHaveBeenCalledWith({kind:'SLOT',slot:'22'});
    sockets[0]!.onclose?.({});await vi.advanceTimersByTimeAsync(500);expect(sockets).toHaveLength(2);
    sockets[1]!.onmessage?.({data:'malformed'});expect(status).toHaveBeenCalledWith('DEGRADED','INVALID_WS_PAYLOAD');
    expect(()=>startReadSubscriptions('ws://evil.test',[],data,status,factory)).toThrow('WSS_REQUIRED');
  }finally{stop();vi.useRealTimers();}
});
it('paginates beyond twenty signatures and proves watermark continuity before advancement',async()=>{
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
 const signatures=Array.from({length:26},(_,i)=>'2'.repeat(86)+'2'+alphabet[i]!);
 let pages=0;let transactions=0;
 const fetcher=vi.fn<typeof fetch>().mockImplementation(async(_url,init)=>{
  const request=JSON.parse(String(init!.body)) as {method:string;params:unknown[]};let result:unknown;
  if(request.method==='getGenesisHash')result='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  else if(request.method==='getSignaturesForAddress'){const options=request.params[1] as {before?:string};pages++;const start=options.before?20:0;result=signatures.slice(start,start+20).map(signature=>({signature,slot:1,err:null,confirmationStatus:'finalized',blockTime:1000}));}
  else{transactions++;result={...receipt(),transaction:{...receipt().transaction,signatures:[request.params[0]]}};}
  return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}));
 });
 const result=await new WalletReadRpc('https://fixture',new ReadTransport(fetcher)).backfill(wallet,signatures[25]!);
 expect(pages).toBe(2);expect(transactions).toBe(25);expect(result.observations).toHaveLength(25);expect(result.cursor).toBe(signatures[0]);
});
it('recognizes supported swap CPI without turning a transfer into a mirror authorization',()=>{
 const raw=receipt();const instruction=raw.transaction.message.instructions[0]!;raw.transaction.message.instructions=[];
 const withCpi={...raw,meta:{...raw.meta,innerInstructions:[{instructions:[instruction]}]}};
 expect(decodeWalletFlow(withCpi,wallet).status).toBe('SWAP_CANDIDATE');expect(decodeWalletFlow(withCpi,wallet).copyEligible).toBe(false);
});
it('subscription acknowledgements do not fabricate data readiness; wrong IDs, stale streams and old sockets are rejected',async()=>{
 vi.useFakeTimers();const sockets:SocketLike[]=[],status=vi.fn(),data=vi.fn();let failOnce=true;const factory=()=>{if(failOnce){failOnce=false;throw new Error('FIXTURE_HANDSHAKE_FAILURE');}const s:SocketLike={onopen:null,onmessage:null,onerror:null,onclose:null,send:()=>{},close:()=>s.onclose?.({})};sockets.push(s);return s;};const stop=startReadSubscriptions('wss://fixture',[wallet],data,status,factory);
 try{await vi.advanceTimersByTimeAsync(500);const s=sockets[0]!;s.onopen?.({});s.onmessage?.({data:JSON.stringify({jsonrpc:'2.0',id:1,result:100})});expect(status).toHaveBeenCalledWith('DEGRADED','SUBSCRIPTIONS_PARTIAL');expect(data).not.toHaveBeenCalled();s.onmessage?.({data:JSON.stringify({jsonrpc:'2.0',id:2,result:101})});expect(status).toHaveBeenCalledWith('OK','SUBSCRIPTIONS_ACKNOWLEDGED');await vi.advanceTimersByTimeAsync(25000);expect(status).toHaveBeenCalledWith('DEGRADED','WS_STALE');expect(data).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1000);const current=sockets.at(-1)!;current.onopen?.({});current.onmessage?.({data:JSON.stringify({jsonrpc:'2.0',id:1,result:200})});current.onmessage?.({data:JSON.stringify({jsonrpc:'2.0',method:'slotNotification',params:{subscription:999,result:{slot:30}}})});expect(status).toHaveBeenCalledWith('DEGRADED','SUBSCRIPTION_ID_MISMATCH');s.onmessage?.({data:JSON.stringify({jsonrpc:'2.0',method:'slotNotification',params:{subscription:100,result:{slot:31}}})});expect(data).not.toHaveBeenCalled();}finally{stop();vi.useRealTimers();}
});
it('rejects duplicated token deltas instead of promoting a forged balanced swap',()=>{
 const raw=receipt();raw.meta.preTokenBalances.push(raw.meta.preTokenBalances[0]!);expect(decodeWalletFlow(raw,wallet).reason).toBe('DUPLICATE_TOKEN_ACCOUNT_BALANCE');
});
it('quarantines primary-signature, status, slot, time and incomplete receipt disagreements before cursor advancement',async()=>{
 for(const scenario of ['secondary-signature','error','slot','time','missing-meta','missing-tokens','missing-row-error']){
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async(_url,init)=>{
   const request=JSON.parse(String(init!.body)) as {method:string};let result:unknown;
   if(request.method==='getGenesisHash')result='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
   else if(request.method==='getSignaturesForAddress'){const row:Record<string,unknown>={signature:sig,slot:1,err:null,confirmationStatus:'finalized',blockTime:1000};if(scenario==='missing-row-error')delete row.err;result=[row];}
   else{const raw:Record<string,unknown>=receipt();if(scenario==='secondary-signature')(raw.transaction as {signatures:string[]}).signatures=['3'.repeat(88),sig];if(scenario==='error')(raw.meta as {err:unknown}).err={InstructionError:[0,'Custom']};if(scenario==='slot')raw.slot=2;if(scenario==='time')raw.blockTime=1001;if(scenario==='missing-meta')delete raw.meta;if(scenario==='missing-tokens')delete (raw.meta as Record<string,unknown>).preTokenBalances;result=raw;}
   return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}));
  });await expect(new WalletReadRpc('https://fixture',new ReadTransport(fetcher)).backfill(wallet,null),scenario).rejects.toThrow();
 }
});
it('retires a failing WS before close so synchronous error reentry cannot overflow or multiply reconnects',async()=>{
 vi.useFakeTimers();const sockets:SocketLike[]=[],status=vi.fn(),data=vi.fn();let closes=0;const factory=()=>{const s:SocketLike={onopen:null,onmessage:null,onerror:null,onclose:null,send:()=>{},close:()=>{closes++;s.onerror?.({});s.onclose?.({});throw new Error('CONNECTING_CLOSE_FAILURE');}};sockets.push(s);return s;};const stop=startReadSubscriptions('wss://fixture',[],data,status,factory);
 try{const first=sockets[0]!,oldError=first.onerror!,oldMessage=first.onmessage!;expect(()=>first.onerror?.({})).not.toThrow();expect(closes).toBe(1);oldError({});oldMessage({data:JSON.stringify({jsonrpc:'2.0',id:1,result:100})});expect(status).not.toHaveBeenCalledWith('OK','SUBSCRIPTIONS_ACKNOWLEDGED');await vi.advanceTimersByTimeAsync(500);expect(sockets).toHaveLength(2);expect(()=>stop()).not.toThrow();await vi.advanceTimersByTimeAsync(60000);expect(sockets).toHaveLength(2);expect(closes).toBe(2);expect(data).not.toHaveBeenCalled();}finally{stop();vi.useRealTimers();}
});
it('WS send failure retires once and a later healthy socket recovers only after real ACK/data',async()=>{vi.useFakeTimers();const sockets:SocketLike[]=[],data=vi.fn(),status=vi.fn();let fail=true;const factory=()=>{const s:SocketLike={onopen:null,onmessage:null,onerror:null,onclose:null,send:()=>{if(fail)throw new Error('WRITE_AFTER_CLOSE');},close:()=>s.onerror?.({})};sockets.push(s);return s;};const stop=startReadSubscriptions('wss://fixture',[],data,status,factory);try{expect(()=>sockets[0]!.onopen?.({})).not.toThrow();fail=false;await vi.advanceTimersByTimeAsync(500);const current=sockets[1]!;current.onopen?.({});current.onmessage?.({data:JSON.stringify({jsonrpc:'2.0',id:1,result:7})});expect(data).not.toHaveBeenCalled();current.onmessage?.({data:JSON.stringify({jsonrpc:'2.0',method:'slotNotification',params:{subscription:7,result:{slot:42}}})});expect(data).toHaveBeenCalledWith({kind:'SLOT',slot:'42'});}finally{stop();vi.useRealTimers();}});
