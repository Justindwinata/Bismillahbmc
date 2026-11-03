import { it,expect,vi } from 'vitest';
import { observeCycle } from '../apps/worker/src/cycle.js';
import { observation,ProviderError } from '../packages/connectors/src/index.js';
it('persists observation before health success, missing RPC is explicit',async () => {
  const store={save:vi.fn().mockResolvedValue(true),health:vi.fn().mockResolvedValue(undefined)};
  const source=observation('dexscreener','mint',{},0);
  await observeCycle(store,{discover:async () => [source]});
  expect(store.save).toHaveBeenCalledWith(source);
  expect(store.health.mock.calls).toEqual([['dexscreener','OK',null],['solana-rpc','NOT_CONFIGURED','RPC_REQUIRED']]);
});
it('provider errors degrade without invented data; chain observation continues',async () => {
  const store={save:vi.fn().mockResolvedValue(true),health:vi.fn().mockResolvedValue(undefined)};
  const chain=observation('solana-rpc','slot',{},0,'12');
  await observeCycle(store,{discover:async () => {throw new ProviderError('RATE_LIMITED');}},{observeSlot:async () => chain});
  expect(store.health.mock.calls).toEqual([['dexscreener','DEGRADED','RATE_LIMITED'],['solana-rpc','OK',null]]);
  expect(store.save).toHaveBeenCalledExactlyOnceWith(chain);
});
it('lost persistence never reports success and cannot sign',async () => {
  const store={save:vi.fn().mockRejectedValue(new Error('DB unavailable')),health:vi.fn().mockRejectedValue(new Error('DB unavailable'))};
  await expect(observeCycle(store,{discover:async () => [observation('dexscreener','mint',{},0)]})).rejects.toThrow('DB unavailable');
});
