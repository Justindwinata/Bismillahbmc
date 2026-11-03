import { it,expect,vi } from 'vitest';
import { JupiterTokenFeed,tokenMarket,tokenObservation } from '../packages/connectors/src/jupiter-tokens.js';
import { jupiterMarketCycle } from '../apps/worker/src/jupiter-market-cycle.js';
const token={id:'So11111111111111111111111111111111111111112',name:'FIXTURE',symbol:'FIXTURE',decimals:9,tokenProgram:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',firstPool:{id:'So11111111111111111111111111111111111111112',createdAt:'2026-11-01T00:00:00Z'},updatedAt:'2026-11-01T00:01:00Z',stats5m:{buyVolume:2,sellVolume:3},stats24h:{buyVolume:10,sellVolume:20}};
it('independent real-provider adapter preserves source time and unknown venue/liquidity, never treats metadata as chain security',async()=>{
 const feed=new JupiterTokenFeed({json:async url=>{expect(url).toContain('api.jup.ag/tokens/v2');return [token];}});expect(await feed.recent()).toHaveLength(1);expect(await feed.search(token.id)).toHaveLength(1);
 expect(tokenMarket(token)).toMatchObject({sourceProvider:'jupiter-tokens-v2',poolVerification:'PROVIDER_POOL_ID_NOT_ONCHAIN_PROOF',liquidity:{usd:null},quoteToken:{symbol:'UNKNOWN'},volume:{m5:5,h24:30}});
 expect(tokenMarket({...token,stats5m:{buyVolume:2}}).volume.m5).toBeNull();expect(tokenObservation(token)).toMatchObject({provider:'jupiter-tokens',sourceAt:'2026-11-01T00:01:00.000Z',dataClass:'LIVE_PROVIDER'});
});
it('provider failures and invalid token identity do not create market success or fabricated rows',async()=>{
 const store={save:vi.fn(),saveMarket:vi.fn(),health:vi.fn()};await jupiterMarketCycle(store,{recent:async()=>{throw new Error('429');}});expect(store.save).not.toHaveBeenCalled();expect(store.health).toHaveBeenCalledWith('jupiter-tokens','DEGRADED','PROVIDER_OR_PERSISTENCE_UNAVAILABLE');
 await expect(new JupiterTokenFeed({json:async()=>[{...token,id:'invalid'}]}).recent()).rejects.toThrow();await jupiterMarketCycle(store,{recent:async()=>[token]});expect(store.saveMarket).toHaveBeenCalledWith(token.id,token.firstPool.id,tokenMarket(token),expect.any(String),'2026-11-01T00:01:00.000Z');
});
