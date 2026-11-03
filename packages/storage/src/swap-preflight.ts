import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {z} from 'zod';
import {hash,intentSchema,type VerifyContext} from '../../execution/src/verifier.js';
export class SwapPreflightStore{
 constructor(private readonly pool:Pool){}
 async save(intent:unknown,wire:Buffer,sourceClass:'LIVE_CHAIN_RPC'|'REPLAY_TEST',result:unknown,proof?:{verifiedAt:number;context:VerifyContext}){const parsed=intentSchema.parse(intent),classification=z.enum(['LIVE_CHAIN_RPC','REPLAY_TEST']).parse(sourceClass),id=randomUUID(),c=await this.pool.connect();try{await c.query('BEGIN');await c.query('INSERT INTO execution_swap_preflights(id,correlation_id,source_class,intent_hash,wire_hash,result) VALUES ($1,$2,$3,$4,$5,$6)',[id,parsed.correlationId,classification,hash(JSON.stringify(parsed)),hash(wire),JSON.stringify(result)]);if(proof){if((result as {status?:string}).status!=='WIRE_AND_RPC_PROOFS_VERIFIED_NOT_EXECUTION_AUTHORIZED'||!Number.isSafeInteger(proof.verifiedAt))throw new Error('PREPARED_PROOF_INVALID');await c.query('INSERT INTO execution_swap_prepared(preflight_id,intent,unsigned_wire,verified_at,verification_context) VALUES ($1,$2,$3,$4,$5)',[id,JSON.stringify(parsed),wire.toString('base64'),proof.verifiedAt,JSON.stringify(proof.context)]);}const audit=await c.query("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('independent-verifier','SWAP_PREFLIGHT_OBSERVATION',$1,$2) RETURNING id",[parsed.correlationId,JSON.stringify({id,sourceClass:classification,financialAuthorization:'NONE',wireHash:hash(wire),result})]);await c.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0].id]);await c.query('COMMIT');return id;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
 async prepared(id:string){return (await this.pool.query('SELECT p.*,e.source_class,e.correlation_id FROM execution_swap_prepared p JOIN execution_swap_preflights e ON e.id=p.preflight_id WHERE p.preflight_id=$1',[z.uuid().parse(id)])).rows[0]??null;}
 async observe(id:string,signature:string,result:unknown){
  z.uuid().parse(id);z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/).parse(signature);
  // Observation time is provenance, not a new economic event. Repeated identical receipts dedupe.
  const value=result as {provenance?:unknown},digest=hash(JSON.stringify({...value,provenance:undefined})),c=await this.pool.connect();
  try{await c.query('BEGIN');const inserted=await c.query('INSERT INTO execution_swap_receipt_observations(id,preflight_id,signature,result_hash,result) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id',[randomUUID(),id,signature,digest,JSON.stringify(result)]);
   const row=(await c.query('SELECT id FROM execution_swap_receipt_observations WHERE preflight_id=$1 AND signature=$2 AND result_hash=$3',[id,signature,digest])).rows[0];
   if(inserted.rowCount){const audit=await c.query("INSERT INTO audit_events(actor,event_type,correlation_id,payload) SELECT 'receipt-observer','SWAP_RECEIPT_OBSERVED',correlation_id,$2 FROM execution_swap_preflights WHERE id=$1 RETURNING id",[id,JSON.stringify({id:row.id,preflightId:id,signature,result,financialAuthorization:'NONE',portfolioApplied:false})]);await c.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0].id]);}
   await c.query('COMMIT');return row.id as string;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
 async enqueue(preflightId:string,signature:string){
  z.uuid().parse(preflightId);z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/).parse(signature);
  await this.pool.query('INSERT INTO execution_swap_receipt_requests(id,preflight_id,signature) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[randomUUID(),preflightId,signature]);
  return (await this.pool.query('SELECT * FROM execution_swap_receipt_requests WHERE preflight_id=$1 AND signature=$2',[preflightId,signature])).rows[0];
 }
 async claim(sourceClass:'LIVE_CHAIN_RPC'|'REPLAY_TEST',id?:string){
  const token=randomUUID();return (await this.pool.query(`UPDATE execution_swap_receipt_requests r SET lease_token=$1,lease_until=clock_timestamp()+interval '30 seconds',attempts=r.attempts+1 WHERE r.id=(SELECT q.id FROM execution_swap_receipt_requests q JOIN execution_swap_preflights e ON e.id=q.preflight_id WHERE q.state='PENDING' AND q.next_at<=clock_timestamp() AND (q.lease_until IS NULL OR q.lease_until<clock_timestamp()) AND e.source_class=$2 AND ($3::uuid IS NULL OR q.id=$3) ORDER BY q.next_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT 1) RETURNING r.*`,[token,sourceClass,id??null])).rows[0]??null;
 }
 async finish(id:string,token:string,observationId:string,complete:boolean){
  return (await this.pool.query(`UPDATE execution_swap_receipt_requests SET state=CASE WHEN $4 THEN 'COMPLETE' ELSE 'PENDING' END,observation_id=$3,lease_token=NULL,lease_until=NULL,next_at=clock_timestamp()+make_interval(secs=>least(300,5*power(2,least(attempts,6)))::int) WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp() RETURNING id`,[id,token,observationId,complete])).rowCount===1;
 }
 async requests(){return (await this.pool.query('SELECT id,preflight_id,signature,state,attempts,next_at,observation_id FROM execution_swap_receipt_requests ORDER BY next_at DESC,id LIMIT 20')).rows;}
 async receipts(){return (await this.pool.query('SELECT r.*,e.correlation_id,e.source_class FROM execution_swap_receipt_observations r JOIN execution_swap_preflights e ON e.id=r.preflight_id ORDER BY r.created_at DESC,r.id LIMIT 20')).rows;}
 async list(){return (await this.pool.query('SELECT id,correlation_id,source_class,intent_hash,wire_hash,result,created_at FROM execution_swap_preflights ORDER BY created_at DESC,id LIMIT 20')).rows;}
}
