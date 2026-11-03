import { it,expect } from 'vitest';
import fc from 'fast-check';
import { PaperLedger,type PaperFill } from '../packages/accounting/src/paper.js';
const mint='So11111111111111111111111111111111111111112';
const buy:PaperFill={id:'FIXTURE-buy',mode:'PAPER',sourceClass:'REPLAY',side:'BUY',mint,quantity:'10',quoteLamports:'100',feeLamports:'2',fillable:true};
it('separates capital flows from realized profit and accounts fees with exact partial FIFO',()=>{
  const ledger=new PaperLedger();ledger.capitalFlow(1000n);expect(ledger.snapshot().realizedPnlLamports).toBe('0');
  ledger.fill(buy);expect(ledger.fill(buy)).toBe(false);
  expect(()=>ledger.fill({...buy,quantity:'1'})).toThrow('IDEMPOTENCY_CONFLICT');
  ledger.fill({...buy,id:'FIXTURE-sell-1',side:'SELL',quantity:'3',quoteLamports:'60',feeLamports:'1'});
  expect(ledger.snapshot().realizedPnlLamports).toBe('29');
  ledger.capitalFlow(500n);expect(ledger.snapshot().realizedPnlLamports).toBe('29');
  ledger.fill({...buy,id:'FIXTURE-sell-2',side:'SELL',quantity:'7',quoteLamports:'80',feeLamports:'1'});
  expect(ledger.snapshot()).toMatchObject({mode:'PAPER',sourceClass:'PAPER_SIM',realizedPnlLamports:'36',feesLamports:'4',netCapitalLamports:'1500',cashLamports:'1536',unrealizedPnlLamports:null,positions:[]});
});
it('rejects unfillable, oversized, unknown mode, insufficient inventory and malformed fill without mutation',()=>{
  const ledger=new PaperLedger();ledger.capitalFlow(100n);
  expect(()=>ledger.fill(buy)).toThrow('INSUFFICIENT_PAPER_CASH');
  expect(()=>ledger.fill({...buy,fillable:false})).toThrow('UNFILLABLE_QUOTE');
  expect(()=>ledger.fill({...buy,quantity:'0'})).toThrow('ZERO_FILL');
  expect(()=>ledger.fill({...buy,side:'SELL'})).toThrow('INSUFFICIENT_INVENTORY');
  expect(()=>ledger.fill({...buy,side:'SELL',feeLamports:'101'})).toThrow('FEE_EXCEEDS_PROCEEDS');
  expect(()=>ledger.fill({...buy,mode:'LIVE' as 'PAPER'})).toThrow();
  expect(()=>ledger.fill({...buy,side:'FAKE' as 'BUY'})).toThrow();
  expect(()=>ledger.capitalFlow(-101n)).toThrow('INSUFFICIENT_PAPER_CASH');
  expect(ledger.snapshot().cashLamports).toBe('100');
});
it('FIFO allocation conserves integer cost across randomized partial exits',()=>{
  fc.assert(fc.property(fc.integer({min:2,max:10000}),fc.integer({min:1,max:1000000}),(quantity,cost)=>{
    const ledger=new PaperLedger();ledger.capitalFlow(BigInt(cost)*4n+100n);
    ledger.fill({...buy,quantity:String(quantity),quoteLamports:String(cost),feeLamports:'1'});
    ledger.fill({...buy,id:'FIXTURE-partial',side:'SELL',quantity:'1',quoteLamports:'3',feeLamports:'1'});
    ledger.fill({...buy,id:'FIXTURE-rest',side:'SELL',quantity:String(quantity-1),quoteLamports:String(cost*2),feeLamports:'1'});
    const s=ledger.snapshot();expect(BigInt(s.cashLamports)-BigInt(s.netCapitalLamports)).toBe(BigInt(s.realizedPnlLamports));expect(s.positions).toHaveLength(0);
  }));
});

it('tracks refundable paper rent separately from fees and performance',()=>{const ledger=new PaperLedger();ledger.capitalFlow(100n);ledger.reserveRent('20');expect(ledger.snapshot()).toMatchObject({cashLamports:'80',rentReserveLamports:'20',realizedPnlLamports:'0'});expect(()=>ledger.reserveRent('81')).toThrow('RENT_RESERVE_BREACH');expect(()=>ledger.refundRent('21')).toThrow('RENT_REFUND_EXCEEDS_RESERVE');ledger.refundRent('20');expect(ledger.snapshot().cashLamports).toBe('100');});
it('quotes exact FIFO basis across lots without mutating inventory and conserves rounding remainders',()=>{
 const ledger=new PaperLedger();ledger.capitalFlow(1000n);ledger.fill({...buy,quantity:'3',quoteLamports:'7',feeLamports:'1'});ledger.fill({...buy,id:'second',quantity:'4',quoteLamports:'11',feeLamports:'0'});const before=ledger.snapshot();expect(ledger.costFor(mint,'5')).toBe('13');expect(ledger.costFor(mint,'7')).toBe('19');expect(ledger.snapshot()).toEqual(before);expect(()=>ledger.costFor(mint,'8')).toThrow('INSUFFICIENT_INVENTORY');expect(()=>ledger.costFor(mint,'0')).toThrow('INSUFFICIENT_INVENTORY');ledger.fill({...buy,id:'partial',side:'SELL',quantity:'5',quoteLamports:'20',feeLamports:'1'});expect(ledger.snapshot().positions[0]!.costLamports).toBe('6');expect(ledger.costFor(mint,'2')).toBe('6');
 expect(()=>ledger.capitalFlow(18446744073709551615n)).toThrow('VIRTUAL_CASH_OVERFLOW');
});
it('overflow on refund or sale rejects before mutating cash, FIFO lots or rent',()=>{
 const max=18446744073709551615n,rent=new PaperLedger();rent.capitalFlow(max);rent.reserveRent('1');rent.capitalFlow(1n);const reserved=rent.snapshot();expect(()=>rent.refundRent('1')).toThrow('VIRTUAL_CASH_OVERFLOW');expect(rent.snapshot()).toEqual(reserved);
 const ledger=new PaperLedger();ledger.capitalFlow(max);ledger.fill(buy);const before=ledger.snapshot();expect(()=>ledger.fill({...buy,id:'overflow-sell',side:'SELL',quoteLamports:max.toString(),feeLamports:'0'})).toThrow('VIRTUAL_CASH_OVERFLOW');expect(ledger.snapshot()).toEqual(before);
});
it('failed-execution fees are idempotent realized expenses, never deposits or fills',()=>{const ledger=new PaperLedger();ledger.capitalFlow(20n);expect(ledger.chargeFee('attempt','5')).toBe(true);expect(ledger.chargeFee('attempt','5')).toBe(false);expect(ledger.snapshot()).toMatchObject({cashLamports:'15',netCapitalLamports:'20',realizedPnlLamports:'-5',feesLamports:'5',positions:[]});expect(()=>ledger.chargeFee('attempt','6')).toThrow('IDEMPOTENCY_CONFLICT');expect(()=>ledger.chargeFee('other','16')).toThrow('INSUFFICIENT');expect(()=>ledger.chargeFee('','0')).toThrow();expect(()=>ledger.chargeFee('bad','-1')).toThrow();expect(ledger.chargeFee('zero','0')).toBe(true);});
