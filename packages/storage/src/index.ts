import { providerDimensions,blockerCategory } from '../../domain/src/health.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { readdir,readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import type { evaluate } from '../../engine/src/index.js';
import type { SourceObservation } from '../../connectors/src/index.js';
export { Pool };
export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(7011001)");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, hash text NOT NULL)');
    const directory = new URL('../../../ops/migrations/',import.meta.url);
    for (const name of (await readdir(directory)).filter(n => /^\d+_[a-z_]+\.sql$/.test(n)).sort()) {
      const sql = await readFile(new URL(name,directory),'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const version = name.split('_')[0]!;
      const previous = await client.query<{hash:string}>('SELECT hash FROM schema_migrations WHERE version=$1',[version]);
      if (previous.rows.length) {
        if (previous.rows[0]!.hash !== hash) throw new Error('MIGRATION_HASH_MISMATCH');
      } else {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations VALUES ($1,$2)',[version,hash]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {await client.query('ROLLBACK'); throw error;}
  finally {client.release();}
}
export class Store {
  constructor(readonly pool: Pool) {}
  async save(source: SourceObservation): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(7011002)');
      const inserted = await client.query('INSERT INTO source_snapshots(provider,source_key,source_hash,data_class,received_at,source_at,slot,payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id', [source.provider,source.sourceKey,source.hash,source.dataClass,source.receivedAt,source.sourceAt,source.slot,JSON.stringify(source.payload)]);
      if (inserted.rowCount) {
        const audit = await client.query<{id:string}>("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('worker','SOURCE_OBSERVED',$1,$2) RETURNING id",[randomUUID(),JSON.stringify({sourceId:inserted.rows[0].id,hash:source.hash})]);
        await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0]!.id]);
      }
      await client.query('COMMIT');
      return Boolean(inserted.rowCount);
    } catch (error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }
  async health(provider: string,status: 'OK'|'DEGRADED'|'NOT_CONFIGURED',reason: string | null) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(7011002)');
      const dimensions=providerDimensions(status,reason,provider);
      await client.query(`INSERT INTO provider_health(provider,status,observed_at,last_success_at,reason,transport_status,response_quality,subscription_state,last_data_at)
        VALUES ($1,$2,clock_timestamp(),CASE WHEN $2='OK' THEN clock_timestamp() END,$3,$4,$5,$6,
          CASE WHEN $1='solana-ws' AND $7 THEN clock_timestamp()
           WHEN $1 IN ('dexscreener','solana-rpc','jupiter-tokens') THEN (SELECT max(received_at) FROM source_snapshots WHERE provider=$1)
           WHEN $1='dex-market' THEN (SELECT max(received_at) FROM market_observations WHERE coalesce(payload->>'sourceProvider','dexscreener')='dexscreener')
           WHEN $1='wallet-rpc' THEN (SELECT max(received_at) FROM wallet_observations) END)
        ON CONFLICT(provider) DO UPDATE SET status=$2,observed_at=clock_timestamp(),
        last_success_at=CASE WHEN $2='OK' THEN clock_timestamp() ELSE provider_health.last_success_at END,reason=$3,
        transport_status=$4,response_quality=$5,subscription_state=$6,last_data_at=GREATEST(provider_health.last_data_at,EXCLUDED.last_data_at)`,[provider,status,reason,dimensions.transport,dimensions.quality,dimensions.subscription,dimensions.dataTick]);

      const audit=await client.query<{id:string}>("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('worker','PROVIDER_HEALTH',$1,$2) RETURNING id",[randomUUID(),JSON.stringify({provider,status,reason})]);
      await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0]!.id]);
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  }
  async system() {
    const state = await this.pool.query<{mode:'OBSERVE'|'HALTED';signer_enabled:false}>('SELECT mode,signer_enabled FROM system_state WHERE singleton');
    if (state.rows.length !== 1) throw new Error('SYSTEM_STATE_MISSING');
    const health = await this.pool.query('SELECT * FROM provider_health ORDER BY provider');
    return {...state.rows[0]!,providers:health.rows};
  }
  async candidates() {
    return (await this.pool.query(`SELECT * FROM (SELECT DISTINCT ON(source_key) source_key AS mint,source_hash,data_class,received_at,source_at,slot,payload
      FROM source_snapshots WHERE provider IN ('dexscreener','jupiter-tokens') ORDER BY source_key,received_at DESC,id DESC) latest
      ORDER BY received_at DESC,mint LIMIT 100`)).rows;
  }
  async halt(actor: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(7011002)');
      const changed=await client.query("UPDATE system_state SET mode='HALTED',updated_at=clock_timestamp() WHERE singleton AND mode <> 'HALTED' RETURNING mode");
      if (!changed.rowCount) {await client.query('COMMIT');return;}
      const audit = await client.query<{id:string}>("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ($1,'SYSTEM_HALTED',$2,'{}') RETURNING id",[actor,randomUUID()]);
      await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0]!.id]);
      await client.query('COMMIT');
    } catch (error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }
  async session(hash: string) {
    return (await this.pool.query<{csrf_token:string;expires_at:Date}>('SELECT csrf_token,expires_at FROM browser_sessions WHERE token_hash=$1 AND expires_at>clock_timestamp()',[hash])).rows[0] ?? null;
  }
  async createSession(hash:string,csrf:string) {
    await this.pool.query('DELETE FROM browser_sessions WHERE expires_at<clock_timestamp()');
    await this.pool.query("INSERT INTO browser_sessions(token_hash,csrf_token,expires_at) VALUES ($1,$2,clock_timestamp()+interval '2 hours')",[hash,csrf]);
  }
  async deleteSession(hash:string) {await this.pool.query('DELETE FROM browser_sessions WHERE token_hash=$1',[hash]);}
  async events(after:string,limit=100) {
    return (await this.pool.query(`SELECT o.id::text AS sequence,a.event_type AS type,a.recorded_at,a.correlation_id,a.payload
      FROM outbox_events o JOIN audit_events a ON a.id=o.audit_id WHERE o.id>$1 ORDER BY o.id LIMIT $2`,[after,limit])).rows;
  }
  async dashboard() {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const state=(await client.query('SELECT mode,signer_enabled,updated_at FROM system_state WHERE singleton')).rows[0];
      if (!state) throw new Error('SYSTEM_STATE_MISSING');
      const providers=(await client.query('SELECT * FROM provider_health ORDER BY provider')).rows;
      const workers=(await client.query('SELECT run_id,state,started_at,observed_at,progress FROM worker_heartbeats ORDER BY observed_at DESC LIMIT 10')).rows;
      const candidates=(await client.query(`WITH selected AS MATERIALIZED (
        SELECT * FROM (SELECT DISTINCT ON (source_key) source_key AS mint,id,received_at
          FROM source_snapshots WHERE provider IN ('dexscreener','jupiter-tokens') ORDER BY source_key,received_at DESC,id DESC) latest
        ORDER BY received_at DESC,mint LIMIT 100)
        SELECT c.mint,s.received_at,s.source_at,s.data_class,s.source_hash,s.payload,
        (SELECT t.payload FROM token_security_snapshots t WHERE t.mint=c.mint ORDER BY t.received_at DESC,t.id DESC LIMIT 1) AS security,
        (SELECT m.payload FROM market_observations m WHERE m.mint=c.mint ORDER BY m.received_at DESC,m.id DESC LIMIT 1) AS market,
        (SELECT m.received_at FROM market_observations m WHERE m.mint=c.mint ORDER BY m.received_at DESC,m.id DESC LIMIT 1) AS market_received_at
        FROM selected c JOIN source_snapshots s ON s.id=c.id ORDER BY c.received_at DESC,c.mint`)).rows;
      const chain=(await client.query("SELECT slot::text,received_at FROM source_snapshots WHERE provider='solana-rpc' AND source_key='finalized-slot' ORDER BY received_at DESC LIMIT 1")).rows[0] ?? null;
      const events=(await client.query(`SELECT o.id::text AS sequence,a.event_type AS type,a.recorded_at,a.correlation_id,a.payload
        FROM outbox_events o JOIN audit_events a ON a.id=o.audit_id ORDER BY o.id DESC LIMIT 50`)).rows;
      const watchlist=(await client.query('SELECT * FROM wallet_watchlists ORDER BY created_at')).rows;
      const copyFeed=(await client.query('SELECT signature,wallet,slot::text,source_at,received_at,payload FROM wallet_observations ORDER BY received_at DESC LIMIT 100')).rows;
      const lag=(await client.query("SELECT percentile_disc(0.50) WITHIN GROUP(ORDER BY extract(epoch FROM (received_at-source_at))*1000) AS p50_ms,percentile_disc(0.95) WITHIN GROUP(ORDER BY extract(epoch FROM (received_at-source_at))*1000) AS p95_ms FROM wallet_observations WHERE source_at IS NOT NULL AND source_at<=received_at")).rows[0];
      const cursor=(await client.query("SELECT coalesce(max(id),0)::text AS cursor FROM outbox_events")).rows[0].cursor as string;
      const agents=(await client.query("SELECT DISTINCT ON(role) role,payload FROM agent_events WHERE payload->>'mode' IN ('OBSERVE','HALTED') ORDER BY role,recorded_at DESC,event_id DESC")).rows;
      await client.query('COMMIT');
      return {version:1,recordedAt:new Date().toISOString(),cursor,system:{...state,providers},chain,candidates,events,workers,release:'NOT_LIVE_VERIFIED',wallet:{status:'NOT_CONNECTED',equity:null},agents,watchlist,copyFeed,lag};
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  }
  async saveMarket(mint:string,pair:string,payload:unknown,receivedAt:string,sourceAt:string|null=null) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(7011002)');
      const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const inserted=await client.query<{id:string}>('INSERT INTO market_observations(mint,pair_address,received_at,source_hash,payload,source_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',[mint,pair,receivedAt,hash,JSON.stringify(payload),sourceAt]);
      const audit=await client.query<{id:string}>("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('worker','MARKET_OBSERVED',$1,$2) RETURNING id",[randomUUID(),JSON.stringify({mint,pair,marketId:inserted.rows[0]!.id,hash,dataClass:'LIVE_PROVIDER'})]);
      await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0]!.id]);
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  }

  async watchlists() {return (await this.pool.query<{address:string;last_signature:string|null}>('SELECT address,last_signature FROM wallet_watchlists ORDER BY created_at')).rows;}
  async addWatch(address:string) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7011002)');
      const exists=await client.query('SELECT address FROM wallet_watchlists WHERE address=$1',[address]);
      if(!exists.rowCount){
        if(Number((await client.query('SELECT count(*) FROM wallet_watchlists')).rows[0].count)>=2)throw new Error('WATCHLIST_LIMIT');
        await client.query('INSERT INTO wallet_watchlists(address) VALUES ($1)',[address]);
        const audit=await client.query<{id:string}>("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('owner','WATCHLIST_ADDED',$1,$2) RETURNING id",[randomUUID(),JSON.stringify({address})]);
        await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0]!.id]);
      }
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async walletWindow(wallet:string,observations:{signature:string;slot:string;flow:{sourceAt:string|null}}[],cursor:string|null,initial:boolean,expectedCursor:string|null){
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7011002)');
      const watermark=(await client.query('SELECT last_signature FROM wallet_watchlists WHERE address=$1 FOR UPDATE',[wallet])).rows[0];
      if(!watermark||watermark.last_signature!==expectedCursor)throw new Error('WALLET_CURSOR_CONFLICT');
      for(const item of observations){
        const payload={...item.flow,dataClass:'LIVE_CHAIN',copyAction:'SKIP',initialWindow:initial};
        const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        const inserted=await client.query('INSERT INTO wallet_observations(signature,wallet,slot,source_at,payload,source_hash) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING signature',[item.signature,wallet,item.slot,item.flow.sourceAt,JSON.stringify(payload),hash]);
        if(!inserted.rowCount){const prior=(await client.query('SELECT payload FROM wallet_observations WHERE wallet=$1 AND signature=$2',[wallet,item.signature])).rows[0];const incoming=(item.flow as {provenance?:{receiptHash?:string}}).provenance?.receiptHash;if(incoming&&prior?.payload?.provenance?.receiptHash!==incoming)throw new Error('WALLET_RECEIPT_CONFLICT');}
        if(inserted.rowCount){const audit=await client.query<{id:string}>("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('wallet-observer','WALLET_FLOW_OBSERVED',$1,$2) RETURNING id",[randomUUID(),JSON.stringify({wallet,signature:item.signature,hash})]);await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0]!.id]);}
      }
      await client.query("UPDATE wallet_watchlists SET last_signature=$2,status=$3 WHERE address=$1",[wallet,cursor,initial?'INITIAL_WINDOW_ONLY':'BACKFILLED']);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async saveEvaluation(result:ReturnType<typeof evaluate>){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7011002)');
      const inserted=await client.query('INSERT INTO agent_runs(decision_id,mint,input_hash,policy_hash,mode,action) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING decision_id',[result.decisionId,result.mint,result.inputHash,result.policyHash,result.mode,result.action]);
      if(inserted.rowCount){
        for(const event of result.events)await client.query('INSERT INTO agent_events(event_id,decision_id,role,payload) VALUES ($1,$2,$3,$4)',[event.eventId,event.decisionId,event.role,JSON.stringify(event)]);
        const audit=await client.query<{id:string}>("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('desk','AGENT_DECISION',$1,$2) RETURNING id",[result.decisionId,JSON.stringify({decisionId:result.decisionId,mint:result.mint,action:result.action,policyHash:result.policyHash})]);
        await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0]!.id]);
      }
      await client.query('COMMIT');return Boolean(inserted.rowCount);
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  async workerFault(runId:string,component:string,reason:string){
    z.uuid().parse(runId);z.enum(['MARKET','JUPITER_FEED','AGENTS','RECEIPT_OBSERVER','EXECUTOR']).parse(component);z.string().regex(/^[A-Z_]{1,80}$/).parse(reason);const c=await this.pool.connect();try{await c.query('BEGIN');const row=(await c.query("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('worker','DEPENDENCY_FAILURE_RETRY',$1,$2) RETURNING id",[runId,JSON.stringify({component,reason,financialAuthorization:'NONE',observedAt:new Date().toISOString()})])).rows[0];await c.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[row.id]);await c.query('COMMIT');}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  }
  async workerHeartbeat(runId:string,state:'RUNNING'|'STOPPED',progress:unknown){
    z.uuid().parse(runId);z.enum(['RUNNING','STOPPED']).parse(state);const validated=z.strictObject({marketAt:z.string().datetime().nullable(),paperAt:z.string().datetime().nullable(),sourceIdentity:z.string().regex(/^[a-f0-9]{64}$/).optional(),workerPid:z.number().int().positive().safe().optional()}).parse(progress);
    await this.pool.query(`WITH updated AS (INSERT INTO worker_heartbeats(run_id,state,progress) VALUES ($1,$2,$3) ON CONFLICT(run_id) DO UPDATE SET state=$2,progress=$3,observed_at=clock_timestamp() WHERE worker_heartbeats.state<>'STOPPED' RETURNING run_id) INSERT INTO worker_observation_samples(run_id,state,mode,progress,providers) SELECT run_id,$2,(SELECT mode FROM system_state WHERE singleton),$3,coalesce((SELECT jsonb_agg(row_to_json(p)) FROM provider_health p),'[]'::jsonb) FROM updated`,[runId,state,JSON.stringify(validated)]);
  }
  async decision(id:string){
    const run=(await this.pool.query('SELECT * FROM agent_runs WHERE decision_id=$1',[id])).rows[0];
    if(!run)return null;
    const events=(await this.pool.query('SELECT role,payload FROM agent_events WHERE decision_id=$1 ORDER BY recorded_at,event_id',[id])).rows;
    const journal=(await this.pool.query(`SELECT j.session_id,j.request_key,j.input,j.fill,j.snapshot,j.lease_valid_until,e.sequence::text AS ledger_sequence,a.scope FROM research_journal j LEFT JOIN paper_ledger_events e ON e.journal_id=j.id LEFT JOIN paper_automations a ON a.session_id=j.session_id WHERE j.decision_id=$1`,[id])).rows[0]??null;
    const sourceReceipts=journal?(await this.pool.query(`SELECT o.kind,o.scope,o.received_at,o.source_hash,o.payload FROM paper_observations o JOIN paper_jobs j ON j.id=o.job_id WHERE j.session_id=$1 AND o.lease_token=$2 ORDER BY o.id`,[journal.session_id,journal.request_key])).rows:[];
    return {run,events:events.map(e=>({...e,diagnostics:(e.payload.output.reasons as string[]).map(reason=>({reason,category:blockerCategory(reason)}))})),lineage:journal?{classification:'RESEARCH_NOT_CHAIN',chainSignature:null,...journal,sourceReceipts}:null};
  }

  async resumeObserve(){
    const client=await this.pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7011002)');
      const changed=await client.query("UPDATE system_state SET mode='OBSERVE',updated_at=clock_timestamp() WHERE singleton AND mode='HALTED' AND signer_enabled=false RETURNING mode");
      if(changed.rowCount){const audit=await client.query<{id:string}>("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('owner-reauth','RESUMED_OBSERVE_ONLY',$1,$2) RETURNING id",[randomUUID(),JSON.stringify({signerEnabled:false,liveTradingEnabled:false})]);await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0]!.id]);}
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

}
