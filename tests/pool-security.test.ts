import { createHash } from 'node:crypto';
import { it,expect } from 'vitest';
import { CpmmSecurityReader,CPMM_PROGRAM,CPMM_AUTHORITY,UPGRADE_LOADER,keyBytes,keyString } from '../packages/connectors/src/pool-security.js';
import { ProviderError } from '../packages/connectors/src/index.js';
import { SPL_PROGRAM } from '../packages/connectors/src/security.js';
const k=(n:number)=>keyString(Buffer.concat([Buffer.alloc(31),Buffer.from([n])]));
const pool=k(1),candidate=k(2),config=k(3),va=k(4),vb=k(5),lp=k(6),programData=k(7),wsol='So11111111111111111111111111111111111111112';
const disc=(name:string)=>createHash('sha256').update('account:'+name).digest().subarray(0,8);
function fixture(change:{owner?:string;liquidity?:bigint;redeemable?:bigint;frozen?:boolean;mintAuth?:boolean;swapsOff?:boolean;changed?:boolean;upgrade?:boolean;vaultOwner?:boolean;badMint?:boolean;badConfig?:boolean;creatorFee?:boolean}={}){
 const state=Buffer.alloc(637);disc('PoolState').copy(state);[config,k(8),va,vb,lp,candidate,wsol,SPL_PROGRAM,SPL_PROGRAM,k(9)].forEach((key,i)=>keyBytes(key).copy(state,8+i*32));state[329]=change.swapsOff?4:0;state[330]=9;state[331]=6;state[332]=9;state[390]=change.creatorFee?1:0;state.writeBigUInt64LE(100000n,333);
 const tokenMint=(authority:string|null,supply:bigint,decimals:number,freeze=false)=>{const b=Buffer.alloc(82);if(authority){b.writeUInt32LE(1);keyBytes(authority).copy(b,4);}b.writeBigUInt64LE(supply,36);b[44]=decimals;b[45]=1;if(freeze){b.writeUInt32LE(1,46);keyBytes(k(8)).copy(b,50);}return b;};
 const tokenVault=(mint:string,amount:bigint)=>{const b=Buffer.alloc(165);keyBytes(mint).copy(b);keyBytes(change.vaultOwner?k(8):CPMM_AUTHORITY).copy(b,32);b.writeBigUInt64LE(amount,64);b[108]=1;if(mint===wsol){b.writeUInt32LE(1,109);b.writeBigUInt64LE(2039280n,113);}return b;};
 const program=Buffer.alloc(36);program.writeUInt32LE(2);keyBytes(programData).copy(program,4);const pd=Buffer.alloc(80);pd.writeUInt32LE(3);if(change.upgrade){pd[12]=1;keyBytes(k(8)).copy(pd,13);}
 const cfg=Buffer.alloc(236);disc('AmmConfig').copy(cfg);cfg.writeBigUInt64LE(change.badConfig?10001n:2500n,12);
 const acct=(owner:string,b:Buffer,executable=false)=>({owner,executable,lamports:b.length===165?Number(b.readBigUInt64LE(64)+2039280n):100000000,data:[b.toString('base64'),'base64']});
 return {read:async(method:string,params:unknown[]=[])=>{if(method==='getGenesisHash')return '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';if(method==='getAccountInfo')return {context:{slot:100},value:params[0]===pool?acct(change.owner??CPMM_PROGRAM,state):acct(UPGRADE_LOADER,program,true)};
 const again=Buffer.from(state);if(change.changed)again[329]=4;
 return {context:{slot:101},value:[acct(CPMM_PROGRAM,again),acct(SPL_PROGRAM,tokenVault(change.badMint?wsol:candidate,1000000n)),acct(SPL_PROGRAM,tokenVault(wsol,change.liquidity??2000000000n)),acct(SPL_PROGRAM,tokenMint(CPMM_AUTHORITY,change.redeemable??100n,9)),acct(SPL_PROGRAM,tokenMint(change.mintAuth?k(8):null,1000000n,6,change.frozen)),acct(SPL_PROGRAM,tokenMint(null,0n,9)),acct(CPMM_PROGRAM,cfg),acct(UPGRADE_LOADER,program,true),acct(UPGRADE_LOADER,pd)]};}};
}
it('independent same-slot CPMM proof validates principal vaults and non-redeemable LP without a fabricated locker claim',async()=>{
 const result=await new CpmmSecurityReader(fixture()).screen(pool,candidate);expect(result.assessment).toBe('PASS');expect(result.exitSafe).toBe(true);expect(result.slot).toBe('101');expect(JSON.stringify(result.facts)).toContain('SUPPLY_DEFICIT_NON_REDEEMABLE');expect(keyString(keyBytes(candidate))).toBe(candidate);expect(keyString(keyBytes('11111111111111111111111111111111'))).toBe('11111111111111111111111111111111');
});
it('fake pool, wrong vault owner/mint, freeze, LP rug, fee and swap pause never get entry approval',async()=>{
 for(const change of [{owner:SPL_PROGRAM},{vaultOwner:true},{badMint:true},{frozen:true},{redeemable:100000n},{liquidity:0n},{swapsOff:true},{badConfig:true},{creatorFee:true},{changed:true}])expect((await new CpmmSecurityReader(fixture(change)).screen(pool,candidate)).assessment,JSON.stringify(change,(_,v)=>typeof v==='bigint'?v.toString():v)).not.toBe('PASS');
 const rug=await new CpmmSecurityReader(fixture({redeemable:100000n})).screen(pool,candidate);expect(rug.exitSafe).toBe(true);expect(rug.reasons).toContain('POOL_LP_REDEEMABLE_RUG_RISK');expect((await new CpmmSecurityReader(fixture({mintAuth:true})).screen(pool,candidate)).exitSafe).toBe(true);
 expect((await new CpmmSecurityReader(fixture({liquidity:1n})).screen(pool,candidate)).exitSafe).toBe(true);expect((await new CpmmSecurityReader(fixture({liquidity:0n})).screen(pool,candidate)).exitSafe).toBe(false);
});
it('unreviewed mutable program revision stays UNKNOWN; explicit matching hash is still constrained by all pool gates',async()=>{
 const reader=new CpmmSecurityReader(fixture({upgrade:true}));const result=await reader.screen(pool,candidate);expect(result.assessment).toBe('UNKNOWN');const facts=result.facts as {revisionHash:string};expect((await reader.screen(pool,candidate,{minQuoteReserveLamports:'1000000000',minNonRedeemableLpBps:9500,programDataHash:facts.revisionHash})).assessment).toBe('PASS');
 expect((await new CpmmSecurityReader({read:async()=>{throw new Error('RPC outage');}}).screen(pool,candidate)).assessment).toBe('UNKNOWN');
});

