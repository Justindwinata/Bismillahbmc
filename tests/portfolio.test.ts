import { it,expect } from 'vitest';
import { PortfolioReader } from '../packages/connectors/src/portfolio.js';
import { SPL_PROGRAM,TOKEN_2022_PROGRAM } from '../packages/connectors/src/security.js';
import { keyString } from '../packages/connectors/src/pool-security.js';
const key=(n:number)=>{const b=Buffer.alloc(32);b.writeUInt32LE(n);return keyString(b);};const wallet=key(1),asset=key(2),asset22=key(3),wsol='So11111111111111111111111111111111111111112';
function fixture(options:{empty?:boolean;wrongNetwork?:boolean;wrongOwner?:boolean;wrongProgram?:boolean;wrongDecimals?:boolean;lowSupply?:boolean;changed?:boolean;missingMint?:boolean;staleSlot?:boolean;nonSystem?:boolean;count?:number}={}){
 let lookups=0;const accounts=(program:string)=>options.empty?[]:program===TOKEN_2022_PROGRAM?[{pubkey:key(50),account:{owner:program,lamports:2039280,data:{parsed:{type:'account',info:{owner:wallet,mint:asset22,state:'frozen',tokenAmount:{amount:'3',decimals:2}}}}}}]:Array.from({length:options.count??2},(_,i)=>({pubkey:key(100+i),account:{owner:options.wrongProgram?TOKEN_2022_PROGRAM:program,lamports:2039280,data:{parsed:{type:'account',info:{owner:options.wrongOwner?key(99):wallet,mint:asset,state:'initialized',tokenAmount:{amount:String(5+i),decimals:6}}}}}}));
 return {read:async(method:string,params:unknown[]=[])=>{
  if(method==='getGenesisHash')return options.wrongNetwork?'wrong-network':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getTokenAccountsByOwner'){lookups++;const program=(params[1] as {programId:string}).programId;const value=accounts(program);if(options.changed&&lookups>2&&value[0])value[0].account.data.parsed.info.tokenAmount.amount='999';return {context:{slot:100},value};}
  if(method==='getMultipleAccounts')return {context:{slot:options.staleSlot?99:100},value:(params[0] as string[]).map(m=>options.missingMint?null:{owner:m===asset22?TOKEN_2022_PROGRAM:SPL_PROGRAM,data:{parsed:{type:'mint',info:{isInitialized:true,decimals:options.wrongDecimals?9:m===asset22?2:6,supply:options.lowSupply?'1':'1000000000'}}}})};
  if(method==='getAccountInfo')return {context:{slot:100},value:options.empty?null:{owner:options.nonSystem?SPL_PROGRAM:'11111111111111111111111111111111',lamports:5000}};
  throw new Error('FIXTURE_METHOD_NOT_SUPPORTED');
 }};
}
it('verifies exact multi-account SPL aggregation, frozen public balances and same-slot provenance without inventing equity',async()=>{
 const p=await new PortfolioReader(fixture()).read(wallet);expect(p.status).toBe('AVAILABLE');expect(p.nativeBalanceLamports).toBe('5000');expect(p.holdings).toEqual(expect.arrayContaining([expect.objectContaining({mint:asset,amount:'11',decimals:6,accounts:2}),expect.objectContaining({mint:asset22,amount:'3',transferStatus:'FROZEN'})]));expect(p.consistency).toBe('FINALIZED_SAME_SLOT');expect(p.equityLamports).toBeNull();expect(p.realizedPnlLamports).toBeNull();expect(p.receipts.every(r=>r.hash.length===64)).toBe(true);
});
it('a proven empty account set is zero inventory; unavailable or non-system native balance is never fabricated zero',async()=>{
 const empty=await new PortfolioReader(fixture({empty:true})).read(wallet);expect(empty.status).toBe('AVAILABLE');expect(empty.nativeBalanceLamports).toBe('0');expect(empty.holdings).toEqual([]);const unknown=await new PortfolioReader({read:async()=>{throw new Error('fixture provider429');}}).read(wallet);expect(unknown.status).toBe('UNAVAILABLE');expect(unknown.holdings).toBeNull();expect(unknown.nativeBalanceLamports).toBeNull();expect((await new PortfolioReader(fixture({nonSystem:true})).read(wallet)).nativeBalanceLamports).toBeNull();
});
it('wrong owners/programs/decimals/supply, missing mint, stale context, cap and changed snapshots fail closed',async()=>{
 for(const o of [{wrongNetwork:true},{wrongOwner:true},{wrongProgram:true},{wrongDecimals:true},{lowSupply:true},{changed:true},{missingMint:true},{staleSlot:true},{count:1000}]){const p=await new PortfolioReader(fixture(o)).read(wallet);expect(p.status,JSON.stringify(o)).toBe('UNAVAILABLE');expect(p.holdings).toBeNull();}
});
it('wrapped SOL native mint supply zero does not erase its public token quantity',async()=>{
 const base=fixture(),read=base.read;const rpc={read:async(method:string,params:unknown[]=[])=>{const result=await read(method,params);if(method==='getTokenAccountsByOwner'){const r=result as {value:{account:{data:{parsed:{info:{mint:string;tokenAmount:{decimals:number}}}}}}[]};r.value.forEach(a=>{if(a.account.data.parsed.info.mint===asset){a.account.data.parsed.info.mint=wsol;a.account.data.parsed.info.tokenAmount.decimals=9;}});}if(method==='getMultipleAccounts'){const r=result as {value:{data:{parsed:{info:{decimals:number;supply:string}}}}[]};(params[0] as string[]).forEach((m,i)=>{if(m===wsol){r.value[i]!.data.parsed.info.decimals=9;r.value[i]!.data.parsed.info.supply='0';}});}return result;}};expect((await new PortfolioReader(rpc).read(wallet)).status).toBe('AVAILABLE');
});
it('a slow read window remains unavailable even if every individual RPC payload is valid',async()=>{
 let clock=0;const f=fixture(),read=f.read;const rpc={read:async(method:string,params:unknown[]=[])=>{const r=await read(method,params);if(method==='getAccountInfo')clock=31000;return r;}};const result=await new PortfolioReader(rpc,()=>clock).read(wallet);expect(result.status).toBe('UNAVAILABLE');expect(result.reason).toBe('PORTFOLIO_READ_WINDOW_TOO_OLD');expect(result.holdings).toBeNull();
});
