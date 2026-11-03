/** Explicit non-chain fixture worker; never runs against the owner database. */
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Pool, Store, migrate } from '../packages/storage/src/index.js';
import { ExecutionStore } from '../packages/storage/src/execution.js';
import { HarnessSigner } from '../packages/execution/src/harness-signer.js';
import { HarnessBankTransport } from '../packages/execution/src/model-transport.js';
import { harnessTransfer } from '../packages/execution/src/harness-wire.js';
import { HARNESS_GENESIS, HARNESS_BLOCKHASH, type ExecutionIntent } from '../packages/execution/src/verifier.js';
import { executionCycle } from '../apps/worker/src/execution-cycle.js';
import { keyString } from '../packages/connectors/src/pool-security.js';
import { evaluate, fingerprint } from '../packages/engine/src/index.js';
import { replayInput, replayPolicy } from '../packages/engine/src/replay.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !/^\/sentinel_(execution_test|d1_test_browser)$/.test(new URL(url).pathname))
    throw new Error('ISOLATED_FIXTURE_DATABASE_REQUIRED');
const pool = new Pool({ connectionString: url, max: 4 });
let signer: HarnessSigner | undefined;
try {
    await migrate(pool);
    const store = new ExecutionStore(pool), bank = new HarnessBankTransport(pool);
    const mode = process.argv[2] ?? 'run';
    if (mode === 'recover') {
        const id = process.argv[3];
        if (!id)
            throw new Error('ORDER_ID_REQUIRED');
        const adapter = { sign: async () => { throw new Error('NO_SIGNER_ON_RECOVERY'); }, submit: async () => { throw new Error('NO_REBROADCAST_ON_RECOVERY'); }, receipt: bank.receipt.bind(bank) };
        let result = 'IDLE';
        for (let i = 0; i < 130 && result === 'IDLE'; i++) {
            result = await executionCycle(store, adapter, undefined, 5000, id);
            if (result === 'IDLE')
                await new Promise(resolve => setTimeout(resolve, 50));
        }
        const detail = await store.detail(id);
        writeFileSync(1, JSON.stringify({ id, result, sourceClass: 'HARNESS_NOT_CHAIN', detail }) + '\n');
    }
    else {
        const clock = Date.now(), input = { ...replayInput(mode === 'veto' ? 'MISSING_SECURITY' : 'BUY', clock), researchPolicy: replayPolicy, account: { exposureLamports: '0', reservedLamports: '0', dailyLossLamports: '0', dailyFeesLamports: '0', openPositions: 0, tradesLastHour: 0, lastTradeAt: null } };
        const decision = evaluate(input, fingerprint(replayPolicy), clock);
        await new Store(pool).saveEvaluation(decision);
        if (decision.action !== 'BUY_PROPOSED') {
            writeFileSync(1, JSON.stringify({ status: 'VETO_NO_ORDER', decisionId: decision.decisionId, sourceClass: 'REPLAY_TEST' }) + '\n');
        }
        else {
            const destination = keyString(randomBytes(32));
            signer = await HarnessSigner.start(destination);
            const at = Date.now(), accountId = randomUUID();
            await store.account(accountId, '1000');
            await bank.seed(signer.publicKey, '1000');
            await bank.seed(destination, '0');
            const intent: ExecutionIntent = { id: randomUUID(), correlationId: decision.decisionId, mode: 'HARNESS', genesis: HARNESS_GENESIS, payer: signer.publicKey, blockhash: HARNESS_BLOCKHASH, policyHash: decision.policyHash, quoteHash: input.quote.hash, observedAt: input.quote.receivedAt, expiresAt: new Date(Date.parse(input.quote.receivedAt) + replayPolicy.quoteMaxAgeMs).toISOString(), maxSpend: '100', maxFee: '10', instructions: [{ kind: 'SOL_TRANSFER', destination, amount: '100' }] };
            await store.create(accountId, randomUUID(), intent, harnessTransfer(signer.publicKey, destination, 100n), { genesis: HARNESS_GENESIS, now: at, feeLamports: '5', minimumSlot: 0, lookups: [], tokenAccounts: {} });
            if (mode === 'crash')
                writeFileSync(1, JSON.stringify({ id: intent.id, sourceClass: 'HARNESS_NOT_CHAIN' }) + '\n');
            const liveSigner = signer;
            const result = await executionCycle(store, { sign: o => liveSigner.sign(Buffer.from(o.unsigned_wire, 'base64'), o.intent), submit: bank.submit.bind(bank), receipt: bank.receipt.bind(bank) }, mode === 'crash' ? state => { if (state === 'SUBMITTED')
                process.exit(88); } : undefined, 5000, intent.id);
            writeFileSync(1, JSON.stringify({ id: intent.id, result, sourceClass: 'HARNESS_NOT_CHAIN', detail: await store.detail(intent.id) }) + '\n');
        }
    }
}
finally {
    signer?.close();
    await pool.end();
}
