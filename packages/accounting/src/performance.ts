import { z } from 'zod';
const signed=z.string().regex(/^(0|-?[1-9][0-9]{0,39})$/);
const position=z.object({mint:z.string(),quantity:signed,costLamports:signed});
const snapshot=z.object({realizedPnlLamports:signed,netCapitalLamports:signed,feesLamports:signed,positions:z.array(position),equityLamports:signed.nullable().optional()});
const event=z.object({recorded_at:z.union([z.date(),z.string().datetime()]),action:z.string(),fill:z.object({side:z.enum(['BUY','SELL']),mint:z.string()}).passthrough().nullable(),snapshot,input:z.object({inputDataClass:z.enum(['LIVE_PROVIDER','REPLAY']),receivedAt:z.string().datetime(),sourceAt:z.string().datetime().nullable(),requestedSide:z.enum(['BUY','SELL']).optional(),researchPolicy:z.object({quoteMaxAgeMs:z.number().int().positive()}).passthrough().optional(),quote:z.object({receivedAt:z.string().datetime(),fillable:z.boolean(),expiresAt:z.string().datetime().optional()}).passthrough().optional()}).passthrough()});
export function wilsonInterval(wins:number,total:number){
 if(!Number.isSafeInteger(wins)||!Number.isSafeInteger(total)||wins<0||total<0||wins>total)throw new Error('INVALID_BINOMIAL_SAMPLE');if(total===0)return null;
 const z=1.959963984540054,p=wins/total,scale=1+z*z/total,center=(p+z*z/(2*total))/scale,width=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/scale;
 return {confidence:0.95,lower:Math.max(0,center-width),upper:Math.min(1,center+width)};
}
const quantile=(values:number[],p:number)=>values.length?values.slice().sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)]!:null;
export function performanceAccumulator(scope:'REPLAY_TEST'|'FORWARD_PAPER'|'SHADOW'){
 let eventCount=0,lastFees='0',poisoned=false;let previousTime=-Infinity,lastPnl=0n,lastPositions:Map<string,z.infer<typeof position>>=new Map();
 const outcomes:bigint[]=[],basis:bigint[]=[],pendingPnl=new Map<string,bigint>(),pendingCost=new Map<string,bigint>(),latency:number[]=[],quoteAge:number[]=[];
 let wins=0,losses=0,flat=0,unpriced=0,priced=0,peak=0n,maxDrawdown=0n,exitSamples=0,exitQuoteFailures=0;const classes=new Set<string>();
 const add=(raw:unknown)=>{if(poisoned)throw new Error('PERFORMANCE_ACCUMULATOR_INVALID');try{const events=z.array(event).parse(raw);
 for(const row of events){eventCount++;lastFees=row.snapshot.feesLamports;const at=new Date(row.recorded_at).getTime(),received=Date.parse(row.input.receivedAt);if(at<previousTime||received>at||(row.input.sourceAt!==null&&Date.parse(row.input.sourceAt)>at))throw new Error('LOOKAHEAD_OR_CHRONOLOGY_CONFLICT');previousTime=at;classes.add(row.input.inputDataClass);latency.push(at-received);
  const quote=row.input.quote;if(quote){const age=at-Date.parse(quote.receivedAt);if(age<0)throw new Error('LOOKAHEAD_QUOTE');quoteAge.push(age);}
  if(row.input.requestedSide==='SELL'){exitSamples++;if(!quote||!quote.fillable||(quote.expiresAt!==undefined&&Date.parse(quote.expiresAt)<=at)||(quote&&row.input.researchPolicy&&at-Date.parse(quote.receivedAt)>row.input.researchPolicy.quoteMaxAgeMs))exitQuoteFailures++;}
  const pnl=BigInt(row.snapshot.realizedPnlLamports),current=new Map(row.snapshot.positions.map(p=>[p.mint,p]));
  if(row.fill?.side==='SELL'){
   const before=lastPositions.get(row.fill.mint);if(!before)throw new Error('CLOSED_TRADE_WITHOUT_ENTRY_HISTORY');const remaining=current.get(row.fill.mint);const cost=BigInt(before.costLamports)-BigInt(remaining?.costLamports??'0');if(cost<0n)throw new Error('COST_BASIS_CONFLICT');
   const tradePnl=(pendingPnl.get(row.fill.mint)??0n)+pnl-lastPnl,tradeCost=(pendingCost.get(row.fill.mint)??0n)+cost;
   if(remaining){pendingPnl.set(row.fill.mint,tradePnl);pendingCost.set(row.fill.mint,tradeCost);}else{if(tradeCost<=0n)throw new Error('UNKNOWN_CLOSED_TRADE_COST');outcomes.push(tradePnl);basis.push(tradeCost);if(tradePnl>0n)wins++;else if(tradePnl<0n)losses++;else flat++;pendingPnl.delete(row.fill.mint);pendingCost.delete(row.fill.mint);}
  }
  lastPnl=pnl;lastPositions=current;
  if(row.snapshot.equityLamports===null||row.snapshot.equityLamports===undefined)unpriced++;else{priced++;const performance=BigInt(row.snapshot.equityLamports)-BigInt(row.snapshot.netCapitalLamports);if(performance>peak)peak=performance;if(peak-performance>maxDrawdown)maxDrawdown=peak-performance;}
 }
 }catch(error){poisoned=true;throw error;}};
 const finish=()=>{if(poisoned)throw new Error('PERFORMANCE_ACCUMULATOR_INVALID');
 if((scope==='FORWARD_PAPER'&&classes.has('REPLAY'))||(scope==='REPLAY_TEST'&&classes.has('LIVE_PROVIDER')))throw new Error('PERFORMANCE_SOURCE_SCOPE_MIX');
 const sum=outcomes.reduce((n,p)=>n+p,0n),grossProfit=outcomes.filter(p=>p>0n).reduce((n,p)=>n+p,0n),grossLoss=-outcomes.filter(p=>p<0n).reduce((n,p)=>n+p,0n),count=outcomes.length;
 const returns=outcomes.map((p,i)=>({p,c:basis[i]!})).sort((a,b)=>a.p*b.c<b.p*a.c?-1:a.p*b.c>b.p*a.c?1:0);let medianReturnBps:null|{numerator:string;denominator:string}=null;
 if(count){const high=returns[Math.floor(count/2)]!,low=returns[Math.floor((count-1)/2)]!;medianReturnBps={numerator:((low.p*high.c+high.p*low.c)*10000n).toString(),denominator:(2n*low.c*high.c).toString()};}
 return {qualification:'STRATEGY_NOT_VALIDATED',scope,sourceClasses:[...classes].sort(),events:eventCount,closedTrades:count,wins,losses,flat,winRate:count?wins/count:null,winRateWilson95:wilsonInterval(wins,count),netExpectancyLamports:count?{numerator:sum.toString(),denominator:count}:null,closedNetPnlLamports:count?sum.toString():null,profitFactor:grossLoss>0n?{numerator:grossProfit.toString(),denominator:grossLoss.toString()}:null,profitFactorStatus:count===0?'NO_CLOSED_TRADES':grossLoss===0n?'NO_LOSS_SAMPLE':'OBSERVED_PAPER_ONLY',medianReturnBps,maxKnownDrawdownLamports:priced?maxDrawdown.toString():null,drawdownQuality:unpriced?'LOWER_BOUND_WITH_UNPRICED_GAPS':'OBSERVED_PAPER_MARKS_ONLY',knownEquitySamples:priced,unknownEquitySamples:unpriced,feesAndModeledRentLamports:lastFees,exitQuoteSamples:exitSamples,exitQuoteFailures,processingLagMs:{p50:quantile(latency,0.5),p95:quantile(latency,0.95)},quoteAgeMs:{p50:quantile(quoteAge,0.5),p95:quantile(quoteAge,0.95)},quoteToChainFillDeviation:null,quoteToChainFillReason:'NO_VERIFIED_CHAIN_FILLS',outOfSample:'NOT_RUN',walkForward:'NOT_RUN',survivorship:'ALL_PERSISTED_SESSION_DECISIONS_INCLUDED; EXTERNAL_DISCOVERY_COMPLETENESS_NOT_PROVEN'};
 };return {add,finish};
}
export function researchPerformance(raw:unknown,scope:'REPLAY_TEST'|'FORWARD_PAPER'|'SHADOW'){const accumulator=performanceAccumulator(scope);accumulator.add(raw);return accumulator.finish();}
export function temporalPartitions<T extends {id:string;at:string;availableAt:string}>(records:T[],trainEnd:string,validationEnd:string,embargoMs:number){
 const train=Date.parse(trainEnd),validation=Date.parse(validationEnd);if(!Number.isFinite(train)||!Number.isFinite(validation)||train>=validation||!Number.isSafeInteger(embargoMs)||embargoMs<0||validation-train<=2*embargoMs)throw new Error('INVALID_TEMPORAL_BOUNDARIES');
 const output:{train:T[];validation:T[];test:T[];embargoed:T[]}={train:[],validation:[],test:[],embargoed:[]};let previous=-Infinity;const ids=new Set<string>();
 for(const row of records){const at=Date.parse(row.at),available=Date.parse(row.availableAt);if(!Number.isFinite(at)||!Number.isFinite(available)||available>at||at<previous||ids.has(row.id))throw new Error('LOOKAHEAD_DUPLICATE_OR_NONCHRONOLOGICAL_DATA');previous=at;ids.add(row.id);
  if(at<train-embargoMs)output.train.push(row);else if(at>train+embargoMs&&at<validation-embargoMs)output.validation.push(row);else if(at>validation+embargoMs)output.test.push(row);else output.embargoed.push(row);
 }
 return output;
}
