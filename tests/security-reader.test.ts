import { it,expect } from 'vitest';
import { MintSecurityReader,SPL_PROGRAM,TOKEN_2022_PROGRAM } from '../packages/connectors/src/security.js';
const mint='So11111111111111111111111111111111111111112';
const key=(i:number)=>'1'.repeat(31)+'123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[i]!;
function provider(change:{authority?:boolean;program?:string;partial?:boolean;conflict?:boolean;concentrated?:boolean;missing?:boolean;extensions?:{extension:string;state?:unknown}[]}={}){
 return {read:async(method:string)=>{
  if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
  if(method==='getAccountInfo')return {context:{slot:100},value:change.missing?null:{owner:change.program??SPL_PROGRAM,executable:false,data:{parsed:{type:'mint',info:{mintAuthority:change.authority?mint:null,freezeAuthority:null,supply:change.partial?'2000':'1000',decimals:9,isInitialized:true,...(change.extensions?{extensions:change.extensions}:{})}}}}};
  if(method==='getTokenLargestAccounts')return {context:{slot:101},value:Array.from({length:20},(_,i)=>({address:key(i+1),amount:'50',decimals:9}))};
  return {context:{slot:change.conflict?99:102},value:Array.from({length:20},(_,i)=>({owner:SPL_PROGRAM,data:{parsed:{type:'account',info:{mint,owner:key(change.concentrated?1:i+1),state:'initialized',tokenAmount:{amount:'50',decimals:9}}}}}))};
 }};
}
it('binds finalized mint, full holder ownership and exact supply before PASS',async()=>{
 const result=await new MintSecurityReader(provider(),()=>1000).screen(mint,1000);
 expect(result.assessment).toBe('PASS');expect(result.security.holderOwnershipVerified).toBe(true);expect(result.slot).toBe('100');expect(result.hash).toHaveLength(64);
});
it('vetoes authorities/unknown extensions or programs and concentration; missing facts stay unknown',async()=>{
 for(const input of [{authority:true},{program:'11111111111111111111111111111111'},{concentrated:true}])expect((await new MintSecurityReader(provider(input)).screen(mint,1000)).assessment).toBe('VETO');
 for(const input of [{missing:true},{partial:true},{conflict:true}])expect((await new MintSecurityReader(provider(input)).screen(mint,1000)).assessment).toBe('UNKNOWN');
 expect((await new MintSecurityReader({read:async()=>{throw new Error('secret endpoint details');}}).screen(mint,1000)).reasons).toEqual(['RPC_SCHEMA_OR_PROVIDER_UNAVAILABLE']);
});

it('Token-2022 extension findings preserve decimals and raw evidence without granting tradeability',async()=>{
 for(const name of ['transferFeeConfig','transferHook','permanentDelegate','pausableConfig','defaultAccountState','nonTransferable','metadataPointer','futureUnknownExtension']){const result=await new MintSecurityReader(provider({program:TOKEN_2022_PROGRAM,extensions:[{extension:name,state:{fixture:'REPLAY_TEST'}}]})).screen(mint,1000);expect(result.assessment).toBe('VETO');expect(result.decimals).toBe(9);expect(result.security.extensions).toEqual([name]);expect(result.reasons).toContain('UNSUPPORTED_TOKEN_EXTENSION_'+name.toUpperCase());}
 expect((await new MintSecurityReader(provider({program:TOKEN_2022_PROGRAM})).screen(mint,1000)).reasons).toEqual(['TOKEN_2022_BASE_PROGRAM_NOT_QUALIFIED']);
 expect((await new MintSecurityReader(provider({extensions:[{extension:'transferHook'}]})).screen(mint,1000)).assessment).toBe('VETO');
});
it('a concentrated partial holder sample is a proven lower-bound veto, never a false full-supply PASS',async()=>{
 expect((await new MintSecurityReader(provider({partial:true,concentrated:true})).screen(mint,1000)).reasons).toEqual(['HOLDER_CONCENTRATION_HIGH']);
 expect((await new MintSecurityReader(provider({partial:true})).screen(mint,1000)).assessment).toBe('UNKNOWN');
});
it('partial-supply ownership can PASS only under a worst-case upper bound and stable bracketed supply',async()=>{
 const original=provider();let reads=0;const bounded={read:async(method:string,params:unknown[]=[])=>{const result=await original.read(method);if(method==='getAccountInfo'){reads++;const r=result as {context:{slot:number};value:{data:{parsed:{info:{supply:string}}}}};r.context.slot=reads===1?100:103;r.value.data.parsed.info.supply='1010';}void params;return result;}};
 const result=await new MintSecurityReader(bounded).screen(mint,1000);expect(result.assessment).toBe('PASS');expect(result.reasons).toContain('FINALIZED_HOLDER_OWNER_UPPER_BOUND');
 reads=0;const changed={read:async(method:string,params:unknown[]=[])=>{const r=await bounded.read(method,params);if(method==='getAccountInfo'&&reads>1)(r as {value:{data:{parsed:{info:{supply:string}}}}}).value.data.parsed.info.supply='1005';return r;}};expect((await new MintSecurityReader(changed).screen(mint,1000)).assessment).toBe('UNKNOWN');
});
