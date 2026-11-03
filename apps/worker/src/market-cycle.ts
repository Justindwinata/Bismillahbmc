import { DexScreener,DexMarket,SolanaReadRpc,ProviderError } from '../../../packages/connectors/src/index.js';
import type { Store } from '../../../packages/storage/src/index.js';
import { observeCycle } from './cycle.js';
export async function marketCycle(store:Pick<Store,'save'|'health'|'candidates'|'saveMarket'>,dex:Pick<DexScreener,'discover'>=new DexScreener(),market:Pick<DexMarket,'pairs'>=new DexMarket(),rpc?:Pick<SolanaReadRpc,'observeSlot'>) {
  await observeCycle(store,dex,rpc);
  try {
    const mints=(await store.candidates()).map((c:{mint:string})=>c.mint).slice(0,30);
    if (mints.length) {
      const best=new Map<string,Awaited<ReturnType<DexMarket['pairs']>>[number]>();
      for(const pair of await market.pairs(mints))if(!best.has(pair.baseToken.address)||(pair.liquidity?.usd??-1)>(best.get(pair.baseToken.address)?.liquidity?.usd??-1))best.set(pair.baseToken.address,pair);
      for(const pair of best.values())await store.saveMarket(pair.baseToken.address,pair.pairAddress,pair,new Date().toISOString());
    }
    await store.health('dex-market','OK',null);
  } catch(error) {await store.health('dex-market','DEGRADED',error instanceof ProviderError ? error.code : 'PERSISTENCE_OR_SCHEMA_ERROR');}
}
