import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Store} from '../../../packages/storage/src/index.js';
import type {WalletReadRpc} from '../../../packages/connectors/src/wallet.js';
import {ProgramReviewStore} from '../../../packages/storage/src/program-reviews.js';
import {SwapPreflightStore} from '../../../packages/storage/src/swap-preflight.js';
import {loadMainnetSwapContext} from '../../../packages/execution/src/swap-context.js';
import {swapReceiptCycle} from '../../worker/src/swap-receipt-cycle.js';
import {SigningStore} from '../../../packages/storage/src/signing.js';
import {productionSigningCapability} from '../../../packages/execution/src/signing-policy.js';
import {intentSchema} from '../../../packages/execution/src/verifier.js';
export function swapPreflightRoutes(app:FastifyInstance,store:Store,rpc:Pick<WalletReadRpc,'read'>|undefined,sourceClass:'LIVE_CHAIN_RPC'|'REPLAY_TEST'|undefined){
 const evidence=new SwapPreflightStore(store.pool),reviews=new ProgramReviewStore(store.pool);let active=false,lastAt=0;
 app.post('/api/v1/execution/signer-mandates/:id/revoke',async(request,reply)=>{const params=z.object({id:z.uuid()}).safeParse(request.params),body=z.strictObject({reason:z.string().min(1).max(250)}).safeParse(request.body);if(!params.success||!body.success)return reply.code(400).send({error:'INVALID_SIGNER_REVOCATION'});if(!await new SigningStore(store.pool).revoke(params.data.id,body.data.reason))return reply.code(404).send({error:'SIGNER_MANDATE_NOT_FOUND'});return {status:'REVOKED',mainnetSigning:false};});
 app.get('/api/v1/execution/signing-status',async()=>({...productionSigningCapability,sourceClass:'HARNESS_NOT_CHAIN',journal:await new SigningStore(store.pool).list()}));
 app.get('/api/v1/execution/preflights',()=>evidence.list());
 app.get('/api/v1/execution/receipt-observations',()=>evidence.receipts());
 app.get('/api/v1/execution/receipt-requests',()=>evidence.requests());
 app.post('/api/v1/execution/observe-swap-receipt',async(request,reply)=>{
  const input=z.strictObject({preflightId:z.uuid(),signature:z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/)}).safeParse(request.body);
  if(!input.success)return reply.code(400).send({error:'INVALID_RECEIPT_OBSERVATION'});
  if(!rpc||!sourceClass)return reply.code(503).send({error:'READ_RPC_OR_PROVENANCE_NOT_CONFIGURED'});
  if(active||Date.now()-lastAt<2000)return reply.code(429).send({error:'PREFLIGHT_QUOTA'});
  active=true;lastAt=Date.now();try{
   const prepared=await evidence.prepared(input.data.preflightId);if(!prepared)return reply.code(404).send({error:'VERIFIED_PREFLIGHT_REQUIRED'});
   if(prepared.source_class!==sourceClass)return reply.code(409).send({error:'RECEIPT_PROVENANCE_MISMATCH'});
   const job=await evidence.enqueue(prepared.preflight_id,input.data.signature);return await swapReceiptCycle(evidence,rpc,sourceClass,job.id);
  }catch{return reply.code(422).send({error:'RECEIPT_PROVIDER_OR_PROOF_INVALID',financialAuthorization:'NONE'});}finally{active=false;}
 });
 app.post('/api/v1/execution/preflight-swap',async(request,reply)=>{
 const parsed=z.strictObject({intent:intentSchema,transaction:z.string().min(100).max(1644),minimumSlot:z.number().int().safe().positive()}).safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_SWAP_PREFLIGHT'});const {intent,transaction,minimumSlot}=parsed.data,wire=Buffer.from(transaction,'base64');if(wire.toString('base64')!==transaction||intent.mode!=='MAINNET')return reply.code(400).send({error:'UNSIGNED_MAINNET_PREFLIGHT_REQUIRED'});
 if(!rpc||!sourceClass)return reply.code(503).send({error:'READ_RPC_OR_PROVENANCE_NOT_CONFIGURED',financialAuthorization:'NONE'});if(active||Date.now()-lastAt<2000)return reply.code(429).send({error:'PREFLIGHT_QUOTA',financialAuthorization:'NONE'});active=true;lastAt=Date.now();
 try{const result=await loadMainnetSwapContext(wire,intent,rpc,minimumSlot,(program,codeHash)=>reviews.resolve(codeHash,program));const output={status:'WIRE_AND_RPC_PROOFS_VERIFIED_NOT_EXECUTION_AUTHORIZED',scope:'SINGLE_CPMM_EXISTING_ACCOUNTS',financialAuthorization:'NONE',sourceClass,chainSettlementVerified:false,messageHash:result.verified.messageHash,slotWindow:result.slotWindow,consistency:result.consistency,receipts:result.receipts};const id=await evidence.save(intent,wire,sourceClass,output,{verifiedAt:result.context.now,context:result.context});return {id,...output};}
 catch(error){const reason=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'PREFLIGHT_PROVIDER_OR_PROOF_INVALID';const result={status:'VETO',reason,financialAuthorization:'NONE',sourceClass,chainSettlementVerified:false};const id=await evidence.save(intent,wire,sourceClass,result);return reply.code(422).send({id,...result});}finally{active=false;}
 });
}
