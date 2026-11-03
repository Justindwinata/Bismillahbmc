import { z } from 'zod';
import { address,baseUnits } from '../../domain/src/index.js';
const units=z.number().int().safe().nonnegative();
const token=z.object({accountIndex:z.number().int().nonnegative(),owner:address,mint:address,uiTokenAmount:z.object({amount:baseUnits,decimals:z.number().int().min(0).max(255)})});
const schema=z.object({meta:z.object({err:z.unknown(),fee:units,preBalances:z.array(units).max(256),postBalances:z.array(units).max(256),preTokenBalances:z.array(token),postTokenBalances:z.array(token)}),transaction:z.object({message:z.object({accountKeys:z.array(z.union([address,z.object({pubkey:address})])).min(1).max(256)})})});
const wrapped='So11111111111111111111111111111111111111112';
/** Receipt effects, never swap attribution, spendability, refundable rent or P&L. */
export function walletEffects(raw:unknown,wallet:string){
 const missing=(reason:string)=>({status:'UNKNOWN' as const,reason,nativeDeltaLamports:null,walletFeeLamports:null,controlledLamportsDeltaExcludingFee:null,wrappedQuantityDelta:null,tokenAccountEffects:null});
 const parsed=schema.safeParse(raw);if(!parsed.success||!address.safeParse(wallet).success)return missing('NATIVE_ACCOUNT_EVIDENCE_INCOMPLETE');
 const {meta,transaction}=parsed.data;const keys=transaction.message.accountKeys.map(k=>typeof k==='string'?k:k.pubkey),ownerIndex=keys.indexOf(wallet);
 if(meta.err===undefined||keys.length!==meta.preBalances.length||keys.length!==meta.postBalances.length||new Set(keys).size!==keys.length||ownerIndex<0)return missing('NATIVE_ACCOUNT_MAPPING_INCOMPLETE');
 const pre=meta.preTokenBalances,post=meta.postTokenBalances;
 if([pre,post].some(list=>new Set(list.map(b=>b.accountIndex)).size!==list.length||list.some(b=>b.accountIndex>=keys.length)))return missing('TOKEN_ACCOUNT_MAPPING_INVALID');
 const indexes=new Set([...pre,...post].map(b=>b.accountIndex));const effects=[];let wrappedDelta=0n,accountDelta=0n;
 for(const index of indexes){
  const before=pre.find(b=>b.accountIndex===index),after=post.find(b=>b.accountIndex===index);
  if(before&&after&&(before.owner!==after.owner||before.mint!==after.mint||before.uiTokenAmount.decimals!==after.uiTokenAmount.decimals))return missing('TOKEN_ACCOUNT_IDENTITY_CHANGED');
  const account=after??before!;if(account.owner!==wallet)continue;
  if(index===ownerIndex)return missing('NATIVE_AND_TOKEN_ACCOUNT_ALIAS');
  const quantity=BigInt(after?.uiTokenAmount.amount??'0')-BigInt(before?.uiTokenAmount.amount??'0');
  const lamports=BigInt(meta.postBalances[index]!)-BigInt(meta.preBalances[index]!);accountDelta+=lamports;
  if(account.mint===wrapped){if(account.uiTokenAmount.decimals!==9)return missing('WRAPPED_DECIMALS_INVALID');wrappedDelta+=quantity;}
  effects.push({account:keys[index]!,mint:account.mint,quantityDelta:quantity.toString(),accountLamportsDelta:lamports.toString(),opened:before===undefined,closed:after===undefined,reserveOrBackingDelta:account.mint===wrapped?(lamports-quantity).toString():lamports.toString(),rentClassification:'UNVERIFIED_NOT_REFUND_OR_EXPENSE'});
 }
 const native=BigInt(meta.postBalances[ownerIndex]!)-BigInt(meta.preBalances[ownerIndex]!),fee=ownerIndex===0?BigInt(meta.fee):0n;
 return {status:'OBSERVED' as const,reason:meta.err===null?'FINALIZED_ACCOUNT_EFFECTS_NOT_SWAP_OR_PNL':'FAILED_RECEIPT_ACCOUNT_EFFECTS_NOT_FILL',nativeDeltaLamports:native.toString(),walletFeeLamports:fee.toString(),controlledLamportsDeltaExcludingFee:(native+accountDelta+fee).toString(),wrappedQuantityDelta:wrappedDelta.toString(),tokenAccountEffects:effects,rentClassification:'UNKNOWN',pnlLamports:null,copyAuthority:false};
}
