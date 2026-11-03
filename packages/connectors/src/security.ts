import { createHash } from 'node:crypto';
import { z } from 'zod';
import { address,baseUnits } from '../../domain/src/index.js';
import { WalletReadRpc } from './wallet.js';
export const TOKEN_2022_PROGRAM='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const SPL_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const slot=z.number().int().positive().safe();
const mintInfo=z.object({mintAuthority:address.nullable(),freezeAuthority:address.nullable(),supply:baseUnits,decimals:z.number().int().min(0).max(255),isInitialized:z.literal(true),extensions:z.array(z.object({extension:z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/),state:z.unknown().optional()})).max(64).optional()});
export interface MintScreen {mint:string;decimals:number|null;transferSafe:boolean;slot:string|null;verifiedAt:string;hash:string;dataClass:'LIVE_CHAIN';assessment:'PASS'|'VETO'|'UNKNOWN';reasons:string[];security:{mintAuthority:string|null;freezeAuthority:string|null;tokenProgram:string;extensions:string[];holderOwnershipVerified:boolean;assessment:'PASS'|'VETO'|'UNKNOWN';reasons:string[]};facts:unknown}
export class MintSecurityReader {
 constructor(private readonly rpc:Pick<WalletReadRpc,'read'>,private readonly now=Date.now){}
 async screen(mint:string,maxOwnerBps:number,verifiedVault?:{address:string;mint:string;authority:string;proofHash:string}):Promise<MintScreen>{
  address.parse(mint);z.number().int().min(1).max(10000).parse(maxOwnerBps);
  let transferSafe=false;let decimals:number|null=null;let observedSlot:string|null=null;let facts:unknown=null;
  let security:MintScreen['security']={mintAuthority:null,freezeAuthority:null,tokenProgram:'UNKNOWN',extensions:[],holderOwnershipVerified:false,assessment:'UNKNOWN',reasons:[]};
  const finish=(assessment:MintScreen['assessment'],...reasons:string[]):MintScreen=>({mint,decimals,transferSafe,slot:observedSlot,verifiedAt:new Date(this.now()).toISOString(),hash:createHash('sha256').update(JSON.stringify({mint,facts,assessment,reasons})).digest('hex'),dataClass:'LIVE_CHAIN',assessment,reasons,security:{...security,assessment,reasons},facts});
  try{
   if(await this.rpc.read('getGenesisHash')!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')return finish('UNKNOWN','WRONG_NETWORK');
   const raw=await this.rpc.read('getAccountInfo',[mint,{encoding:'jsonParsed',commitment:'finalized'}]);facts={mint:raw};
   const account=z.object({context:z.object({slot}),value:z.object({owner:address,executable:z.literal(false),data:z.unknown()}).nullable()}).parse(raw);
   observedSlot=String(account.context.slot);
   if(!account.value)return finish('UNKNOWN','MINT_ACCOUNT_NOT_FOUND');
   security.tokenProgram=account.value.owner;
   if(![SPL_PROGRAM,TOKEN_2022_PROGRAM].includes(account.value.owner))return finish('VETO','TOKEN_PROGRAM_NOT_SUPPORTED');
   const parsed=z.object({parsed:z.object({type:z.literal('mint'),info:mintInfo})}).parse(account.value.data).parsed.info;
   decimals=parsed.decimals;
   security={...security,mintAuthority:parsed.mintAuthority,freezeAuthority:parsed.freezeAuthority,extensions:(parsed.extensions??[]).map(e=>e.extension)};
   transferSafe=account.value.owner===SPL_PROGRAM&&parsed.freezeAuthority===null&&security.extensions.length===0;
   if(parsed.mintAuthority!==null)return finish('VETO','MINT_AUTHORITY_ACTIVE');
   if(parsed.freezeAuthority!==null)return finish('VETO','FREEZE_AUTHORITY_ACTIVE');
   if(security.extensions.length)return finish('VETO',...security.extensions.map(name=>'UNSUPPORTED_TOKEN_EXTENSION_'+name.toUpperCase()));
   if(account.value.owner===TOKEN_2022_PROGRAM)return finish('VETO','TOKEN_2022_BASE_PROGRAM_NOT_QUALIFIED');
   if(BigInt(parsed.supply)===0n)return finish('UNKNOWN','SUPPLY_ZERO_OR_NATIVE_WRAPPER');
   const largestRaw=await this.rpc.read('getTokenLargestAccounts',[mint,{commitment:'finalized'}]);
   const largest=z.object({context:z.object({slot}),value:z.array(z.object({address,amount:baseUnits,decimals:z.number().int()})).max(20)}).parse(largestRaw);
   facts={mint:raw,largest:largestRaw};
   if(largest.context.slot<account.context.slot||largest.value.some(v=>v.decimals!==parsed.decimals))return finish('UNKNOWN','SLOT_OR_DECIMALS_CONFLICT');
   if(!largest.value.length)return finish('UNKNOWN','HOLDER_DATA_UNAVAILABLE');
   const ownersRaw=await this.rpc.read('getMultipleAccounts',[largest.value.map(v=>v.address),{encoding:'jsonParsed',commitment:'finalized',minContextSlot:largest.context.slot}]);
   const owners=z.object({context:z.object({slot}),value:z.array(z.object({owner:address,data:z.object({parsed:z.object({type:z.literal('account'),info:z.object({mint:address,owner:address,state:z.literal('initialized'),tokenAmount:z.object({amount:baseUnits,decimals:z.number().int()})})})})}).nullable()).max(20)}).parse(ownersRaw);
   facts={mint:raw,largest:largestRaw,owners:ownersRaw};
   if(owners.context.slot<largest.context.slot||owners.value.length!==largest.value.length||new Set(largest.value.map(v=>v.address)).size!==largest.value.length)return finish('UNKNOWN','HOLDER_CONTEXT_CONFLICT');
   const distribution=new Map<string,bigint>();let total=0n;
   for(const [i,entry]of owners.value.entries()){
    const expected=largest.value[i]!;const info=entry?.data.parsed.info;
    if(!entry||entry.owner!==SPL_PROGRAM||!info||info.mint!==mint||info.tokenAmount.amount!==expected.amount||info.tokenAmount.decimals!==parsed.decimals)return finish('UNKNOWN','TOKEN_ACCOUNT_OWNERSHIP_UNVERIFIED');
    const amount=BigInt(expected.amount);if(!(verifiedVault&&expected.address===verifiedVault.address&&info.mint===verifiedVault.mint&&info.owner===verifiedVault.authority&&/^[a-f0-9]{64}$/.test(verifiedVault.proofHash)))distribution.set(info.owner,(distribution.get(info.owner)??0n)+amount);total+=amount;
   }
   if([...distribution.values()].some(v=>v*10000n>BigInt(parsed.supply)*BigInt(maxOwnerBps)))return finish('VETO','HOLDER_CONCENTRATION_HIGH');
   if(total>BigInt(parsed.supply))return finish('UNKNOWN','HOLDER_SUPPLY_CONFLICT');
   const remaining=BigInt(parsed.supply)-total;
   if(remaining>0n){
    if(remaining*10000n>BigInt(parsed.supply)*BigInt(maxOwnerBps)||[...distribution.values()].some(v=>(v+remaining)*10000n>BigInt(parsed.supply)*BigInt(maxOwnerBps)))return finish('UNKNOWN','HOLDER_DISTRIBUTION_INCOMPLETE');
    const reread=z.object({context:z.object({slot}),value:z.object({owner:address,data:z.object({parsed:z.object({info:mintInfo})})})}).parse(await this.rpc.read('getAccountInfo',[mint,{encoding:'jsonParsed',commitment:'finalized',minContextSlot:owners.context.slot}]));
    facts={mint:raw,largest:largestRaw,owners:ownersRaw,mintAfter:reread,remainingSupply:remaining.toString(),bound:'ALL_UNOBSERVED_SUPPLY_ASSIGNED_TO_ANY_ONE_OWNER',verifiedVault:verifiedVault??null};
    if(reread.context.slot<owners.context.slot||reread.value.owner!==SPL_PROGRAM||reread.value.data.parsed.info.supply!==parsed.supply||reread.value.data.parsed.info.mintAuthority!==null||reread.value.data.parsed.info.freezeAuthority!==null)return finish('UNKNOWN','HOLDER_SUPPLY_CHANGED');
   }
   security.holderOwnershipVerified=true;
   return finish('PASS',remaining===0n?'FINALIZED_MINT_AND_COMPLETE_HOLDER_ACCOUNT_SAMPLE':'FINALIZED_HOLDER_OWNER_UPPER_BOUND');
  }catch{return finish('UNKNOWN','RPC_SCHEMA_OR_PROVIDER_UNAVAILABLE');}
 }
}
