import { validateBootstrap,databasePool } from './runtime.js';
import { Store,migrate } from '../packages/storage/src/index.js';
import { DexScreener,SolanaReadRpc } from '../packages/connectors/src/index.js';
import { marketCycle } from '../apps/worker/src/market-cycle.js';
validateBootstrap();
const pool=databasePool();
try {
  await migrate(pool);
  const store=new Store(pool);
  const rpc=process.env.SOLANA_RPC_HTTP_URL ? new SolanaReadRpc(process.env.SOLANA_RPC_HTTP_URL) : undefined;
  await marketCycle(store,new DexScreener(),undefined,rpc);
  console.log(JSON.stringify({observedAt:new Date().toISOString(),...await store.system(),discoveryLeads:(await store.candidates()).length,signerEnabled:false}));
} catch {console.error('OBSERVATION_FAILED');process.exitCode=1;}
finally {await pool.end();}
