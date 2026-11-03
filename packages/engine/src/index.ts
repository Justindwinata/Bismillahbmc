import { exitAmount } from './exit-size.js';
import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { address,baseUnits,roles,bootstrapVeto } from '../../domain/src/index.js';
import { researchPolicy,chainEvidence,researchQuote,researchAccount,researchPosition,WSOL,fresh,poolEvidence,transferEvidence } from './research.js';
const metric=z.number().finite().nonnegative().nullable();
export const evaluationInput=z.object({mint:address,tokenDecimals:z.number().int().min(0).max(255).optional(),sourceId:z.string().min(1),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),receivedAt:z.string().datetime(),sourceAt:z.string().datetime().nullable(),mode:z.enum(['OBSERVE','HALTED','PAPER','SHADOW']),inputDataClass:z.enum(['LIVE_PROVIDER','REPLAY']),market:z.object({liquidityUsd:metric,volume5mUsd:metric,volume24hUsd:metric}).nullable(),poolEvidence:poolEvidence.optional(),transferEvidence:transferEvidence.optional(),security:z.object({mintAuthority:z.string().nullable(),freezeAuthority:z.string().nullable(),tokenProgram:z.string(),extensions:z.array(z.string()),holderOwnershipVerified:z.boolean(),assessment:z.enum(['PASS','VETO','UNKNOWN']).optional(),reasons:z.array(z.string().max(100)).max(20).optional()}).nullable(),balanceLamports:baseUnits.nullable(),researchPolicy:researchPolicy.optional(),chainEvidence:chainEvidence.optional(),quote:researchQuote.optional(),account:researchAccount.optional(),position:researchPosition.optional(),requestedSide:z.enum(['BUY','SELL']).optional(),halted:z.boolean().optional()});
export type EvaluationInput=z.infer<typeof evaluationInput>;
export interface StageOutput {state:'PASS'|'VETO'|'UNKNOWN'|'SKIP'|'RECORDED';reasons:string[];proposal?:'BUY_PROPOSED'|'SELL_PROPOSED'|'SKIP';authority?:'NON_FINANCIAL_ONLY';amountLamports?:string;equityLamports?:string|null;value?:number|null}
export interface AgentEvent {eventId:string;decisionId:string;role:typeof roles[number];mint:string;sourceIds:string[];inputDataClass:EvaluationInput['inputDataClass'];dataClass:'DERIVED';mode:EvaluationInput['mode'];policyHash:string;createdAt:string;durationMs:number;inputHash:string;outputHash:string;output:StageOutput}
interface Context {input:EvaluationInput;prior:Partial<Record<typeof roles[number],StageOutput>>;now:number}
type Agent=(ctx:Context)=>StageOutput;
const out=(state:StageOutput['state'],...reasons:string[]):StageOutput=>({state,reasons});
export const DESK:Agent=({input})=>out('PASS',input.mode==='HALTED'?'OBSERVE_EXPOSURE_ONLY':'OBSERVATION_SESSION_OPEN');
export const SCOUT:Agent=({input})=>out('PASS','CANONICAL_MINT_FROM_SOURCE_'+input.sourceId);
export const FILTER:Agent=({input,now})=>{
  const policy=input.researchPolicy;
  const age=now-Date.parse(input.receivedAt);
  if(age<0||age>(policy?.marketMaxAgeMs??90000))return out('VETO','SOURCE_RECEIPT_STALE_OR_FUTURE');
  if(!input.market||input.market.liquidityUsd===null)return out('UNKNOWN','LIQUIDITY_UNAVAILABLE');
  if(!policy)return out('UNKNOWN',...(input.sourceAt===null?['SOURCE_TIMESTAMP_UNKNOWN']:[]),'OWNER_MARKET_THRESHOLDS_UNCONFIGURED');
  const chain=input.chainEvidence;
  if(!chain||chain.mint!==input.mint||!fresh(chain.verifiedAt,now,policy.chainMaxAgeMs))return out('UNKNOWN','CHAIN_CORROBORATION_MISSING_OR_STALE');
  if(input.sourceAt!==null&&!fresh(input.sourceAt,now,policy.marketMaxAgeMs))return out('VETO','SOURCE_TIMESTAMP_STALE_OR_FUTURE');
  if(input.market.volume5mUsd===null)return out('UNKNOWN','VOLUME_UNAVAILABLE');
  if(input.market.liquidityUsd<policy.minLiquidityUsd||input.market.volume5mUsd<policy.minVolume5mUsd)return out('VETO','MARKET_BELOW_POLICY');
  return out('PASS',input.sourceAt===null?'RECEIPT_FRESH_CHAIN_CORROBORATED_SOURCE_TIME_UNKNOWN':'FRESH_MARKET_AND_CHAIN');
};
export const RUG_CHECK:Agent=({input})=>{
  if(input.poolEvidence&&input.poolEvidence.assessment!=='PASS')return out(input.poolEvidence.assessment==='VETO'?'VETO':'UNKNOWN','POOL_ENTRY_NOT_QUALIFIED',...(input.poolEvidence.reasons??[]));
  const s=input.security;if(!s)return out('UNKNOWN','ONCHAIN_MINT_STATE_UNAVAILABLE');
  if(s.assessment==='VETO')return out('VETO',...(s.reasons??['ONCHAIN_SECURITY_VETO']));
  if(s.assessment==='UNKNOWN')return out('UNKNOWN',...(s.reasons??['ONCHAIN_SECURITY_UNKNOWN']));
  if(s.mintAuthority!==null)return out('VETO','MINT_AUTHORITY_ACTIVE');
  if(s.freezeAuthority!==null)return out('VETO','FREEZE_AUTHORITY_ACTIVE');
  if(s.tokenProgram!=='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'||s.extensions.length)return out('VETO','TOKEN_PROGRAM_OR_EXTENSION_UNVERIFIED');
  if(!s.holderOwnershipVerified)return out('UNKNOWN','HOLDER_OWNERSHIP_UNVERIFIED');
  return out('PASS','MINT_FIELDS_VERIFIED');
};
export const ANALYST:Agent=({input})=>{
  const m=input.market;if(!m||m.volume5mUsd===null||m.volume24hUsd===null||m.volume24hUsd===0)return {...out('UNKNOWN','VOLUME_HISTORY_UNAVAILABLE'),value:null};
  return {...out('RECORDED','OBSERVED_5M_TO_24H_RATIO_NOT_A_PROFIT_FORECAST'),value:m.volume5mUsd/m.volume24hUsd};
};
export function exitReadiness(input:EvaluationInput,now:number):StageOutput{
 const p=input.researchPolicy,q=input.quote,owned=input.position,s=input.security,t=input.transferEvidence,pool=input.poolEvidence,c=input.chainEvidence;
 if(!p||!q||!owned||owned.mint!==input.mint||q.inputMint!==input.mint||q.outputMint!==WSOL||q.inputAmount!==exitAmount(owned.quantity,p.exitFractionBps))return out('VETO','EXIT_UNAVAILABLE_OWNERSHIP_OR_QUOTE');
 if(!q.fillable||!fresh(q.receivedAt,now,p.quoteMaxAgeMs)||(q.expiresAt!==undefined&&Date.parse(q.expiresAt)<=now)||q.slippageBps>p.maxSlippageBps||q.priceImpactBps>p.maxPriceImpactBps)return out('VETO','EXIT_UNAVAILABLE_ROUTE_OR_PRICE');
 if(BigInt(q.outputAmount)<=BigInt(q.feeLamports))return out('VETO','EXIT_UNAVAILABLE_NET_PROCEEDS');
 if(!s||s.tokenProgram!=='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'||s.extensions.length||s.freezeAuthority!==null)return out('VETO','EXIT_UNAVAILABLE_TRANSFER_SEMANTICS');
 if(!c||c.mint!==input.mint||!t||!t.transferSafe||t.mint!==input.mint||t.hash!==c.hash||t.slot!==c.slot||!fresh(t.verifiedAt,now,p.chainMaxAgeMs)||!fresh(c.verifiedAt,now,p.chainMaxAgeMs))return out('VETO','EXIT_UNAVAILABLE_FRESH_TRANSFER_PROOF');
 if(!pool||!pool.exitSafe||pool.mint!==input.mint||pool.slot===null||!fresh(pool.verifiedAt,now,p.chainMaxAgeMs)||q.poolHash!==pool.hash)return out('VETO','EXIT_UNAVAILABLE_POOL_OR_ROUTE_BINDING');
 if(q.inputAmount!==owned.quantity&&owned.exitCostLamports===undefined)return out('VETO','EXIT_UNAVAILABLE_PARTIAL_FIFO_BASIS');
 return out('PASS','OWNED_RISK_REDUCING_EXIT_VERIFIED');
}
export const STRATEGY:Agent=({input,prior,now})=>{
 const policy=input.researchPolicy;
 if(input.requestedSide==='SELL'){
  const ready=exitReadiness(input,now);if(ready.state!=='PASS')return {...ready,state:'SKIP',proposal:'SKIP'};
  const position=input.position!,quote=input.quote!,p=policy!;const cost=BigInt(position.exitCostLamports??position.costLamports),proceeds=BigInt(quote.outputAmount),fee=BigInt(quote.feeLamports),net=proceeds>fee?proceeds-fee:0n;
  const risk=prior.FILTER?.state!=='PASS'||prior.RUG_CHECK?.state!=='PASS';
  const trigger=risk?'EXIT_ENTRY_RISK_DOWNGRADED':net*10000n>=cost*BigInt(10000+p.takeProfitBps)?'EXIT_TAKE_PROFIT':net*10000n<=cost*BigInt(10000-p.stopLossBps)?'EXIT_STOP_LOSS':now-Date.parse(position.openedAt)>=p.maxHoldMs?'EXIT_MAX_HOLD':null;
  return {...out(trigger?'PASS':'SKIP',trigger??'EXIT_THRESHOLD_NOT_MET'),proposal:trigger?'SELL_PROPOSED':'SKIP'};
 }
 if(prior.FILTER?.state!=='PASS'||prior.RUG_CHECK?.state!=='PASS')return {...out('SKIP','UPSTREAM_VETO_OR_UNKNOWN'),proposal:'SKIP'};
 if(!policy)return {...out('SKIP','NO_OWNER_TESTED_ENTRY_POLICY'),proposal:'SKIP'};
 if(input.position)return {...out('SKIP','POSITION_ALREADY_OWNED'),proposal:'SKIP'};
 const score=prior.ANALYST?.value,entry=typeof score==='number'&&score*288>=policy.entryVolumeRatio;
 return {...out(entry?'PASS':'SKIP',entry?'VOLUME_ACCELERATION_ENTRY':'NO_ENTRY_SIGNAL'),proposal:entry?'BUY_PROPOSED':'SKIP'};
};
export function boundedSize(balance:string,reserve:string,cap:string,exposure:string,totalCap:string):string{
  const b=BigInt(baseUnits.parse(balance));const r=BigInt(baseUnits.parse(reserve));const c=BigInt(baseUnits.parse(cap));const e=BigInt(baseUnits.parse(exposure));const t=BigInt(baseUnits.parse(totalCap));
  if(b<=r||e>=t)return '0';return [b-r,c,t-e].reduce((a,v)=>a<v?a:v).toString();
}
export const SIZER:Agent=({input,prior})=>{
  const policy=input.researchPolicy,quote=input.quote;
  if(!['PAPER','SHADOW'].includes(input.mode)||!policy)return {...out('SKIP',input.balanceLamports===null?'CHAIN_BALANCE_UNKNOWN':'ZERO_LIVE_CAPS'),amountLamports:'0'};
  if(!quote||!input.account||input.balanceLamports===null||prior.STRATEGY?.state!=='PASS')return {...out('SKIP','SIZING_INPUT_INCOMPLETE'),amountLamports:'0'};
  if(input.requestedSide==='SELL'){
    if(!input.position||BigInt(quote.inputAmount)>BigInt(input.position.quantity))return {...out('VETO','SELL_EXCEEDS_INVENTORY'),amountLamports:'0'};
    return {...out('PASS','OWNED_EXIT_SIZE'),amountLamports:quote.inputAmount};
  }
  const reserve=BigInt(policy.reserveLamports)+BigInt(quote.feeLamports)+BigInt(input.account.reservedLamports);
  const exposure=BigInt(input.account.exposureLamports)+BigInt(input.account.reservedLamports);
  const fee=BigInt(quote.feeLamports),totalCap=BigInt(policy.maxExposureLamports);
  const amount=reserve>=BigInt(input.balanceLamports)||exposure+fee>=totalCap?'0':boundedSize(input.balanceLamports,reserve.toString(),policy.maxPositionLamports,exposure.toString(),(totalCap-fee).toString());
  return {...out(amount==='0'?'VETO':'PASS',amount==='0'?'NO_AVAILABLE_RESEARCH_BUDGET':'BOUNDED_RESEARCH_SIZE'),amountLamports:amount};
};
export const GUARD:Agent=({input,prior,now})=>{
  if(input.halted||input.mode==='HALTED')return out('VETO','KILL_SWITCH_ACTIVE',...(prior.RUG_CHECK?.state==='PASS'?[]:['SECURITY_VETO_OR_UNKNOWN']));
  if(!['PAPER','SHADOW'].includes(input.mode))return out('VETO',...(prior.RUG_CHECK?.state==='PASS'?[]:['SECURITY_VETO_OR_UNKNOWN']),...bootstrapVeto(false).reasons);
  const p=input.researchPolicy,q=input.quote,a=input.account;
  if(input.requestedSide==='SELL'&&!q)return exitReadiness(input,now);
  if(!p||!q||!a||input.balanceLamports===null)return out('VETO','RESEARCH_INPUT_INCOMPLETE');
  const sell=input.requestedSide==='SELL';
  if(sell){const readiness=exitReadiness(input,now);if(readiness.state!=='PASS')return readiness;}
  else if(FILTER({input,prior,now}).state!=='PASS'||RUG_CHECK({input,prior,now}).state!=='PASS')return out('VETO','INDEPENDENT_SECURITY_RECHECK_FAILED');
  if(!sell&&input.poolEvidence&&(!fresh(input.poolEvidence.verifiedAt,now,p.chainMaxAgeMs)||input.poolEvidence.mint!==input.mint||q.poolHash!==input.poolEvidence.hash))return out('VETO','ENTRY_POOL_PROOF_STALE_OR_MISMATCH');
  const ownStrategy=STRATEGY({input,prior:{FILTER:FILTER({input,prior,now}),RUG_CHECK:RUG_CHECK({input,prior,now}),ANALYST:ANALYST({input,prior,now})},now});
  if(ownStrategy.state!=='PASS'||ownStrategy.proposal!==prior.STRATEGY?.proposal)return out('VETO','INDEPENDENT_STRATEGY_RECHECK_FAILED');
  if(['STRATEGY','SIZER'].some(role=>prior[role as keyof typeof prior]?.state!=='PASS'))return out('VETO','UPSTREAM_VETO_OR_UNKNOWN');
  if(!fresh(q.receivedAt,now,p.quoteMaxAgeMs)||!q.fillable||(q.expiresAt!==undefined&&Date.parse(q.expiresAt)<=now))return out('VETO','QUOTE_STALE_OR_UNFILLABLE');
  if(q.inputMint!==(sell?input.mint:WSOL)||q.outputMint!==(sell?WSOL:input.mint))return out('VETO','QUOTE_MINT_MISMATCH');
  const recheckedSize=SIZER({input,prior,now});
  if(recheckedSize.state!=='PASS'||recheckedSize.amountLamports!==q.inputAmount||prior.SIZER?.amountLamports!==q.inputAmount)return out('VETO','SIZE_REQUOTE_REQUIRED');
  if(q.slippageBps>p.maxSlippageBps||q.priceImpactBps>p.maxPriceImpactBps)return out('VETO','QUOTE_PRICE_LIMIT');
  if(BigInt(a.dailyFeesLamports)+BigInt(q.feeLamports)>BigInt(p.maxDailyFeesLamports))return out('VETO','DAILY_FEE_LIMIT');
  if(BigInt(input.balanceLamports)<BigInt(p.reserveLamports)+BigInt(q.feeLamports)+BigInt(a.reservedLamports)+(sell?0n:BigInt(q.inputAmount)))return out('VETO','GAS_RESERVE_BREACH');
  if(!sell){
    if(BigInt(a.dailyLossLamports)>=BigInt(p.maxDailyLossLamports))return out('VETO','DAILY_LOSS_LIMIT');
    if(BigInt(a.dailyLossLamports)+BigInt(a.exposureLamports)+BigInt(a.reservedLamports)+BigInt(q.inputAmount)+BigInt(q.feeLamports)>BigInt(p.maxDailyLossLamports))return out('VETO','DAILY_WORST_CASE_LOSS_LIMIT');
    if(a.openPositions>=p.maxOpenPositions||a.tradesLastHour>=p.maxTradesPerHour)return out('VETO','POSITION_OR_RATE_LIMIT');
    if(a.lastTradeAt!==null&&(!fresh(a.lastTradeAt,now,Number.MAX_SAFE_INTEGER)||now-Date.parse(a.lastTradeAt)<p.cooldownMs))return out('VETO','COOLDOWN_ACTIVE_OR_FUTURE');
  }
  return {...out('PASS','VALIDATED_NON_FINANCIAL_INTENT'),authority:'NON_FINANCIAL_ONLY'};
};
export const EXECUTOR:Agent=({input,prior})=>prior.GUARD?.authority==='NON_FINANCIAL_ONLY'&&['PAPER','SHADOW'].includes(input.mode)?out('RECORDED',input.mode==='PAPER'?'PAPER_INTENT_READY_NO_CHAIN_SUBMISSION':'SHADOW_UNSIGNED_INTENT_NO_FILL'):out('SKIP','NO_AUTHORIZED_INTENT','SIGNER_LOCKED','NO_SUBMISSION');
export const LOGGER:Agent=()=>out('RECORDED','TRACE_PREPARED_FOR_ATOMIC_PERSISTENCE');
export const EQUITY:Agent=({input,now})=>{
  if(['PAPER','SHADOW'].includes(input.mode)&&input.balanceLamports!==null&&input.account){
    if(input.account.openPositions===0)return {...out('RECORDED','RESEARCH_CASH_EQUITY_NOT_REAL_FUNDS'),equityLamports:input.balanceLamports,value:null};
    const q=input.quote,p=input.position;
    if(input.account.openPositions===1&&p&&q&&input.requestedSide==='SELL'&&q.inputMint===p.mint&&q.outputMint===WSOL&&q.inputAmount===p.quantity&&input.researchPolicy&&fresh(q.receivedAt,now,input.researchPolicy.quoteMaxAgeMs)&&q.fillable&&BigInt(q.outputAmount)>=BigInt(q.feeLamports))return {...out('RECORDED','ESTIMATED_RESEARCH_EXIT_EQUITY'),equityLamports:(BigInt(input.balanceLamports)+BigInt(q.outputAmount)-BigInt(q.feeLamports)).toString(),value:null};
  }
  return {...out('UNKNOWN','NO_RECONCILED_OWNED_WALLET_OR_COST_BASIS'),equityLamports:null,value:null};
};
export const agents={DESK,SCOUT,FILTER,RUG_CHECK,ANALYST,STRATEGY,SIZER,GUARD,EXECUTOR,LOGGER,EQUITY};
export const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function evaluate(raw:unknown,policyHash:string,now=Date.now()){
  const input=evaluationInput.parse(raw);if(!/^[a-f0-9]{64}$/.test(policyHash))throw new Error('INVALID_POLICY_HASH');
  if(input.researchPolicy&&policyHash!==fingerprint(input.researchPolicy))throw new Error('POLICY_HASH_MISMATCH');
  const decisionId=randomUUID();const inputHash=fingerprint({input,receiptFreshness:now<Date.parse(input.receivedAt)?'FUTURE':now-Date.parse(input.receivedAt)>90000?'STALE':'RECENT'});const prior:Context['prior']={};const events:AgentEvent[]=[];
  for(const role of roles){const started=performance.now();const output=agents[role]({input,prior,now});prior[role]=output;events.push({eventId:randomUUID(),decisionId,role,mint:input.mint,sourceIds:[input.sourceId],inputDataClass:input.inputDataClass,dataClass:'DERIVED',mode:input.mode,policyHash,createdAt:new Date(now).toISOString(),durationMs:performance.now()-started,inputHash,outputHash:fingerprint(output),output});}
  return {decisionId,inputHash,mint:input.mint,policyHash,mode:input.mode,action:prior.GUARD?.authority==='NON_FINANCIAL_ONLY'?(prior.STRATEGY?.proposal??'SKIP'):'SKIP',events};
}
