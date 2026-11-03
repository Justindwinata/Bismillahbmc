import { ProgramReviewStore } from '../../../packages/storage/src/program-reviews.js';
import { CpmmSecurityReader,type PoolProof } from '../../../packages/connectors/src/pool-security.js';
import { z } from 'zod';
import { fingerprint } from '../../../packages/engine/src/index.js';
import { JupiterTokenFeed,tokenMarket } from '../../../packages/connectors/src/jupiter-tokens.js';
import { DexMarket,ReadTransport } from '../../../packages/connectors/src/index.js';
import { MintSecurityReader } from '../../../packages/connectors/src/security.js';
import { JupiterPaperQuotes,sampledPaperCosts } from '../../../packages/connectors/src/jupiter-paper.js';
import { WalletReadRpc } from '../../../packages/connectors/src/wallet.js';
import type { Store } from '../../../packages/storage/src/index.js';
import type { PaperSources } from './paper-cycle.js';
export function livePaperSources(store:Store,endpoint:string,key?:string):PaperSources{
 const pools=new Map<string,PoolProof>();
 const rpc=new WalletReadRpc(endpoint),poolReader=new CpmmSecurityReader(new WalletReadRpc(endpoint,new ReadTransport(fetch,Date.now,2_000_000)),Date.now,hash=>new ProgramReviewStore(store.pool).resolve(hash)),screen=new MintSecurityReader(rpc),dex=new DexMarket(),quotes=new JupiterPaperQuotes(()=>sampledPaperCosts(rpc),undefined,key);
 return {quote:async input=>{const observation=await quotes.quote(input);const candidate=input.inputMint==='So11111111111111111111111111111111111111112'?input.outputMint:input.inputMint;const pool=pools.get(candidate);
 const route=z.object({routePlan:z.array(z.object({swapInfo:z.object({ammKey:z.string(),inputMint:z.string(),outputMint:z.string()})}))}).parse(observation.raw).routePlan;
 const bound=pool?.exitSafe===true&&route.length===1&&route[0]!.swapInfo.ammKey===pool.pool&&route[0]!.swapInfo.inputMint===input.inputMint&&route[0]!.swapInfo.outputMint===input.outputMint;
 const hash=fingerprint({quoteHash:observation.hash,poolHash:pool?.hash??null,bound});return {...observation,hash,quote:{...observation.quote,hash,fillable:bound,...(pool?{poolHash:pool.hash}:{})}};
 },market:async(mint)=>{
  const pair=await (async()=>{try{const pairs=await dex.pairs([mint]);const best=pairs.sort((a,b)=>(b.liquidity?.usd??-1)-(a.liquidity?.usd??-1))[0];if(best)return {...best,providerSourceAt:null,sourceProvider:'dexscreener',receiptAt:new Date().toISOString()};}catch{ /* independent provider remains explicitly attributed */ }const token=(await new JupiterTokenFeed(undefined,key).search(mint))[0];if(!token)throw new Error('MARKET_POOL_UNAVAILABLE');return {...tokenMarket(token),receiptAt:new Date().toISOString()};})().catch(async()=>{const previous=(await store.pool.query<{received_at:Date;payload:{pairAddress:string;sourceProvider?:string;providerSourceAt?:string|null;baseToken:{address:string;name:string;symbol:string};quoteToken:{symbol:string};liquidity?:{usd?:number|null}|null;volume?:{m5?:number|null;h24?:number|null}|null}}> ('SELECT received_at,payload FROM market_observations WHERE mint=$1 ORDER BY received_at DESC LIMIT 1',[mint])).rows[0];if(!previous)throw new Error('MARKET_POOL_UNAVAILABLE');return {...previous.payload,providerSourceAt:previous.payload.providerSourceAt??null,sourceProvider:previous.payload.sourceProvider??'dexscreener',receiptAt:previous.received_at.toISOString()};});
  const receivedAt=pair.receiptAt;await store.saveMarket(mint,pair.pairAddress,pair,receivedAt,pair.providerSourceAt);
  const pool=await poolReader.screen(pair.pairAddress,mint,{minQuoteReserveLamports:'1000000000',minNonRedeemableLpBps:9500});pools.set(mint,pool);
  const candidateVault=pool.assessment==='PASS'?pool.vaults.find(v=>v.mint===mint):undefined;
  const security=await screen.screen(mint,1000,candidateVault?{...candidateVault,authority:pool.authority,proofHash:pool.hash}:undefined);await store.pool.query('INSERT INTO token_security_snapshots(mint,slot,source_hash,payload) VALUES ($1,$2,$3,$4)',[mint,security.slot,security.hash,JSON.stringify({...security,pool})]);
  const assessment=security.security;
  return {raw:{pair,receivedAt,dataClass:'LIVE_PROVIDER',security,pool},input:{mint,poolEvidence:pool,...(security.decimals!==null?{tokenDecimals:security.decimals}:{}),sourceId:pair.sourceProvider+':pair:'+pair.pairAddress,sourceHash:fingerprint(pair),receivedAt,sourceAt:pair.providerSourceAt,mode:'PAPER',inputDataClass:'LIVE_PROVIDER',balanceLamports:null,market:{liquidityUsd:pair.liquidity?.usd??null,volume5mUsd:pair.volume?.m5??null,volume24hUsd:pair.volume?.h24??null},security:assessment,...(security.slot?{transferEvidence:{mint,slot:security.slot,hash:security.hash,verifiedAt:security.verifiedAt,transferSafe:security.transferSafe},chainEvidence:{mint,slot:security.slot,hash:security.hash,verifiedAt:security.verifiedAt,commitment:'finalized' as const}}:{})}};
 }};
}
