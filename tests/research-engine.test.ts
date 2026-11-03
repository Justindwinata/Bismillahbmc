import { it,expect } from 'vitest';
import { evaluate,fingerprint,evaluationInput,agents } from '../packages/engine/src/index.js';
import { replayPolicy,replayInput } from '../packages/engine/src/replay.js';
const at=Date.parse('2026-11-01T00:00:00.000Z');
function valid(side:'BUY'|'SELL'='BUY'){
 return {...replayInput(side,at),researchPolicy:replayPolicy,account:{exposureLamports:side==='SELL'?'102':'0',reservedLamports:'0',dailyLossLamports:'0',dailyFeesLamports:'0',openPositions:side==='SELL'?1:0,tradesLastHour:0,lastTradeAt:null},...(side==='SELL'?{position:{mint:replayInput(side,at).mint,quantity:'10',costLamports:'102',openedAt:new Date(at-1000).toISOString()}}:{})};
}
it('passes FILTER and authorizes bounded BUY/SELL proposals only in nonfinancial modes',()=>{
 for(const mode of ['PAPER','SHADOW'] as const)for(const side of ['BUY','SELL'] as const){
  const result=evaluate({...valid(side),mode},fingerprint(replayPolicy),at);
  expect(result.action).toBe(side+'_PROPOSED');
  expect(evaluate({...valid(side),mode,quote:{...valid(side).quote,expiresAt:new Date(at+1000).toISOString()}},fingerprint(replayPolicy),at).action).toBe(side+'_PROPOSED');
  expect(result.events.find(e=>e.role==='FILTER')!.output.state).toBe('PASS');
  expect(result.events.find(e=>e.role==='GUARD')!.output.authority).toBe('NON_FINANCIAL_ONLY');
  expect(result.events.find(e=>e.role==='EXECUTOR')!.output.reasons.join()).toContain('NO_');
 }
});
it('vetoes stale/missing/conflicting evidence and changed policy regardless of bullish score',()=>{
 const base=valid();
 const cases=[{security:{...base.security!,assessment:'VETO',reasons:['FIXTURE_SECURITY_VETO']}},{security:{...base.security!,assessment:'UNKNOWN',reasons:['FIXTURE_SECURITY_UNKNOWN']}},{halted:true},{mode:'OBSERVE'},{mode:'HALTED'},{security:null},{chainEvidence:{...base.chainEvidence,mint:'11111111111111111111111111111111'}},{chainEvidence:undefined},{market:{...base.market,liquidityUsd:1}},{market:{...base.market,volume5mUsd:null}},{quote:{...base.quote,expiresAt:new Date(at).toISOString()}},{quote:{...base.quote,fillable:false}},{quote:{...base.quote,receivedAt:new Date(at-10001).toISOString()}},{quote:{...base.quote,inputMint:base.mint}},{quote:{...base.quote,inputAmount:'99'}},{quote:{...base.quote,slippageBps:101}},{quote:{...base.quote,priceImpactBps:101}},{account:{...base.account,dailyFeesLamports:'20'}},{account:{...base.account,dailyLossLamports:'150'}},{account:{...base.account,openPositions:2}},{account:{...base.account,tradesLastHour:5}},{account:{...base.account,lastTradeAt:new Date(at+1).toISOString()}},{balanceLamports:'10'},{account:{...base.account,exposureLamports:'300'}},{quote:undefined},{account:undefined}];
 for(const patch of cases)expect(evaluate({...base,...patch},fingerprint(replayPolicy),at).action,JSON.stringify(patch)).toBe('SKIP');
 expect(()=>evaluate(base,'f'.repeat(64),at)).toThrow('POLICY_HASH_MISMATCH');
 expect(()=>evaluate({...base,mode:'MICRO_LIVE'},fingerprint(replayPolicy),at)).toThrow();
});
it('handles exit bounds, cash equity and no-entry thresholds without invented marks',()=>{
 const sell=valid('SELL');
 expect(evaluate({...sell,position:undefined},fingerprint(replayPolicy),at).action).toBe('SKIP');
 expect(evaluate({...sell,quote:{...sell.quote,inputAmount:'11'}},fingerprint(replayPolicy),at).action).toBe('SKIP');
 expect(evaluate({...sell,quote:{...sell.quote,inputAmount:'5',outputAmount:'60'}},fingerprint(replayPolicy),at).action).toBe('SKIP');
 expect(evaluate({...sell,quote:{...sell.quote,outputAmount:'104'}},fingerprint(replayPolicy),at).action).toBe('SKIP');
 expect(evaluate({...valid(),market:{...valid().market,volume5mUsd:100,volume24hUsd:100000}},fingerprint(replayPolicy),at).action).toBe('SKIP');
 const normalized=evaluationInput.parse(valid());
 expect(agents.EQUITY({input:normalized,prior:{},now:at}).equityLamports).toBe('1000');
});
it('independent Guard rejects forged stage approvals; equity and missing security reasons remain explicit',()=>{
 const base=valid();
 for(const assessment of ['VETO','UNKNOWN'] as const){const input=evaluationInput.parse({...base,security:{...base.security!,assessment}});expect(agents.RUG_CHECK({input,prior:{},now:at}).state).toBe(assessment);}
 const sell=valid('SELL');const normalized=evaluationInput.parse(sell);
 expect(agents.EQUITY({input:normalized,prior:{},now:at}).equityLamports).toBe('1118');
 for(const quote of [{...sell.quote,inputMint:'11111111111111111111111111111111'},{...sell.quote,outputMint:sell.mint}])expect(agents.EQUITY({input:evaluationInput.parse({...sell,quote}),prior:{},now:at}).equityLamports).toBeNull();
 expect(evaluate({...sell,balanceLamports:'21'},fingerprint(replayPolicy),at).action).toBe('SKIP');
 const prior={FILTER:{state:'PASS' as const,reasons:[]},RUG_CHECK:{state:'PASS' as const,reasons:[]},STRATEGY:{state:'PASS' as const,reasons:[],proposal:'BUY_PROPOSED' as const},SIZER:{state:'PASS' as const,reasons:[],amountLamports:'1000'}};
 expect(agents.GUARD({input:evaluationInput.parse({...base,balanceLamports:'10000',quote:{...base.quote,inputAmount:'1000'}}),prior,now:at}).state).toBe('VETO');
 expect(agents.GUARD({input:evaluationInput.parse({...base,security:null}),prior,now:at}).state).toBe('VETO');
});

