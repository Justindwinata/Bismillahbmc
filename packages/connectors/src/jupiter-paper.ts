import { z } from 'zod';
import { createHash } from 'node:crypto';
import { address,baseUnits } from '../../domain/src/index.js';
import { ReadTransport } from './index.js';
import type { WalletReadRpc } from './wallet.js';
import { researchQuote } from '../../engine/src/research.js';
const positive=baseUnits.refine(v=>BigInt(v)>0n);
const request=z.strictObject({inputMint:address,outputMint:address,amount:positive,slippageBps:z.number().int().min(0).max(10000)}).refine(v=>v.inputMint!==v.outputMint);
const response=z.object({inputMint:address,outputMint:address,inAmount:positive,outAmount:positive,otherAmountThreshold:positive,swapMode:z.literal('ExactIn'),slippageBps:z.number().int().min(0).max(10000),priceImpact:z.number().finite(),transaction:z.null(),taker:z.null(),requestId:z.string().min(1).max(200),expireAt:z.string().datetime().nullish(),router:z.enum(['metis','jupiterz','dflow','okx']).optional(),routePlan:z.array(z.object({swapInfo:z.object({ammKey:address,inputMint:address,outputMint:address,inAmount:positive,outAmount:positive})})).min(1).max(100)}).passthrough();
export interface PaperCosts {networkLamports:string;priorityLamports:string;rentLamports:string;receivedAt:string;slot:string;model:'CHAIN_SAMPLED_CONSERVATIVE_V1'|'REPLAY_TEST_V1';evidence?:unknown}
export interface PaperQuoteObservation {sourceClass:'LIVE_PROVIDER'|'REPLAY_TEST';provider:string;receivedAt:string;hash:string;raw:unknown;costs:PaperCosts;quote:z.infer<typeof researchQuote>}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class JupiterPaperQuotes {
 constructor(private readonly costs:()=>Promise<PaperCosts>,private readonly http:Pick<ReadTransport,'json'>=new ReadTransport(),private readonly apiKey?:string,private readonly now=Date.now){}
 async quote(raw:unknown):Promise<PaperQuoteObservation>{
  const input=request.parse(raw);const params=new URLSearchParams({...input,slippageBps:String(input.slippageBps)});const started=this.now();
  // No taker, receiver, transaction construction, signer or execute method exists here.
  const result=await this.http.json('https://api.jup.ag/swap/v2/order?'+params,{headers:this.apiKey?{'x-api-key':this.apiKey}:{}});const data=response.parse(result);
  if(data.inputMint!==input.inputMint||data.outputMint!==input.outputMint||data.inAmount!==input.amount||data.slippageBps>input.slippageBps||BigInt(data.otherAmountThreshold)>BigInt(data.outAmount)||BigInt(data.otherAmountThreshold)<BigInt(data.outAmount)*BigInt(10000-input.slippageBps)/10000n)throw new Error('QUOTE_REQUEST_MISMATCH');
  if(!data.routePlan.some(r=>r.swapInfo.inputMint===input.inputMint)||!data.routePlan.some(r=>r.swapInfo.outputMint===input.outputMint))throw new Error('QUOTE_ROUTE_MISMATCH');
  const costs=z.object({networkLamports:baseUnits,priorityLamports:baseUnits,rentLamports:baseUnits,receivedAt:z.string().datetime(),slot:baseUnits,model:z.literal('CHAIN_SAMPLED_CONSERVATIVE_V1'),evidence:z.unknown().optional()}).parse(await this.costs());const observed=this.now();if((data.router==='jupiterz'&&!data.expireAt)||(data.expireAt&&Date.parse(data.expireAt)<=observed))throw new Error('QUOTE_EXPIRED_OR_RFQ_EXPIRY_UNKNOWN');if(observed-started>10000||Date.parse(costs.receivedAt)>observed||observed-Date.parse(costs.receivedAt)>10000)throw new Error('QUOTE_OR_COST_STALE');
  const fee=(BigInt(baseUnits.parse(costs.networkLamports))+BigInt(baseUnits.parse(costs.priorityLamports))+BigInt(baseUnits.parse(costs.rentLamports))).toString();const digest=hash({request:input,response:result,costs});
  const quote=researchQuote.parse({inputMint:input.inputMint,outputMint:input.outputMint,inputAmount:input.amount,outputAmount:data.otherAmountThreshold,feeLamports:fee,...(data.expireAt?{expiresAt:data.expireAt}:{}),receivedAt:new Date(started).toISOString(),hash:digest,fillable:true,slippageBps:data.slippageBps,priceImpactBps:Math.ceil(Math.abs(data.priceImpact)*100)});
  return {sourceClass:'LIVE_PROVIDER',provider:'jupiter-swap-v2-quote-only',receivedAt:new Date(observed).toISOString(),hash:digest,raw:result,costs,quote};
 }
}
export async function sampledPaperCosts(rpc:Pick<WalletReadRpc,'read'>):Promise<PaperCosts>{
 if(await rpc.read('getGenesisHash')!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw new Error('WRONG_NETWORK');
 const block=z.object({context:z.object({slot:z.number().int().positive().safe()}),value:z.object({blockhash:address})}).parse(await rpc.read('getLatestBlockhash',[{commitment:'finalized'}]));
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const c of block.value.blockhash)n=n*58n+BigInt(alphabet.indexOf(c));const bytes=Buffer.alloc(32);for(let i=31;i>=0;i--){bytes[i]=Number(n&255n);n>>=8n;}
 // Unsigned message with one required signature and no instructions, used ONLY for fee estimation.
 const message=Buffer.concat([Buffer.from([1,0,0,1]),Buffer.alloc(32),bytes,Buffer.from([0])]).toString('base64');
 const fee=z.object({context:z.object({slot:z.number().int().positive().safe()}),value:z.number().int().nonnegative().safe()}).parse(await rpc.read('getFeeForMessage',[message,{commitment:'finalized'}]));
 const priority=z.array(z.object({slot:z.number().int().positive().safe(),prioritizationFee:z.number().int().nonnegative().safe()})).min(1).parse(await rpc.read('getRecentPrioritizationFees'));
 const recent=priority.filter(v=>v.slot>=block.context.slot-300);if(!recent.length)throw new Error('PRIORITY_SAMPLES_STALE');
 const upper=recent.reduce((m,v)=>BigInt(v.prioritizationFee)>m?BigInt(v.prioritizationFee):m,0n);
 const rent=z.number().int().nonnegative().safe().parse(await rpc.read('getMinimumBalanceForRentExemption',[165,{commitment:'finalized'}]));
 // Two signatures, max 1.4M compute units at highest sampled price, one SPL account rent charged as expense.
 // A conservative PAPER model, never a claim of actual transaction fees or recoverable rent.
 return {networkLamports:(BigInt(fee.value)*2n).toString(),priorityLamports:((upper*1400000n+999999n)/1000000n).toString(),rentLamports:String(rent),slot:String(fee.context.slot),receivedAt:new Date().toISOString(),model:'CHAIN_SAMPLED_CONSERVATIVE_V1',evidence:{block,fee,prioritySamples:recent,rentMinimumLamports:rent}};
}
