import { it,expect } from 'vitest';
import { capitalCommand } from '../packages/accounting/src/capital.js';
it('virtual capital requires integer positive amounts, idempotency and a specific refund reservation',()=>{
 const base={requestKey:crypto.randomUUID(),amountLamports:'1',note:'Virtual adjustment'};
 for(const kind of ['DEPOSIT','WITHDRAW','RENT_RESERVE'])expect(capitalCommand.parse({...base,kind}).amountLamports).toBe('1');
 expect(capitalCommand.parse({...base,kind:'RENT_REFUND',rentReservationKey:crypto.randomUUID()}).kind).toBe('RENT_REFUND');
 for(const amountLamports of ['0','-1','1.5','01','18446744073709551616'])expect(capitalCommand.safeParse({...base,kind:'DEPOSIT',amountLamports}).success).toBe(false);
 expect(capitalCommand.safeParse({...base,kind:'RENT_REFUND'}).success).toBe(false);expect(capitalCommand.safeParse({...base,kind:'MAINNET_DEPOSIT'}).success).toBe(false);expect(capitalCommand.safeParse({...base,kind:'DEPOSIT',privateKey:'forbidden-unrecognized-field'}).success).toBe(false);
});
