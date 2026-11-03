import { DexScreener, SolanaReadRpc, ProviderError } from '../../../packages/connectors/src/index.js';
import type { Store } from '../../../packages/storage/src/index.js';
export async function observeCycle(store: Pick<Store,'save'|'health'>, dex: Pick<DexScreener,'discover'>, rpc?: Pick<SolanaReadRpc,'observeSlot'>) {
  // Each provider commits independently. A failed DB write never reports provider success.
  try {
    for (const source of await dex.discover()) await store.save(source);
    await store.health('dexscreener','OK',null);
  } catch (error) {await store.health('dexscreener','DEGRADED',error instanceof ProviderError ? error.code : 'PERSISTENCE_OR_SCHEMA_ERROR');}
  if (!rpc) {await store.health('solana-rpc','NOT_CONFIGURED','RPC_REQUIRED');return;}
  try {
    await store.save(await rpc.observeSlot());
    await store.health('solana-rpc','OK',null);
  } catch (error) {await store.health('solana-rpc','DEGRADED',error instanceof ProviderError ? error.code : 'PERSISTENCE_OR_SCHEMA_ERROR');}
}
