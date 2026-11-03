import {createPublicKey,verify} from 'node:crypto';
import {z} from 'zod';
import {address,baseUnits} from '../../domain/src/index.js';
import {keyBytes} from '../../connectors/src/pool-security.js';
import {hash,HARNESS_GENESIS,intentSchema,type VerifyContext} from './verifier.js';
import {verifyExecutionTransaction} from './swap-verifier.js';
const digest=z.string().regex(/^[a-f0-9]{64}$/),time=z.number().int().safe().nonnegative();
export const signingMandate=z.strictObject({id:z.uuid(),mode:z.enum(['HARNESS','MAINNET']),genesis:z.string().min(1),payer:address,policyHash:digest,issuedAt:time,expiresAt:time,maxOrders:z.number().int().min(1).max(1000),maxFeePerOrder:baseUnits,maxTotalFees:baseUnits,spendCaps:z.record(address,baseUnits),pool:address,source:address,destination:address,inputMint:address,outputMint:address});
export const guardPermit=z.strictObject({requestId:z.uuid(),correlationId:z.uuid(),intentHash:digest,quoteHash:digest,policyHash:digest,side:z.enum(['ENTRY','PROTECTIVE_EXIT']),approvedAt:time,expiresAt:time,decision:z.literal('ALLOW')});
export type SigningMandate=z.infer<typeof signingMandate>;
export type GuardPermit=z.infer<typeof guardPermit>;
export type Certificate<T>={payload:T;signature:string};
export function signingCertificateMessage(domain:'MANDATE'|'GUARD',payload:SigningMandate|GuardPermit){return Buffer.from('SENTINEL_SIGNER_'+domain+'_V1\0'+JSON.stringify(payload));}
function certificate<T>(domain:'MANDATE'|'GUARD',schema:z.ZodType<T>,input:unknown,authority:string):T{
 const parsed=z.strictObject({payload:schema,signature:z.string().max(88)}).parse(input),signature=Buffer.from(parsed.signature,'base64');
 const key=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),keyBytes(address.parse(authority))])});
 if(signature.length!==64||signature.toString('base64')!==parsed.signature||!verify(null,signingCertificateMessage(domain,parsed.payload as SigningMandate|GuardPermit),key,signature))throw new Error('SIGNER_CERTIFICATE_INVALID');return parsed.payload;
}
/** Deployment-pinned authorities, not request-provided keys. This release permits only non-chain HARNESS signing. */
export function checkSigningPolicy(raw:Buffer,input:unknown,context:VerifyContext,mandateCertificate:unknown,permitCertificate:unknown,authorities:{owner:string;governor:string},now=Date.now()){
 if(authorities.owner===authorities.governor)throw new Error('SIGNER_AUTHORITY_SEPARATION');
 const intent=intentSchema.parse(input);if(intent.mode!=='HARNESS'||intent.genesis!==HARNESS_GENESIS)throw new Error('PRODUCTION_SIGNING_DISABLED');
 const mandate=certificate('MANDATE',signingMandate,mandateCertificate,authorities.owner),permit=certificate('GUARD',guardPermit,permitCertificate,authorities.governor),verified=verifyExecutionTransaction(raw,intent,{...context,now});
 if(mandate.mode!==intent.mode||mandate.genesis!==intent.genesis||mandate.payer!==intent.payer||mandate.policyHash!==intent.policyHash||now<mandate.issuedAt||now>=mandate.expiresAt||mandate.expiresAt<=mandate.issuedAt||BigInt(intent.maxFee)>BigInt(mandate.maxFeePerOrder))throw new Error('SIGNER_MANDATE_VETO');
 if(permit.requestId!==intent.id||permit.correlationId!==intent.correlationId||permit.intentHash!==verified.intentHash||permit.quoteHash!==intent.quoteHash||permit.policyHash!==intent.policyHash||now<permit.approvedAt||now>=permit.expiresAt||permit.expiresAt>Date.parse(intent.expiresAt)||permit.expiresAt>mandate.expiresAt||permit.expiresAt-permit.approvedAt>30000)throw new Error('SIGNER_GUARD_VETO');
 const s=intent.instructions[0];if(intent.instructions.length!==1||s?.kind!=='JUPITER_CPMM_SWAP')throw new Error('SIGNER_SWAP_SCOPE_REQUIRED');
 const entry=s.pool===mandate.pool&&s.source===mandate.source&&s.destination===mandate.destination&&s.mint===mandate.inputMint&&s.outputMint===mandate.outputMint,exit=s.pool===mandate.pool&&s.source===mandate.destination&&s.destination===mandate.source&&s.mint===mandate.outputMint&&s.outputMint===mandate.inputMint;
 if(!(entry&&permit.side==='ENTRY')&&!(exit&&permit.side==='PROTECTIVE_EXIT'))throw new Error('SIGNER_ROUTE_VETO');if(!mandate.spendCaps[s.mint]||BigInt(s.amount)>BigInt(mandate.spendCaps[s.mint]!))throw new Error('SIGNER_SPEND_CAP');
 return {mandate,permit,mandateCertificate:{payload:mandate,signature:(mandateCertificate as Certificate<SigningMandate>).signature,issuer:authorities.owner},guardCertificate:{payload:permit,signature:(permitCertificate as Certificate<GuardPermit>).signature,issuer:authorities.governor},verified,mint:s.mint,amount:s.amount,maxFee:intent.maxFee,requestHash:hash(JSON.stringify({intentHash:verified.intentHash,wireHash:verified.wireHash,mandateId:mandate.id,permit}))};
}
export const productionSigningCapability={status:'DISABLED',reason:'PRODUCTION_CODE_AND_ACTIVATION_GATES_OPEN',softwareScope:'HARNESS_PROTOCOL_ONLY_PRODUCTION_CODE_OPEN',mainnetSigning:false,submission:false} as const;
