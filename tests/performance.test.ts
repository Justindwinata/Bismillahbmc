import { it,expect } from 'vitest';
import { researchPerformance,wilsonInterval } from '../packages/accounting/src/performance.js';
const mint='FIXTURE_MINT_NEVER_CHAIN';const start=Date.parse('2026-11-01T00:00:00Z');
function row(i:number,side:'BUY'|'SELL'|null,pnl:string,cost:string|null,equity:string|null='1000'){
 const at=new Date(start+i*1000).toISOString();return {recorded_at:at,action:side?side+'_PROPOSED':'SKIP',fill:side?{side,mint}:null,snapshot:{realizedPnlLamports:pnl,netCapitalLamports:'1000',feesLamports:'0',positions:cost===null?[]:[{mint,quantity:'1',costLamports:cost}],equityLamports:equity},input:{inputDataClass:'REPLAY',receivedAt:at,sourceAt:null,requestedSide:side??'BUY',quote:{receivedAt:at,fillable:true}}};
}
it('counts all closed net outcomes including flat trades, exact expectancy/profit factor and cash-flow-neutral drawdown',()=>{
 const data=[row(0,'BUY','0','100'),row(1,'SELL','100',null,'1100'),row(2,'BUY','100','100','1100'),row(3,'SELL','50',null,'1050'),row(4,'BUY','50','100','1050'),row(5,'SELL','50',null,'1050'),row(6,null,'50',null,'1050')];
 const r=researchPerformance(data,'REPLAY_TEST');expect(r).toMatchObject({closedTrades:3,wins:1,losses:1,flat:1,netExpectancyLamports:{numerator:'50',denominator:3},profitFactor:{numerator:'100',denominator:'50'},maxKnownDrawdownLamports:'50',qualification:'STRATEGY_NOT_VALIDATED',outOfSample:'NOT_RUN',quoteToChainFillDeviation:null});expect(r.winRate).toBeCloseTo(1/3);expect(r.medianReturnBps!.numerator).toBe('0');
});
it('partial exits form one closed outcome; no-fill/unknown equity cannot fabricate wins or complete drawdown',()=>{
 const open=row(0,'BUY','0','200',null);open.snapshot.positions[0]!.quantity='2';const partial=row(1,'SELL','20','100','1020');const close=row(2,'SELL','10',null,'1010');const r=researchPerformance([open,partial,close],'REPLAY_TEST');expect(r.closedTrades).toBe(1);expect(r.closedNetPnlLamports).toBe('10');expect(r.drawdownQuality).toBe('LOWER_BOUND_WITH_UNPRICED_GAPS');expect(r.profitFactor).toBeNull();expect(r.profitFactorStatus).toBe('NO_LOSS_SAMPLE');
 const monitor=row(1,null,'0',null);monitor.input.requestedSide='SELL';
 for(const patch of [{quote:{receivedAt:monitor.recorded_at,fillable:false}},{quote:{receivedAt:monitor.recorded_at,fillable:true,expiresAt:new Date(start).toISOString()}},{quote:{receivedAt:new Date(start).toISOString(),fillable:true},researchPolicy:{quoteMaxAgeMs:1}}])expect(researchPerformance([{...monitor,input:{...monitor.input,...patch}}],'REPLAY_TEST').exitQuoteFailures).toBe(1);
 expect(researchPerformance([{...monitor,input:{...monitor.input,quote:{...monitor.input.quote,expiresAt:new Date(start+2000).toISOString()},researchPolicy:{quoteMaxAgeMs:2000}}}],'REPLAY_TEST').exitQuoteFailures).toBe(0);
 const noFill=row(0,null,'0',null,null);noFill.input.requestedSide='SELL';delete (noFill.input as {quote?:unknown}).quote;expect(researchPerformance([noFill],'REPLAY_TEST')).toMatchObject({closedTrades:0,winRate:null,netExpectancyLamports:null,maxKnownDrawdownLamports:null,exitQuoteFailures:1});
});
it('rejects future information, missing cost history and REPLAY promoted to forward statistics',()=>{
 const data=row(1,'BUY','0','100');expect(()=>researchPerformance([row(0,'SELL','1',null)],'REPLAY_TEST')).toThrow('WITHOUT_ENTRY');expect(()=>researchPerformance([data],'FORWARD_PAPER')).toThrow('SOURCE_SCOPE');
 expect(()=>researchPerformance([{...data,input:{...data.input,receivedAt:new Date(start+2000).toISOString()}}],'REPLAY_TEST')).toThrow('LOOKAHEAD');expect(()=>researchPerformance([row(2,null,'0',null),data],'REPLAY_TEST')).toThrow('CHRONOLOGY');expect(()=>researchPerformance([{...data,input:{...data.input,quote:{receivedAt:new Date(start+2000).toISOString(),fillable:true}}}],'REPLAY_TEST')).toThrow('LOOKAHEAD_QUOTE');
 const empty=researchPerformance([],'SHADOW');expect(empty.winRateWilson95).toBeNull();expect(empty.quoteToChainFillDeviation).toBeNull();
});
it('Wilson intervals expose sample uncertainty and reject invalid denominators',()=>{
 const interval=wilsonInterval(5,10)!;expect(interval.lower).toBeCloseTo(0.236593,5);expect(interval.upper).toBeCloseTo(0.763407,5);expect(wilsonInterval(1,1)!.lower).toBeLessThan(0.21);expect(wilsonInterval(0,0)).toBeNull();expect(()=>wilsonInterval(2,1)).toThrow();expect(()=>wilsonInterval(0,-1)).toThrow();
});
it('temporal embargo preserves missing/delisted observations and rejects look-ahead or duplicate samples',async()=>{
 const {temporalPartitions}=await import('../packages/accounting/src/performance.js');const times=[0,9000,11000,15000,19000,21000,30000];const rows=times.map((t,i)=>({id:String(i),at:new Date(start+t).toISOString(),availableAt:new Date(start+t).toISOString(),delisted:i===0,features:null}));const split=temporalPartitions(rows,new Date(start+10000).toISOString(),new Date(start+20000).toISOString(),1000);
 expect(split.train.map(r=>r.id)).toEqual(['0']);expect(split.train[0]!.delisted).toBe(true);expect(split.validation.map(r=>r.id)).toEqual(['3']);expect(split.test.map(r=>r.id)).toEqual(['6']);expect(split.embargoed).toHaveLength(4);expect(Object.values(split).flat()).toHaveLength(rows.length);
 expect(()=>temporalPartitions([{...rows[0]!,availableAt:new Date(start+1).toISOString()}],rows[2]!.at,rows[5]!.at,1)).toThrow('LOOKAHEAD');expect(()=>temporalPartitions([rows[0]!,rows[0]!],rows[2]!.at,rows[5]!.at,1)).toThrow('DUPLICATE');expect(()=>temporalPartitions(rows,'bad','bad',1)).toThrow('BOUNDARIES');
});
it('streamed batches retain FIFO outcome history and poison incomplete metrics after malformed or out-of-order data',async()=>{
 const {performanceAccumulator}=await import('../packages/accounting/src/performance.js');const data=[row(0,'BUY','0','200'),row(1,'SELL','20','100'),row(2,'SELL','10',null)];const stream=performanceAccumulator('REPLAY_TEST');for(const r of data)stream.add([r]);expect(stream.finish()).toEqual(researchPerformance(data,'REPLAY_TEST'));
 stream.add([row(3,null,'10',null)]);expect(stream.finish().events).toBe(4);
 expect(()=>stream.add([row(0,null,'0',null)])).toThrow('CHRONOLOGY');expect(()=>stream.finish()).toThrow('ACCUMULATOR_INVALID');expect(()=>stream.add([])).toThrow('ACCUMULATOR_INVALID');
 const invalid=performanceAccumulator('SHADOW');expect(()=>invalid.add([{}])).toThrow();expect(()=>invalid.finish()).toThrow('ACCUMULATOR_INVALID');
});
