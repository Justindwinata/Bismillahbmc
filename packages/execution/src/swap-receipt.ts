import {z} from 'zod';
import {address,baseUnits} from '../../domain/src/index.js';
import type {ExecutionIntent} from './verifier.js';
export const swapEffects=z.strictObject({source:address,destination:address,inputMint:address,outputMint:address,sourceBefore:baseUnits,sourceAfter:baseUnits,outputBefore:baseUnits,outputAfter:baseUnits,vaultInBefore:baseUnits,vaultInAfter:baseUnits,vaultOutBefore:baseUnits,vaultOutAfter:baseUnits,poolFee:baseUnits,rent: z.literal('0')});
/** Independently reconciles exact account deltas, not a submit result or a quoted fill. Model scope only. */
export function reconcileSwapEffects(intent:ExecutionIntent,raw:unknown,failed:boolean){const s=intent.instructions[0];if(intent.instructions.length!==1||s?.kind!=='JUPITER_CPMM_SWAP')throw new Error('SWAP_EFFECT_INTENT');const e=swapEffects.parse(raw);const debit=BigInt(e.sourceBefore)-BigInt(e.sourceAfter),credit=BigInt(e.outputAfter)-BigInt(e.outputBefore),vaultIn=BigInt(e.vaultInAfter)-BigInt(e.vaultInBefore),vaultOut=BigInt(e.vaultOutBefore)-BigInt(e.vaultOutAfter);
 if(e.source!==s.source||e.destination!==s.destination||e.inputMint!==s.mint||e.outputMint!==s.outputMint||debit!==vaultIn||credit!==vaultOut||debit!==(failed?0n:BigInt(s.amount))||(failed?(credit!==0n||e.poolFee!=='0'):(credit<BigInt(s.minOut)||BigInt(e.poolFee)>debit)))throw new Error('SWAP_EFFECT_RECONCILIATION');
 return {inputAmount:debit.toString(),outputAmount:credit.toString(),rent:'0' as const,poolFee:e.poolFee};}
