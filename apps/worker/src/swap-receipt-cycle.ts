import {z} from 'zod';
import type {VerifyContext} from '../../../packages/execution/src/verifier.js';
import type {WalletReadRpc} from '../../../packages/connectors/src/wallet.js';
import {reconcileFinalizedSwap} from '../../../packages/execution/src/swap-chain-receipt.js';
import {SwapPreflightStore} from '../../../packages/storage/src/swap-preflight.js';
/** Independent read-only recovery. Neither an absent receipt nor an expired lease can submit a transaction. */
export async function swapReceiptCycle(store:SwapPreflightStore,rpc:Pick<WalletReadRpc,'read'>|undefined,sourceClass:'LIVE_CHAIN_RPC'|'REPLAY_TEST',requestId?:string,fault?:(state:string)=>void){
 if(!rpc)return {status:'DISABLED_NO_READ_RPC'};
 const job=await store.claim(sourceClass,requestId);if(!job)return {status:'IDLE'};
 const prepared=await store.prepared(job.preflight_id);if(!prepared)throw new Error('PREPARED_PROOF_MISSING');
 let result:unknown,complete=false;
 try{
  const raw=z.object({transaction:z.tuple([z.string().max(1644),z.literal('base64')])}).safeParse(await rpc.read('getTransaction',[job.signature,{commitment:'finalized',encoding:'base64',maxSupportedTransactionVersion:0}]));
  if(!raw.success)throw new Error('SIGNED_RECEIPT_UNAVAILABLE');
  const signed=Buffer.from(raw.data.transaction[0],'base64'),unsigned=Buffer.concat([Buffer.from([1]),Buffer.alloc(64),signed.subarray(65)]);
  if(signed.toString('base64')!==raw.data.transaction[0]||!unsigned.equals(Buffer.from(prepared.unsigned_wire,'base64')))throw new Error('RECEIPT_NOT_PREPARED_TRANSACTION');
  const observed=await reconcileFinalizedSwap({intent:prepared.intent,signedWire:signed,signature:job.signature,verifiedAt:Number(prepared.verified_at),verificationContext:prepared.verification_context as VerifyContext},rpc,sourceClass);
  result=observed;complete=observed.status==='RECONCILED_OBSERVATION';
 }catch(error){result={status:'UNKNOWN',reason:error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'RECEIPT_PROVIDER_OR_PROOF_INVALID',sourceClass,chainVerified:false,financialAuthorization:'NONE',receipt:null,accounting:null};}
 const id=await store.observe(prepared.preflight_id,job.signature,result);fault?.('OBSERVATION_PERSISTED');
 const committed=await store.finish(job.id,job.lease_token,id,complete);
 return {id,requestId:job.id,preflightId:prepared.preflight_id,...result as object,portfolioApplied:false,requestCommitted:committed};
}
