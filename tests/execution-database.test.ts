import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { Pool, migrate } from '../packages/storage/src/index.js';
import { ExecutionStore } from '../packages/storage/src/execution.js';
import { HarnessSigner } from '../packages/execution/src/harness-signer.js';
import { HarnessBankTransport } from '../packages/execution/src/model-transport.js';
import { harnessTransfer } from '../packages/execution/src/harness-wire.js';
import { HARNESS_GENESIS, HARNESS_BLOCKHASH, type ExecutionIntent, type VerifyContext } from '../packages/execution/src/verifier.js';
import { executionCycle, type HarnessExecutionAdapter } from '../apps/worker/src/execution-cycle.js';
import { keyString } from '../packages/connectors/src/pool-security.js';
const url = process.env.TEST_EXECUTION_DATABASE_URL;
if (url && !new URL(url).pathname.includes('execution_test'))
    throw new Error('DISPOSABLE_EXECUTION_DATABASE_REQUIRED');
const pool = new Pool({ connectionString: url, max: 8 }), store = new ExecutionStore(pool);
const test = it.skipIf(!url);
beforeAll(async () => { if (url) {
    await migrate(pool);
    await pool.query("UPDATE system_state SET mode='OBSERVE' WHERE singleton");
} });
afterAll(async () => { await pool.end(); });
async function fixture(fail = false) { const destination = keyString(randomBytes(32)), signer = await HarnessSigner.start(destination), clock = Date.now(), account = randomUUID(); await store.account(account, '1000'); const intent: ExecutionIntent = { id: randomUUID(), correlationId: randomUUID(), mode: 'HARNESS', genesis: HARNESS_GENESIS, payer: signer.publicKey, blockhash: HARNESS_BLOCKHASH, policyHash: 'a'.repeat(64), quoteHash: 'b'.repeat(64), observedAt: new Date(clock).toISOString(), expiresAt: new Date(clock + 30000).toISOString(), maxSpend: '100', maxFee: '10', instructions: [{ kind: 'SOL_TRANSFER', destination, amount: '100' }] }; const wire = harnessTransfer(signer.publicKey, destination, 100n), context: VerifyContext = { genesis: HARNESS_GENESIS, now: clock, feeLamports: '5', minimumSlot: 0, lookups: [], tokenAccounts: {} }; const bank = new HarnessBankTransport(pool, fail); await bank.seed(signer.publicKey, '1000'); await bank.seed(destination, '0'); const request = randomUUID(); await store.create(account, request, intent, wire, context); const adapter: HarnessExecutionAdapter = { sign: o => signer.sign(Buffer.from(o.unsigned_wire, 'base64'), o.intent), submit: o => bank.submit(o), receipt: o => bank.receipt(o) }; return { signer, account, intent, wire, context, bank, request, adapter, run: (a = adapter, fault?: ((state: string) => void)) => executionCycle(store, a, fault, 5000, intent.id) }; }
test('worker → isolated signature → persisted attempt → bank receipt → ledger → API-shaped detail, with one logical fill', async () => { const f = await fixture(); try {
    expect(await f.run()).toBe('RECONCILED');
    const d = await store.detail(f.intent.id);
    expect(d?.order.state).toBe('RECONCILED');
    expect(d?.receipt.source_class).toBe('HARNESS_NOT_CHAIN');
    expect(d?.ledger).toMatchObject({ spent: '100', fee: '5', cash_after: '895' });
    expect(d?.events.map(e => e.state)).toEqual(['CREATED', 'VERIFIED', 'SIGNED', 'BROADCASTING', 'RECONCILED']);
    const account = (await pool.query('SELECT cash::text,reserved::text FROM execution_accounts WHERE id=$1', [f.account])).rows[0];
    expect(account).toEqual({ cash: '895', reserved: '0' });
    await store.reconcile(f.intent.id, 'duplicate-callback', d!.receipt.payload);
    expect(await f.run()).toBe('IDLE');
    expect((await pool.query('SELECT order_id FROM execution_ledger WHERE order_id=$1', [f.intent.id])).rowCount).toBe(1);
}
finally {
    f.signer.close();
} });
test('concurrent identical creation deduplicates; competing budgets never overspend', async () => { const f = await fixture(); try {
    const repeated = await Promise.all(Array.from({ length: 10 }, () => store.create(f.account, f.request, f.intent, f.wire, f.context)));
    expect(new Set(repeated).size).toBe(1);
    const account = randomUUID();
    await store.account(account, '150');
    const results = await Promise.allSettled([1, 2].map(() => store.create(account, randomUUID(), { ...f.intent, id: randomUUID(), correlationId: randomUUID() }, f.wire, f.context)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await pool.query('SELECT reserved::text FROM execution_accounts WHERE id=$1', [account])).rows[0].reserved).toBe('110');
    await expect(store.create(f.account, f.request, { ...f.intent, maxSpend: '99' }, f.wire, f.context)).rejects.toThrow('IDEMPOTENCY');
}
finally {
    f.signer.close();
} });
test('timeout after durable submission becomes uncertain, restart reconciles without signing or resubmitting', async () => { const f = await fixture(); let submits = 0; try {
    const timeout = { ...f.adapter, submit: async (o: Parameters<typeof f.adapter.submit>[0]) => { submits++; await f.bank.submit(o); throw new Error('HARNESS_TIMEOUT_AFTER_COMMIT'); }, receipt: async () => null };
    expect(await f.run(timeout)).toBe('UNCERTAIN');
    expect((await pool.query('SELECT reserved::text FROM execution_accounts WHERE id=$1', [f.account])).rows[0].reserved).toBe('110');
    const restarted = new ExecutionStore(pool);
    expect(await executionCycle(restarted, { ...f.adapter, sign: async () => { throw new Error('MUST_NOT_SIGN'); }, submit: async () => { throw new Error('MUST_NOT_RESUBMIT'); } }, undefined, 5000, f.intent.id)).toBe('RECONCILED');
    expect(submits).toBe(1);
}
finally {
    f.signer.close();
} });
test('crash at each boundary preserves identity; uncertain-before-send remains reserved rather than blindly rebroadcast', async () => { for (const boundary of ['VERIFIED', 'SIGNED', 'BROADCASTING', 'SUBMITTED', 'RECONCILED']) {
    const f = await fixture();
    try {
        await expect(f.run(f.adapter, state => { if (state === boundary)
            throw new Error('HARNESS_CRASH_' + boundary); })).rejects.toThrow('HARNESS_CRASH');
        const result = await f.run();
        if (boundary === 'BROADCASTING') {
            expect(result).toBe('UNCERTAIN');
            expect((await store.detail(f.intent.id))?.ledger).toBeNull();
            expect((await pool.query('SELECT reserved::text FROM execution_accounts WHERE id=$1', [f.account])).rows[0].reserved).toBe('110');
        }
        else
            expect(['RECONCILED', 'IDLE']).toContain(result);
    }
    finally {
        f.signer.close();
    }
} });
test('malformed receipt holds reservation; failed instruction reconciles only observed fee', async () => { const f = await fixture(), failed = await fixture(true); try {
    const tamper = { ...f.adapter, receipt: async (o: Parameters<typeof f.adapter.receipt>[0]) => { const receipt = await f.bank.receipt(o); return receipt ? { ...receipt, payerAfter: '999' } : null; } };
    await f.run(tamper);
    expect((await store.detail(f.intent.id))?.order.state).toBe('UNCERTAIN');
    expect((await store.detail(f.intent.id))?.ledger).toBeNull();
    expect(await f.run()).toBe('RECONCILED');
    expect(await failed.run()).toBe('RECONCILED');
    expect((await store.detail(failed.intent.id))?.ledger).toMatchObject({ spent: '0', fee: '5', cash_after: '995' });
}
finally {
    f.signer.close();
    failed.signer.close();
} });
test('Guard cannot be bypassed by direct VERIFIED calls or HALT between signing and broadcast', async () => { const f = await fixture(); try {
    const row = await store.claim(5000, f.intent.id);
    expect(row).not.toBeNull();
    await pool.query("UPDATE system_state SET mode='HALTED' WHERE singleton");
    await expect(store.transition(f.intent.id, row!.lease_token, 'VERIFIED', 'BYPASS_ATTEMPT')).rejects.toThrow('KILL_SWITCH_ACTIVE');
    await store.release(f.intent.id, row!.lease_token);
    expect(await f.run()).toContain('KILL_SWITCH_ACTIVE');
    expect((await store.detail(f.intent.id))?.order.state).toBe('REJECTED');
    expect((await pool.query('SELECT reserved::text FROM execution_accounts WHERE id=$1', [f.account])).rows[0].reserved).toBe('0');
}
finally {
    await pool.query("UPDATE system_state SET mode='OBSERVE' WHERE singleton");
    f.signer.close();
} });
test('lease/quote expiration at deferred COMMIT rolls back state, audit and outbox together', async () => { const f = await fixture(); try {
    const row = await store.claim(50, f.intent.id);
    await pool.query("CREATE FUNCTION execution_test_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='VERIFIED' THEN PERFORM pg_sleep(0.12); END IF; RETURN NEW; END $$; CREATE TRIGGER execution_test_delay AFTER INSERT ON execution_events FOR EACH ROW EXECUTE FUNCTION execution_test_delay()");
    await expect(store.transition(f.intent.id, row!.lease_token, 'VERIFIED', 'TEST_EXPIRE_AT_COMMIT')).rejects.toThrow('EXECUTION_COMMIT_EXPIRED');
    expect((await store.detail(f.intent.id))?.events.map(e => e.state)).toEqual(['CREATED']);
    expect((await pool.query("SELECT id FROM audit_events WHERE correlation_id=$1 AND payload->>'state'='VERIFIED'", [f.intent.correlationId])).rowCount).toBe(0);
}
finally {
    await pool.query('DROP TRIGGER IF EXISTS execution_test_delay ON execution_events; DROP FUNCTION IF EXISTS execution_test_delay()');
    f.signer.close();
} });
test('persisted identity, signed bytes, attempt and lifecycle cannot be rewritten to bypass verifier or reconciliation', async () => { const f = await fixture(); try {
    await expect(pool.query("UPDATE execution_orders SET intent=jsonb_set(intent,'{maxSpend}','\"999\"') WHERE id=$1", [f.intent.id])).rejects.toThrow('IMMUTABLE_EXECUTION_INTENT');
    await expect(pool.query("UPDATE execution_orders SET state='RECONCILED' WHERE id=$1", [f.intent.id])).rejects.toThrow('EXECUTION_STATE_BYPASS');
    await expect(f.run(f.adapter, state => { if (state === 'SIGNED')
        throw new Error('HARNESS_CRASH_SIGNED'); })).rejects.toThrow();
    await expect(pool.query("UPDATE execution_orders SET signed_wire='tampered' WHERE id=$1", [f.intent.id])).rejects.toThrow('IMMUTABLE_EXECUTION_ATTEMPT');
    expect(await f.run()).toBe('RECONCILED');
    const d = await store.detail(f.intent.id);
    await expect(store.reconcile(f.intent.id, 'replay', { ...d!.receipt.payload, payerAfter: '999' })).rejects.toThrow('RECEIPT_CONFLICT');
    await expect(pool.query("UPDATE execution_ledger SET fee=0 WHERE order_id=$1", [f.intent.id])).rejects.toThrow('APPEND_ONLY');
}
finally {
    f.signer.close();
} });
test('parallel workers submit a single persisted attempt', async () => { const f = await fixture(); try {
    const outcomes = await Promise.all([f.run(), f.run(), f.run()]);
    expect(outcomes.filter(s => s === 'RECONCILED')).toHaveLength(1);
    expect((await pool.query('SELECT signature FROM execution_harness_submissions WHERE order_id=$1', [f.intent.id])).rowCount).toBe(1);
    expect((await store.detail(f.intent.id))?.events.filter(e => e.state === 'BROADCASTING')).toHaveLength(1);
}
finally {
    f.signer.close();
} });
test('receipt reconciliation remains available while HALTED, but wrong account proof and stale lease cannot debit cash', async () => { const f = await fixture(); try {
    await f.run({ ...f.adapter, receipt: async () => null });
    const lease = await store.claim(50, f.intent.id), receipt = await f.bank.receipt(lease!);
    await expect(store.reconcile(f.intent.id, lease!.lease_token, { ...receipt, destination: f.intent.payer })).rejects.toThrow('RECEIPT_ACCOUNT_MISMATCH');
    await new Promise(r => setTimeout(r, 60));
    await expect(store.reconcile(f.intent.id, lease!.lease_token, receipt)).rejects.toThrow('EXECUTION_LEASE_LOST');
    await store.release(f.intent.id, lease!.lease_token);
    await pool.query("UPDATE system_state SET mode='HALTED' WHERE singleton");
    expect(await f.run({ ...f.adapter, submit: async () => { throw new Error('HALT_NO_RESUBMIT'); } })).toBe('RECONCILED');
}
finally {
    await pool.query("UPDATE system_state SET mode='OBSERVE' WHERE singleton");
    f.signer.close();
} });

