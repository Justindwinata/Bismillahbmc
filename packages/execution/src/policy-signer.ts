import {checkSigningPolicy,type Certificate,type SigningMandate,type GuardPermit} from './signing-policy.js';
import type {VerifyContext,ExecutionIntent} from './verifier.js';
import type {SigningStore} from '../../storage/src/signing.js';
export type SignPolicyProof={mandate:Certificate<SigningMandate>;permit:Certificate<GuardPermit>};
export type SignedResult={transaction:string;signature:string};
export interface IdempotentSignerProvider{signOnce(requestId:string,wire:Buffer,intent:ExecutionIntent,context:VerifyContext,proof:SignPolicyProof):Promise<SignedResult>;lookup(requestId:string):Promise<SignedResult|null>}
/** No submission method. On uncertain signing, query the same request only; never create a replacement. */
export class PolicyBoundSigner{
 constructor(private readonly journal:SigningStore,private readonly provider:IdempotentSignerProvider,private readonly authorities:{owner:string;governor:string}){}
 async sign(wire:Buffer,intent:ExecutionIntent,context:VerifyContext,mandate:Certificate<SigningMandate>,permit:Certificate<GuardPermit>){
  const bytes=Buffer.from(wire),authority=Object.freeze({...this.authorities}),frozenContext=JSON.parse(JSON.stringify(context)) as VerifyContext,certificate=structuredClone(mandate),guard=structuredClone(permit),approval=checkSigningPolicy(bytes,intent,frozenContext,certificate,guard,authority),approved=approval.verified.intent,claim=await this.journal.reserve(approval,bytes);if(claim.kind==='SIGNED')return {transaction:String(claim.row.signed_wire),signature:String(claim.row.signature)};
  try{const result=claim.kind==='SIGN_ONCE'?await this.provider.signOnce(approved.id,Buffer.from(bytes),structuredClone(approved),JSON.parse(JSON.stringify(frozenContext)) as VerifyContext,structuredClone({mandate:certificate,permit:guard})):await this.provider.lookup(approved.id);if(!result)throw new Error('SIGNATURE_OUTCOME_UNKNOWN');checkSigningPolicy(bytes,approved,frozenContext,certificate,guard,authority);return await this.journal.complete(approved.id,claim.row.lease_token,approved,result);}catch(error){await this.journal.unknown(approved.id,claim.row.lease_token);throw error;}
 }
}
