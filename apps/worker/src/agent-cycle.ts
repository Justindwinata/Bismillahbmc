import { MintSecurityReader } from '../../../packages/connectors/src/security.js';
import { WalletReadRpc } from '../../../packages/connectors/src/wallet.js';
import { evaluate,fingerprint } from '../../../packages/engine/src/index.js';
import type { Store } from '../../../packages/storage/src/index.js';
import { validateBootstrap } from '../../../scripts/runtime.js';
export async function agentCycle(store:Store,screen?:MintSecurityReader){
  const system=await store.system();
  const policyHash=fingerprint(validateBootstrap());
  const inputs=(await store.pool.query<{mint:string;source_id:string;source_hash:string;received_at:Date;payload:{liquidity?:{usd?:number};volume?:{m5?:number;h24?:number}}}>(`WITH latest AS (SELECT DISTINCT ON(mint) mint,id,source_hash,received_at,payload FROM market_observations WHERE received_at>=statement_timestamp()-interval '90 seconds' ORDER BY mint,received_at DESC,id DESC)
    SELECT l.mint,l.id::text AS source_id,l.source_hash,l.received_at,l.payload FROM latest l LEFT JOIN agent_cursors c ON c.mint=l.mint
    WHERE l.received_at>=clock_timestamp()-interval '90 seconds' AND l.received_at<=clock_timestamp()
    ORDER BY l.received_at DESC,c.last_considered_at ASC NULLS FIRST,l.id DESC,l.mint LIMIT 5`)).rows;
  for(const item of inputs){
    await store.pool.query('INSERT INTO agent_cursors(mint) VALUES ($1) ON CONFLICT(mint) DO UPDATE SET last_considered_at=clock_timestamp()',[item.mint]);
    let evidence:Awaited<ReturnType<MintSecurityReader['screen']>>|null=null;
    if(screen){evidence=await screen.screen(item.mint,1000);await store.pool.query('INSERT INTO token_security_snapshots(mint,slot,source_hash,payload) VALUES ($1,$2,$3,$4)',[item.mint,evidence.slot,evidence.hash,JSON.stringify(evidence)]);}
    await store.saveEvaluation(evaluate({mint:item.mint,sourceId:'market:'+item.source_id,sourceHash:item.source_hash,receivedAt:item.received_at.toISOString(),sourceAt:null,mode:system.mode,inputDataClass:'LIVE_PROVIDER',market:{liquidityUsd:item.payload.liquidity?.usd??null,volume5mUsd:item.payload.volume?.m5??null,volume24hUsd:item.payload.volume?.h24??null},security:evidence?.security??null,balanceLamports:null,...(evidence?.slot?{chainEvidence:{mint:item.mint,slot:evidence.slot,verifiedAt:evidence.verifiedAt,hash:evidence.hash,commitment:'finalized'}}:{})},policyHash));
  }
}

export const configuredSecurityReader=()=>process.env.SOLANA_RPC_HTTP_URL?new MintSecurityReader(new WalletReadRpc(process.env.SOLANA_RPC_HTTP_URL)):undefined;