async function swapRunFixture(failed=false){
 const {swapFixture,WSOL,USDC}=await import('../scripts/fixtures/harness-swap.js'),{queueVerifiedSwap}=await import('../apps/worker/src/swap-order.js'),{SwapModelTransport}=await import('../packages/execution/src/swap-model.js'),{replayInput,replayPolicy}=await import('../packages/engine/src/replay.js'),{fingerprint}=await import('../packages/engine/src/index.js');
 await pool.query("UPDATE system_state SET mode='OBSERVE' WHERE singleton");const base=swapFixture(),signer=await HarnessSigner.start(base.swap.destination,{pool:base.swap.pool,source:base.swap.source,destination:base.swap.destination,mint:base.swap.mint,outputMint:base.swap.outputMint}),f=swapFixture(signer.publicKey,base.addresses),bank=new SwapModelTransport(pool,failed),account=randomUUID();await store.account(account,'1000','SWAP');for(const [a,n]of [[signer.publicKey,'20'],[f.swap.source,'980'],[f.swap.destination,'0'],[f.swap.vaultIn,'100000'],[f.swap.vaultOut,'200000']])await bank.seed(a!,n!);
 const prepare=async(x:ReturnType<typeof swapFixture>,scenario:'BUY'|'SELL'|'MISSING_SECURITY'='BUY')=>{x.intent.policyHash=fingerprint(replayPolicy);const q={...replayInput(scenario).quote,inputMint:x.swap.mint,outputMint:x.swap.outputMint,inputAmount:x.swap.amount,outputAmount:x.swap.minOut,feeLamports:'10',receivedAt:x.intent.observedAt};x.intent.quoteHash=q.hash;return queueVerifiedSwap(store,account,x.intent.id,x.intent,x.wire,x.context,{...replayInput(scenario),quote:q,researchPolicy:replayPolicy});};
 const adapter={sign:(o:import('../packages/storage/src/execution.js').Order)=>signer.sign(Buffer.from(o.unsigned_wire,'base64'),o.intent,o.verification_context),submit:bank.submit.bind(bank),receipt:bank.receipt.bind(bank)};
 return {f,signer,bank,account,prepare,adapter,swapFixture,WSOL,USDC,run:(id=f.intent.id,a=adapter,fault?:((s:string)=>void))=>executionCycle(store,a,fault,5000,id)};
}
test('one integrated swap BUY → protective SELL → FIFO/equity has eleven-role correlation, exact effects and no double fill',async()=>{const f=await swapRunFixture();try{
 const queued=await f.prepare(f.f);expect(queued.status).toBe('QUEUED_HARNESS_SWAP');expect(await f.run()).toBe('RECONCILED');const buy=await store.detail(f.f.intent.id);expect(buy?.decisionTrace).toHaveLength(11);expect(buy?.swapAccounting.snapshot).toMatchObject({cashLamports:'895',positions:[{mint:f.USDC,quantity:'197',costLamports:'105'}],sourceClass:'HARNESS_NOT_CHAIN'});expect(await f.prepare(f.f)).toMatchObject({status:'QUEUED_HARNESS_SWAP',decisionId:queued.decisionId});
 const exit=f.swapFixture(f.signer.publicKey,f.f.addresses,'SELL','197','98');expect((await f.prepare(exit,'SELL')).status).toBe('QUEUED_HARNESS_SWAP');expect(await f.run(exit.intent.id)).toBe('RECONCILED');const detail=await store.detail(exit.intent.id);expect(detail?.swapAccounting.snapshot).toMatchObject({cashLamports:'988',realizedPnlLamports:'-12',feesLamports:'10',positions:[]});await store.reconcile(exit.intent.id,'duplicate',detail!.receipt.payload);expect((await pool.query('SELECT order_id FROM execution_swap_fills WHERE order_id=$1',[exit.intent.id])).rowCount).toBe(1);expect((await pool.query('SELECT reserved::text FROM execution_accounts WHERE id=$1',[f.account])).rows[0].reserved).toBe('0');const held=(await pool.query('SELECT sum(balance)::text AS total FROM execution_harness_balances WHERE address=ANY($1::text[])',[[f.signer.publicKey,f.f.addresses.source]])).rows[0].total;expect(held).toBe('988');
 }finally{f.signer.close();}});
