import {checkSigningPolicy} from './signing-policy.js';
import {address} from '../../domain/src/index.js';
import {verifyExecutionTransaction} from './swap-verifier.js';
import { generateKeyPairSync, sign } from 'node:crypto';
import { keyString } from '../../connectors/src/pool-security.js';
import { HARNESS_GENESIS } from './verifier.js';
const pair = generateKeyPairSync('ed25519'), publicKey = keyString(pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
let signingAuthorities:{owner:string;governor:string}|undefined;
let destination: string | null = null;let swapMandate:{pool:string;source:string;destination:string;mint:string;outputMint:string}|undefined;
const signed = new Map<string, {
    hash: string;
    transaction: string;
    signature: string;
}>();
process.on('message', (message: unknown) => {
    try {
        const m = message as {
            id: string;
            method: string;
            signingAuthorities?:{owner:string;governor:string};policy?:import('./policy-signer.js').SignPolicyProof;
            intentId?:string;
            destination?: string;swapMandate?:typeof swapMandate;context?:import('./verifier.js').VerifyContext;
            wire?: string;
            intent?: unknown;
        };
        if (m.method === 'init' && !destination && m.destination) {
            destination = m.destination;swapMandate=m.swapMandate;
            process.send?.({ id: m.id, publicKey });
            return;
        }
        if(m.method==='require-policy'){if(!destination||signingAuthorities||signed.size||!m.signingAuthorities)throw new Error('POLICY_CONFIGURATION_DENIED');signingAuthorities={owner:address.parse(m.signingAuthorities.owner),governor:address.parse(m.signingAuthorities.governor)};process.send?.({id:m.id,configured:'true'});return;}
        if(m.method==='lookup'&&destination){const old=signed.get(m.intentId??'');process.send?.({id:m.id,found:old?'true':'false',...old});return;}
        if (m.method !== 'sign' || !destination || !m.wire)
            throw new Error('HARNESS_SIGNER_NOT_READY');
        const raw = Buffer.from(m.wire, 'base64'), result = verifyExecutionTransaction(raw, m.intent, {...(m.context??{genesis:HARNESS_GENESIS,feeLamports:'5',minimumSlot:0,lookups:[],tokenAccounts:{}}),now:Date.now()});
        if (result.intent.mode !== 'HARNESS' || result.intent.payer !== publicKey || BigInt(result.intent.maxSpend) > 1000n || BigInt(result.intent.maxFee) > 10n || result.intent.instructions.some(i => i.kind==='JUPITER_CPMM_SWAP'?(!swapMandate||i.pool!==swapMandate.pool||!((i.source===swapMandate.source&&i.destination===swapMandate.destination&&i.mint===swapMandate.mint&&i.outputMint===swapMandate.outputMint)||(i.source===swapMandate.destination&&i.destination===swapMandate.source&&i.mint===swapMandate.outputMint&&i.outputMint===swapMandate.mint))):(i.kind!=='SOL_TRANSFER'||i.destination!==destination||Boolean(swapMandate))))
            throw new Error('HARNESS_MANDATE_VETO');
        if(signingAuthorities)checkSigningPolicy(raw,m.intent,m.context!,m.policy?.mandate,m.policy?.permit,signingAuthorities);
        const old = signed.get(result.intent.id);
        if (old) {
            if (old.hash !== result.intentHash)
                throw new Error('SIGNER_IDEMPOTENCY_CONFLICT');
            process.send?.({ id: m.id, ...old });
            return;
        }
        if (signed.size >= 100)
            throw new Error('HARNESS_SIGNER_CAP');
        const signature = sign(null, result.message, pair.privateKey);
        const transaction = Buffer.concat([Buffer.from([1]), signature, result.message]).toString('base64');
        const response = { hash: result.intentHash, signature: signature.toString('hex'), transaction };
        signed.set(result.intent.id, response);
        process.send?.({ id: m.id, ...response });
    }
    catch {
        process.send?.({ id: (message as {
                id?: string;
            })?.id, error: 'ISOLATED_SIGNER_VETO' });
    }
});
process.on('disconnect', () => process.exit(0));
