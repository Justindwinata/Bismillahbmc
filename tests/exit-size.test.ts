import { it,expect } from 'vitest';
import { exitAmount } from '../packages/engine/src/exit-size.js';
import fc from 'fast-check';
it('rounds integer exits down, clears indivisible dust and never exceeds inventory',()=>{expect(exitAmount('11',5000)).toBe('5');expect(exitAmount('1',1)).toBe('1');expect(exitAmount('10')).toBe('10');expect(()=>exitAmount('0')).toThrow('EMPTY_EXIT_INVENTORY');expect(()=>exitAmount('10',0)).toThrow();fc.assert(fc.property(fc.bigInt({min:1n,max:18446744073709551615n}),fc.integer({min:1,max:10000}),(q,bps)=>{const result=BigInt(exitAmount(q.toString(),bps));expect(result>0n&&result<=q).toBe(true);expect(result).toBe(q*BigInt(bps)/10000n||1n);}));});
