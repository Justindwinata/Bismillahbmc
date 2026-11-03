import { z } from 'zod';
import { baseUnits } from '../../domain/src/index.js';
// Round down to base units; sell at least one indivisible unit to clear dust, never above inventory.
export function exitAmount(quantity:string,fractionBps=10000){const q=BigInt(baseUnits.parse(quantity));z.number().int().min(1).max(10000).parse(fractionBps);if(q===0n)throw new Error('EMPTY_EXIT_INVENTORY');const part=q*BigInt(fractionBps)/10000n;return (part===0n?1n:part).toString();}
