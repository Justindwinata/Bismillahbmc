import { z } from 'zod';
import { baseUnits } from '../../domain/src/index.js';
const common={requestKey:z.uuid(),amountLamports:baseUnits.pipe(z.string().refine(n=>BigInt(n)>0n)),note:z.string().trim().min(3).max(200)};
export const capitalCommand=z.discriminatedUnion('kind',[
 z.strictObject({...common,kind:z.literal('DEPOSIT')}),z.strictObject({...common,kind:z.literal('WITHDRAW')}),
 z.strictObject({...common,kind:z.literal('RENT_RESERVE')}),z.strictObject({...common,kind:z.literal('RENT_REFUND'),rentReservationKey:z.uuid()}),
]);
export type CapitalCommand=z.infer<typeof capitalCommand>;
