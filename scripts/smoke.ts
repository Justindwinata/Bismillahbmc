import { DexScreener,SolanaReadRpc,ProviderError } from '../packages/connectors/src/index.js';
import { validateBootstrap } from './runtime.js';
validateBootstrap();
let failed = false;
for (const provider of ['dexscreener','solana-rpc'] as const) {
  try {
    const observations = provider === 'dexscreener' ? await new DexScreener().discover() : [await new SolanaReadRpc(process.env.SOLANA_RPC_HTTP_URL || 'https://api.mainnet-beta.solana.com').observeSlot()];
    console.log(JSON.stringify({provider,observedAt:new Date().toISOString(),status:'OK',count:observations.length,sources:observations}));
  } catch (error) {failed=true;console.log(JSON.stringify({provider,status:'BLOCKED',code:error instanceof ProviderError ? error.code : 'CONFIGURATION_ERROR'}));}
}
if (failed) process.exitCode=1;
