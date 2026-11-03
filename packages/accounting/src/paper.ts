import { z } from 'zod';
import { address,baseUnits } from '../../domain/src/index.js';
export interface PaperFill {id:string;mode:'PAPER';side:'BUY'|'SELL';mint:string;quantity:string;quoteLamports:string;feeLamports:string;fillable:boolean;sourceClass:'PAPER_SIM'|'REPLAY'}
export class PaperLedger {
  readonly mode='PAPER';private seen=new Map<string,string>();
  private rent=0n;private cash=0n;private capital=0n;private realized=0n;private fees=0n;
  private lots=new Map<string,{quantity:bigint;cost:bigint}[]>();
  capitalFlow(delta:bigint){if(this.cash+delta<0n)throw new Error('INSUFFICIENT_PAPER_CASH');if(this.cash+delta>18446744073709551615n)throw new Error('VIRTUAL_CASH_OVERFLOW');this.cash+=delta;this.capital+=delta;}
  chargeFee(id:string,amount:string){z.string().min(1).max(100).parse(id);const value=BigInt(baseUnits.parse(amount)),key='fee:'+id,body=value.toString();if(this.seen.has(key)){if(this.seen.get(key)!==body)throw new Error('IDEMPOTENCY_CONFLICT');return false;}if(value>this.cash)throw new Error('INSUFFICIENT_PAPER_CASH');this.cash-=value;this.realized-=value;this.fees+=value;this.seen.set(key,body);return true;}
  reserveRent(amount:string){const value=BigInt(baseUnits.parse(amount));if(this.cash<value)throw new Error('RENT_RESERVE_BREACH');this.cash-=value;this.rent+=value;}
  refundRent(amount:string){const value=BigInt(baseUnits.parse(amount));if(this.rent<value)throw new Error('RENT_REFUND_EXCEEDS_RESERVE');if(this.cash+value>18446744073709551615n)throw new Error('VIRTUAL_CASH_OVERFLOW');this.rent-=value;this.cash+=value;}
  // FIFO integer basis: floor each partial lot; the remaining lot retains every rounding remainder.
  costFor(mint:string,quantity:string){const amount=BigInt(baseUnits.parse(quantity));const lots=this.lots.get(mint)??[];if(amount===0n||lots.reduce((n,l)=>n+l.quantity,0n)<amount)throw new Error('INSUFFICIENT_INVENTORY');let remaining=amount,cost=0n;for(const lot of lots){const sold=remaining<lot.quantity?remaining:lot.quantity;cost+=sold===lot.quantity?lot.cost:lot.cost*sold/lot.quantity;remaining-=sold;if(remaining===0n)break;}return cost.toString();}
  fill(raw:PaperFill){
    const fill=z.object({id:z.string().min(1).max(100),mode:z.literal('PAPER'),side:z.enum(['BUY','SELL']),mint:address,quantity:baseUnits,quoteLamports:baseUnits,feeLamports:baseUnits,fillable:z.boolean(),sourceClass:z.enum(['PAPER_SIM','REPLAY'])}).parse(raw);
    if(fill.mode!=='PAPER'||!['PAPER_SIM','REPLAY'].includes(fill.sourceClass))throw new Error('PAPER_ONLY');
    if(this.seen.has(fill.id)){if(this.seen.get(fill.id)!==JSON.stringify(fill))throw new Error('IDEMPOTENCY_CONFLICT');return false;}
    if(!fill.fillable)throw new Error('UNFILLABLE_QUOTE');
    const quantity=BigInt(baseUnits.parse(fill.quantity));const quote=BigInt(baseUnits.parse(fill.quoteLamports));const fee=BigInt(baseUnits.parse(fill.feeLamports));
    if(quantity===0n||quote===0n)throw new Error('ZERO_FILL');
    const lots=this.lots.get(fill.mint)??[];
    if(fill.side==='BUY'){
      if(this.cash<quote+fee)throw new Error('INSUFFICIENT_PAPER_CASH');
      this.cash-=quote+fee;lots.push({quantity,cost:quote+fee});
    }else{
      if(fee>quote)throw new Error('FEE_EXCEEDS_PROCEEDS');if(this.cash+quote-fee>18446744073709551615n)throw new Error('VIRTUAL_CASH_OVERFLOW');
      if(lots.reduce((n,lot)=>n+lot.quantity,0n)<quantity)throw new Error('INSUFFICIENT_INVENTORY');
      let remaining=quantity;let cost=0n;
      while(remaining>0n){const lot=lots[0]!;const sold=remaining<lot.quantity?remaining:lot.quantity;const basis=sold===lot.quantity?lot.cost:lot.cost*sold/lot.quantity;cost+=basis;lot.quantity-=sold;lot.cost-=basis;remaining-=sold;if(lot.quantity===0n)lots.shift();}
      this.cash+=quote-fee;this.realized+=quote-fee-cost;
    }
    this.fees+=fee;this.lots.set(fill.mint,lots);this.seen.set(fill.id,JSON.stringify(fill));return true;
  }
  snapshot(){return {mode:this.mode,sourceClass:'PAPER_SIM',cashLamports:this.cash.toString(),rentReserveLamports:this.rent.toString(),netCapitalLamports:this.capital.toString(),realizedPnlLamports:this.realized.toString(),feesLamports:this.fees.toString(),unrealizedPnlLamports:null,positions:[...this.lots].filter(([,lots])=>lots.length).map(([mint,lots])=>({mint,quantity:lots.reduce((n,l)=>n+l.quantity,0n).toString(),costLamports:lots.reduce((n,l)=>n+l.cost,0n).toString(),tradeability:'UNKNOWN'}))};}
}
