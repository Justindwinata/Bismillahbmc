import { createHash } from 'node:crypto';
import { z } from 'zod';
import { address,baseUnits } from '../../domain/src/index.js';
import { ProviderError } from './index.js';
import { SPL_PROGRAM } from './security.js';
import type { WalletReadRpc } from './wallet.js';
export const CPMM_PROGRAM='CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
export const CPMM_AUTHORITY='GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL';
export const UPGRADE_LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
const WSOL='So11111111111111111111111111111111111111112';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function keyBytes(key:string){address.parse(key);let n=0n;for(const c of key)n=n*58n+BigInt(alphabet.indexOf(c));const b=Buffer.alloc(32);for(let i=31;i>=0;i--){b[i]=Number(n&255n);n>>=8n;}return b;}
export function keyString(b:Uint8Array){if(b.length!==32)throw new Error('PUBKEY_LENGTH');let n=BigInt('0x'+Buffer.from(b).toString('hex')),result='';while(n){result=alphabet[Number(n%58n)]+result;n/=58n;}for(const byte of b){if(byte)break;result='1'+result;}return result;}
const sha=(data:unknown)=>createHash('sha256').update(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data)).digest('hex');
const account=z.object({owner:address,executable:z.boolean(),lamports:z.number().int().nonnegative().safe(),data:z.tuple([z.string().max(2000000),z.literal('base64')])});
type Account=z.infer<typeof account>;
function bytes(a:Account){const data=Buffer.from(a.data[0],'base64');if(data.toString('base64')!==a.data[0])throw new Error('NONCANONICAL_BASE64');return data;}
function publicKey(data:Buffer,offset:number){return keyString(data.subarray(offset,offset+32));}
export function decodeCpmmPool(data:Buffer){
 if(data.length!==637||!data.subarray(0,8).equals(Buffer.from(sha('account:PoolState'),'hex').subarray(0,8)))throw new Error('CPMM_LAYOUT_OR_DISCRIMINATOR');
 return {config:publicKey(data,8),creator:publicKey(data,40),vaultA:publicKey(data,72),vaultB:publicKey(data,104),lpMint:publicKey(data,136),mintA:publicKey(data,168),mintB:publicKey(data,200),programA:publicKey(data,232),programB:publicKey(data,264),status:data[329]!,lpDecimals:data[330]!,decimalsA:data[331]!,decimalsB:data[332]!,lpSupply:data.readBigUInt64LE(333),feesA:data.readBigUInt64LE(341)+data.readBigUInt64LE(357)+data.readBigUInt64LE(397),feesB:data.readBigUInt64LE(349)+data.readBigUInt64LE(365)+data.readBigUInt64LE(405),openTime:data.readBigUInt64LE(373),creatorFeeEnabled:data[390]!==0};
}
function mint(a:Account){const b=bytes(a);if(a.owner!==SPL_PROGRAM||a.executable||b.length!==82||b[45]!==1)throw new Error('MINT_OWNER_LAYOUT');const authority=b.readUInt32LE(0),freeze=b.readUInt32LE(46);if(authority>1||freeze>1)throw new Error('MINT_OPTION');return {authority:authority?publicKey(b,4):null,freeze:freeze?publicKey(b,50):null,supply:b.readBigUInt64LE(36),decimals:b[44]!};}
function vault(a:Account,expectedMint:string){const b=bytes(a);if(a.owner!==SPL_PROGRAM||a.executable||b.length!==165||publicKey(b,0)!==expectedMint||publicKey(b,32)!==CPMM_AUTHORITY||b[108]!==1||b.readUInt32LE(72)!==0||b.readUInt32LE(129)!==0)throw new Error('VAULT_IDENTITY_OR_CONTROL');const amount=b.readBigUInt64LE(64),native=b.readUInt32LE(109);if(expectedMint===WSOL){if(native!==1||BigInt(a.lamports)<b.readBigUInt64LE(113)+amount)throw new Error('WSOL_VAULT_BACKING');}else if(native!==0)throw new Error('TOKEN_VAULT_NATIVE_MISMATCH');return amount;}
export interface PoolProof {assessment:'PASS'|'VETO'|'UNKNOWN';exitSafe:boolean;reasons:string[];pool:string;mint:string;slot:string|null;verifiedAt:string;hash:string;venue:'RAYDIUM_CPMM';vaults:{address:string;mint:string}[];authority:string;facts:unknown;genesis:string|null;revisionHash?:string;revisionReviewId?:string}
export const poolPolicy=z.strictObject({minQuoteReserveLamports:baseUnits,minNonRedeemableLpBps:z.number().int().min(9500).max(10000),programDataHash:z.string().regex(/^[a-f0-9]{64}$/).optional()});
export class CpmmSecurityReader{
 constructor(private readonly rpc:Pick<WalletReadRpc,'read'>,private readonly now=Date.now,private readonly reviewedRevision?:((hash:string)=>Promise<string|null>)){}
 async screen(pool:string,candidate:string,policy=poolPolicy.parse({minQuoteReserveLamports:'1000000000',minNonRedeemableLpBps:9500})):Promise<PoolProof>{
  address.parse(pool);address.parse(candidate);policy=poolPolicy.parse(policy);let facts:unknown=null,slot:string|null=null;let genesis:string|null=null;let exitSafe=false;let revisionHash:string|undefined,revisionReviewId:string|undefined;let vaults:PoolProof['vaults']=[];
  const finish=(assessment:PoolProof['assessment'],...reasons:string[]):PoolProof=>({assessment,exitSafe,reasons,pool,mint:candidate,slot,verifiedAt:new Date(this.now()).toISOString(),hash:sha({pool,candidate,genesis,facts,assessment,reasons,revisionHash,revisionReviewId,exitSafe}),venue:'RAYDIUM_CPMM',vaults,authority:CPMM_AUTHORITY,genesis,facts,...(revisionHash?{revisionHash}:{}),...(revisionReviewId?{revisionReviewId}:{})});
  try{
   const network=await this.rpc.read('getGenesisHash');genesis=address.safeParse(network).success?String(network):null;
   if(genesis!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')return finish('UNKNOWN','POOL_WRONG_NETWORK');
   const first=z.object({context:z.object({slot:z.number().int().positive().safe()}),value:account.nullable()}).parse(await this.rpc.read('getAccountInfo',[pool,{encoding:'base64',commitment:'finalized'}]));facts={first};slot=String(first.context.slot);
   if(!first.value)return finish('UNKNOWN','POOL_NOT_FOUND');if(first.value.owner!==CPMM_PROGRAM||first.value.executable)return finish('UNKNOWN','POOL_VENUE_NOT_SUPPORTED');
   const poolBytes=bytes(first.value),p=decodeCpmmPool(poolBytes);vaults=[{address:p.vaultA,mint:p.mintA},{address:p.vaultB,mint:p.mintB}];
   if(![p.mintA,p.mintB].includes(candidate)||![p.mintA,p.mintB].includes(WSOL)||candidate===WSOL||p.mintA===p.mintB)return finish('VETO','POOL_MINT_PAIR_MISMATCH');
   if(p.programA!==SPL_PROGRAM||p.programB!==SPL_PROGRAM)return finish('VETO','POOL_TOKEN_SEMANTICS_UNSUPPORTED');
   const prog=z.object({context:z.object({slot:z.number().int().positive().safe()}),value:account}).parse(await this.rpc.read('getAccountInfo',[CPMM_PROGRAM,{encoding:'base64',commitment:'finalized',minContextSlot:first.context.slot}]));const pb=bytes(prog.value);
   if(prog.value.owner!==UPGRADE_LOADER||!prog.value.executable||pb.length!==36||pb.readUInt32LE(0)!==2)return finish('VETO','POOL_PROGRAM_LOADER_INVALID');const programData=publicKey(pb,4);
   const keys=[pool,p.vaultA,p.vaultB,p.lpMint,p.mintA,p.mintB,p.config,CPMM_PROGRAM,programData];if(new Set(keys).size!==keys.length)return finish('VETO','POOL_ACCOUNT_ALIAS');
   const snapshot=z.object({context:z.object({slot:z.number().int().positive().safe()}),value:z.array(account.nullable()).length(keys.length)}).parse(await this.rpc.read('getMultipleAccounts',[keys,{encoding:'base64',commitment:'finalized',minContextSlot:Math.max(first.context.slot,prog.context.slot)}]));facts={first,program:prog,keys,snapshot:{context:snapshot.context,value:snapshot.value.map((v,i)=>i===8&&v?{owner:v.owner,executable:v.executable,programDataHeaderBase64:bytes(v).subarray(0,45).toString('base64'),programDataByteLength:bytes(v).length,programDataSha256:sha(bytes(v))}:v)}};slot=String(snapshot.context.slot);
   if(snapshot.context.slot<Math.max(first.context.slot,prog.context.slot)||snapshot.value.some(v=>v===null))return finish('UNKNOWN','POOL_SNAPSHOT_INCOMPLETE');const a=snapshot.value as Account[];
   if(a[0]!.owner!==CPMM_PROGRAM||a[0]!.executable||!bytes(a[0]!).equals(poolBytes)||!bytes(a[7]!).equals(pb)||a[7]!.owner!==UPGRADE_LOADER||!a[7]!.executable)return finish('UNKNOWN','POOL_CHANGED_DURING_PROOF');
   const pd=bytes(a[8]!);if(a[8]!.owner!==UPGRADE_LOADER||a[8]!.executable||pd.length<45||pd.readUInt32LE(0)!==3||pd[12]!>1)return finish('VETO','POOL_PROGRAMDATA_INVALID');
   revisionHash=sha(pd.subarray(45));facts={...facts as object,revisionHash,upgradeAuthority:pd[12]===1?publicKey(pd,13):null};
   if(this.reviewedRevision){try{revisionReviewId=(await this.reviewedRevision(revisionHash))??undefined;}catch{return finish('UNKNOWN','POOL_PROGRAM_REGISTRY_UNAVAILABLE');}if(!revisionReviewId)return finish('UNKNOWN','POOL_PROGRAM_REVISION_REVIEW_REQUIRED');}
   if(!this.reviewedRevision&&pd[12]===1&&policy.programDataHash!==revisionHash)return finish('UNKNOWN','POOL_UPGRADEABLE_REVISION_NOT_PINNED');
   if(p.status&4||p.openTime>BigInt(Math.floor(this.now()/1000)))return finish('VETO','POOL_SWAPS_DISABLED_OR_NOT_OPEN');if(p.creatorFeeEnabled)return finish('UNKNOWN','POOL_CREATOR_FEE_UNQUALIFIED');
   const cfg=bytes(a[6]!);if(a[6]!.owner!==CPMM_PROGRAM||a[6]!.executable||cfg.length!==236||!cfg.subarray(0,8).equals(Buffer.from(sha('account:AmmConfig'),'hex').subarray(0,8))||cfg.readBigUInt64LE(12)>10000n)return finish('VETO','POOL_CONFIG_OR_FEE_UNSAFE');
   const ma=mint(a[4]!),mb=mint(a[5]!),lp=mint(a[3]!);const target=p.mintA===candidate?ma:mb;
   if((p.mintA===WSOL?ma:mb).decimals!==9||ma.decimals!==p.decimalsA||mb.decimals!==p.decimalsB||lp.decimals!==p.lpDecimals||lp.authority!==CPMM_AUTHORITY||lp.freeze!==null||target.freeze!==null)return finish('VETO','POOL_MINT_AUTHORITY_OR_DECIMALS');
   const va=vault(a[1]!,p.mintA),vb=vault(a[2]!,p.mintB);if(va<=p.feesA||vb<=p.feesB)return finish('VETO','POOL_NO_PRINCIPAL_LIQUIDITY');const ra=va-p.feesA,rb=vb-p.feesB;
   if(p.lpSupply===0n||lp.supply>p.lpSupply)return finish('VETO','POOL_LP_SUPPLY_CONFLICT');const nonRedeemable=p.lpSupply-lp.supply;
   exitSafe=true;
   facts={...facts as object,principalA:ra.toString(),principalB:rb.toString(),trackedLpSupply:p.lpSupply.toString(),redeemableLpSupply:lp.supply.toString(),nonRedeemableLpBps:(nonRedeemable*10000n/p.lpSupply).toString(),lpAssumption:'SUPPLY_DEFICIT_NON_REDEEMABLE_INCLUDES_INITIAL_UNMINTED_LOCK; NOT_A_LOCKER_CLAIM'};
   if(target.authority!==null)return finish('VETO','POOL_TOKEN_MINT_AUTHORITY_ACTIVE');
   if((p.mintA===WSOL?ra:rb)<BigInt(policy.minQuoteReserveLamports))return finish('VETO','POOL_QUOTE_RESERVE_BELOW_POLICY');
   if(nonRedeemable*10000n<p.lpSupply*BigInt(policy.minNonRedeemableLpBps))return finish('VETO','POOL_LP_REDEEMABLE_RUG_RISK');
   return finish('PASS','CPMM_SAME_SLOT_VAULT_MINT_LP_PROOF','PROGRAM_REVISION_BOUND');
  }catch(error){return finish('UNKNOWN',error instanceof ProviderError?'POOL_PROVIDER_'+error.code:error instanceof z.ZodError?'POOL_RPC_SCHEMA_UNVERIFIABLE':'POOL_LAYOUT_UNVERIFIABLE');}
 }
}
