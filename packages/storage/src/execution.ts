import {evaluate,evaluationInput,fingerprint} from '../../engine/src/index.js';
import {PaperLedger,type PaperFill} from '../../accounting/src/paper.js';
import {swapEffects,reconcileSwapEffects} from '../../execution/src/swap-receipt.js';
import {verifyExecutionTransaction} from '../../execution/src/swap-verifier.js';
import { randomUUID, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';
import { keyBytes } from '../../connectors/src/pool-security.js';
import { hash, intentSchema, HARNESS_GENESIS, type ExecutionIntent, type VerifyContext } from '../../execution/src/verifier.js';
import { address, baseUnits, roles } from '../../domain/src/index.js';
const receiptSchema = z.strictObject({ sourceClass: z.literal('HARNESS_NOT_CHAIN'), genesis: z.literal(HARNESS_GENESIS), signature: z.string().regex(/^[a-f0-9]{128}$/), payer: address, destination: address, messageHash: z.string().regex(/^[a-f0-9]{64}$/), finality: z.literal('HARNESS_FINAL'), err: z.union([z.null(), z.record(z.string(), z.unknown())]), fee: baseUnits, payerBefore: baseUnits, payerAfter: baseUnits, destinationBefore: baseUnits, destinationAfter: baseUnits,swap:swapEffects.optional() });
export type HarnessReceipt = z.infer<typeof receiptSchema>;
export type Order = {
    id: string;
    account_id: string;
    correlation_id: string;
    intent: ExecutionIntent;
    state: string;
    unsigned_wire: string;
    verification_context: VerifyContext;
    signature: string | null;
    signed_wire: string | null;
    attempt_id: string | null;
    reservation: string;
    lease_token: string;
    reason: string | null;
};
export class ExecutionStore {
    constructor(readonly pool: Pool) { }
    private async tx<T>(fn: (c: PoolClient) => Promise<T>) { const c = await this.pool.connect(); try {
        await c.query('BEGIN');
        const value = await fn(c);
        await c.query('COMMIT');
        return value;
    }
    catch (e) {
        await c.query('ROLLBACK');
        throw e;
    }
    finally {
        c.release();
    } }
    private async event(c: PoolClient, o: Pick<Order, 'id' | 'correlation_id'>, state: string, reason: string, payload: unknown = {}) { await c.query('INSERT INTO execution_events(order_id,correlation_id,state,reason,payload) VALUES ($1,$2,$3,$4,$5)', [o.id, o.correlation_id, state, reason, JSON.stringify(payload)]); const audit = await c.query("INSERT INTO audit_events(actor,event_type,correlation_id,payload) VALUES ('execution-worker','EXECUTION_TRANSITION',$1,$2) RETURNING id", [o.correlation_id, JSON.stringify({ orderId: o.id, state, reason, sourceClass: 'HARNESS_NOT_CHAIN', details: payload })]); await c.query('INSERT INTO outbox_events(audit_id) VALUES ($1)', [audit.rows[0].id]); }
    private async allowed(c: PoolClient, intent: ExecutionIntent) { const mode = (await c.query('SELECT mode FROM system_state WHERE singleton')).rows[0]?.mode; if (mode !== 'OBSERVE')
        throw new Error('KILL_SWITCH_ACTIVE'); if (intent.mode !== 'HARNESS' || intent.genesis !== HARNESS_GENESIS || BigInt(intent.maxSpend) > 1000n || BigInt(intent.maxFee) > 10n)
        throw new Error('EXECUTION_MANDATE_VETO'); const clock = Number((await c.query('SELECT extract(epoch FROM clock_timestamp())*1000 AS ms')).rows[0].ms); if (clock >= Date.parse(intent.expiresAt) || clock < Date.parse(intent.observedAt))
        throw new Error('EXECUTION_EVIDENCE_EXPIRED'); }
    async account(id: string, cash: string,purpose:'TRANSFER'|'SWAP'='TRANSFER') { z.uuid().parse(id); baseUnits.parse(cash); await this.pool.query("INSERT INTO execution_accounts(id,mode,initial_cash,cash,purpose) VALUES ($1,'HARNESS',$2,$2,$3)", [id, cash,purpose]); }
    async create(accountId: string, requestKey: string, rawIntent: unknown, wire: Buffer, context: VerifyContext) {
        const intent = intentSchema.parse(rawIntent);
        z.uuid().parse(accountId);
        z.uuid().parse(requestKey);
        const fingerprint = hash(JSON.stringify({ intent, wire: wire.toString('base64'), context }));
        return this.tx(async (c) => {
            await c.query('SELECT pg_advisory_xact_lock(7011003)');
            const old = (await c.query('SELECT id,intent_hash FROM execution_orders WHERE request_key=$1 OR id=$2', [requestKey, intent.id])).rows[0];
            if (old) {
                if (old.id !== intent.id || old.intent_hash !== fingerprint)
                    throw new Error('ORDER_IDEMPOTENCY_CONFLICT');
                return old.id as string;
            }
            await this.allowed(c, intent);
            const swap=intent.instructions[0]?.kind==='JUPITER_CPMM_SWAP'?intent.instructions[0]:null;
            const owner=(await c.query('SELECT purpose FROM execution_accounts WHERE id=$1 FOR UPDATE',[accountId])).rows[0];if(!owner||owner.purpose!==(swap?'SWAP':'TRANSFER'))throw new Error('EXECUTION_ACCOUNT_PURPOSE');
            if(swap){const proposal=(await c.query('SELECT p.*,r.action FROM execution_swap_proposals p JOIN agent_runs r ON r.decision_id=p.correlation_id WHERE p.order_id=$1',[intent.id])).rows[0];if(!proposal||proposal.correlation_id!==intent.correlationId||proposal.intent_hash!==hash(JSON.stringify(intent))||proposal.quote_hash!==intent.quoteHash||proposal.policy_hash!==intent.policyHash||proposal.action!==(swap.mint==='So11111111111111111111111111111111111111112'?'BUY_PROPOSED':'SELL_PROPOSED'))throw new Error('SWAP_GUARD_PROPOSAL_REQUIRED');await this.swapCommitGuard(c,accountId,intent,proposal.input);verifyExecutionTransaction(wire,intent,context);if(swap.mint!=='So11111111111111111111111111111111111111112'&&swap.outputMint!=='So11111111111111111111111111111111111111112')throw new Error('SWAP_ACCOUNTING_PAIR_UNSUPPORTED');if(swap.outputMint==='So11111111111111111111111111111111111111112'){const ledger=await this.swapLedger(c,accountId);const held=BigInt(ledger.snapshot().positions.find(p=>p.mint===swap.mint)?.quantity??'0');const reserved=BigInt((await c.query("SELECT coalesce(sum((intent->'instructions'->0->>'amount')::numeric),0)::text AS amount FROM execution_orders WHERE account_id=$1 AND state NOT IN ('RECONCILED','REJECTED') AND intent->'instructions'->0->>'mint'=$2",[accountId,swap.mint])).rows[0].amount);if(held-reserved<BigInt(swap.amount))throw new Error('SWAP_INVENTORY_RESERVED_OR_MISSING');}}
            const reserve = (swap&&swap.outputMint==='So11111111111111111111111111111111111111112'?0n:BigInt(intent.maxSpend)) + BigInt(intent.maxFee);
            const account = await c.query('UPDATE execution_accounts SET reserved=reserved+$2 WHERE id=$1 AND cash-reserved>=$2 RETURNING id', [accountId, reserve.toString()]);
            if (!account.rowCount)
                throw new Error('EXECUTION_BUDGET');
            await c.query("INSERT INTO execution_orders(id,request_key,account_id,correlation_id,mode,intent_hash,intent,unsigned_wire,verification_context,state,reservation) VALUES ($1,$2,$3,$4,'HARNESS',$5,$6,$7,$8,'CREATED',$9)", [intent.id, requestKey, accountId, intent.correlationId, fingerprint, JSON.stringify(intent), wire.toString('base64'), JSON.stringify(context), reserve.toString()]);
            await this.event(c, { id: intent.id, correlation_id: intent.correlationId }, 'CREATED', 'GUARD_RESERVED', { policyHash: intent.policyHash, quoteHash: intent.quoteHash, reservation: reserve.toString() });
            return intent.id;
        });
    }
    async claim(leaseMs = 5000, orderId?: string) { if (!Number.isInteger(leaseMs) || leaseMs < 50 || leaseMs > 30000)
        throw new Error('LEASE_RANGE'); return this.tx(async (c) => { const row = (await c.query("SELECT * FROM execution_orders WHERE state NOT IN ('RECONCILED','REJECTED') AND (lease_until IS NULL OR lease_until<clock_timestamp()) AND ($1::uuid IS NULL OR id=$1) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1", [orderId ?? null])).rows[0]; if (!row)
        return null; const token = randomUUID(); await c.query("UPDATE execution_orders SET lease_token=$2,lease_until=clock_timestamp()+$3*interval '1 millisecond' WHERE id=$1", [row.id, token, leaseMs]); return { ...row, lease_token: token } as Order; }); }
    private async locked(c: PoolClient, id: string, token: string) { const row = (await c.query('SELECT *,lease_until>clock_timestamp() AS lease_valid FROM execution_orders WHERE id=$1 FOR UPDATE', [id])).rows[0]; if (!row || row.lease_token !== token || !row.lease_valid)
        throw new Error('EXECUTION_LEASE_LOST'); return row as Order; }
    async transition(id: string, token: string, next: 'VERIFIED' | 'SIGNED' | 'BROADCASTING' | 'UNCERTAIN' | 'REJECTED', reason: string, signed?: {
        signature: string;
        transaction: string;
    }) {
        return this.tx(async (c) => {
            const row = await this.locked(c, id, token);
            const allowed: Record<string, string[]> = { CREATED: ['VERIFIED', 'REJECTED'], VERIFIED: ['SIGNED', 'REJECTED'], SIGNED: ['BROADCASTING', 'REJECTED'], BROADCASTING: ['UNCERTAIN'], UNCERTAIN: ['UNCERTAIN'] };
            if (!allowed[row.state]?.includes(next))
                throw new Error('ORDER_TRANSITION_DENIED');
            if (['VERIFIED', 'SIGNED', 'BROADCASTING'].includes(next)) {
                await this.allowed(c, row.intent);
                verifyExecutionTransaction(Buffer.from(row.unsigned_wire, 'base64'), row.intent, { ...row.verification_context, now: Date.now() });
            }
            if (next === 'SIGNED') {
                if (!signed)
                    throw new Error('SIGNED_WIRE_REQUIRED');
                const bytes = Buffer.from(signed.transaction, 'base64'), unsigned = Buffer.from(row.unsigned_wire, 'base64'), publicKey = createPublicKey({ format: 'der', type: 'spki', key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), keyBytes(row.intent.payer)]) });
                if (!/^[a-f0-9]{128}$/.test(signed.signature) || bytes[0] !== 1 || bytes.subarray(1, 65).toString('hex') !== signed.signature || !bytes.subarray(65).equals(unsigned.subarray(65)) || !verify(null, bytes.subarray(65), publicKey, bytes.subarray(1, 65)))
                    throw new Error('SIGNED_TRANSACTION_MISMATCH');
            }
            if (next === 'REJECTED') {
                await c.query('UPDATE execution_accounts SET reserved=reserved-$2 WHERE id=$1', [row.account_id, row.reservation]);
            }
            if (next === 'UNCERTAIN' && row.state === 'UNCERTAIN' && row.reason === reason)
                return row;
            const changed = (await c.query('UPDATE execution_orders SET state=$3,reason=$4,signature=coalesce($5,signature),signed_wire=coalesce($6,signed_wire),attempt_id=CASE WHEN $3=\'BROADCASTING\' THEN coalesce(attempt_id,$7) ELSE attempt_id END,updated_at=clock_timestamp() WHERE id=$1 AND lease_token=$2 RETURNING *', [id, token, next, reason, signed?.signature ?? null, signed?.transaction ?? null, randomUUID()])).rows[0];
            await this.event(c, row, next, reason, { attemptId: changed.attempt_id, signature: changed.signature });
            return { ...changed, lease_token: token } as Order;
        });
    }
    async release(id: string, token: string) { await this.pool.query('UPDATE execution_orders SET lease_until=NULL,lease_token=NULL WHERE id=$1 AND lease_token=$2', [id, token]); }
    private async swapCommitGuard(c:PoolClient,accountId:string,intent:ExecutionIntent,raw:unknown){
      const input=evaluationInput.parse(raw),s=intent.instructions[0];if(s?.kind!=='JUPITER_CPMM_SWAP'||input.inputDataClass!=='REPLAY'||!input.researchPolicy||!input.quote||fingerprint(input.researchPolicy)!==intent.policyHash||input.quote.hash!==intent.quoteHash||input.quote.inputMint!==s.mint||input.quote.outputMint!==s.outputMint||input.quote.inputAmount!==s.amount||input.quote.outputAmount!==s.minOut||BigInt(input.quote.feeLamports)<BigInt(intent.maxFee))throw new Error('SWAP_COMMIT_INPUT_BINDING');
      const ledger=await this.swapLedger(c,accountId),snapshot=ledger.snapshot(),rows=(await c.query('SELECT fill,snapshot,fee::text,created_at FROM execution_swap_fills WHERE account_id=$1 ORDER BY created_at,order_id',[accountId])).rows,at=Date.now(),day=new Date(at).toISOString().slice(0,10);let loss=0n,previous=0n;for(const row of rows){const pnl=BigInt(row.snapshot.realizedPnlLamports);if(new Date(row.created_at).toISOString().slice(0,10)===day&&pnl<previous)loss+=previous-pnl;previous=pnl;}const today=rows.filter(r=>new Date(r.created_at).toISOString().slice(0,10)===day),held=snapshot.positions.find(p=>p.mint===s.mint),open=rows.filter(r=>r.fill?.side==='BUY'&&r.fill.mint===s.mint).at(-1),last=rows.at(-1),sell=s.outputMint==='So11111111111111111111111111111111111111112';
      const result=evaluate({...input,halted:false,balanceLamports:snapshot.cashLamports,position:sell&&held?{mint:held.mint,quantity:held.quantity,costLamports:held.costLamports,exitCostLamports:ledger.costFor(held.mint,s.amount),openedAt:open?new Date(open.created_at).toISOString():new Date(at).toISOString()}:undefined,account:{exposureLamports:snapshot.positions.reduce((n,p)=>n+BigInt(p.costLamports),0n).toString(),reservedLamports:(await c.query('SELECT reserved::text FROM execution_accounts WHERE id=$1',[accountId])).rows[0].reserved,dailyLossLamports:loss.toString(),dailyFeesLamports:today.reduce((n,r)=>n+BigInt(r.fee),0n).toString(),openPositions:snapshot.positions.length,tradesLastHour:rows.filter(r=>r.fill&&new Date(r.created_at).getTime()>at-3600000).length,lastTradeAt:last?new Date(last.created_at).toISOString():null}},intent.policyHash,at);
      if(result.action!==(sell?'SELL_PROPOSED':'BUY_PROPOSED'))throw new Error('SWAP_COMMIT_GUARD_VETO');
    }
    private async swapLedger(c:PoolClient,accountId:string){const a=(await c.query('SELECT initial_cash::text FROM execution_accounts WHERE id=$1',[accountId])).rows[0];const ledger=new PaperLedger();ledger.capitalFlow(BigInt(a.initial_cash));for(const row of (await c.query('SELECT order_id,fill,fee::text FROM execution_swap_fills WHERE account_id=$1 ORDER BY created_at,order_id',[accountId])).rows){if(row.fill)ledger.fill({...row.fill,mode:'PAPER',sourceClass:'REPLAY'} as PaperFill);else ledger.chargeFee(row.order_id,row.fee);}return ledger;}
    async reconcile(id: string, token: string, raw: unknown) {
        const receipt = receiptSchema.parse(raw);
        return this.tx(async (c) => {
            const terminal = (await c.query('SELECT state FROM execution_orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
            if (terminal?.state === 'RECONCILED') {
                const prior = (await c.query('SELECT receipt_hash FROM execution_receipts WHERE order_id=$1', [id])).rows[0];
                if (prior?.receipt_hash !== hash(JSON.stringify(receipt)))
                    throw new Error('RECEIPT_CONFLICT');
                return;
            }
            const row = await this.locked(c, id, token);
            if (!['BROADCASTING', 'UNCERTAIN'].includes(row.state) || !row.signed_wire || row.signature !== receipt.signature || receipt.messageHash !== hash(Buffer.from(row.signed_wire, 'base64').subarray(65)))
                throw new Error('RECEIPT_IDENTITY_MISMATCH');
            const swap=row.intent.instructions[0];
            if(swap?.kind==='JUPITER_CPMM_SWAP'){
              if(!receipt.swap||receipt.payer!==row.intent.payer||receipt.destination!==swap.destination||BigInt(receipt.payerBefore)-BigInt(receipt.payerAfter)!==BigInt(receipt.fee)||receipt.destinationBefore!==receipt.swap.outputBefore||receipt.destinationAfter!==receipt.swap.outputAfter||BigInt(receipt.fee)>BigInt(row.intent.maxFee))throw new Error('SWAP_RECEIPT_ACCOUNT_OR_FEE');
              const effects=reconcileSwapEffects(row.intent,receipt.swap,receipt.err!==null),ledger=await this.swapLedger(c,row.account_id),buy=swap.mint==='So11111111111111111111111111111111111111112';
              const fill:PaperFill={id:row.id,mode:'PAPER',sourceClass:'REPLAY',side:buy?'BUY':'SELL',mint:buy?swap.outputMint:swap.mint,quantity:buy?effects.outputAmount:effects.inputAmount,quoteLamports:buy?effects.inputAmount:effects.outputAmount,feeLamports:receipt.fee,fillable:true};
              if(receipt.err===null)ledger.fill(fill);else ledger.chargeFee(row.id,receipt.fee);
              const cashDelta=receipt.err!==null?-BigInt(receipt.fee):buy?-BigInt(effects.inputAmount)-BigInt(receipt.fee):BigInt(effects.outputAmount)-BigInt(receipt.fee);
              const account=(await c.query('UPDATE execution_accounts SET cash=cash+$2,reserved=reserved-$3 WHERE id=$1 AND cash+$2>=0 AND reserved>=$3 RETURNING cash::text',[row.account_id,cashDelta.toString(),row.reservation])).rows[0];if(!account)throw new Error('SWAP_ACCOUNTING_CONFLICT');
              const snapshot=ledger.snapshot();if(snapshot.cashLamports!==account.cash)throw new Error('SWAP_LEDGER_CASH_CONFLICT');const receiptHash=hash(JSON.stringify(receipt));
              await c.query("INSERT INTO execution_receipts(order_id,signature,source_class,receipt_hash,payload) VALUES ($1,$2,'HARNESS_NOT_CHAIN',$3,$4)",[id,receipt.signature,receiptHash,JSON.stringify(receipt)]);
              await c.query('INSERT INTO execution_swap_fills(order_id,account_id,fill,snapshot,fee) VALUES ($1,$2,$3,$4,$5)',[id,row.account_id,receipt.err===null?JSON.stringify({...fill,mode:'HARNESS',sourceClass:'HARNESS_NOT_CHAIN',inputDataClass:'REPLAY_TEST'}):null,JSON.stringify({...snapshot,mode:'HARNESS',sourceClass:'HARNESS_NOT_CHAIN',equityLamports:snapshot.positions.length?null:snapshot.cashLamports}),receipt.fee]);
              await c.query("INSERT INTO execution_ledger(order_id,account_id,source_class,spent,fee,cash_after,receipt_hash) VALUES ($1,$2,'HARNESS_NOT_CHAIN',$3,$4,$5,$6)",[id,row.account_id,buy?effects.inputAmount:'0',receipt.fee,account.cash,receiptHash]);
              await c.query("UPDATE execution_orders SET state='RECONCILED',reason=$2,updated_at=clock_timestamp() WHERE id=$1",[id,receipt.err===null?'HARNESS_SWAP_RECEIPT_RECONCILED':'HARNESS_SWAP_FAILED_FEE_RECONCILED']);await this.event(c,row,'RECONCILED',receipt.err===null?'HARNESS_SWAP_RECEIPT_RECONCILED':'HARNESS_SWAP_FAILED_FEE_RECONCILED',{receiptHash,accounting:{...snapshot,mode:'HARNESS',sourceClass:'HARNESS_NOT_CHAIN',equityLamports:snapshot.positions.length?null:snapshot.cashLamports},effects});return;
            }
            const instructions = row.intent.instructions;
            if(receipt.swap)throw new Error('UNEXPECTED_SWAP_RECEIPT');
            if (instructions.some(i => i.kind !== 'SOL_TRANSFER') || new Set(instructions.map(i => i.destination)).size !== 1)
                throw new Error('RECEIPT_SEMANTICS_UNSUPPORTED');
            if (receipt.payer !== row.intent.payer || receipt.destination !== instructions[0]!.destination)
                throw new Error('RECEIPT_ACCOUNT_MISMATCH');
            const spend = receipt.err === null ? instructions.reduce((n, i) => n + BigInt(i.amount), 0n) : 0n, fee = BigInt(receipt.fee);
            if (fee > BigInt(row.intent.maxFee) || BigInt(receipt.payerBefore) - BigInt(receipt.payerAfter) !== spend + fee || BigInt(receipt.destinationAfter) - BigInt(receipt.destinationBefore) !== spend)
                throw new Error('RECEIPT_BALANCE_MISMATCH');
            const receiptHash = hash(JSON.stringify(receipt));
            await c.query("INSERT INTO execution_receipts(order_id,signature,source_class,receipt_hash,payload) VALUES ($1,$2,'HARNESS_NOT_CHAIN',$3,$4)", [id, receipt.signature, receiptHash, JSON.stringify(receipt)]);
            const account = (await c.query('UPDATE execution_accounts SET cash=cash-$2,reserved=reserved-$3 WHERE id=$1 AND cash>=$2 AND reserved>=$3 RETURNING cash::text', [row.account_id, (spend + fee).toString(), row.reservation])).rows[0];
            if (!account)
                throw new Error('RECONCILIATION_ACCOUNT_CONFLICT');
            await c.query("INSERT INTO execution_ledger(order_id,account_id,source_class,spent,fee,cash_after,receipt_hash) VALUES ($1,$2,'HARNESS_NOT_CHAIN',$3,$4,$5,$6)", [id, row.account_id, spend.toString(), fee.toString(), account.cash, receiptHash]);
            await c.query("UPDATE execution_orders SET state='RECONCILED',reason=$2,updated_at=clock_timestamp() WHERE id=$1", [id, receipt.err === null ? 'HARNESS_RECEIPT_RECONCILED' : 'FAILED_RECEIPT_FEE_RECONCILED']);
            await this.event(c, row, 'RECONCILED', receipt.err === null ? 'HARNESS_RECEIPT_RECONCILED' : 'FAILED_RECEIPT_FEE_RECONCILED', { receiptHash, cashAfter: account.cash, spent: spend.toString(), fee: fee.toString() });
        });
    }
    async swapSnapshot(accountId:string){z.uuid().parse(accountId);return this.tx(async c=>(await this.swapLedger(c,accountId)).snapshot());}
    async list() { return (await this.pool.query('SELECT id,correlation_id,mode,state,reason,signature,attempt_id,created_at,updated_at FROM execution_orders ORDER BY created_at DESC LIMIT 50')).rows; }
    async detail(id: string) { z.uuid().parse(id); const order = (await this.pool.query('SELECT id,correlation_id,mode,intent,state,reason,signature,attempt_id FROM execution_orders WHERE id=$1', [id])).rows[0]; if (!order)
        return null; return { order, signerJournal:(await this.pool.query('SELECT r.id,r.mandate_id,r.state,r.signature,r.intent_hash,r.guard_certificate,m.certificate AS mandate_certificate,r.created_at,r.updated_at,EXISTS(SELECT 1 FROM signer_mandate_revocations v WHERE v.mandate_id=r.mandate_id) AS mandate_revoked FROM signer_requests r JOIN signer_mandates m ON m.id=r.mandate_id WHERE r.id=$1',[id])).rows[0]??null, sourceClass: 'HARNESS_NOT_CHAIN', mainnetReceiptVerified: false, decisionTrace: (await this.pool.query("SELECT role,payload FROM agent_events WHERE decision_id=$1 ORDER BY array_position($2::text[],role)", [order.correlation_id, [...roles]])).rows, events: (await this.pool.query('SELECT sequence::text,state,reason,payload,created_at FROM execution_events WHERE order_id=$1 ORDER BY sequence', [id])).rows, receipt: (await this.pool.query('SELECT source_class,receipt_hash,payload FROM execution_receipts WHERE order_id=$1', [id])).rows[0] ?? null, swapAccounting:(await this.pool.query('SELECT fill,snapshot,fee::text FROM execution_swap_fills WHERE order_id=$1',[id])).rows[0]??null,ledger: (await this.pool.query('SELECT source_class,spent::text,fee::text,cash_after::text,receipt_hash FROM execution_ledger WHERE order_id=$1', [id])).rows[0] ?? null }; }
}
