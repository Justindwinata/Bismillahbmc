import {swapReceiptCycle} from './swap-receipt-cycle.js';
import {SwapPreflightStore} from '../../../packages/storage/src/swap-preflight.js';
import {WalletReadRpc} from '../../../packages/connectors/src/wallet.js';
import { sourceIdentity } from '../../../scripts/source-identity.js';
import { ExecutionStore } from '../../../packages/storage/src/execution.js';
import { executionCycle } from './execution-cycle.js';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { validateBootstrap,databasePool } from '../../../scripts/runtime.js';
import { Store } from '../../../packages/storage/src/index.js';
import { DexScreener,SolanaReadRpc } from '../../../packages/connectors/src/index.js';
import { monitorWallets } from './wallet-monitor.js';
import { agentCycle,configuredSecurityReader } from './agent-cycle.js';
import { PaperSchedulerStore } from '../../../packages/storage/src/paper-scheduler.js';
import { paperCycle } from './paper-cycle.js';
import { jupiterMarketCycle } from './jupiter-market-cycle.js';
import { JupiterTokenFeed } from '../../../packages/connectors/src/jupiter-tokens.js';
import { livePaperSources } from './paper-live.js';
import { marketCycle } from './market-cycle.js';
validateBootstrap();
const pool = databasePool();
const store = new Store(pool);
const dex = new DexScreener();
const rpc = process.env.SOLANA_RPC_HTTP_URL ? new SolanaReadRpc(process.env.SOLANA_RPC_HTTP_URL) : undefined;
const screening=configuredSecurityReader();
const scheduler=new PaperSchedulerStore(pool);
const paperSources=process.env.SOLANA_RPC_HTTP_URL?livePaperSources(store,process.env.SOLANA_RPC_HTTP_URL,process.env.JUPITER_API_KEY):undefined;
const stop = new AbortController();const runId=randomUUID();const progress:{marketAt:string|null;paperAt:string|null;sourceIdentity:string;workerPid:number}={marketAt:null,paperAt:null,sourceIdentity:await sourceIdentity(),workerPid:process.pid};
await store.workerHeartbeat(runId,'RUNNING',progress);
const heartbeat=(async()=>{while(!stop.signal.aborted){try{await setTimeout(5000,undefined,{signal:stop.signal});await store.workerHeartbeat(runId,'RUNNING',progress);}catch(error){if(stop.signal.aborted)break;console.error('HEARTBEAT_PERSISTENCE_UNAVAILABLE');void error;}}})();
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,() => stop.abort());
const paperWorker=(async()=>{while(!stop.signal.aborted){try{if(paperSources){await scheduler.discover();await paperCycle(scheduler,paperSources,'LIVE_PROVIDER',3,undefined,stop.signal);progress.paperAt=new Date().toISOString();}}catch{console.error('PAPER_SCHEDULER_DEPENDENCY_UNAVAILABLE');}try{await setTimeout(1000,undefined,{signal:stop.signal});}catch{break;}}})();
const monitor=(async()=>{while(!stop.signal.aborted){try{await monitorWallets(store,process.env.SOLANA_RPC_HTTP_URL,process.env.SOLANA_RPC_WS_URL,stop.signal);}catch{if(!stop.signal.aborted)console.error('WALLET_MONITOR_RETRY_NO_EXECUTION');}try{await setTimeout(5000,undefined,{signal:stop.signal});}catch{break;}}})();
try {
  let failures=0,stage='MARKET';while (!stop.signal.aborted) {
   try{stage='MARKET';await marketCycle(store,dex,undefined,rpc);
    stage='JUPITER_FEED';await jupiterMarketCycle(store,new JupiterTokenFeed(undefined,process.env.JUPITER_API_KEY));
    stage='AGENTS';await agentCycle(store,screening);stage='RECEIPT_OBSERVER';await swapReceiptCycle(new SwapPreflightStore(pool),process.env.SOLANA_RPC_HTTP_URL?new WalletReadRpc(process.env.SOLANA_RPC_HTTP_URL):undefined,'LIVE_CHAIN_RPC');stage='EXECUTOR';await executionCycle(new ExecutionStore(pool));progress.marketAt=new Date().toISOString();failures=0;}catch(error){failures++;const reason=error instanceof Error&&error.message==='Query read timeout'?'DATABASE_QUERY_TIMEOUT':error instanceof Error&&/^[A-Z_]{1,80}$/.test(error.message)?error.message:'MARKET_CYCLE_DEPENDENCY_UNAVAILABLE';console.error(JSON.stringify({event:'MARKET_CYCLE_RETRY_NO_EXECUTION',stage,reason,attempt:failures}));try{await store.workerFault(runId,stage,reason);}catch{/* database failure remains visible in stderr/heartbeat age */}}
    try {await setTimeout(failures?Math.min(30000,1000*2**Math.min(failures,5)):30_000,undefined,{signal:stop.signal});} catch {break;}
  }
} catch {console.error('WORKER_STOPPED_DEPENDENCY_FAILURE');process.exitCode=1;}
finally {stop.abort();await Promise.all([monitor,paperWorker,heartbeat]);try{await store.workerHeartbeat(runId,'STOPPED',progress);}catch{console.error('WORKER_STOP_HEARTBEAT_UNAVAILABLE');process.exitCode=1;}finally{await pool.end();}}
