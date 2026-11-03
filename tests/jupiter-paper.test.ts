import { it,expect } from 'vitest';
import { JupiterPaperQuotes,sampledPaperCosts } from '../packages/connectors/src/jupiter-paper.js';
import { WSOL } from '../packages/engine/src/research.js';
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const request={inputMint:WSOL,outputMint:mint,amount:'100',slippageBps:100};
const response={inputMint:WSOL,outputMint:mint,inAmount:'100',outAmount:'1000',otherAmountThreshold:'990',swapMode:'ExactIn',slippageBps:100,priceImpact:-0.1,transaction:null,taker:null,requestId:'fixture',routePlan:[{swapInfo:{ammKey:WSOL,inputMint:WSOL,outputMint:mint,inAmount:'100',outAmount:'1000'}}]};
const costs=async()=>({networkLamports:'2',priorityLamports:'3',rentLamports:'4',receivedAt:new Date().toISOString(),slot:'12',model:'CHAIN_SAMPLED_CONSERVATIVE_V1' as const});
it('only requests takerless GET quotes and uses conservative min-out and explicit fee/rent model',async()=>{
 const quote=await new JupiterPaperQuotes(costs,{json:async(url,init)=>{expect(url).toContain('/swap/v2/order?');expect(url).not.toMatch(/taker|execute|receiver/);expect(init?.method).toBeUndefined();return response;}}).quote(request);
 expect(quote.quote).toMatchObject({outputAmount:'990',feeLamports:'9',priceImpactBps:10});expect(quote.sourceClass).toBe('LIVE_PROVIDER');expect(quote.raw).toEqual(response);
 const fresh=await new JupiterPaperQuotes(costs,{json:async()=>({...response,router:'jupiterz',expireAt:new Date(Date.now()+30000).toISOString()})}).quote(request);expect(fresh.quote.expiresAt).toBeDefined();
});
it('rejects mismatch, executable tx, malformed costs, stale quotes and unsupported route data',async()=>{
 for(const patch of [{router:'jupiterz'},{expireAt:new Date(Date.now()-1).toISOString()},{transaction:'serialized'},{taker:mint},{inputMint:mint},{inAmount:'101'},{otherAmountThreshold:'900'},{otherAmountThreshold:'1001'},{slippageBps:101},{routePlan:[]},{routePlan:[{swapInfo:{...response.routePlan[0]!.swapInfo,inputMint:mint}}]}])await expect(new JupiterPaperQuotes(costs,{json:async()=>({...response,...patch})}).quote(request)).rejects.toThrow();
 await expect(new JupiterPaperQuotes(async()=>({...await costs(),receivedAt:new Date(Date.now()-60000).toISOString()}),{json:async()=>response}).quote(request)).rejects.toThrow('STALE');
 await expect(new JupiterPaperQuotes(async()=>{throw new Error('RPC_DOWN');},{json:async()=>response}).quote(request)).rejects.toThrow('RPC_DOWN');
});
it('samples actual chain RPC fee/rent inputs without signatures or submission and rejects wrong network',async()=>{
 const methods:string[]=[];const rpc={read:async(method:string)=>{methods.push(method);if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';if(method==='getLatestBlockhash')return {context:{slot:1000},value:{blockhash:WSOL}};if(method==='getFeeForMessage')return {context:{slot:1000},value:5000};if(method==='getRecentPrioritizationFees')return [{slot:1000,prioritizationFee:10}];return 2039280;}};
 expect(await sampledPaperCosts(rpc)).toMatchObject({networkLamports:'10000',priorityLamports:'14',rentLamports:'2039280'});expect(methods).not.toContain('sendTransaction');await expect(sampledPaperCosts({read:async()=> 'wrong-genesis'})).rejects.toThrow('WRONG_NETWORK');
});