it('all-in exposure includes model fees/rent and unknown inventory cannot evade worst-case daily loss budget',()=>{
 const base=valid();const constrained={...replayPolicy,maxExposureLamports:'200',maxDailyLossLamports:'1000'};const context={input:evaluationInput.parse({...base,researchPolicy:constrained,account:{...base.account,exposureLamports:'199'}}),prior:{STRATEGY:{state:'PASS' as const,reasons:[]}},now:at};
 expect(agents.SIZER(context).amountLamports).toBe('0');
 const pending={...context,input:evaluationInput.parse({...base,balanceLamports:'150',account:{...base.account,reservedLamports:'100'}})};expect(agents.SIZER(pending).amountLamports).toBe('28');expect(evaluate(pending.input,fingerprint(replayPolicy),at).action).toBe('SKIP');
 const resized={...context,input:evaluationInput.parse({...base,researchPolicy:constrained,account:{...base.account,exposureLamports:'150',openPositions:1},quote:{...base.quote,inputAmount:'48'}})};expect(agents.SIZER(resized).amountLamports).toBe('48');expect(evaluate(resized.input,fingerprint(constrained),at).action).toBe('BUY_PROPOSED');
 const daily=evaluate({...base,account:{...base.account,exposureLamports:'100'}},fingerprint(replayPolicy),at);expect(daily.action).toBe('SKIP');expect(daily.events.find(e=>e.role==='GUARD')!.output.reasons).toContain('DAILY_WORST_CASE_LOSS_LIMIT');
});
