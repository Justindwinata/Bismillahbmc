import type { Pool } from 'pg';
import { createPublicKey, verify } from 'node:crypto';
import { keyBytes } from '../../connectors/src/pool-security.js';
import type { Order, HarnessReceipt } from '../../storage/src/execution.js';
import { HARNESS_GENESIS, hash, verifyTransaction } from './verifier.js';
/** Persistent deterministic bank model. NOT RPC, NOT a blockchain, never mainnet settlement. */
export class HarnessBankTransport {
    constructor(readonly pool: Pool, private readonly failInstruction = false) { }
    async seed(address: string, balance: string) { await this.pool.query('INSERT INTO execution_harness_balances(address,balance) VALUES ($1,$2)', [address, balance]); }
    async submit(order: Order) {
        if (order.intent.mode !== 'HARNESS' || !order.signed_wire || !order.signature)
            throw new Error('HARNESS_ONLY');
        const bytes = Buffer.from(order.signed_wire, 'base64');
        const unsigned = Buffer.concat([Buffer.from([1]), Buffer.alloc(64), bytes.subarray(65)]);
        const result = verifyTransaction(unsigned, order.intent, { ...order.verification_context, now: Date.now() });
        const key = createPublicKey({ format: 'der', type: 'spki', key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), keyBytes(order.intent.payer)]) });
        if (!verify(null, result.message, key, bytes.subarray(1, 65)) || bytes.subarray(1, 65).toString('hex') !== order.signature)
            throw new Error('HARNESS_SIGNATURE_INVALID');
        const instruction = result.intent.instructions[0];
        if (result.intent.instructions.length !== 1 || instruction?.kind !== 'SOL_TRANSFER')
            throw new Error('HARNESS_ROUTE_UNSUPPORTED');
        const c = await this.pool.connect();
        try {
            await c.query('BEGIN');
            await c.query('SELECT pg_advisory_xact_lock(7011004)');
            if ((await c.query('SELECT signature FROM execution_harness_submissions WHERE signature=$1', [order.signature])).rowCount) {
                await c.query('COMMIT');
                return;
            }
            const payer = (await c.query('SELECT balance::text FROM execution_harness_balances WHERE address=$1 FOR UPDATE', [order.intent.payer])).rows[0], destination = (await c.query('SELECT balance::text FROM execution_harness_balances WHERE address=$1 FOR UPDATE', [instruction.destination])).rows[0];
            if (!payer || !destination)
                throw new Error('HARNESS_BANK_ACCOUNT_MISSING');
            const amount = this.failInstruction ? 0n : BigInt(result.message.subarray(-8).readBigUInt64LE()), fee = 5n;
            if (BigInt(payer.balance) < amount + fee)
                throw new Error('HARNESS_BANK_INSUFFICIENT');
            const after = BigInt(payer.balance) - amount - fee, destAfter = BigInt(destination.balance) + amount;
            await c.query('UPDATE execution_harness_balances SET balance=$2 WHERE address=$1', [order.intent.payer, after.toString()]);
            await c.query('UPDATE execution_harness_balances SET balance=$2 WHERE address=$1', [instruction.destination, destAfter.toString()]);
            const receipt: HarnessReceipt = { sourceClass: 'HARNESS_NOT_CHAIN', genesis: HARNESS_GENESIS, signature: order.signature, payer: order.intent.payer, destination: instruction.destination, messageHash: hash(result.message), finality: 'HARNESS_FINAL', err: this.failInstruction ? { InstructionError: [0, 'HARNESS_FAILURE'] } : null, fee: fee.toString(), payerBefore: payer.balance, payerAfter: after.toString(), destinationBefore: destination.balance, destinationAfter: destAfter.toString() };
            await c.query("INSERT INTO execution_harness_submissions(signature,order_id,source_class,receipt) VALUES ($1,$2,'HARNESS_NOT_CHAIN',$3)", [order.signature, order.id, JSON.stringify(receipt)]);
            await c.query('COMMIT');
        }
        catch (error) {
            await c.query('ROLLBACK');
            throw error;
        }
        finally {
            c.release();
        }
    }
    async receipt(order: Order): Promise<HarnessReceipt | null> { return (await this.pool.query('SELECT receipt FROM execution_harness_submissions WHERE signature=$1 AND order_id=$2', [order.signature, order.id])).rows[0]?.receipt ?? null; }
}