test('swap veto, direct Guard bypass, stale proof and concurrent entries cannot create unbounded exposure',async()=>{const f=await swapRunFixture();try{expect((await f.prepare(f.f,'MISSING_SECURITY')).status).toBe('VETO_NO_ORDER');expect(await store.detail(f.f.intent.id)).toBeNull();await expect(store.create(f.account,randomUUID(),f.f.intent,f.f.wire,f.f.context)).rejects.toThrow('SWAP_GUARD_PROPOSAL_REQUIRED');const fresh=f.swapFixture(f.signer.publicKey,f.f.addresses);await f.prepare(fresh);expect((await Promise.all([f.run(fresh.intent.id),f.run(fresh.intent.id)])).filter(x=>x==='RECONCILED')).toHaveLength(1);const second=f.swapFixture(f.signer.publicKey,f.f.addresses);expect((await f.prepare(second)).status).toBe('VETO_NO_ORDER');
 }finally{f.signer.close();}});
test('uncertain swap submit recovers only by persisted receipt; mutation is quarantined and failed receipt is fee-only',async()=>{const f=await swapRunFixture();try{await f.prepare(f.f);const lost={...f.adapter,submit:async(o:import('../packages/storage/src/execution.js').Order)=>{await f.bank.submit(o);throw new Error('LOST_RESPONSE');},receipt:async()=>null};expect(await f.run(f.f.intent.id,lost)).toBe('UNCERTAIN');expect((await pool.query('SELECT reserved::text FROM execution_accounts WHERE id=$1',[f.account])).rows[0].reserved).toBe('110');const recovery={sign:async()=>{throw new Error('NO_RESIGN');},submit:async()=>{throw new Error('NO_RESUBMIT');},receipt:f.bank.receipt.bind(f.bank)};const poisoned={...recovery,receipt:async(o:import('../packages/storage/src/execution.js').Order)=>{const receipt=await f.bank.receipt(o);return {...receipt!,swap:{...receipt!.swap!,outputAfter:'999'}};}};expect(await f.run(f.f.intent.id,poisoned)).toBe('SWAP_RECEIPT_ACCOUNT_OR_FEE');expect((await pool.query('SELECT reserved::text FROM execution_accounts WHERE id=$1',[f.account])).rows[0].reserved).toBe('110');expect(await f.run(f.f.intent.id,recovery)).toBe('RECONCILED');const d=await store.detail(f.f.intent.id);await expect(store.reconcile(f.f.intent.id,'duplicate',{...d!.receipt.payload,swap:{...d!.receipt.payload.swap,outputAfter:'999'}})).rejects.toThrow('RECEIPT_CONFLICT');
 }finally{f.signer.close();}const bad=await swapRunFixture(true);try{await bad.prepare(bad.f);expect(await bad.run()).toBe('RECONCILED');const d=await store.detail(bad.f.intent.id);expect(d?.swapAccounting.fill).toBeNull();expect(d?.swapAccounting.snapshot).toMatchObject({cashLamports:'995',realizedPnlLamports:'-5',feesLamports:'5',positions:[]});expect((await store.swapSnapshot(bad.account)).cashLamports).toBe('995');}finally{bad.signer.close();}});
