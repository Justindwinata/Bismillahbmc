import { z } from 'zod';
import { createHash } from 'node:crypto';
import { address,baseUnits } from '../../domain/src/index.js';
import { SPL_PROGRAM,TOKEN_2022_PROGRAM } from './security.js';
import type { WalletReadRpc } from './wallet.js';
const slot=z.number().int().safe().positive();
const amount=z.object({amount:baseUnits,decimals:z.number().int().min(0).max(255)});
const token=z.object({pubkey:address,account:z.object({owner:address,lamports:z.number().int().safe().nonnegative(),data:z.object({parsed:z.object({type:z.literal('account'),info:z.object({owner:address,mint:address,state:z.enum(['initialized','frozen']),tokenAmount:amount})})})})});
type Token=z.infer<typeof token>;
const tokens=z.object({context:z.object({slot}),value:z.array(token).max(1000)});
const mint=z.object({owner:address,data:z.object({parsed:z.object({type:z.literal('mint'),info:z.object({isInitialized:z.literal(true),decimals:z.number().int().min(0).max(255),supply:baseUnits})})})});
const native='So11111111111111111111111111111111111111112';
export interface Holding {mint:string;program:string;amount:string;decimals:number;accounts:number;accountLamports:string;quantityScope:'PUBLIC_TOKEN_BALANCE';transferStatus:'FROZEN'|'READ_ONLY_NOT_TRADE_AUTHORIZATION'}
export class PortfolioReader{
 constructor(private readonly rpc:Pick<WalletReadRpc,'read'>,private readonly now=Date.now){}
 async read(wallet:string){
  address.parse(wallet);const started=this.now();const receipts:{method:string;slot:string|null;hash:string;receivedAt:string}[]=[],slots:number[]=[];
  const read=async(method:Parameters<WalletReadRpc['read']>[0],params:unknown[]=[])=>{if(this.now()<started||this.now()-started>30000)throw new Error('PORTFOLIO_READ_WINDOW_TOO_OLD');const raw=await this.rpc.read(method,params);const envelope=z.object({context:z.object({slot}).optional()}).safeParse(raw);const at=envelope.success?envelope.data.context?.slot:null;if(at!==undefined&&at!==null)slots.push(at);receipts.push({method,receivedAt:new Date(this.now()).toISOString(),slot:at===undefined||at===null?null:String(at),hash:createHash('sha256').update(JSON.stringify(raw)).digest('hex')});return raw;};
  try{
   if(await read('getGenesisHash')!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw new Error('PORTFOLIO_WRONG_NETWORK');
   const discovered:Token[]=[];
   for(const program of [SPL_PROGRAM,TOKEN_2022_PROGRAM]){const result=tokens.parse(await read('getTokenAccountsByOwner',[wallet,{programId:program},{encoding:'jsonParsed',commitment:'finalized'}]));if(result.value.some(a=>a.account.owner!==program||a.account.data.parsed.info.owner!==wallet))throw new Error('PORTFOLIO_OWNER_MISMATCH');discovered.push(...result.value);}
   if(discovered.length>1000||new Set(discovered.map(a=>a.pubkey)).size!==discovered.length)throw new Error('PORTFOLIO_CAP_OR_DUPLICATE_ACCOUNT');
   const byMint=new Map<string,Holding>(),minimum=Math.max(0,...slots);
   // Fetch independent mint state in bounded RPC batches; preserve every account/mint quantity as an integer string.
   const mints=[...new Set(discovered.map(a=>a.account.data.parsed.info.mint))],metadata=new Map<string,z.infer<typeof mint>>();
   for(let offset=0;offset<mints.length;offset+=100){const keys=mints.slice(offset,offset+100);const requiredMintSlot=Math.max(minimum,...slots);const result=z.object({context:z.object({slot}),value:z.array(mint.nullable())}).parse(await read('getMultipleAccounts',[keys,{encoding:'jsonParsed',commitment:'finalized',minContextSlot:requiredMintSlot}]));if(result.context.slot<requiredMintSlot||result.value.length!==keys.length||result.value.some(a=>a===null))throw new Error('PORTFOLIO_MINT_CONTEXT_INCOMPLETE');result.value.forEach((a,i)=>metadata.set(keys[i]!,a!));}
   for(const a of discovered){const t=a.account.data.parsed.info,m=metadata.get(t.mint)!;if(m.owner!==a.account.owner||m.data.parsed.info.decimals!==t.tokenAmount.decimals||(t.mint===native&&(m.owner!==SPL_PROGRAM||t.tokenAmount.decimals!==9)))throw new Error('PORTFOLIO_MINT_PROGRAM_OR_DECIMALS');const old=byMint.get(t.mint);const sum=BigInt(old?.amount??'0')+BigInt(t.tokenAmount.amount);if(t.mint!==native&&sum>BigInt(m.data.parsed.info.supply))throw new Error('PORTFOLIO_SUPPLY_CONFLICT');byMint.set(t.mint,{mint:t.mint,program:m.owner,amount:sum.toString(),decimals:t.tokenAmount.decimals,accounts:(old?.accounts??0)+1,accountLamports:(BigInt(old?.accountLamports??'0')+BigInt(a.account.lamports)).toString(),quantityScope:'PUBLIC_TOKEN_BALANCE',transferStatus:t.state==='frozen'||old?.transferStatus==='FROZEN'?'FROZEN':'READ_ONLY_NOT_TRADE_AUTHORIZATION'});}
   // Re-bracket membership/amounts. A changing wallet must not publish a supposedly complete stable inventory.
   for(const program of [SPL_PROGRAM,TOKEN_2022_PROGRAM]){const requiredSlot=Math.max(minimum,...slots);const result=tokens.parse(await read('getTokenAccountsByOwner',[wallet,{programId:program},{encoding:'jsonParsed',commitment:'finalized',minContextSlot:requiredSlot}]));const before=discovered.filter(a=>a.account.owner===program),after=result.value;if(result.context.slot<requiredSlot||after.some(a=>a.account.owner!==program||a.account.data.parsed.info.owner!==wallet)||before.length!==after.length||before.some(a=>{const b=after.find(b=>b.pubkey===a.pubkey);return !b||JSON.stringify(b.account.data.parsed.info)!==JSON.stringify(a.account.data.parsed.info)||a.account.lamports!==b.account.lamports;}))throw new Error('PORTFOLIO_CHANGED_DURING_READ');}
   const nativeMinimum=Math.max(0,...slots);const nativeResult=z.object({context:z.object({slot}),value:z.object({owner:address,lamports:z.number().int().safe().nonnegative()}).nullable()}).parse(await read('getAccountInfo',[wallet,{encoding:'jsonParsed',commitment:'finalized',minContextSlot:nativeMinimum}]));if(nativeResult.context.slot<nativeMinimum)throw new Error('PORTFOLIO_NATIVE_CONTEXT_CONFLICT');
   if(this.now()<started||this.now()-started>30000)throw new Error('PORTFOLIO_READ_WINDOW_TOO_OLD');
   const nativeBalance=nativeResult.value===null?'0':nativeResult.value.owner==='11111111111111111111111111111111'?String(nativeResult.value.lamports):null;
   return {status:'AVAILABLE',address:wallet,genesis:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',dataClass:'LIVE_CHAIN',commitment:'finalized',receivedAt:new Date(this.now()).toISOString(),slotWindow:{from:String(Math.min(...slots)),to:String(Math.max(...slots))},consistency:slots.every(n=>n===slots[0])?'FINALIZED_SAME_SLOT':'BRACKETED_STABLE_FINALIZED_WINDOW_NOT_ATOMIC',nativeBalanceLamports:nativeBalance,holdings:[...byMint.values()],accountCount:discovered.length,token2022Scope:'PUBLIC_BALANCE_ONLY_CONFIDENTIAL_OR_RESTRICTED_VALUE_UNKNOWN',equityLamports:null,realizedPnlLamports:null,liabilities:'UNKNOWN',receipts};
  }catch(error){return {status:'UNAVAILABLE',address:wallet,reason:error instanceof Error&&/^PORTFOLIO_[A-Z_]+$/.test(error.message)?error.message:'PORTFOLIO_RPC_OR_SCHEMA_UNAVAILABLE',nativeBalanceLamports:null,holdings:null,equityLamports:null,realizedPnlLamports:null,receivedAt:new Date(this.now()).toISOString(),receipts};}
 }
}
