import { it,expect,vi } from 'vitest';
import { marketCycle } from '../apps/worker/src/market-cycle.js';
import { ProviderError } from '../packages/connectors/src/index.js';
const mint='So11111111111111111111111111111111111111112';
const pair=(usd:number|null)=>({chainId:'solana',dexId:'FIXTURE',pairAddress:mint,baseToken:{address:mint,name:'FIXTURE',symbol:'FIXTURE'},quoteToken:{address:mint,symbol:'SOL'},liquidity:{usd}});
it('market cycle selects best liquidity per mint and persists only actual returned metrics',async()=>{
 const store={save:vi.fn().mockResolvedValue(true),health:vi.fn().mockResolvedValue(undefined),candidates:vi.fn().mockResolvedValue([{mint}]),saveMarket:vi.fn().mockResolvedValue(undefined)};
 await marketCycle(store,{discover:async()=>[]},{pairs:async()=>[pair(null),pair(10),pair(5)]});
 expect(store.saveMarket).toHaveBeenCalledTimes(1);expect(store.saveMarket.mock.calls[0]![2].liquidity.usd).toBe(10);
 expect(store.health).toHaveBeenCalledWith('dex-market','OK',null);
});
it('empty feeds, rate failures and persistence failures cannot manufacture successful market data',async()=>{
 const store={save:vi.fn().mockResolvedValue(true),health:vi.fn().mockResolvedValue(undefined),candidates:vi.fn().mockResolvedValue([]),saveMarket:vi.fn().mockResolvedValue(undefined)};const pairs=vi.fn().mockResolvedValue([]);
 await marketCycle(store,{discover:async()=>[]},{pairs});expect(pairs).not.toHaveBeenCalled();
 store.candidates.mockResolvedValue([{mint}]);pairs.mockRejectedValue(new ProviderError('RATE_LIMITED'));
 await marketCycle(store,{discover:async()=>[]},{pairs});expect(store.health).toHaveBeenCalledWith('dex-market','DEGRADED','RATE_LIMITED');
 pairs.mockResolvedValue([pair(1)]);store.saveMarket.mockRejectedValue(new Error('DB_FAIL'));
 await marketCycle(store,{discover:async()=>[]},{pairs});expect(store.health).toHaveBeenCalledWith('dex-market','DEGRADED','PERSISTENCE_OR_SCHEMA_ERROR');
});