test('concurrent distinct swap proposals recheck Guard against reserved exposure inside the order transaction',async()=>{const f=await swapRunFixture();try{const second=f.swapFixture(f.signer.publicKey,f.f.addresses);const outcomes=await Promise.allSettled([f.prepare(f.f),f.prepare(second)]);expect(outcomes.filter(o=>o.status==='fulfilled'&&o.value.status==='QUEUED_HARNESS_SWAP')).toHaveLength(1);for(const outcome of outcomes){if(outcome.status==='rejected')expect(outcome.reason.message).toBe('SWAP_COMMIT_GUARD_VETO');else expect(['QUEUED_HARNESS_SWAP','VETO_NO_ORDER']).toContain(outcome.value.status);}expect((await pool.query("SELECT count(*)::int AS n FROM execution_orders WHERE account_id=$1",[f.account])).rows[0].n).toBe(1);expect((await pool.query('SELECT reserved::text FROM execution_accounts WHERE id=$1',[f.account])).rows[0].reserved).toBe('110');}finally{f.signer.close();}});

test('signer journal atomically caps requests/fees/amounts, survives restart and queries unknown signing without re-signing',async()=>{
 const {swapFixture}=await import('../scripts/fixtures/harness-swap.js'),{harnessSigningAuthority}=await import('../scripts/fixtures/signing-authority.js'),{SigningStore}=await import('../packages/storage/src/signing.js'),{PolicyBoundSigner}=await import('../packages/execution/src/policy-signer.js'),{signatureBase58}=await import('../packages/execution/src/chain-receipt.js');
 const template=swapFixture(),signer=await HarnessSigner.start(template.swap.destination,{pool:template.swap.pool,source:template.swap.source,destination:template.swap.destination,mint:template.swap.mint,outputMint:template.swap.outputMint}),f=swapFixture(signer.publicKey,template.addresses),authority=harnessSigningAuthority(f.intent,{maxOrders:2,maxTotalFees:'20',spendCap:'200'}),journal=new SigningStore(pool);let calls=0,failAfterSign=true;
 const provider={signOnce:async(_id:string,w:Buffer,i:ExecutionIntent,c:VerifyContext,p:import('../packages/execution/src/policy-signer.js').SignPolicyProof)=>{calls++;const r=await signer.sign(w,i,c,p);if(failAfterSign)throw new Error('SIMULATED_SIGNER_REPLY_TIMEOUT');return {...r,signature:signatureBase58(Buffer.from(r.signature,'hex'))};},lookup:async(id:string)=>{const r=await signer.lookup(id);return r?{...r,signature:signatureBase58(Buffer.from(r.signature,'hex'))}:null;}};
 try{await signer.requirePolicy(authority.authorities);await expect(signer.sign(f.wire,f.intent,f.context)).rejects.toThrow('VETO');const permit=authority.permit(f.intent),boundary=new PolicyBoundSigner(journal,provider,authority.authorities);await expect(boundary.sign(f.wire,f.intent,f.context,authority.mandate,permit)).rejects.toThrow('SIMULATED_SIGNER_REPLY_TIMEOUT');expect((await journal.list()).find(r=>r.id===f.intent.id).state).toBe('UNKNOWN');
 const recovered=await new PolicyBoundSigner(new SigningStore(pool),provider,authority.authorities).sign(f.wire,f.intent,f.context,authority.mandate,permit);expect(recovered.signature.length).toBeGreaterThan(80);expect(calls).toBe(1);expect(await boundary.sign(f.wire,f.intent,f.context,authority.mandate,permit)).toEqual(recovered);expect(calls).toBe(1);
 const duplicate={...f.intent,id:randomUUID(),correlationId:randomUUID()};await expect(boundary.sign(f.wire,duplicate,f.context,authority.mandate,authority.permit(duplicate))).rejects.toThrow('SIGNER_TRANSACTION_ALREADY_BOUND');expect(calls).toBe(1);
 failAfterSign=false;const g=swapFixture(signer.publicKey,template.addresses,'BUY','100','198'),gp=authority.permit(g.intent),concurrent=await Promise.allSettled(Array.from({length:8},()=>boundary.sign(g.wire,g.intent,g.context,authority.mandate,gp)));expect(concurrent.filter(r=>r.status==='fulfilled').length,JSON.stringify(concurrent.map(r=>r.status==='rejected'?String(r.reason):'SIGNED'))).toBeGreaterThanOrEqual(1);expect(calls).toBe(2);expect((await pool.query('SELECT count(*)::int AS n,sum(fee_reservation)::text AS fees,sum(amount)::text AS amount FROM signer_requests WHERE mandate_id=$1',[authority.mandate.payload.id])).rows[0]).toMatchObject({n:2,fees:'20',amount:'200'});
 const third=swapFixture(signer.publicKey,template.addresses,'BUY','100','199');await expect(boundary.sign(third.wire,third.intent,third.context,authority.mandate,authority.permit(third.intent))).rejects.toThrow('SIGNER_DURABLE_BUDGET_VETO');expect(calls).toBe(2);
 await expect(pool.query('UPDATE signer_requests SET unsigned_wire=$2 WHERE id=$1',[f.intent.id,'mutated'])).rejects.toThrow('IMMUTABLE_SIGNER_REQUEST');await expect(pool.query("UPDATE signer_requests SET signature='mutated' WHERE id=$1",[f.intent.id])).rejects.toThrow('IMMUTABLE_SIGNER_RESULT');await expect(pool.query('DELETE FROM signer_requests WHERE id=$1',[f.intent.id])).rejects.toThrow('IMMUTABLE_SIGNER_REQUEST');
 await expect(boundary.sign(f.wire,{...f.intent,mode:'MAINNET'},f.context,authority.mandate,permit)).rejects.toThrow('PRODUCTION_SIGNING_DISABLED');expect(calls).toBe(2);expect((await pool.query('SELECT id FROM audit_events WHERE event_type=$1 AND correlation_id=$2',['SIGNATURE_PERSISTED',f.intent.correlationId])).rowCount).toBe(1);
 }finally{signer.close();}
});

