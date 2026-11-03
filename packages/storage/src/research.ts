import { exitAmount } from '../../engine/src/exit-size.js';
import { assertProgramReview } from './program-reviews.js';
import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { z } from 'zod';
import { evaluate,evaluationInput,fingerprint,exitReadiness } from '../../engine/src/index.js';
import { researchPolicy } from '../../engine/src/research.js';
import { replayInput } from '../../engine/src/replay.js';
import type { PaperJob } from './paper-scheduler.js';
import { baseUnits } from '../../domain/src/index.js';
import { performanceAccumulator } from '../../accounting/src/performance.js';
import { capitalCommand } from '../../accounting/src/capital.js';
import { PaperLedger,type PaperFill } from '../../accounting/src/paper.js';
const dateRange={from:z.iso.date().optional(),to:z.iso.date().optional()};
export const historyRange=z.strictObject(dateRange).refine(v=>!v.from||!v.to||v.from<=v.to,'INVALID_DATE_RANGE');
export const historyPage=z.strictObject({...dateRange,before:z.string().regex(/^[1-9][0-9]{0,18}$/).pipe(z.string().refine(n=>BigInt(n)<=9223372036854775807n)).optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}).refine(v=>!v.from||!v.to||v.from<=v.to,'INVALID_DATE_RANGE');
const sessionConfig=z.strictObject({mode:z.enum(['PAPER','SHADOW']),policy:researchPolicy,initialCashLamports:baseUnits});
export class ResearchStore {
  constructor(private readonly pool:Pool){}
  async create(raw:unknown){
    const config=sessionConfig.parse(raw);const id=randomUUID();const policyHash=fingerprint(config.policy);
    await this.pool.query('INSERT INTO research_sessions(id,mode,policy,policy_hash,initial_cash) VALUES ($1,$2,$3,$4,$5)',[id,config.mode,JSON.stringify(config.policy),policyHash,config.initialCashLamports]);return {id,mode:config.mode,policyHash};
  }
  async list(){return (await this.pool.query('SELECT id,mode,policy_hash,initial_cash::text,created_at FROM research_sessions ORDER BY created_at DESC LIMIT 50')).rows;}
  private async replay(client:PoolClient,id:string){
    const session=(await client.query('SELECT *,initial_cash::text AS cash FROM research_sessions WHERE id=$1',[id])).rows[0];
    if(!session)throw new Error('RESEARCH_SESSION_NOT_FOUND');
    const journal=(await client.query<{fill:PaperFill|null;recorded_at:Date;snapshot:ReturnType<PaperLedger['snapshot']>}>('SELECT fill,recorded_at,snapshot FROM research_journal WHERE session_id=$1 AND fill IS NOT NULL ORDER BY id',[id])).rows;
    const ledger=new PaperLedger();ledger.capitalFlow(BigInt(session.cash));const events=(await client.query<{kind:string;amount:string|null;fill:PaperFill|null}>(`SELECT e.kind,e.amount::text,j.fill FROM paper_ledger_events e LEFT JOIN research_journal j ON j.id=e.journal_id WHERE e.session_id=$1 ORDER BY e.sequence`,[id])).rows;for(const row of events){if(row.kind==='FILL')ledger.fill(row.fill!);else if(row.kind==='DEPOSIT')ledger.capitalFlow(BigInt(row.amount!));else if(row.kind==='WITHDRAW')ledger.capitalFlow(-BigInt(row.amount!));else if(row.kind==='RENT_RESERVE')ledger.reserveRent(row.amount!);else ledger.refundRent(row.amount!);}
    const decisionCount=Number((await client.query('SELECT count(*)::int AS n FROM research_journal WHERE session_id=$1',[id])).rows[0].n);return {session,journal,ledger,decisionCount};
  }
  async detail(id:string,page:unknown={}){
    z.uuid().parse(id);const paging=historyPage.parse(page);const client=await this.pool.connect();
    try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const {session,ledger,decisionCount}=await this.replay(client,id);const pageRows=(await client.query('SELECT j.id::text,j.recorded_at,j.input,j.fill,j.snapshot,r.action,j.decision_id FROM research_journal j JOIN agent_runs r ON r.decision_id=j.decision_id WHERE session_id=$1 AND ($2::bigint IS NULL OR j.id<$2) AND ($4::date IS NULL OR j.recorded_at>=($4::date::timestamp AT TIME ZONE \'UTC\')) AND ($5::date IS NULL OR j.recorded_at<(($5::date+1)::timestamp AT TIME ZONE \'UTC\')) ORDER BY j.id DESC LIMIT $3',[id,paging.before??null,paging.limit+1,paging.from??null,paging.to??null])).rows;const hasMore=pageRows.length>paging.limit;const events=pageRows.slice(0,paging.limit).reverse();const eventCount=decisionCount;const matchedCount=!paging.from&&!paging.to?decisionCount:Number((await client.query("SELECT count(*)::int AS n FROM research_journal WHERE session_id=$1 AND ($2::date IS NULL OR recorded_at>=($2::date::timestamp AT TIME ZONE 'UTC')) AND ($3::date IS NULL OR recorded_at<(($3::date+1)::timestamp AT TIME ZONE 'UTC'))",[id,paging.from??null,paging.to??null])).rows[0].n);const capitalEvents=(await client.query("SELECT sequence::text,request_key,kind,amount::text,rent_reference,source_class,created_at FROM paper_ledger_events WHERE session_id=$1 AND kind<>'FILL' ORDER BY sequence DESC LIMIT 50",[id])).rows;const valuation=await this.valuation(client,id,ledger.snapshot(),researchPolicy.parse(session.policy).quoteMaxAgeMs);await client.query('COMMIT');return {id,mode:session.mode,policy:session.policy,policyHash:session.policy_hash,classification:'RESEARCH_NOT_CHAIN',snapshot:{...ledger.snapshot(),...valuation,mode:session.mode,sourceClass:session.mode==='SHADOW'?'SHADOW':'PAPER_SIM'},events,eventCount,history:{limit:paging.limit,matchedCount,displayedCount:events.length,hasMore,nextCursor:hasMore?events[0]?.id:null},capitalEvents};}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  private async valuation(client:PoolClient,id:string,snapshot:ReturnType<PaperLedger['snapshot']>,ttl:number){
    const marks=(await client.query<{mint:string;quantity:string;net_value:string}>("SELECT mint,quantity::text,net_value::text FROM paper_marks WHERE session_id=$1 AND received_at<=clock_timestamp() AND received_at>=clock_timestamp()-$2*interval '1 millisecond'",[id,ttl])).rows;
    let value=0n,cost=0n;for(const p of snapshot.positions){const mark=marks.find(m=>m.mint===p.mint&&m.quantity===p.quantity);if(!mark)return {equityLamports:null,unrealizedPnlLamports:null,valuation:'UNKNOWN_MISSING_FRESH_EXIT_QUOTE'};value+=BigInt(mark.net_value);cost+=BigInt(p.costLamports);}
    return {equityLamports:(BigInt(snapshot.cashLamports)+BigInt(snapshot.rentReserveLamports)+value).toString(),unrealizedPnlLamports:(value-cost).toString(),valuation:snapshot.positions.length?'ESTIMATED_EXECUTABLE_PAPER_EXIT':BigInt(snapshot.rentReserveLamports)>0n?'PAPER_CASH_AND_RESERVED_RENT':'PAPER_CASH'};
  }
  async capital(id:string,raw:unknown){
    z.uuid().parse(id);const command=capitalCommand.parse(raw),hash=fingerprint(command),client=await this.pool.connect();
    try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7011002)');
      const previous=(await client.query('SELECT input_hash,snapshot FROM paper_ledger_events WHERE session_id=$1 AND request_key=$2',[id,command.requestKey])).rows[0];if(previous){if(previous.input_hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');await client.query('COMMIT');return {duplicate:true,snapshot:previous.snapshot,classification:'VIRTUAL_CAPITAL_NOT_CHAIN'};}
      if((await client.query('SELECT id FROM research_journal WHERE session_id=$1 AND request_key=$2',[id,command.requestKey])).rowCount)throw new Error('IDEMPOTENCY_CONFLICT');
      const {session,ledger}=await this.replay(client,id),before=ledger.snapshot(),amount=BigInt(command.amountLamports),policy=researchPolicy.parse(session.policy);
      const reserved=BigInt((await client.query("SELECT coalesce(sum(reservation_lamports),0)::text AS amount FROM paper_jobs WHERE session_id=$1 AND state='LEASED' AND lease_until>clock_timestamp()",[id])).rows[0].amount);
      if(['WITHDRAW','RENT_RESERVE'].includes(command.kind)&&BigInt(before.cashLamports)-amount<BigInt(policy.reserveLamports)+reserved)throw new Error('CAPITAL_ENCUMBERED_OR_RESERVE_BREACH');
      if(command.kind==='DEPOSIT')ledger.capitalFlow(amount);else if(command.kind==='WITHDRAW')ledger.capitalFlow(-amount);else if(command.kind==='RENT_RESERVE')ledger.reserveRent(command.amountLamports);else{
        const reservation=(await client.query("SELECT amount::text FROM paper_ledger_events WHERE session_id=$1 AND request_key=$2 AND kind='RENT_RESERVE'",[id,command.rentReservationKey])).rows[0];if(!reservation)throw new Error('RENT_RESERVATION_NOT_FOUND');
        const refunded=BigInt((await client.query("SELECT coalesce(sum(amount),0)::text AS amount FROM paper_ledger_events WHERE session_id=$1 AND rent_reference=$2 AND kind='RENT_REFUND'",[id,command.rentReservationKey])).rows[0].amount);if(refunded+amount>BigInt(reservation.amount))throw new Error('RENT_REFUND_EXCEEDS_RESERVATION');ledger.refundRent(command.amountLamports);
      }
      const snapshot={...ledger.snapshot(),...await this.valuation(client,id,ledger.snapshot(),policy.quoteMaxAgeMs),mode:session.mode,sourceClass:session.mode==='SHADOW'?'SHADOW':'PAPER_SIM'};
      await client.query('INSERT INTO paper_ledger_events(session_id,request_key,kind,amount,rent_reference,input_hash,source_class,snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,command.requestKey,command.kind,command.amountLamports,command.kind==='RENT_REFUND'?command.rentReservationKey:null,hash,snapshot.sourceClass,JSON.stringify(snapshot)]);
      const audit=await client.query("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('owner','VIRTUAL_CAPITAL_EVENT',$1,$2) RETURNING id",[command.requestKey,JSON.stringify({sessionId:id,...command,mode:session.mode,sourceClass:snapshot.sourceClass,classification:'VIRTUAL_CAPITAL_NOT_CHAIN'})]);await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0].id]);await client.query('COMMIT');return {duplicate:false,snapshot,classification:'VIRTUAL_CAPITAL_NOT_CHAIN'};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async series(id:string,rawRange:unknown={}){
    z.uuid().parse(id);const range=historyRange.parse(rawRange);const client=await this.pool.connect();
    try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const session=(await client.query('SELECT mode FROM research_sessions WHERE id=$1',[id])).rows[0];if(!session)throw new Error('RESEARCH_SESSION_NOT_FOUND');
      const counts=(await client.query("SELECT count(*)::int AS decisions,count(*) FILTER(WHERE fill IS NOT NULL AND fill<>'null'::jsonb)::int AS fills FROM research_journal WHERE session_id=$1",[id])).rows[0];
      const params=[id,range.from??null,range.to??null];
      // Preserve first/last and exact realized-PnL extrema in each chronological bucket.
      // This bounds only the chart response; performance below still processes every event.
      const rows=(await client.query(`WITH matching AS (
        SELECT id,recorded_at,snapshot->>'realizedPnlLamports' AS pnl,row_number() OVER(ORDER BY id) AS ordinal,count(*) OVER() AS matching_count
        FROM research_journal WHERE session_id=$1 AND ($2::date IS NULL OR recorded_at>=($2::date::timestamp AT TIME ZONE 'UTC')) AND ($3::date IS NULL OR recorded_at<(($3::date+1)::timestamp AT TIME ZONE 'UTC'))
      ), bucketed AS (SELECT *,floor((ordinal-1)/greatest(1,ceil(matching_count::numeric/2500))) AS bucket FROM matching), ranked AS (
        SELECT *,row_number() OVER(PARTITION BY bucket ORDER BY id) AS first_point,row_number() OVER(PARTITION BY bucket ORDER BY id DESC) AS last_point,
        row_number() OVER(PARTITION BY bucket ORDER BY pnl::numeric,id) AS low_point,row_number() OVER(PARTITION BY bucket ORDER BY pnl::numeric DESC,id) AS high_point FROM bucketed
      ) SELECT id::text,recorded_at,pnl,matching_count::text FROM ranked WHERE matching_count<=10000 OR first_point=1 OR last_point=1 OR low_point=1 OR high_point=1 ORDER BY ranked.id`,params)).rows;
      const rangeDecisionCount=Number(rows[0]?.matching_count??0);await client.query('COMMIT');return {id,mode:session.mode,sourceClass:'RESEARCH_NOT_CHAIN',scope:'ENTIRE_SESSION_NOT_HISTORY_PAGE',totalDecisions:counts.decisions,totalFills:counts.fills,rangeDecisionCount,sampling:rangeDecisionCount>10000?'BUCKET_FIRST_LAST_MIN_MAX':'ALL_MATCHING_POINTS',range:{from:range.from??null,to:range.to??null,timezone:'UTC'},points:rows.map(r=>({id:r.id,recordedAt:r.recorded_at,realizedPnlLamports:z.string().regex(/^(0|-?[1-9][0-9]{0,39})$/).parse(r.pnl)})),equity:'UNKNOWN_UNLESS_INVENTORY_VALUED'};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async performance(id:string){
    z.uuid().parse(id);const client=await this.pool.connect();
    try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const session=(await client.query('SELECT s.mode,a.scope FROM research_sessions s LEFT JOIN paper_automations a ON a.session_id=s.id WHERE s.id=$1',[id])).rows[0];if(!session)throw new Error('RESEARCH_SESSION_NOT_FOUND');
      const accumulator=performanceAccumulator(session.mode==='SHADOW'?'SHADOW':session.scope==='LIVE_PROVIDER'?'FORWARD_PAPER':'REPLAY_TEST');
      await client.query('DECLARE performance_events NO SCROLL CURSOR FOR SELECT j.recorded_at,j.input,j.fill,j.snapshot,r.action FROM research_journal j JOIN agent_runs r ON r.decision_id=j.decision_id WHERE session_id=$1 ORDER BY j.id',[id]);
      for(;;){const batch=(await client.query('FETCH FORWARD 512 FROM performance_events')).rows;if(!batch.length)break;accumulator.add(batch);}
      const result=accumulator.finish();await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  // UI replay explicitly selects committed regression data, not caller-invented LIVE evidence.
  async runReplay(id:string,requestKey:string,scenario:'BUY'|'SELL'|'MISSING_SECURITY'|'STALE_QUOTE'){
    return this.apply(id,requestKey,replayInput(scenario),scenario);
  }
  async apply(id:string,requestKey:string,raw:unknown,identity?:string,job?:PaperJob){
    z.uuid().parse(id);z.uuid().parse(requestKey);
    const validated=evaluationInput.parse(raw);const requestHash=fingerprint(identity??validated);
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7011002)');
      const previous=(await client.query('SELECT input_hash,decision_id FROM research_journal WHERE session_id=$1 AND request_key=$2',[id,requestKey])).rows[0];
      if(previous){if(previous.input_hash!==requestHash)throw new Error('IDEMPOTENCY_CONFLICT');await client.query('COMMIT');return {decisionId:previous.decision_id,duplicate:true};}
      if((await client.query('SELECT sequence FROM paper_ledger_events WHERE session_id=$1 AND request_key=$2',[id,requestKey])).rowCount)throw new Error('IDEMPOTENCY_CONFLICT');
      const automation=(await client.query('SELECT * FROM paper_automations WHERE session_id=$1',[id])).rows[0];
      let ownReservation:string|null=null;let leaseValidUntil:Date|null=null;
      if(automation){
        if(!job||job.session_id!==id||!automation.enabled||automation.scope!==job.scope||(validated.inputDataClass==='REPLAY')!==(job.scope==='REPLAY_TEST'))throw new Error('AUTOMATION_LEASE_REQUIRED');
        const fence=await client.query("SELECT id,reservation_lamports::text AS reservation,lease_until FROM paper_jobs WHERE id=$1 AND session_id=$2 AND state='LEASED' AND lease_token=$3 AND lease_until>clock_timestamp() FOR UPDATE",[job.id,id,job.lease_token]);if(!fence.rowCount)throw new Error('LEASE_LOST');ownReservation=fence.rows[0].reservation;leaseValidUntil=fence.rows[0].lease_until;
      }
      const {session,journal,ledger,decisionCount}=await this.replay(client,id);
      const policy=researchPolicy.parse(session.policy);const snapshot=ledger.snapshot();
      // Retain the entry cap, but never stop SHADOW evidence or an owned protective exit.
      if(decisionCount>=10000&&session.mode!=='SHADOW'&&!(validated.requestedSide==='SELL'&&snapshot.positions.some(p=>p.mint===validated.mint)))throw new Error('RESEARCH_SESSION_EVENT_LIMIT');
      if(job&&validated.requestedSide==='SELL'){
        const q=validated.quote,p=snapshot.positions.find(p=>p.mint===validated.mint);
        if(p&&q?.fillable&&q.inputMint===p.mint&&q.outputMint==='So11111111111111111111111111111111111111112'&&q.inputAmount===p.quantity&&Date.now()-Date.parse(q.receivedAt)>=0&&Date.now()-Date.parse(q.receivedAt)<=policy.quoteMaxAgeMs&&exitReadiness({...validated,position:{mint:p.mint,quantity:p.quantity,costLamports:p.costLamports,openedAt:new Date().toISOString()},researchPolicy:policy},Date.now()).state==='PASS')await client.query('INSERT INTO paper_marks(session_id,mint,quantity,net_value,received_at,quote_hash) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(session_id,mint) DO UPDATE SET quantity=$3,net_value=$4,received_at=$5,quote_hash=$6',[id,p.mint,p.quantity,(BigInt(q.outputAmount)>BigInt(q.feeLamports)?BigInt(q.outputAmount)-BigInt(q.feeLamports):0n).toString(),q.receivedAt,q.hash]);
        else await client.query('DELETE FROM paper_marks WHERE session_id=$1 AND mint=$2',[id,validated.mint]);
      }
      const halted=(await client.query('SELECT mode FROM system_state WHERE singleton FOR SHARE')).rows[0]?.mode!=='OBSERVE';
      const position=snapshot.positions.find(p=>p.mint===validated.mint);
      const today=new Date().toISOString().slice(0,10);const daily=journal.filter(e=>e.recorded_at.toISOString().startsWith(today));
      let dailyLoss=0n;let priorPnl=0n;
      for(const row of journal){const pnl=BigInt(row.snapshot.realizedPnlLamports);if(row.recorded_at.toISOString().startsWith(today)&&pnl<priorPnl)dailyLoss+=priorPnl-pnl;priorPnl=pnl;}
      const last=journal.filter(e=>e.fill).at(-1);
      const reservations=(await client.query<{other:string}>("SELECT coalesce(sum(reservation_lamports),0)::text AS other FROM paper_jobs WHERE session_id=$1 AND state='LEASED' AND ($2::uuid IS NULL OR id<>$2)",[id,job?.id??null])).rows[0]!.other;
      const input={...validated,mode:session.mode,researchPolicy:policy,halted,balanceLamports:snapshot.cashLamports,
        account:{exposureLamports:snapshot.positions.reduce((v,p)=>v+BigInt(p.costLamports),0n).toString(),reservedLamports:reservations,dailyLossLamports:dailyLoss.toString(),dailyFeesLamports:daily.reduce((v,e)=>v+BigInt(e.fill?.feeLamports??'0'),0n).toString(),openPositions:snapshot.positions.length,tradesLastHour:journal.filter(e=>e.fill&&e.recorded_at.getTime()>Date.now()-3600000).length,lastTradeAt:last?.recorded_at.toISOString()??null},
        ...(position?{position:{mint:position.mint,quantity:position.quantity,costLamports:position.costLamports,exitCostLamports:ledger.costFor(position.mint,exitAmount(position.quantity,policy.exitFractionBps)),openedAt:journal.filter(e=>e.fill?.mint===position.mint&&e.fill.side==='BUY').at(-1)!.recorded_at.toISOString()}}:{})};
      // Caller supplied balances/account/position cannot override durable state.
      if(!position)delete (input as {position?:unknown}).position;
      const result=evaluate(input,session.policy_hash);
      if(automation?.scope==='LIVE_PROVIDER'&&result.action!=='SKIP')await assertProgramReview(client,validated.poolEvidence?.revisionReviewId,validated.poolEvidence?.revisionHash);
      if(automation?.scope==='LIVE_PROVIDER'&&result.action!=='SKIP'&&(validated.tokenDecimals===undefined||validated.poolEvidence?.genesis!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'||!validated.poolEvidence||!validated.transferEvidence))throw new Error('CHAIN_POOL_TRANSFER_PROOF_REQUIRED');
      let fill:PaperFill|null=null;
      if(session.mode==='PAPER'&&result.action!=='SKIP'){
        const q=validated.quote!;if(ownReservation!==null&&BigInt(ownReservation)<BigInt(q.feeLamports)+(result.action==='BUY_PROPOSED'?BigInt(q.inputAmount):0n))throw new Error('RESERVATION_INSUFFICIENT');const side=result.action==='BUY_PROPOSED'?'BUY':'SELL';
        fill={id:requestKey,mode:'PAPER',sourceClass:validated.inputDataClass==='REPLAY'?'REPLAY':'PAPER_SIM',side,mint:validated.mint,quantity:side==='BUY'?q.outputAmount:q.inputAmount,quoteLamports:side==='BUY'?q.inputAmount:q.outputAmount,feeLamports:q.feeLamports,fillable:q.fillable};ledger.fill(fill);
      }
      const next={...ledger.snapshot(),...await this.valuation(client,id,ledger.snapshot(),policy.quoteMaxAgeMs),mode:session.mode,sourceClass:session.mode==='SHADOW'?'SHADOW':'PAPER_SIM'};
      const equity=result.events.find(e=>e.role==='EQUITY')!;
      equity.inputHash=fingerprint({decisionInput:result.inputHash,postLedger:next});
      equity.output={state:next.equityLamports===null?'UNKNOWN':'RECORDED',reasons:['POST_ACCOUNTING_'+next.valuation],equityLamports:next.equityLamports,value:null};equity.outputHash=fingerprint(equity.output);
      await client.query('INSERT INTO agent_runs(decision_id,mint,input_hash,policy_hash,mode,action) VALUES ($1,$2,$3,$4,$5,$6)',[result.decisionId,result.mint,fingerprint({requestKey,inputHash:result.inputHash}),result.policyHash,result.mode,result.action]);
      for(const event of result.events)await client.query('INSERT INTO agent_events(event_id,decision_id,role,payload) VALUES ($1,$2,$3,$4)',[event.eventId,result.decisionId,event.role,JSON.stringify(event)]);
      await client.query('INSERT INTO research_journal(session_id,request_key,input_hash,decision_id,input,fill,snapshot,lease_valid_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,requestKey,requestHash,result.decisionId,JSON.stringify(input),fill?JSON.stringify(fill):null,JSON.stringify(next),leaseValidUntil]);
      const audit=await client.query<{id:string}>("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('research','RESEARCH_DECISION',$1,$2) RETURNING id",[result.decisionId,JSON.stringify({sessionId:id,mode:session.mode,action:result.action,inputClass:validated.inputDataClass,executionAuthority:'NONE'})]);
      await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[audit.rows[0]!.id]);
      if(validated.requestedSide==='SELL'&&result.action==='SKIP'&&result.events.find(e=>e.role==='GUARD')!.output.reasons.some(r=>r.startsWith('EXIT_UNAVAILABLE'))){const alert=await client.query("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('guard','EXIT_UNAVAILABLE',$1,$2) RETURNING id",[result.decisionId,JSON.stringify({mint:validated.mint,sessionId:id,reasons:result.events.find(e=>e.role==='GUARD')!.output.reasons})]);await client.query('INSERT INTO outbox_events(audit_id) VALUES ($1)',[alert.rows[0].id]);}
      // Migration012 defers evidence/deadline checks until COMMIT, after all writes/triggers.
      if(job){const released=await client.query("UPDATE paper_jobs SET state='READY',lease_token=NULL,lease_until=NULL,reservation_lamports=0,last_decision_id=$3,last_reason=$4,next_at=clock_timestamp()+(SELECT interval_ms FROM paper_automations WHERE session_id=$5)*interval '1 millisecond' WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp()",[job.id,job.lease_token,result.decisionId,result.events.find(e=>e.role==='GUARD')!.output.reasons.join(','),id]);if(!released.rowCount)throw new Error('LEASE_LOST');}
      await client.query('COMMIT');return {decisionId:result.decisionId,action:result.action,snapshot:next,duplicate:false};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}
