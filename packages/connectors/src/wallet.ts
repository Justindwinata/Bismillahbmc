import { z } from 'zod';
import { createHash } from 'node:crypto';
import { walletEffects } from './wallet-effects.js';
import { address,baseUnits } from '../../domain/src/index.js';
import { ReadTransport,ProviderError,rpcResult } from './index.js';
const signature=z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);
const balances=z.array(z.object({accountIndex:z.number().int().nonnegative(),mint:address,owner:address.optional(),uiTokenAmount:z.object({amount:baseUnits,decimals:z.number().int().min(0).max(255)})}));
const receipt=z.object({slot:z.number().int().nonnegative().safe(),blockTime:z.number().int().nullable(),meta:z.object({err:z.unknown(),fee:z.number().int().nonnegative().safe(),preTokenBalances:balances,postTokenBalances:balances,innerInstructions:z.array(z.object({instructions:z.array(z.object({programId:address}).passthrough())})).nullish()}),transaction:z.object({message:z.object({instructions:z.array(z.object({programId:address}).passthrough())})})});
export interface WalletFlow {status:'SWAP_CANDIDATE'|'UNKNOWN'|'FAILED';reason:string;slot:string|null;sourceAt:string|null;deltas:{mint:string;delta:string;decimals:number}[];feeLamports:string|null;copyEligible:false;nativeEffects?:ReturnType<typeof walletEffects>}
const unknown=(reason:string):WalletFlow=>({status:'UNKNOWN',reason,slot:null,sourceAt:null,deltas:[],feeLamports:null,copyEligible:false});
export function decodeWalletFlow(raw:unknown,wallet:string):WalletFlow {
  if(!address.safeParse(wallet).success)return unknown('INVALID_WALLET');
  const parsed=receipt.safeParse(raw);if(!parsed.success)return unknown('RECEIPT_UNAVAILABLE_OR_MALFORMED');
  const r=parsed.data;
  // err must explicitly exist and be null. Missing err is never successful.
  if(r.meta.err===undefined)return unknown('META_ERR_UNKNOWN');
  if(r.meta.err!==null)return {...unknown('CHAIN_TRANSACTION_FAILED'),status:'FAILED',slot:String(r.slot),sourceAt:r.blockTime===null?null:new Date(r.blockTime*1000).toISOString(),feeLamports:String(r.meta.fee),nativeEffects:walletEffects(raw,wallet)};
  const pre=r.meta.preTokenBalances;const post=r.meta.postTokenBalances;
  if([pre,post].some(list=>new Set(list.map(b=>b.accountIndex)).size!==list.length))return unknown('DUPLICATE_TOKEN_ACCOUNT_BALANCE');
  if([...pre,...post].some(b=>!b.owner))return unknown('TOKEN_OWNER_UNKNOWN');
  for(const before of pre){const after=post.find(b=>b.accountIndex===before.accountIndex);if(after&&(before.owner!==after.owner||before.mint!==after.mint))return unknown('ACCOUNT_IDENTITY_CHANGED');}
  const byAccount=new Map<number,{mint:string;decimals:number;delta:bigint}>();
  for(const [list,sign] of [[pre,-1n],[post,1n]] as const)for(const b of list){
    if(b.owner!==wallet)continue;
    const before=byAccount.get(b.accountIndex);
    if(before && (before.mint!==b.mint || before.decimals!==b.uiTokenAmount.decimals))return unknown('ACCOUNT_IDENTITY_CHANGED');
    byAccount.set(b.accountIndex,{mint:b.mint,decimals:b.uiTokenAmount.decimals,delta:(before?.delta??0n)+sign*BigInt(b.uiTokenAmount.amount)});
  }
  const net=new Map<string,{delta:bigint;decimals:number}>();
  for(const b of byAccount.values()){
    if(net.has(b.mint) && net.get(b.mint)!.decimals!==b.decimals)return unknown('DECIMALS_CONFLICT');
    net.set(b.mint,{delta:(net.get(b.mint)?.delta??0n)+b.delta,decimals:b.decimals});
  }
  const deltas=[...net].filter(([,b])=>b.delta!==0n).map(([mint,b])=>({mint,delta:b.delta.toString(),decimals:b.decimals}));
  const jupiter=[...r.transaction.message.instructions,...(r.meta.innerInstructions??[]).flatMap(group=>group.instructions)].some(i=>i.programId==='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
  const balanced=deltas.length===2&&deltas.filter(d=>BigInt(d.delta)>0n).length===1;
  return {status:jupiter&&balanced?'SWAP_CANDIDATE':'UNKNOWN',reason:jupiter&&balanced?'FINALIZED_OWNER_TOKEN_FLOW_REQUIRES_INDEPENDENT_RISK':'UNSUPPORTED_ROUTE_OR_NATIVE_RENT_UNRESOLVED',slot:String(r.slot),sourceAt:r.blockTime===null?null:new Date(r.blockTime*1000).toISOString(),deltas,feeLamports:String(r.meta.fee),copyEligible:false,nativeEffects:walletEffects(raw,wallet)};
}
export class WalletReadRpc {
  constructor(private readonly endpoint:string,private readonly http=new ReadTransport()){
    const url=new URL(endpoint);if(url.protocol!=='https:' && !(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('HTTPS_RPC_REQUIRED');
  }
  async read(method:'getSignatureStatuses'|'isBlockhashValid'|'getLatestBlockhash'|'getFeeForMessage'|'getRecentPrioritizationFees'|'getMinimumBalanceForRentExemption'|'getBalance'|'getGenesisHash'|'getSignaturesForAddress'|'getTransaction'|'getAccountInfo'|'getTokenLargestAccounts'|'getTokenAccountsByOwner'|'getMultipleAccounts',params:unknown[]=[]):Promise<unknown>{
    const raw=await this.http.json(this.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
    return rpcResult(raw);
  }
  async backfill(wallet:string,cursor:string|null){
    address.parse(wallet);if(cursor)signature.parse(cursor);
    if(await this.read('getGenesisHash')!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw new ProviderError('WRONG_NETWORK');
    const rowSchema=z.object({signature,slot:z.number().int().nonnegative().safe(),err:z.unknown(),confirmationStatus:z.literal('finalized'),blockTime:z.number().int().nullable()});
    const rows:z.infer<typeof rowSchema>[]=[];const seen=new Set<string>();let before:string|undefined;let reached=cursor===null;
    for(let page=0;page<(cursor?5:1);page++){
      const result=await this.read('getSignaturesForAddress',[wallet,{commitment:'finalized',limit:20,...(before?{before}:{})}]);
      const batch=z.array(rowSchema).max(20).parse(result);
      if(batch.some(row=>row.err===undefined)||batch.some((row,i)=>i>0&&row.slot>batch[i-1]!.slot)||new Set(batch.map(row=>row.signature)).size!==batch.length)throw new Error('BACKFILL_GAP_REQUIRES_REVIEW');
      for(const row of batch){
        if(rows.length&&row.slot>rows.at(-1)!.slot)throw new Error('BACKFILL_ORDER_DISAGREEMENT');
        if(row.signature===cursor){reached=true;break;}
        if(seen.has(row.signature))throw new Error('BACKFILL_GAP_REQUIRES_REVIEW');
        seen.add(row.signature);rows.push(row);
      }
      if(reached||batch.length<20)break;
      before=batch.at(-1)!.signature;
    }
    // A stored watermark must actually be encountered, not inferred from an empty provider page.
    if(!reached)throw new Error('BACKFILL_GAP_REQUIRES_REVIEW');
    const observations=[];
    for(const row of [...rows].reverse()){
      const raw=await this.read('getTransaction',[row.signature,{commitment:'finalized',encoding:'jsonParsed',maxSupportedTransactionVersion:0}]);
      if(raw===null)throw new Error('FINALIZED_RECEIPT_UNAVAILABLE');
      const identity=z.object({slot:z.number().int().nonnegative().safe(),blockTime:z.number().int().nullable(),meta:z.object({err:z.unknown()}),transaction:z.object({signatures:z.array(signature).min(1)})}).safeParse(raw);
      if(!identity.success||identity.data.transaction.signatures[0]!==row.signature)throw new Error('SIGNATURE_DISAGREEMENT');
      if(identity.data.slot!==row.slot)throw new Error('SLOT_DISAGREEMENT');
      if(identity.data.meta.err===undefined||(identity.data.meta.err===null)!==(row.err===null))throw new Error('RECEIPT_ERROR_DISAGREEMENT');
      if(identity.data.blockTime!==row.blockTime)throw new Error('RECEIPT_TIME_DISAGREEMENT');
      const decoded=decodeWalletFlow(raw,wallet);
      if(decoded.reason==='RECEIPT_UNAVAILABLE_OR_MALFORMED'||decoded.reason==='META_ERR_UNKNOWN')throw new Error('FINALIZED_RECEIPT_INCOMPLETE');
      if(decoded.slot!==null&&decoded.slot!==String(row.slot))throw new Error('SLOT_DISAGREEMENT');
      observations.push({signature:row.signature,slot:String(row.slot),flow:{...decoded,provenance:{signature:row.signature,genesis:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',commitment:'finalized',encoding:'jsonParsed',observedAt:new Date().toISOString(),receiptHash:createHash('sha256').update(JSON.stringify(raw)).digest('hex')}}});
    }
    return {observations,cursor:rows[0]?.signature??cursor,initial:cursor===null};
  }
}
