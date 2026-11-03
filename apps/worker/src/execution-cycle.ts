import { ExecutionStore, type HarnessReceipt, type Order } from '../../../packages/storage/src/execution.js';
import { verifyExecutionTransaction } from '../../../packages/execution/src/swap-verifier.js';
export interface HarnessExecutionAdapter {
    sign(order: Order): Promise<{
        signature: string;
        transaction: string;
    }>;
    submit(order: Order): Promise<void>;
    receipt(order: Order): Promise<HarnessReceipt | null>;
}
/** No default transport. Submission identity commits before external I/O; uncertain orders only reconcile. */
export async function executionCycle(store: ExecutionStore, adapter?: HarnessExecutionAdapter, fault?: (state: string) => void, leaseMs = 5000, orderId?: string) {
    if (!adapter)
        return 'DISABLED_NO_TRANSPORT';
    let order = await store.claim(leaseMs, orderId);
    if (!order)
        return 'IDLE';
    const token = order.lease_token;
    try {
        if (order.state === 'CREATED') {
            verifyExecutionTransaction(Buffer.from(order.unsigned_wire, 'base64'), order.intent, { ...order.verification_context, now: Date.now() });
            order = await store.transition(order.id, token, 'VERIFIED', 'INDEPENDENT_WIRE_VERIFIED');
            fault?.('VERIFIED');
        }
        if (order.state === 'VERIFIED') {
            const signed = await adapter.sign(order);
            order = await store.transition(order.id, token, 'SIGNED', 'ISOLATED_HARNESS_SIGNATURE', signed);
            fault?.('SIGNED');
        }
        let submit = false;
        if (order.state === 'SIGNED') {
            order = await store.transition(order.id, token, 'BROADCASTING', 'ATTEMPT_PERSISTED_BEFORE_SUBMIT');
            submit = true;
            fault?.('BROADCASTING');
        }
        if (submit) {
            try {
                await adapter.submit(order);
            }
            catch {
                order = await store.transition(order.id, token, 'UNCERTAIN', 'BROADCAST_RESULT_UNKNOWN');
            }
            fault?.('SUBMITTED');
        }
        if (['BROADCASTING', 'UNCERTAIN'].includes(order.state)) {
            const receipt = await adapter.receipt(order);
            if (receipt) {
                await store.reconcile(order.id, token, receipt);
                fault?.('RECONCILED');
                return 'RECONCILED';
            }
            await store.transition(order.id, token, 'UNCERTAIN', 'RECEIPT_UNAVAILABLE_NO_RESUBMIT');
            return 'UNCERTAIN';
        }
        return order.state;
    }
    catch (error) {
        if (fault)
            throw error;
        const reason = error instanceof Error ? error.message : 'EXECUTION_DEPENDENCY_FAILED';
        // Before any broadcast it is safe to reject and release; after it, never release an uncertain reservation.
        try {
            const current = (await store.detail(order.id))?.order;
            if (current && ['CREATED', 'VERIFIED', 'SIGNED'].includes(current.state))
                await store.transition(order.id, token, 'REJECTED', 'PRE_BROADCAST_VETO');
            else if (current && ['BROADCASTING', 'UNCERTAIN'].includes(current.state))
                await store.transition(order.id, token, 'UNCERTAIN', 'RECONCILIATION_UNVERIFIED');
        }
        catch { /* expired lease is recovered by another worker */ }
        return reason;
    }
    finally {
        await store.release(order.id, token);
    }
}
