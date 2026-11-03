import { exitAmount } from '../../../packages/engine/src/exit-size.js';
import type { PaperQuoteObservation } from '../../../packages/connectors/src/jupiter-paper.js';
import { boundedSize,type EvaluationInput } from '../../../packages/engine/src/index.js';
import { researchPolicy,WSOL } from '../../../packages/engine/src/research.js';
import { PaperSchedulerStore,type PaperJob } from '../../../packages/storage/src/paper-scheduler.js';
export interface PaperSources {
 market:(mint:string)=>Promise<{input:EvaluationInput;raw:unknown}>;
 quote:(request:{inputMint:string;outputMint:string;amount:string;slippageBps:number})=>Promise<PaperQuoteObservation>;
}
export async function paperCycle(store:PaperSchedulerStore,sources:PaperSources,scope:PaperJob['scope']='LIVE_PROVIDER',limit=5,sessionId?:string,signal?:AbortSignal){
 for(let count=0;count<limit;count++){
  if(signal?.aborted)break;
  const job=await store.claim(scope,60000,sessionId);if(!job)break;
  try{
   const detail=await store.research.detail(job.session_id),policy=researchPolicy.parse(detail.policy),snapshot=detail.snapshot;
   const market=await sources.market(job.mint);const input:EvaluationInput={...market.input,mode:detail.mode,balanceLamports:null};
   if(input.mint!==job.mint||(input.inputDataClass==='REPLAY')!==(scope==='REPLAY_TEST'))throw new Error('SOURCE_SCOPE_OR_MINT_MISMATCH');
   await store.record(job,'MARKET',market.raw);await store.record(job,'SECURITY',{security:input.security,chain:input.chainEvidence??null});
   if(signal?.aborted)throw new Error('WORKER_STOP_REQUESTED');
   const owned=snapshot.positions.find(p=>p.mint===job.mint),side=owned?'SELL':'BUY';
   const exposure=snapshot.positions.reduce((total,p)=>total+BigInt(p.costLamports),0n).toString();
   let amount=(owned?exitAmount(owned.quantity,policy.exitFractionBps):undefined)??boundedSize(snapshot.cashLamports,policy.reserveLamports,policy.maxPositionLamports,exposure,policy.maxExposureLamports);
   input.requestedSide=side;
   if(amount==='0'){await store.research.apply(job.session_id,job.lease_token,input,undefined,job);continue;}
   try{
    let observation=await sources.quote({inputMint:owned?job.mint:WSOL,outputMint:owned?WSOL:job.mint,amount,slippageBps:policy.maxSlippageBps});
    if(observation.sourceClass!==scope)throw new Error('QUOTE_SCOPE_MISMATCH');
    await store.record(job,owned?'QUOTE_SELL':'QUOTE_BUY',observation);
    if(!owned){
     const fee=BigInt(observation.quote.feeLamports),reserve=BigInt(policy.reserveLamports)+fee,cap=BigInt(policy.maxExposureLamports);
     const resized=reserve>=BigInt(snapshot.cashLamports)||BigInt(exposure)+fee>=cap?'0':boundedSize(snapshot.cashLamports,reserve.toString(),policy.maxPositionLamports,exposure,(cap-fee).toString());
     if(resized!==amount&&resized!=='0'){amount=resized;observation=await sources.quote({inputMint:WSOL,outputMint:job.mint,amount,slippageBps:policy.maxSlippageBps});if(observation.sourceClass!==scope)throw new Error('QUOTE_SCOPE_MISMATCH');await store.record(job,'QUOTE_BUY',observation);}
    }
    const q=observation.quote;
    if(q.inputMint!==(owned?job.mint:WSOL)||q.outputMint!==(owned?WSOL:job.mint)||q.inputAmount!==amount)throw new Error('QUOTE_REQUEST_MISMATCH');
    input.quote=q;
   }catch(error){await store.record(job,'ERROR',{reason:error instanceof Error&&/^(QUOTE_|SOURCE_)/.test(error.message)?error.message:'QUOTE_PROVIDER_UNAVAILABLE'});delete input.quote;}
   // Input, Guard, fill, mark, journal, outbox and lease release commit as one transaction.
   if(signal?.aborted)throw new Error('WORKER_STOP_REQUESTED');
   await store.research.apply(job.session_id,job.lease_token,input,undefined,job);
  }catch(error){await store.fail(job,error instanceof Error&&['WORKER_STOP_REQUESTED','EVIDENCE_EXPIRED_DURING_COMMIT','LEASE_LOST','PROGRAM_REVISION_REVIEW_REQUIRED','PROGRAM_REVISION_REVIEW_REVOKED_OR_MISMATCH','RESERVATION_INSUFFICIENT','AUTOMATION_LEASE_REQUIRED','SOURCE_SCOPE_OR_MINT_MISMATCH'].includes(error.message)?error.message:'PAPER_DEPENDENCY_OR_SCHEMA_FAILURE');}
 }
}
