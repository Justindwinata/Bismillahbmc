// Read-only public provider qualification. Never pins a discovered program revision automatically.
import { Pool } from '../packages/storage/src/index.js';
import { ProgramReviewStore } from '../packages/storage/src/program-reviews.js';
import { CpmmSecurityReader,CPMM_PROGRAM } from '../packages/connectors/src/pool-security.js';
import { WalletReadRpc } from '../packages/connectors/src/wallet.js';
import { ReadTransport } from '../packages/connectors/src/index.js';
import { z } from 'zod';
import { address } from '../packages/domain/src/index.js';
const start=Date.now(),startedAt=new Date(start).toISOString();
const endpoint=process.env.SOLANA_RPC_HTTP_URL??'https://api.mainnet-beta.solana.com';
const source='https://api-v3.raydium.io/pools/info/list?poolType=all&poolSortField=liquidity&sortType=desc&pageSize=100&page=1';
const raw=await new ReadTransport().json(source);
const list=z.object({data:z.object({data:z.array(z.object({id:address,programId:address,mintA:z.object({address}),mintB:z.object({address})}))})}).parse(raw).data.data;
const wsol='So11111111111111111111111111111111111111112';
const candidates=list.filter(p=>p.programId===CPMM_PROGRAM&&[p.mintA.address,p.mintB.address].includes(wsol)).slice(0,3);
const db=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL}):null;
const reader=new CpmmSecurityReader(new WalletReadRpc(endpoint,new ReadTransport(fetch,Date.now,2_000_000)),Date.now,async hash=>db?new ProgramReviewStore(db).resolve(hash):null);const proofs=[];
try{for(const p of candidates)proofs.push(await reader.screen(p.id,p.mintA.address===wsol?p.mintB.address:p.mintA.address));}finally{await db?.end();}
const counts:Record<string,number>={};for(const p of proofs)for(const reason of p.reasons)counts[reason]=(counts[reason]??0)+1;
console.log(JSON.stringify({startedAt,endedAt:new Date().toISOString(),elapsedMs:Date.now()-start,source,listedPools:list.length,sampledPools:proofs.length,scope:'READ_ONLY_POOL_SCREEN_NOT_TRADING',status:proofs.some(p=>p.assessment==='PASS')?'POOL_SCREEN_PASS_REQUIRES_REMAINING_ENTRY_GATES':'NO_SAFE_ENTRY_OBSERVED',rejectionDistribution:counts,proofs},null,2));
