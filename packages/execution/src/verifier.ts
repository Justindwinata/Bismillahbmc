import { createHash } from 'node:crypto';
import { z } from 'zod';
import { address, baseUnits } from '../../domain/src/index.js';
import { keyString } from '../../connectors/src/pool-security.js';
export const SYSTEM = '11111111111111111111111111111111', TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const HARNESS_GENESIS = 'HARNESS_NO_BLOCKCHAIN_SETTLEMENT';
export const HARNESS_BLOCKHASH = keyString(createHash('sha256').update('sentinel:non-mainnet:execution-harness:v1').digest());
export const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const revisionPin=z.strictObject({codeHash:z.string().regex(/^[a-f0-9]{64}$/),reviewId:z.uuid()});
export const swapInstruction=z.strictObject({kind:z.literal('JUPITER_CPMM_SWAP'),source:address,destination:address,destinationOwner:address,mint:address,outputMint:address,amount:baseUnits,quotedOut:baseUnits,minOut:baseUnits,slippageBps:z.number().int().min(0).max(1000),pool:address,config:address,vaultIn:address,vaultOut:address,observation:address,maxComputeUnits:z.number().int().min(1).max(1400000),computeUnitPrice:baseUnits,programPins:z.strictObject({jupiter:revisionPin,cpmm:revisionPin}).optional()});
const transfer = z.discriminatedUnion('kind', [swapInstruction,
    z.strictObject({ kind: z.literal('SOL_TRANSFER'), destination: address, amount: baseUnits }),
    z.strictObject({ kind: z.literal('SPL_TRANSFER_CHECKED'), source: address, destination: address, destinationOwner: address, mint: address, decimals: z.number().int().min(0).max(255), amount: baseUnits })
]);
export const intentSchema = z.strictObject({ id: z.uuid(), correlationId: z.uuid(), mode: z.enum(['HARNESS', 'MAINNET']), genesis: z.string().min(1), payer: address, blockhash: address, policyHash: z.string().regex(/^[a-f0-9]{64}$/), quoteHash: z.string().regex(/^[a-f0-9]{64}$/), observedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), maxSpend: baseUnits, maxFee: baseUnits, minimumNativeReserve: baseUnits.optional(), instructions: z.array(transfer).min(1).max(8) });
export type ExecutionIntent = z.infer<typeof intentSchema>;
export type LookupProof = {
    address: string;
    owner: string;
    data: Buffer;
    genesis: string;
    slot: number;
    receivedAt: number;
    expectedHash: string;
};
const proofTime=z.number().int().safe().nonnegative(),proofSlot=z.number().int().safe().positive();
const proofData=z.union([z.instanceof(Buffer).refine(b=>b.length<=2000000),z.strictObject({type:z.literal('Buffer'),data:z.array(z.number().int().min(0).max(255)).max(2000000)}).transform(v=>Buffer.from(v.data))]);
const contextSchema=z.strictObject({genesis:z.string().min(1),now:proofTime,feeLamports:baseUnits,minimumSlot:z.number().int().safe().nonnegative(),
 executableRevisions:z.record(address,z.strictObject({programData:address,owner:address,programBytes:proofData,dataBytes:proofData,codeHash:z.string().regex(/^[a-f0-9]{64}$/),reviewId:z.uuid(),slot:proofSlot,receivedAt:proofTime,genesis:z.string().min(1)})).optional(),
 poolAccounts:z.record(address,z.strictObject({owner:address,data:proofData,slot:proofSlot,receivedAt:proofTime,genesis:z.string().min(1)})).optional(),
 lookups:z.array(z.strictObject({address,owner:address,data:proofData,genesis:z.string().min(1),slot:proofSlot,receivedAt:proofTime,expectedHash:z.string().regex(/^[a-f0-9]{64}$/)})).max(8),
 nativeProof:z.strictObject({address,balance:baseUnits,receivedAt:proofTime,slot:proofSlot,genesis:z.string().min(1)}).optional(),
 blockhashProof:z.strictObject({hash:address,valid:z.boolean(),observedAt:proofTime,genesis:z.string().min(1),slot:proofSlot}).optional(),
 tokenAccounts:z.record(address,z.strictObject({mint:address,owner:address,program:address,decimals:z.number().int().min(0).max(255),amount:baseUnits,genesis:z.string().min(1),receivedAt:proofTime,slot:proofSlot}))
});
export type VerifyContext=z.infer<typeof contextSchema>;
class Reader {
    offset = 0;
    constructor(readonly bytes: Buffer) { }
    take(n: number) { if (n < 0 || this.offset + n > this.bytes.length)
        throw new Error('TRUNCATED_WIRE'); const out = this.bytes.subarray(this.offset, this.offset + n); this.offset += n; return out; }
    u8() { return this.take(1)[0]!; }
    short() { let value = 0; for (let i = 0; i < 3; i++) {
        const b = this.u8();
        if (i === 2 && b > 3)
            throw new Error('INVALID_SHORTVEC');
        value |= (b & 127) << (7 * i);
        if (!(b & 128)) {
            if (i > 0 && b === 0)
                throw new Error('NON_CANONICAL_SHORTVEC');
            return value;
        }
    } throw new Error('INVALID_SHORTVEC'); }
}
function lookup(proof: LookupProof, context: VerifyContext) {
    if (proof.owner !== 'AddressLookupTab1e1111111111111111111111111' || proof.genesis !== context.genesis || proof.slot < context.minimumSlot || context.now < proof.receivedAt || context.now - proof.receivedAt > 30000 || hash(proof.data) !== proof.expectedHash)
        throw new Error('ALT_PROOF_INVALID');
    if (proof.data.length < 56 || (proof.data.length - 56) % 32 || proof.data.readUInt32LE(0) !== 1 || proof.data.readBigUInt64LE(4) !== 0xffffffffffffffffn || proof.data.readBigUInt64LE(12) >= BigInt(proof.slot))
        throw new Error('ALT_INACTIVE_OR_WARMING');
    const keys = [];
    for (let i = 56; i < proof.data.length; i += 32)
        keys.push(keyString(proof.data.subarray(i, i + 32)));
    if (keys.length > 256)
        throw new Error('ALT_CAP');
    return keys;
}
/** Independent wire decoder. Unsupported programs/instructions fail closed; no adapter JSON is trusted. */
export function verifyTransaction(raw: Buffer, input: unknown, context: VerifyContext) {
    context=contextSchema.parse(context);
    const intent = intentSchema.parse(input), now = context.now;
    if(intent.instructions.some(i=>i.kind==='JUPITER_CPMM_SWAP'))throw new Error('SWAP_VERIFIER_REQUIRED');
    if (raw.length > 1232 || raw.length < 100)
        throw new Error('WIRE_SIZE');
    if ((intent.mode === 'MAINNET' && intent.genesis !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') || context.genesis !== intent.genesis || (intent.mode === 'HARNESS' && (intent.genesis !== HARNESS_GENESIS || intent.blockhash !== HARNESS_BLOCKHASH)))
        throw new Error('NETWORK_MISMATCH');
    if (!Number.isSafeInteger(now) || now < Date.parse(intent.observedAt) || now >= Date.parse(intent.expiresAt) || Date.parse(intent.expiresAt) - Date.parse(intent.observedAt) > 30000)
        throw new Error('INTENT_OR_QUOTE_EXPIRED');
    if (intent.mode === 'MAINNET') { const p = context.blockhashProof; if (!p || !p.valid || p.hash !== intent.blockhash || p.genesis !== intent.genesis || p.slot < context.minimumSlot || now < p.observedAt || now - p.observedAt > 30000) throw new Error('BLOCKHASH_PROOF_REQUIRED'); }
    const fee = BigInt(baseUnits.parse(context.feeLamports));
    if (fee > BigInt(intent.maxFee))
        throw new Error('FEE_CAP');
    const reader = new Reader(raw), signatures = reader.short();
    if (signatures !== 1 || reader.take(64).some(b => b !== 0))
        throw new Error('UNEXPECTED_SIGNATURE');
    const messageOffset = reader.offset;
    let required = reader.u8(), versioned = false;
    if (required & 128) {
        if (required !== 128)
            throw new Error('UNSUPPORTED_VERSION');
        versioned = true;
        required = reader.u8();
    }
    const readonlySigned = reader.u8(), readonlyUnsigned = reader.u8(), count = reader.short();
    if (required !== 1 || readonlySigned !== 0 || count < 2 || count > 64 || readonlyUnsigned > count - 1)
        throw new Error('SIGNER_HEADER');
    const keys = Array.from({ length: count }, () => keyString(reader.take(32)));
    const writable = keys.map((_, i) => i === 0 || i < count - readonlyUnsigned);
    if (keys[0] !== intent.payer || keyString(reader.take(32)) !== intent.blockhash)
        throw new Error('PAYER_OR_BLOCKHASH');
    const instructionCount = reader.short();
    if (instructionCount > 16)
        throw new Error('INSTRUCTION_CAP');
    const instructions = Array.from({ length: instructionCount }, () => { const program = reader.u8(), accounts = Array.from(reader.take(reader.short())), data = reader.take(reader.short()); return { program, accounts, data }; });
    if (instructions.length !== intent.instructions.length)
        throw new Error('INSTRUCTION_COUNT');
    if (versioned) {
        const tables = reader.short();
        if (tables > 8)
            throw new Error('ALT_CAP');
        const writes: string[] = [], reads: string[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < tables; i++) {
            const table = keyString(reader.take(32));
            if (seen.has(table))
                throw new Error('ALT_DUPLICATE');
            seen.add(table);
            const proof = context.lookups.find(p => p.address === table);
            if (!proof)
                throw new Error('ALT_PROOF_MISSING');
            const addresses = lookup(proof, context);
            for (const [target, indices] of [[writes, reader.take(reader.short())], [reads, reader.take(reader.short())]] as const)
                for (const index of indices) {
                    if (!addresses[index])
                        throw new Error('ALT_INDEX');
                    target.push(addresses[index]!);
                }
        }
        keys.push(...writes, ...reads);
        writable.push(...writes.map(() => true), ...reads.map(() => false));
    }
    if (reader.offset !== raw.length || keys.length > 64 || new Set(keys).size !== keys.length)
        throw new Error('TRAILING_OR_DUPLICATE_ACCOUNTS');
    if (new Set(intent.instructions.map(i => i.kind === 'SOL_TRANSFER' ? 'SOL' : i.mint)).size !== 1)
        throw new Error('MIXED_ASSET_BUDGET');
    const debits=new Map<string,bigint>();
    let spend = 0n;
    const used = new Set([0]);
    for (let i = 0; i < instructions.length; i++) {
        const wire = instructions[i]!, expected = intent.instructions[i]!;
        if (wire.program >= keys.length || wire.accounts.some(a => a >= keys.length) || writable[wire.program])
            throw new Error('ACCOUNT_META');
        used.add(wire.program);
        wire.accounts.forEach(a => used.add(a));
        const accounts = wire.accounts.map(index => keys[index]!);
        const amount = BigInt(expected.amount);
        if (amount <= 0n)
            throw new Error('ZERO_AMOUNT');
        spend += amount;
        if (expected.kind === 'SOL_TRANSFER') {
            if (keys[wire.program] !== SYSTEM || wire.data.length !== 12 || wire.data.readUInt32LE(0) !== 2 || accounts.length !== 2 || accounts[0] !== intent.payer || accounts[1] !== expected.destination || wire.data.readBigUInt64LE(4) !== amount || !wire.accounts.every(index => writable[index]))
                throw new Error('UNAUTHORIZED_SOL_INSTRUCTION');
        }
        else if(expected.kind==='SPL_TRANSFER_CHECKED') {
            debits.set(expected.source,(debits.get(expected.source)??0n)+amount);
            const source = context.tokenAccounts[expected.source], destination = context.tokenAccounts[expected.destination];
            if ([source, destination].some(p => p && (p.genesis !== context.genesis || p.slot < context.minimumSlot || context.now < p.receivedAt || context.now - p.receivedAt > 30000)))
                throw new Error('TOKEN_PROOF_STALE');
            if (expected.source===expected.destination || !source || !destination || BigInt(baseUnits.parse(source.amount)) < amount || source.owner !== intent.payer || destination.owner !== expected.destinationOwner || source.mint !== expected.mint || destination.mint !== expected.mint || source.program !== TOKEN || destination.program !== TOKEN || source.decimals !== expected.decimals || destination.decimals !== expected.decimals)
                throw new Error('TOKEN_ACCOUNT_PROOF');
            if (keys[wire.program] !== TOKEN || wire.data.length !== 10 || wire.data[0] !== 12 || wire.data.readBigUInt64LE(1) !== amount || wire.data[9] !== expected.decimals || JSON.stringify(accounts) !== JSON.stringify([expected.source, expected.mint, expected.destination, intent.payer]) || !writable[wire.accounts[0]!] || !writable[wire.accounts[2]!] || writable[wire.accounts[1]!])
                throw new Error('UNAUTHORIZED_TOKEN_INSTRUCTION');
        }else throw new Error('SWAP_VERIFIER_REQUIRED');
    }
    for(const [source,amount] of debits)if(amount>BigInt(baseUnits.parse(context.tokenAccounts[source]!.amount)))throw new Error('TOKEN_BALANCE_EXCEEDED');
    if(intent.mode==='MAINNET'){const p=context.nativeProof;if(!p||p.address!==intent.payer||p.genesis!==intent.genesis||p.slot<context.minimumSlot||now<p.receivedAt||now-p.receivedAt>30000)throw new Error('NATIVE_BALANCE_PROOF_REQUIRED');const debit=BigInt(intent.maxFee)+BigInt(intent.minimumNativeReserve??'0')+(intent.instructions[0]!.kind==='SOL_TRANSFER'?spend:0n);if(BigInt(baseUnits.parse(p.balance))<debit)throw new Error('NATIVE_RESERVE_BREACH');}
    if (used.size !== keys.length || spend > BigInt(intent.maxSpend))
        throw new Error('SPEND_OR_UNUSED_ACCOUNT');
    return { intent, message: raw.subarray(messageOffset), messageHash: hash(raw.subarray(messageOffset)), wireHash: hash(raw), intentHash: hash(JSON.stringify(intent)), spend: spend.toString(), fee: fee.toString(), resolvedAccounts: keys,staticAccountCount:count, version: versioned ? 'v0' : 'legacy' };
}

/** Discovery only; this never approves a transaction or trusts adapter lookup JSON. */
export function wireLookupAddresses(raw: Buffer): string[] {
 if(raw.length>1232)throw new Error('WIRE_SIZE');const r=new Reader(raw);if(r.short()!==1)throw new Error('SIGNER_HEADER');r.take(64);const version=r.u8();if(!(version&128))return [];if(version!==128)throw new Error('UNSUPPORTED_VERSION');r.take(3);const count=r.short();if(count>64)throw new Error('ACCOUNT_META');r.take(count*32+32);const instructions=r.short();if(instructions>16)throw new Error('INSTRUCTION_CAP');for(let i=0;i<instructions;i++){r.take(1);r.take(r.short());r.take(r.short());}const countTables=r.short();if(countTables>8)throw new Error('ALT_CAP');const addresses=[];for(let i=0;i<countTables;i++){addresses.push(keyString(r.take(32)));r.take(r.short());r.take(r.short());}if(r.offset!==raw.length||new Set(addresses).size!==addresses.length)throw new Error('ALT_LAYOUT_INVALID');return addresses;
}

export function decodeUnsignedWire(raw:Buffer,context:VerifyContext){
 context=contextSchema.parse(context);if(raw.length>1232||raw.length<100)throw new Error('WIRE_SIZE');const r=new Reader(raw);if(r.short()!==1||r.take(64).some(b=>b!==0))throw new Error('UNEXPECTED_SIGNATURE');const messageOffset=r.offset;let required=r.u8();const versioned=Boolean(required&128);if(versioned){if(required!==128)throw new Error('UNSUPPORTED_VERSION');required=r.u8();}const signedReadonly=r.u8(),unsignedReadonly=r.u8(),count=r.short();if(required!==1||signedReadonly!==0||count<2||count>64||unsignedReadonly>count-1)throw new Error('SIGNER_HEADER');const keys=Array.from({length:count},()=>keyString(r.take(32))),writable=keys.map((_,i)=>i===0||i<count-unsignedReadonly);const blockhash=keyString(r.take(32)),n=r.short();if(n<1||n>16)throw new Error('INSTRUCTION_CAP');const instructions=Array.from({length:n},()=>({program:r.u8(),accounts:Array.from(r.take(r.short())),data:r.take(r.short())}));
 if(versioned){const tables=r.short();if(tables>8)throw new Error('ALT_CAP');const seen=new Set(),writes:string[]=[],reads:string[]=[];for(let i=0;i<tables;i++){const table=keyString(r.take(32));if(seen.has(table))throw new Error('ALT_DUPLICATE');seen.add(table);const proof=context.lookups.find(p=>p.address===table);if(!proof)throw new Error('ALT_PROOF_MISSING');const addresses=lookup(proof,context);for(const [target,indices]of [[writes,r.take(r.short())],[reads,r.take(r.short())]] as const)for(const index of indices){if(!addresses[index])throw new Error('ALT_INDEX');target.push(addresses[index]!);}}keys.push(...writes,...reads);writable.push(...writes.map(()=>true),...reads.map(()=>false));}
 if(r.offset!==raw.length||keys.length>64||new Set(keys).size!==keys.length||instructions.some(i=>i.program>=keys.length||i.accounts.some(a=>a>=keys.length)||writable[i.program]))throw new Error('WIRE_ACCOUNT_LAYOUT');return {keys,writable,blockhash,instructions,message:raw.subarray(messageOffset),staticAccountCount:count,version:versioned?'v0':'legacy',context};
}