test('signer order-count, fee and mint budgets veto independently without another key invocation',async()=>{
 const {swapFixture}=await import('../scripts/fixtures/harness-swap.js'),{harnessSigningAuthority}=await import('../scripts/fixtures/signing-authority.js'),{SigningStore}=await import('../packages/storage/src/signing.js'),{PolicyBoundSigner}=await import('../packages/execution/src/policy-signer.js'),{signatureBase58}=await import('../packages/execution/src/chain-receipt.js');
 for(const limits of [{maxOrders:1,maxTotalFees:'100',spendCap:'1000'},{maxOrders:10,maxTotalFees:'10',spendCap:'1000'},{maxOrders:10,maxTotalFees:'100',spendCap:'100'}]){
  const t=swapFixture(),signer=await HarnessSigner.start(t.swap.destination,{pool:t.swap.pool,source:t.swap.source,destination:t.swap.destination,mint:t.swap.mint,outputMint:t.swap.outputMint});let calls=0;
  try{const f=swapFixture(signer.publicKey,t.addresses),a=harnessSigningAuthority(f.intent,limits);await signer.requirePolicy(a.authorities);const boundary=new PolicyBoundSigner(new SigningStore(pool),{signOnce:async(_id,w,i,c,p)=>{calls++;const r=await signer.sign(w,i,c,p);return {...r,signature:signatureBase58(Buffer.from(r.signature,'hex'))};},lookup:async()=>null},a.authorities);await boundary.sign(f.wire,f.intent,f.context,a.mandate,a.permit(f.intent));const next=swapFixture(signer.publicKey,t.addresses,'BUY','100','198');await expect(boundary.sign(next.wire,next.intent,next.context,a.mandate,a.permit(next.intent))).rejects.toThrow('SIGNER_DURABLE_BUDGET_VETO');expect(calls).toBe(1);}finally{signer.close();}
 }
});
test('signer lease expiry recovers by lookup; permit expiry after key use cannot release a signature to executor',async()=>{
 const {swapFixture}=await import('../scripts/fixtures/harness-swap.js'),{harnessSigningAuthority}=await import('../scripts/fixtures/signing-authority.js'),{SigningStore}=await import('../packages/storage/src/signing.js'),{PolicyBoundSigner}=await import('../packages/execution/src/policy-signer.js'),{signatureBase58}=await import('../packages/execution/src/chain-receipt.js');const t=swapFixture(),signer=await HarnessSigner.start(t.swap.destination,{pool:t.swap.pool,source:t.swap.source,destination:t.swap.destination,mint:t.swap.mint,outputMint:t.swap.outputMint});let calls=0,expireLease=true;
 try{const f=swapFixture(signer.publicKey,t.addresses),a=harnessSigningAuthority(f.intent),journal=new SigningStore(pool);await signer.requirePolicy(a.authorities);await expect(signer.requirePolicy(a.authorities)).rejects.toThrow('VETO');const provider={signOnce:async(id:string,w:Buffer,i:ExecutionIntent,c:VerifyContext,p:import('../packages/execution/src/policy-signer.js').SignPolicyProof)=>{calls++;const r=await signer.sign(w,i,c,p);if(expireLease)await pool.query("UPDATE signer_requests SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);else await new Promise(r=>setTimeout(r,1200));return {...r,signature:signatureBase58(Buffer.from(r.signature,'hex'))};},lookup:async(id:string)=>{const r=await signer.lookup(id);return r?{...r,signature:signatureBase58(Buffer.from(r.signature,'hex'))}:null;}},b=new PolicyBoundSigner(journal,provider,a.authorities),p=a.permit(f.intent);
 await expect(b.sign(f.wire,f.intent,f.context,a.mandate,p)).rejects.toThrow('SIGNER_LEASE_LOST');expect((await b.sign(f.wire,f.intent,f.context,a.mandate,p)).signature).toBeTruthy();expect(calls).toBe(1);
 expireLease=false;const second=swapFixture(signer.publicKey,t.addresses,'BUY','100','198');await expect(b.sign(second.wire,second.intent,second.context,a.mandate,a.permit(second.intent,1000))).rejects.toThrow('SIGNER_GUARD_VETO');expect((await journal.list()).find(r=>r.id===second.intent.id).state).toBe('UNKNOWN');expect(calls).toBe(2);expect((await pool.query('SELECT id FROM audit_events WHERE event_type=$1 AND correlation_id=$2',['SIGNATURE_PERSISTED',second.intent.correlationId])).rowCount).toBe(0);
 }finally{signer.close();}
});

test('independent signer HALT and mandate revocation veto key release and preserve unknown budget',async()=>{
 const {swapFixture}=await import('../scripts/fixtures/harness-swap.js'),{harnessSigningAuthority}=await import('../scripts/fixtures/signing-authority.js'),{SigningStore}=await import('../packages/storage/src/signing.js'),{PolicyBoundSigner}=await import('../packages/execution/src/policy-signer.js'),{signatureBase58}=await import('../packages/execution/src/chain-receipt.js');
 for(const fault of ['HALT','REVOKE']){const t=swapFixture(),signer=await HarnessSigner.start(t.swap.destination,{pool:t.swap.pool,source:t.swap.source,destination:t.swap.destination,mint:t.swap.mint,outputMint:t.swap.outputMint});let calls=0;
 try{const f=swapFixture(signer.publicKey,t.addresses),a=harnessSigningAuthority(f.intent),journal=new SigningStore(pool);await signer.requirePolicy(a.authorities);const b=new PolicyBoundSigner(journal,{signOnce:async(_id,w,i,c,p)=>{calls++;const r=await signer.sign(w,i,c,p);if(fault==='HALT')await pool.query("UPDATE system_state SET mode='HALTED' WHERE singleton");else await journal.revoke(a.mandate.payload.id,'REPLAY_TEST independent signer veto');return {...r,signature:signatureBase58(Buffer.from(r.signature,'hex'))};},lookup:async()=>null},a.authorities),p=a.permit(f.intent);await expect(b.sign(f.wire,f.intent,f.context,a.mandate,p)).rejects.toThrow(fault==='HALT'?'SIGNER_KILL_SWITCH_ACTIVE':'SIGNER_MANDATE_REVOKED');expect((await journal.list()).find(r=>r.id===f.intent.id).state).toBe('UNKNOWN');await expect(b.sign(f.wire,f.intent,f.context,a.mandate,p)).rejects.toThrow();expect(calls).toBe(1);if(fault==='REVOKE'){expect(await journal.revoke(a.mandate.payload.id,'REPLAY_TEST duplicate revoke')).toBe(true);expect((await pool.query("SELECT id FROM audit_events WHERE event_type='SIGNER_MANDATE_REVOKED' AND correlation_id=$1",[a.mandate.payload.id])).rowCount).toBe(1);}
 }finally{await pool.query("UPDATE system_state SET mode='OBSERVE' WHERE singleton");signer.close();}}
});

test('deferred signer commit fence rolls back a signature when its lease expires before COMMIT',async()=>{
 const {swapFixture}=await import('../scripts/fixtures/harness-swap.js'),{harnessSigningAuthority}=await import('../scripts/fixtures/signing-authority.js'),{SigningStore}=await import('../packages/storage/src/signing.js'),{checkSigningPolicy}=await import('../packages/execution/src/signing-policy.js'),{signatureBase58}=await import('../packages/execution/src/chain-receipt.js');const t=swapFixture(),signer=await HarnessSigner.start(t.swap.destination,{pool:t.swap.pool,source:t.swap.source,destination:t.swap.destination,mint:t.swap.mint,outputMint:t.swap.outputMint}),client=await pool.connect();
 try{const f=swapFixture(signer.publicKey,t.addresses),a=harnessSigningAuthority(f.intent),p=a.permit(f.intent),journal=new SigningStore(pool),claim=await journal.reserve(checkSigningPolicy(f.wire,f.intent,f.context,a.mandate,p,a.authorities),f.wire);expect(claim.kind).toBe('SIGN_ONCE');await signer.requirePolicy(a.authorities);const signed=await signer.sign(f.wire,f.intent,f.context,{mandate:a.mandate,permit:p});await client.query('BEGIN');await client.query("UPDATE signer_requests SET lease_until=clock_timestamp()+interval '100 milliseconds' WHERE id=$1",[f.intent.id]);await client.query("UPDATE signer_requests SET state='SIGNED',signature=$2,signed_wire=$3 WHERE id=$1",[f.intent.id,signatureBase58(Buffer.from(signed.signature,'hex')),signed.transaction]);await client.query('SELECT pg_sleep(0.2)');await expect(client.query('COMMIT')).rejects.toThrow('SIGNER_COMMIT_EXPIRED');await client.query('ROLLBACK');expect((await journal.list()).find(r=>r.id===f.intent.id)).toMatchObject({state:'SIGNING',signature:null});
 }finally{await client.query('ROLLBACK');client.release();signer.close();}
});

test('authenticated signer diagnostics and revocation expose audit without provisioning keys or granting mainnet access',async()=>{
 const {swapFixture}=await import('../scripts/fixtures/harness-swap.js'),{harnessSigningAuthority}=await import('../scripts/fixtures/signing-authority.js'),{SigningStore}=await import('../packages/storage/src/signing.js'),{checkSigningPolicy}=await import('../packages/execution/src/signing-policy.js'),{Store}=await import('../packages/storage/src/index.js'),{createApi}=await import('../apps/api/src/server.js'),f=swapFixture(),a=harnessSigningAuthority(f.intent),s=new SigningStore(pool),store=new Store(pool);await s.reserve(checkSigningPolicy(f.wire,f.intent,f.context,a.mandate,a.permit(f.intent),a.authorities),f.wire);const token='fixture-signing-api-token-xxxxxxxxxxxxxxxxxxxxx',app=createApi(store,token,{store,passwordHash:'unused',origin:'http://localhost:3000'}),headers={authorization:'Bearer '+token},url='/api/v1/execution/signer-mandates/'+a.mandate.payload.id+'/revoke';
 try{expect((await app.inject({url:'/api/v1/execution/signing-status'})).statusCode).toBe(401);expect((await app.inject({url:'/api/v1/execution/signing-status',headers})).json()).toMatchObject({status:'DISABLED',mainnetSigning:false,submission:false,sourceClass:'HARNESS_NOT_CHAIN'});expect((await app.inject({method:'POST',url,headers:{...headers,origin:'https://evil.invalid'},payload:{reason:'REPLAY_TEST'}})).statusCode).toBe(403);await pool.query("UPDATE system_state SET mode='HALTED' WHERE singleton");expect((await app.inject({method:'POST',url,headers,payload:{reason:'REPLAY_TEST owner revoke while halted'}})).json()).toMatchObject({status:'REVOKED',mainnetSigning:false});expect((await s.list()).find(r=>r.id===f.intent.id).mandate_revoked).toBe(true);expect((await app.inject({method:'POST',url:'/api/v1/execution/signer-mandates/'+randomUUID()+'/revoke',headers,payload:{reason:'REPLAY_TEST'}})).statusCode).toBe(404);expect((await app.inject({method:'POST',url,headers,payload:{reason:''}})).statusCode).toBe(400);expect((await app.inject({method:'POST',url:'/api/v1/execution/signing-status',headers,payload:{mode:'MAINNET',enabled:true}})).statusCode).toBe(404);
 }finally{await app.close();await pool.query("UPDATE system_state SET mode='OBSERVE' WHERE singleton");}
});
