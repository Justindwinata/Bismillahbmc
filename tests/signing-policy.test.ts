import {test,expect} from 'vitest';
import {swapFixture} from '../scripts/fixtures/harness-swap.js';
import {harnessSigningAuthority} from '../scripts/fixtures/signing-authority.js';
import {checkSigningPolicy} from '../packages/execution/src/signing-policy.js';
const fixture=()=>{const f=swapFixture(),a=harnessSigningAuthority(f.intent),p=a.permit(f.intent);return {f,a,p};};
test('independent signed mandate and Guard bind exact intent, payer, pool, units and protective-exit direction',()=>{
 const {f,a,p}=fixture();expect(checkSigningPolicy(f.wire,f.intent,f.context,a.mandate,p,a.authorities).amount).toBe('100');
 const sell=swapFixture(f.intent.payer,f.addresses,'SELL','197','98');expect(checkSigningPolicy(sell.wire,sell.intent,sell.context,a.mandate,a.permit(sell.intent),a.authorities).permit.side).toBe('PROTECTIVE_EXIT');
 const foreign=harnessSigningAuthority(f.intent);expect(()=>checkSigningPolicy(f.wire,f.intent,f.context,a.mandate,p,foreign.authorities)).toThrow('CERTIFICATE');
 for(const changed of [{...p,payload:{...p.payload,side:'PROTECTIVE_EXIT'}},{...p,payload:{...p.payload,intentHash:'0'.repeat(64)}},{...p,signature:Buffer.alloc(64).toString('base64')}])expect(()=>checkSigningPolicy(f.wire,f.intent,f.context,a.mandate,changed,a.authorities)).toThrow('CERTIFICATE');
 expect(()=>checkSigningPolicy(f.wire,f.intent,f.context,{...a.mandate,payload:{...a.mandate.payload,maxOrders:1000}},p,a.authorities)).toThrow('CERTIFICATE');
});
test('production signing, stale mandate/Guard/proof, replayed request and mutated wire stay vetoed',()=>{
 const {f,a,p}=fixture();expect(()=>checkSigningPolicy(f.wire,{...f.intent,mode:'MAINNET'},f.context,a.mandate,p,a.authorities)).toThrow('PRODUCTION_SIGNING_DISABLED');
 expect(()=>checkSigningPolicy(f.wire,f.intent,f.context,a.mandate,p,a.authorities,p.payload.expiresAt)).toThrow();
 const next=swapFixture(f.intent.payer,f.addresses);expect(()=>checkSigningPolicy(next.wire,next.intent,next.context,a.mandate,p,a.authorities)).toThrow('GUARD');
 const changed=Buffer.from(f.wire);changed[changed.length-3]=changed[changed.length-3]!^1;expect(()=>checkSigningPolicy(changed,f.intent,f.context,a.mandate,p,a.authorities)).toThrow();
 const small=harnessSigningAuthority(f.intent,{spendCap:'99'});expect(()=>checkSigningPolicy(f.wire,f.intent,f.context,small.mandate,small.permit(f.intent),small.authorities)).toThrow('SPEND_CAP');
});

test('valid certificate signatures cannot bypass binding, time, fee, route or distinct-authority policy',async()=>{
 const {generateKeyPairSync,sign}=await import('node:crypto'),{keyString}=await import('../packages/connectors/src/pool-security.js'),{signingMandate,guardPermit,signingCertificateMessage}=await import('../packages/execution/src/signing-policy.js');
 const {f,a,p}=fixture(),owner=generateKeyPairSync('ed25519'),governor=generateKeyPairSync('ed25519'),pub=(k:typeof owner.publicKey)=>keyString(k.export({format:'der',type:'spki'}).subarray(-32)),authorities={owner:pub(owner.publicKey),governor:pub(governor.publicKey)},cert=(patch:Record<string,unknown>={})=>{const payload=signingMandate.parse({...a.mandate.payload,...patch});return {payload,signature:sign(null,signingCertificateMessage('MANDATE',payload),owner.privateKey).toString('base64')};},permit=(patch:Record<string,unknown>={})=>{const payload=guardPermit.parse({...p.payload,...patch});return {payload,signature:sign(null,signingCertificateMessage('GUARD',payload),governor.privateKey).toString('base64')};};
 expect(()=>checkSigningPolicy(f.wire,f.intent,f.context,cert(),permit(),{owner:authorities.owner,governor:authorities.owner})).toThrow('AUTHORITY_SEPARATION');
 const now=Date.now();for(const patch of [{mode:'MAINNET'},{genesis:'WRONG'},{payer:f.swap.pool},{policyHash:'0'.repeat(64)},{issuedAt:now+10000},{expiresAt:now-1},{issuedAt:now+10000,expiresAt:now+9999},{maxFeePerOrder:'9'}])expect(()=>checkSigningPolicy(f.wire,f.intent,f.context,cert(patch),permit(),authorities,now)).toThrow('MANDATE_VETO');
 for(const patch of [{requestId:crypto.randomUUID()},{correlationId:crypto.randomUUID()},{intentHash:'0'.repeat(64)},{quoteHash:'0'.repeat(64)},{policyHash:'0'.repeat(64)},{approvedAt:now+10000},{expiresAt:now-1},{expiresAt:Date.parse(f.intent.expiresAt)+1},{approvedAt:now-31000},{side:'PROTECTIVE_EXIT'}])expect(()=>checkSigningPolicy(f.wire,f.intent,f.context,cert(),permit(patch),authorities,now)).toThrow();
 for(const patch of [{pool:f.intent.payer},{source:f.swap.pool},{destination:f.swap.pool},{inputMint:f.swap.pool},{outputMint:f.swap.pool}])expect(()=>checkSigningPolicy(f.wire,f.intent,f.context,cert(patch),permit(),authorities,now)).toThrow('ROUTE_VETO');
 expect(()=>checkSigningPolicy(f.wire,f.intent,f.context,cert({spendCaps:{[f.swap.mint]:'99'}}),permit(),authorities,now)).toThrow('SPEND_CAP');expect(()=>checkSigningPolicy(f.wire,f.intent,f.context,cert({spendCaps:{}}),permit(),authorities,now)).toThrow('SPEND_CAP');
});
