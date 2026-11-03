import { z } from 'zod';
import { address } from '../../domain/src/index.js';
import { ReadTransport,observation } from './index.js';
const number=z.number().finite().nonnegative();
const stats=z.object({buyVolume:number.optional(),sellVolume:number.optional()}).optional();
const token=z.object({id:address,name:z.string().max(200),symbol:z.string().max(80),decimals:z.number().int().min(0).max(255),tokenProgram:address,firstPool:z.object({id:address,createdAt:z.string().datetime()}),liquidity:number.optional(),usdPrice:number.optional(),stats5m:stats,stats24h:stats,updatedAt:z.string().datetime()}).passthrough();
export type JupiterToken=z.infer<typeof token>;
export class JupiterTokenFeed {
 constructor(private readonly http:Pick<ReadTransport,'json'>=new ReadTransport(),private readonly key?:string){}
 private async read(path:string){return z.array(token).max(100).parse(await this.http.json('https://api.jup.ag/tokens/v2/'+path,{headers:this.key?{'x-api-key':this.key}:{}}));}
 recent(){return this.read('recent');}
 async search(mint:string){address.parse(mint);return (await this.read('search?query='+mint)).filter(t=>t.id===mint);}
}
export function tokenObservation(t:JupiterToken,now=Date.now()){
 const source=observation('jupiter-tokens',t.id,t,now);source.sourceAt=new Date(t.updatedAt).toISOString();return source;
}
export function tokenMarket(t:JupiterToken){
 const volume=(s:JupiterToken['stats5m'])=>{if(s?.buyVolume===undefined||s.sellVolume===undefined)return null;const sum=s.buyVolume+s.sellVolume;return Number.isFinite(sum)?sum:null;};
 return {sourceProvider:'jupiter-tokens-v2',poolVerification:'PROVIDER_POOL_ID_NOT_ONCHAIN_PROOF',pairAddress:t.firstPool.id,dexId:'VENUE_UNVERIFIED',baseToken:{address:t.id,name:t.name,symbol:t.symbol},quoteToken:{symbol:'UNKNOWN'},liquidity:{usd:t.liquidity??null},volume:{m5:volume(t.stats5m),h24:volume(t.stats24h)},priceUsd:t.usdPrice?.toString()??null,providerSourceAt:new Date(t.updatedAt).toISOString()};
}