type RawAccount={owner:string;executable:boolean;lamports:number;data:[string,string]};
type Envelope={context:{slot:number};value:RawAccount|null|(RawAccount|null)[]};
function corrupt(stage:'first'|'program'|'batch',change:(e:Envelope)=>void){const base=fixture();return {read:async(method:string,params:unknown[]=[])=>{const raw=await base.read(method,params);const current=method==='getMultipleAccounts'?'batch':method==='getAccountInfo'?(params[0]===pool?'first':'program'):'genesis';if(current!==stage)return raw;const e=structuredClone(raw) as unknown as Envelope;change(e);return e;}};}
function edit(a:RawAccount,fn:(b:Buffer)=>void){const b=Buffer.from(a.data[0],'base64');fn(b);a.data[0]=b.toString('base64');}
it('rejects corrupt account controls, backing, aliases, layouts and inconsistent snapshots independently',async()=>{
 const one=(e:Envelope)=>e.value as RawAccount,many=(e:Envelope)=>e.value as RawAccount[];
 const cases:[Parameters<typeof corrupt>[0],(e:Envelope)=>void,string][]=[
 ['first',e=>{e.value=null;},'POOL_NOT_FOUND'],
 ['first',e=>{one(e).data[0]+='!';},'POOL_LAYOUT_UNVERIFIABLE'],
 ['first',e=>edit(one(e),b=>{b[0]=0;}),'POOL_LAYOUT_UNVERIFIABLE'],
 ['first',e=>edit(one(e),b=>keyBytes(k(20)).copy(b,168)),'POOL_MINT_PAIR_MISMATCH'],
 ['first',e=>edit(one(e),b=>keyBytes(k(20)).copy(b,232)),'POOL_TOKEN_SEMANTICS_UNSUPPORTED'],
 ['first',e=>edit(one(e),b=>keyBytes(pool).copy(b,72)),'POOL_ACCOUNT_ALIAS'],
 ['program',e=>{one(e).executable=false;},'POOL_PROGRAM_LOADER_INVALID'],
 ['batch',e=>{(e.value as (RawAccount|null)[])[1]=null;},'POOL_SNAPSHOT_INCOMPLETE'],
 ['batch',e=>{e.context.slot=99;},'POOL_SNAPSHOT_INCOMPLETE'],
 ['batch',e=>{many(e)[7]!.owner=SPL_PROGRAM;},'POOL_CHANGED_DURING_PROOF'],
 ['batch',e=>{many(e)[8]!.owner=SPL_PROGRAM;},'POOL_PROGRAMDATA_INVALID'],
 ['batch',e=>edit(many(e)[4]!,b=>{b[45]=0;}),'POOL_LAYOUT_UNVERIFIABLE'],
 ['batch',e=>edit(many(e)[4]!,b=>{b.writeUInt32LE(2,0);}),'POOL_LAYOUT_UNVERIFIABLE'],
 ['batch',e=>edit(many(e)[1]!,b=>{b.writeUInt32LE(1,109);}),'POOL_LAYOUT_UNVERIFIABLE'],
 ['batch',e=>{many(e)[2]!.lamports=1;},'POOL_LAYOUT_UNVERIFIABLE'],
 ['batch',e=>edit(many(e)[5]!,b=>{b[44]=8;}),'POOL_MINT_AUTHORITY_OR_DECIMALS'],
 ['batch',e=>edit(many(e)[3]!,b=>{b.writeBigUInt64LE(100001n,36);}),'POOL_LP_SUPPLY_CONFLICT'],
 ];
 for(const [stage,change,reason] of cases){const result=await new CpmmSecurityReader(corrupt(stage,change)).screen(pool,candidate);expect(result.reasons,reason).toContain(reason);expect(result.exitSafe,reason).toBe(false);}
 expect((await new CpmmSecurityReader({read:async()=> 'wrong-network'}).screen(pool,candidate)).reasons).toContain('POOL_WRONG_NETWORK');
 expect((await new CpmmSecurityReader({read:async method=>method==='getGenesisHash'?'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':({})}).screen(pool,candidate)).reasons).toContain('POOL_RPC_SCHEMA_UNVERIFIABLE');
 expect((await new CpmmSecurityReader({read:async()=>{throw new ProviderError('RATE_LIMITED');}}).screen(pool,candidate)).reasons).toContain('POOL_PROVIDER_RATE_LIMITED');
 expect(()=>keyBytes('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toThrow();expect(()=>keyString(Buffer.alloc(31))).toThrow('PUBKEY_LENGTH');
});
it('runtime registry is authoritative over raw hash pins and rechecks changed or revoked revisions',async()=>{
 const base=new CpmmSecurityReader(fixture({upgrade:true}));const proof=await base.screen(pool,candidate);const hash=(proof.facts as {revisionHash:string}).revisionHash;const id='8bceff30-0307-44d9-a395-9c3313f06cc8';let revoked=false;
 const resolver=async(h:string)=>h===hash&&!revoked?id:null;
 const reader=new CpmmSecurityReader(fixture({upgrade:true}),Date.now,resolver);
 const good=await reader.screen(pool,candidate);expect(good.assessment).toBe('PASS');expect(good.revisionReviewId).toBe(id);expect(good.revisionHash).toBe(hash);
 revoked=true;const denied=await reader.screen(pool,candidate,{minQuoteReserveLamports:'1000000000',minNonRedeemableLpBps:9500,programDataHash:hash});expect(denied.assessment).toBe('UNKNOWN');expect(denied.exitSafe).toBe(false);expect(denied.reasons).toContain('POOL_PROGRAM_REVISION_REVIEW_REQUIRED');expect(denied.hash).not.toBe(good.hash);
 const outage=await new CpmmSecurityReader(fixture({upgrade:true}),Date.now,async()=>{throw new Error('FIXTURE_DB_UNAVAILABLE');}).screen(pool,candidate);expect(outage.reasons).toContain('POOL_PROGRAM_REGISTRY_UNAVAILABLE');expect(outage.exitSafe).toBe(false);
 const changed=new CpmmSecurityReader(corrupt('batch',e=>edit((e.value as RawAccount[])[8]!,b=>{b[b.length-1]=1;})),Date.now,async h=>h===hash?id:null);expect((await changed.screen(pool,candidate)).revisionReviewId).toBeUndefined();
});
