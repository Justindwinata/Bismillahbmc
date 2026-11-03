import { validateBootstrap,databasePool } from './runtime.js';
import { Store,migrate } from '../packages/storage/src/index.js';
import { PaperSchedulerStore } from '../packages/storage/src/paper-scheduler.js';
import { paperPolicy } from '../packages/engine/src/paper-policy.js';
import { jupiterMarketCycle } from '../apps/worker/src/jupiter-market-cycle.js';
import { marketCycle } from '../apps/worker/src/market-cycle.js';
import { DexScreener,SolanaReadRpc } from '../packages/connectors/src/index.js';
import { paperCycle } from '../apps/worker/src/paper-cycle.js';
import { livePaperSources } from '../apps/worker/src/paper-live.js';
validateBootstrap();if(!process.env.SOLANA_RPC_HTTP_URL)throw new Error('READ_ONLY_RPC_REQUIRED');const pool=databasePool();
try{await migrate(pool);const store=new Store(pool),scheduler=new PaperSchedulerStore(pool);await marketCycle(store,new DexScreener(),undefined,new SolanaReadRpc(process.env.SOLANA_RPC_HTTP_URL));await jupiterMarketCycle(store);const automation=await scheduler.create({mode:'PAPER',policy:paperPolicy,initialCashLamports:'100000000',intervalMs:30000});await scheduler.discover();await paperCycle(scheduler,livePaperSources(store,process.env.SOLANA_RPC_HTTP_URL,process.env.JUPITER_API_KEY),'LIVE_PROVIDER',1,automation.id);const detail=await scheduler.research.detail(automation.id);const jobs=(await scheduler.status()).find(a=>a.session_id===automation.id);const observations=(await pool.query('SELECT kind,scope,received_at,source_hash,payload FROM paper_observations WHERE job_id IN (SELECT id FROM paper_jobs WHERE session_id=$1) ORDER BY id',[automation.id])).rows;console.log(JSON.stringify({release:'NOT_LIVE_VERIFIED',purpose:'REAL_READ_ONLY_PROVIDER_PAPER_PROOF',sessionId:automation.id,jobs,detail,observations},null,2));}finally{await pool.end();}
