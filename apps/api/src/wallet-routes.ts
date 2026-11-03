import { PortfolioReader } from '../../../packages/connectors/src/portfolio.js';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../../../packages/storage/src/index.js';
import { address } from '../../../packages/domain/src/index.js';
import type { WalletReadRpc } from '../../../packages/connectors/src/wallet.js';
import { observation } from '../../../packages/connectors/src/index.js';
import { cookieToken,digest,opaque } from './auth.js';
import { verifyWalletMessage,walletMessage } from './wallet-proof.js';
export function walletRoutes(app:FastifyInstance,store:Store,origin:string,rpc?:Pick<WalletReadRpc,'read'>){
 async function identity(cookie:string|undefined){const token=cookieToken(cookie);if(!token)throw new Error('OWNER_SESSION_REQUIRED');const hash=digest(token);if(!await store.session(hash))throw new Error('OWNER_SESSION_REQUIRED');return hash;}
 app.post('/api/v1/wallet/challenge',async(request,reply)=>{
  const parsed=z.strictObject({address}).safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_WALLET'});const hash=await identity(request.headers.cookie);const client=await store.pool.connect();
  try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7011002)');
   const recent=await client.query("SELECT id FROM wallet_challenges WHERE session_hash=$1 AND issued_at>clock_timestamp()-interval '1 minute'",[hash]);
   if((recent.rowCount??0)>=5){await client.query('ROLLBACK');return reply.code(429).send({error:'WALLET_CHALLENGE_RATE_LIMIT'});}
   const id=randomUUID(),issued=new Date().toISOString(),expires=new Date(Date.now()+120000).toISOString();const message=walletMessage(origin,parsed.data.address,opaque(),id,issued,expires);
   await client.query('INSERT INTO wallet_challenges(id,session_hash,address,message,expires_at) VALUES ($1,$2,$3,$4,$5)',[id,hash,parsed.data.address,message,expires]);await client.query('COMMIT');return {id,message,expiresAt:expires,purpose:'READ_ONLY_IDENTITY'};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 });
 app.post('/api/v1/wallet/verify',async(request,reply)=>{
  const input=z.strictObject({challengeId:z.uuid(),signature:z.string().regex(/^[a-f0-9]{128}$/)}).safeParse(request.body);if(!input.success)return reply.code(400).send({error:'INVALID_PROOF'});const hash=await identity(request.headers.cookie);const client=await store.pool.connect();
  try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7011002)');
   const challenge=(await client.query('UPDATE wallet_challenges SET consumed_at=clock_timestamp() WHERE id=$1 AND session_hash=$2 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING address,message',[input.data.challengeId,hash])).rows[0];
   if(!challenge||!verifyWalletMessage(challenge.address,challenge.message,input.data.signature)){await client.query('COMMIT');return reply.code(403).send({error:'WALLET_PROOF_REJECTED'});}
   const proofHash=digest(challenge.message+input.data.signature);
   await client.query('INSERT INTO wallet_bindings(session_hash,address,proof_hash) VALUES ($1,$2,$3) ON CONFLICT(session_hash) DO UPDATE SET address=$2,proof_hash=$3,verified_at=clock_timestamp()',[hash,challenge.address,proofHash]);
   const audit=await client.query("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('owner','WALLET_IDENTITY_VERIFIED',$1,$2) RETURNING id",[randomUUID(),JSON.stringify({address:challenge.address,proofHash,authority:'READ_ONLY_IDENTITY'})]);await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0].id]);await client.query('COMMIT');return {address:challenge.address,authority:'READ_ONLY_IDENTITY',signerEnabled:false};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 });
 app.get('/api/v1/wallet',async(request)=>{const hash=await identity(request.headers.cookie);const binding=(await store.pool.query('SELECT address,verified_at,proof_hash FROM wallet_bindings WHERE session_hash=$1',[hash])).rows[0];return binding?{status:'VERIFIED',...binding,authority:'READ_ONLY_IDENTITY',signerEnabled:false}:{status:'NOT_CONNECTED',signerEnabled:false};});
 app.post('/api/v1/wallet/disconnect',async(request)=>{const hash=await identity(request.headers.cookie);const client=await store.pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7011002)');await client.query('DELETE FROM wallet_bindings WHERE session_hash=$1',[hash]);await client.query('UPDATE wallet_challenges SET consumed_at=clock_timestamp() WHERE session_hash=$1 AND consumed_at IS NULL',[hash]);const audit=await client.query("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('owner','WALLET_DISCONNECTED',$1,'{}') RETURNING id",[randomUUID()]);await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0].id]);await client.query('COMMIT');return {status:'NOT_CONNECTED'};}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}});
 app.get('/api/v1/wallet/portfolio',async(request)=>{
  const hash=await identity(request.headers.cookie);const binding=(await store.pool.query('SELECT address,proof_hash FROM wallet_bindings WHERE session_hash=$1',[hash])).rows[0];if(!binding)return {status:'NOT_CONNECTED',holdings:null,nativeBalanceLamports:null,equityLamports:null};if(!rpc)return {status:'UNAVAILABLE',reason:'RPC_NOT_CONFIGURED',holdings:null,nativeBalanceLamports:null,equityLamports:null};
  const result=await new PortfolioReader(rpc).read(binding.address);const current=(await store.pool.query('SELECT address,proof_hash FROM wallet_bindings WHERE session_hash=$1',[hash])).rows[0];if(!current||current.address!==binding.address||current.proof_hash!==binding.proof_hash)return {status:'BINDING_CHANGED',holdings:null,nativeBalanceLamports:null,equityLamports:null};
  if(result.status==='AVAILABLE')await store.save(observation('solana-rpc','wallet-portfolio:'+binding.address,result,Date.now(),result.slotWindow!.to));return {...result,authority:'READ_ONLY_IDENTITY',signerEnabled:false};
 });
 app.get('/api/v1/wallet/balance',async(request)=>{
  const hash=await identity(request.headers.cookie);const binding=(await store.pool.query('SELECT address,proof_hash FROM wallet_bindings WHERE session_hash=$1',[hash])).rows[0];if(!binding)return {status:'NOT_CONNECTED',balanceLamports:null};if(!rpc)return {status:'UNAVAILABLE',reason:'RPC_NOT_CONFIGURED',balanceLamports:null};
  try{if(await rpc.read('getGenesisHash')!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw new Error('WRONG_NETWORK');const raw=await rpc.read('getBalance',[binding.address,{commitment:'finalized'}]);const result=z.object({context:z.object({slot:z.number().int().nonnegative().safe()}),value:z.number().int().nonnegative().safe()}).parse(raw);const current=(await store.pool.query('SELECT address,proof_hash FROM wallet_bindings WHERE session_hash=$1',[hash])).rows[0];if(!current||current.address!==binding.address||current.proof_hash!==binding.proof_hash)return {status:'BINDING_CHANGED',balanceLamports:null};const receivedAt=new Date().toISOString();const balance={address:binding.address,balanceLamports:String(result.value),slot:String(result.context.slot),commitment:'finalized',receivedAt,dataClass:'LIVE_CHAIN'};await store.save(observation('solana-rpc','wallet-balance:'+binding.address,balance,Date.now(),balance.slot));return {status:'AVAILABLE',...balance,scope:'NATIVE_SOL_ONLY_NOT_EQUITY'};}catch{return {status:'UNAVAILABLE',reason:'RPC_OR_BALANCE_UNVERIFIED',balanceLamports:null};}
 });
}
