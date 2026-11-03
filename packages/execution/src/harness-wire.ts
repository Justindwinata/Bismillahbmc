import { keyBytes } from '../../connectors/src/pool-security.js';
import { SYSTEM, HARNESS_BLOCKHASH } from './verifier.js';
/** Labelled harness adapter. The verifier decodes this output independently. */
export function harnessTransfer(payer: string, destination: string, amount: bigint) { const data = Buffer.alloc(12); data.writeUInt32LE(2); data.writeBigUInt64LE(amount, 4); return Buffer.concat([Buffer.from([1]), Buffer.alloc(64), Buffer.from([1, 0, 1, 3]), keyBytes(payer), keyBytes(destination), keyBytes(SYSTEM), keyBytes(HARNESS_BLOCKHASH), Buffer.from([1, 2, 2, 0, 1, 12]), data]); }
