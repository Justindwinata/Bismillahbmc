import {createPublicKey,verify} from 'node:crypto';
import {z} from 'zod';
import {address,baseUnits} from '../../domain/src/index.js';
import {keyBytes} from '../../connectors/src/pool-security.js';
import type {WalletReadRpc} from '../../connectors/src/wallet.js';
import {hash,intentSchema,verifyTransaction,TOKEN,type VerifyContext} from './verifier.js';
import {MAINNET_GENESIS} from './rpc-context.js';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function signatureBase58(bytes:Buffer){if(bytes.length!==64)throw new Error('SIGNATURE_LENGTH');let n=BigInt('0x'+bytes.toString('hex')),out='';while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}for(const byte of bytes){if(byte)break;out='1'+out;}return out;}
const slot=z.number().int().safe().positive(),lamports=z.number().int().safe().nonnegative();
const tokenBalance=z.object({accountIndex:z.number().int().nonnegative(),mint:address,owner:address.optional(),programId:address.optional(),uiTokenAmount:z.object({amount:baseUnits,decimals:z.number().int().min(0).max(255)})});
const receiptSchema=z.object({slot,blockTime:z.number().int().safe().nullable(),version:z.union([z.literal('legacy'),z.literal(0)]).optional(),transaction:z.tuple([z.string().min(1),z.literal('base64')]),meta:z.object({err:z.unknown(),fee:lamports,preBalances:z.array(lamports).max(64),postBalances:z.array(lamports).max(64),preTokenBalances:z.array(tokenBalance).optional(),postTokenBalances:z.array(tokenBalance).optional(),loadedAddresses:z.object({writable:z.array(address).max(64),readonly:z.array(address).max(64)}).optional()})});
export type SignedTransferRecord={intent:unknown;signedWire:Buffer;signature:string;verifiedAt:number;verificationContext:VerifyContext};
const stable=(value:unknown):string=>JSON.stringify(value,(_key,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
/** Observes only. Never submits or grants authority, and never labels a fixture as real chain settlement. */
export async function reconcileFinalizedTransfer(record:SignedTransferRecord,rpc:Pick<WalletReadRpc,'read'>,sourceClass:'LIVE_CHAIN_RPC'|'REPLAY_TEST',now=Date.now){
 const receipts:{method:string;hash:string;observedAt:string}[]=[];const observed=()=>new Date(now()).toISOString();
 const unknown=(reason:string)=>({status:'UNKNOWN' as const,reason,sourceClass,chainVerified:false,financialAuthorization:'NONE',receipt:null,accounting:null,provenance:receipts});
 const read=async(method:Parameters<WalletReadRpc['read']>[0],params:unknown[]=[])=>{const raw=await rpc.read(method,params);receipts.push({method,hash:hash(JSON.stringify(raw)),observedAt:observed()});return raw;};
 try{
  const intent=intentSchema.parse(record.intent);if(intent.mode!=='MAINNET'||intent.genesis!==MAINNET_GENESIS)throw new Error('MAINNET_OBSERVATION_RECORD_REQUIRED');
  const signed=Buffer.from(record.signedWire),signature=z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/).parse(record.signature);if(signed[0]!==1||signed.length<100||signatureBase58(signed.subarray(1,65))!==signature)throw new Error('RECORDED_SIGNATURE_MISMATCH');
  // Only the original immutable verification time/context is used. Quote expiry after landing is not a failed settlement.
  const context={...record.verificationContext,now:record.verifiedAt,lookups:record.verificationContext.lookups.map(p=>({...p,data:Buffer.isBuffer(p.data)?p.data:Buffer.from(z.object({type:z.literal('Buffer'),data:z.array(z.number().int().min(0).max(255)).max(56+256*32)}).parse(p.data).data)}))};
  const verified=verifyTransaction(Buffer.concat([Buffer.from([1]),Buffer.alloc(64),signed.subarray(65)]),intent,context);
  const key=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),keyBytes(intent.payer)])});if(!verify(null,verified.message,key,signed.subarray(1,65)))throw new Error('RECORDED_CRYPTOGRAPHIC_SIGNATURE_INVALID');
  if(await read('getGenesisHash')!==MAINNET_GENESIS)throw new Error('RECEIPT_WRONG_NETWORK');
  const statuses=z.object({context:z.object({slot}),value:z.array(z.object({slot,err:z.unknown(),confirmationStatus:z.enum(['processed','confirmed','finalized'])}).nullable()).length(1)}).parse(await read('getSignatureStatuses',[[signature],{searchTransactionHistory:true}]));
  const status=statuses.value[0];if(!status||status.confirmationStatus!=='finalized')return {...unknown('FINALITY_NOT_REACHED'),status:'PENDING' as const};if(status.err===undefined)throw new Error('STATUS_ERROR_UNKNOWN');
  const raw=await read('getTransaction',[signature,{commitment:'finalized',encoding:'base64',maxSupportedTransactionVersion:0}]);if(raw===null)return unknown('FINALIZED_RECEIPT_UNAVAILABLE');const receipt=receiptSchema.parse(raw);
  if(receipt.meta.err===undefined||stable(receipt.meta.err)!==stable(status.err)||receipt.slot!==status.slot||receipt.slot<context.minimumSlot||receipt.slot>statuses.context.slot)throw new Error('FINALITY_RECEIPT_DISAGREEMENT');
  const bytes=Buffer.from(receipt.transaction[0],'base64');if(bytes.toString('base64')!==receipt.transaction[0]||!bytes.equals(signed))throw new Error('LANDED_TRANSACTION_MUTATED');
  if(receipt.version!==undefined&&receipt.version!==(verified.version==='legacy'?'legacy':0))throw new Error('RECEIPT_VERSION_MISMATCH');
  const keys=verified.resolvedAccounts,loaded=receipt.meta.loadedAddresses;if(verified.version==='legacy'&&((loaded?.writable.length??0)+(loaded?.readonly.length??0)>0))throw new Error('RECEIPT_LOADED_ACCOUNTS_MISMATCH');if(verified.version==='v0'&&JSON.stringify([...(loaded?.writable??[]),...(loaded?.readonly??[])])!==JSON.stringify(keys.slice(verified.staticAccountCount)))throw new Error('RECEIPT_LOADED_ACCOUNTS_MISMATCH');
  if(receipt.meta.preBalances.length!==keys.length||receipt.meta.postBalances.length!==keys.length)throw new Error('RECEIPT_ACCOUNT_BALANCES_INCOMPLETE');const fee=BigInt(receipt.meta.fee);if(fee>BigInt(intent.maxFee))throw new Error('FINAL_FEE_CAP_EXCEEDED');
  const succeeded=receipt.meta.err===null,nativeDeltas=new Map<string,bigint>([[intent.payer,-fee]]),tokenDeltas=new Map<string,{mint:string;owner:string;decimals:number;delta:bigint}>();let spent=0n;
  const add=(key:string,amount:bigint)=>nativeDeltas.set(key,(nativeDeltas.get(key)??0n)+amount);
  for(const i of intent.instructions){const amount=succeeded?BigInt(i.amount):0n;spent+=amount;if(i.kind==='SOL_TRANSFER'){add(intent.payer,-amount);add(i.destination,amount);}else if(i.kind==='SPL_TRANSFER_CHECKED'){for(const [account,owner,sign]of [[i.source,intent.payer,-1n],[i.destination,i.destinationOwner,1n]] as const){const old=tokenDeltas.get(account);if(old&&(old.mint!==i.mint||old.owner!==owner||old.decimals!==i.decimals))throw new Error('TOKEN_IDENTITY_CONFLICT');tokenDeltas.set(account,{mint:i.mint,owner,decimals:i.decimals,delta:(old?.delta??0n)+sign*amount});if(i.mint==='So11111111111111111111111111111111111111112')add(account,sign*amount);}}else throw new Error('SWAP_RECEIPT_ADAPTER_REQUIRED');}
  keys.forEach((key,index)=>{if(BigInt(receipt.meta.postBalances[index]!)-BigInt(receipt.meta.preBalances[index]!)!==(nativeDeltas.get(key)??0n))throw new Error('NATIVE_BALANCE_RECONCILIATION_FAILED');});
  const pre=receipt.meta.preTokenBalances??[],post=receipt.meta.postTokenBalances??[];for(const list of [pre,post])if(new Set(list.map(b=>b.accountIndex)).size!==list.length||list.some(b=>b.accountIndex>=keys.length))throw new Error('TOKEN_ACCOUNT_INDEX_CONFLICT');
  const indexes=new Set([...pre,...post].map(b=>b.accountIndex));for(const index of indexes){const before=pre.find(b=>b.accountIndex===index),after=post.find(b=>b.accountIndex===index),expected=tokenDeltas.get(keys[index]!);if(!expected)throw new Error('TOKEN_RECEIPT_ACCOUNT_UNDECLARED');if(!before||!after||!before.owner||!after.owner||before.owner!==after.owner||before.mint!==after.mint||before.uiTokenAmount.decimals!==after.uiTokenAmount.decimals||(before.programId&&before.programId!==TOKEN)||(after.programId&&after.programId!==TOKEN))throw new Error('TOKEN_RECEIPT_IDENTITY_UNKNOWN');if(expected&&(expected.owner!==before.owner||expected.mint!==before.mint||expected.decimals!==before.uiTokenAmount.decimals))throw new Error('TOKEN_RECEIPT_IDENTITY_MISMATCH');if(BigInt(after.uiTokenAmount.amount)-BigInt(before.uiTokenAmount.amount)!==(expected?.delta??0n))throw new Error('TOKEN_BALANCE_RECONCILIATION_FAILED');}
  for(const account of tokenDeltas.keys())if(!pre.some(b=>keys[b.accountIndex]===account)||!post.some(b=>keys[b.accountIndex]===account))throw new Error('TOKEN_RECEIPT_BALANCES_INCOMPLETE');
  return {status:'RECONCILED_OBSERVATION' as const,reason:succeeded?'FINALIZED_TRANSFER_OBSERVED':'FINALIZED_FAILURE_FEE_OBSERVED',sourceClass,chainVerified:sourceClass==='LIVE_CHAIN_RPC',financialAuthorization:'NONE',scope:'TRANSFER_ONLY_NOT_SWAP',receipt:{signature,slot:String(receipt.slot),sourceAt:receipt.blockTime===null?null:new Date(receipt.blockTime*1000).toISOString(),hash:hash(JSON.stringify(raw)),messageHash:verified.messageHash,success:succeeded},accounting:{spent:spent.toString(),fee:fee.toString(),pnl:null,asset:intent.instructions[0]!.kind==='SOL_TRANSFER'?'NATIVE_SOL':intent.instructions[0]!.mint},provenance:receipts};
 }catch(error){return unknown(error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'RECEIPT_OR_RECORDED_PROOF_INVALID');}
}

// Shared RPC receipt envelope; instruction semantics remain independently checked by each adapter.
export {receiptSchema as finalizedReceiptSchema};
