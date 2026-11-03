import { it, expect } from 'vitest';
import { randomUUID, generateKeyPairSync, verify, createPublicKey } from 'node:crypto';
import { keyString, keyBytes } from '../packages/connectors/src/pool-security.js';
import { verifyTransaction, HARNESS_GENESIS, HARNESS_BLOCKHASH, hash, TOKEN, type ExecutionIntent, type VerifyContext } from '../packages/execution/src/verifier.js';
import { harnessTransfer } from '../packages/execution/src/harness-wire.js';
import { HarnessSigner } from '../packages/execution/src/harness-signer.js';
const k = (n: number) => keyString(Buffer.alloc(32, n)), payer = k(2), destination = k(3), now = Date.now();
export function fixture(p = payer) { const clock = Date.now(); const intent: ExecutionIntent = { id: randomUUID(), correlationId: randomUUID(), mode: 'HARNESS', genesis: HARNESS_GENESIS, payer: p, blockhash: HARNESS_BLOCKHASH, policyHash: 'a'.repeat(64), quoteHash: 'b'.repeat(64), observedAt: new Date(clock).toISOString(), expiresAt: new Date(clock + 30000).toISOString(), maxSpend: '100', maxFee: '10', instructions: [{ kind: 'SOL_TRANSFER', destination, amount: '100' }] }; const context: VerifyContext = { genesis: HARNESS_GENESIS, now: clock, feeLamports: '5', minimumSlot: 100, lookups: [], tokenAccounts: {} }; return { intent, context, wire: harnessTransfer(p, destination, 100n) }; }
it('independently decodes real legacy transaction bytes; adapter metadata cannot change destination or amount', () => { const f = fixture(); expect(verifyTransaction(f.wire, f.intent, f.context)).toMatchObject({ spend: '100', fee: '5', version: 'legacy' }); for (const mutation of ['signature', 'payer', 'blockhash', 'program', 'destination', 'amount', 'authority', 'trailing']) {
    const raw = Buffer.from(f.wire);
    if (mutation === 'signature')
        raw[1] = 1;
    if (mutation === 'payer')
        raw[70] = raw[70]! ^ 1;
    if (mutation === 'blockhash')
        raw[165] = raw[165]! ^ 1;
    if (mutation === 'program')
        raw[137] = raw[137]! ^ 1;
    if (mutation === 'destination')
        raw[104] = raw[104]! ^ 1;
    if (mutation === 'amount')
        raw[raw.length - 1] = raw[raw.length - 1]! ^ 1;
    if (mutation === 'authority')
        raw[raw.length - 15] = 1;
    expect(() => verifyTransaction(mutation === 'trailing' ? Buffer.concat([raw, Buffer.from([0])]) : raw, f.intent, f.context), mutation).toThrow();
} });
it('refuses wrong genesis, expired proof/quote, changed cap, fee, duplicate instructions and truncated/noncanonical wire', () => { const f = fixture(); for (const [intent, context, wire] of [[{ ...f.intent, genesis: 'wrong' }, f.context, f.wire], [f.intent, { ...f.context, now: Date.now() + 31000 }, f.wire], [{ ...f.intent, maxSpend: '99' }, f.context, f.wire], [f.intent, { ...f.context, feeLamports: '11' }, f.wire], [{ ...f.intent, instructions: [...f.intent.instructions, ...f.intent.instructions] }, f.context, f.wire], [f.intent, f.context, f.wire.subarray(0, 110)], [f.intent, f.context, Buffer.concat([Buffer.from([129, 0]), f.wire.subarray(1)])]] as const)
    expect(() => verifyTransaction(wire, intent, context)).toThrow(); });
it('resolves v0 writable lookup addresses from active hash-bound ALT and rejects mutation/warmup/missing proof', () => { const f = fixture(); const table = k(7), data = Buffer.alloc(88); data.writeUInt32LE(1); data.writeBigUInt64LE(0xffffffffffffffffn, 4); data.writeBigUInt64LE(99n, 12); keyBytes(destination).copy(data, 56); const message = Buffer.concat([Buffer.from([128, 1, 0, 1, 2]), keyBytes(payer), keyBytes('11111111111111111111111111111111'), keyBytes(HARNESS_BLOCKHASH), Buffer.from([1, 1, 2, 0, 2, 12]), f.wire.subarray(-12), Buffer.from([1]), keyBytes(table), Buffer.from([1, 0, 0])]); const raw = Buffer.concat([Buffer.from([1]), Buffer.alloc(64), message]); const proof = { address: table, owner: 'AddressLookupTab1e1111111111111111111111111', data, genesis: HARNESS_GENESIS, slot: 100, receivedAt: f.context.now, expectedHash: hash(data) }; expect(verifyTransaction(raw, f.intent, { ...f.context, lookups: [proof] }).version).toBe('v0'); for (const bad of [...[0, 1, 2, 3].map(kind => { const changed = Buffer.from(data); if (kind === 0)
        changed.writeUInt32LE(2); if (kind === 1)
        changed.writeBigUInt64LE(1n, 4); if (kind === 2)
        changed.writeBigUInt64LE(100n, 12); return { ...proof, data: kind === 3 ? changed.subarray(0, 87) : changed, expectedHash: hash(kind === 3 ? changed.subarray(0, 87) : changed) }; }), { ...proof, owner: payer }, { ...proof, expectedHash: '0'.repeat(64) }, { ...proof, slot: 99 }, { ...proof, receivedAt: now - 60000 }])
    expect(() => verifyTransaction(raw, f.intent, { ...f.context, lookups: [bad] })).toThrow(); expect(() => verifyTransaction(raw, f.intent, f.context)).toThrow('ALT_PROOF_MISSING'); });
it('checks SPL transfer-checked mint, owner, decimals and proof freshness; authority changes/unsupported programs stay denied', () => { const f = fixture(), mint = k(4), source = k(5), dest = k(6); const data = Buffer.alloc(10); data[0] = 12; data.writeBigUInt64LE(100n, 1); data[9] = 6; const wire = Buffer.concat([Buffer.from([1]), Buffer.alloc(64), Buffer.from([1, 0, 2, 5]), keyBytes(payer), keyBytes(source), keyBytes(dest), keyBytes(mint), keyBytes(TOKEN), keyBytes(HARNESS_BLOCKHASH), Buffer.from([1, 4, 4, 1, 3, 2, 0, 10]), data]); const intent = { ...f.intent, instructions: [{ kind: 'SPL_TRANSFER_CHECKED' as const, source, destination: dest, destinationOwner: destination, mint, decimals: 6, amount: '100' }] }; const proof = { mint, owner: payer, program: TOKEN, decimals: 6, amount: '1000', genesis: HARNESS_GENESIS, receivedAt: f.context.now, slot: 100 }; const context = { ...f.context, tokenAccounts: { [source]: proof, [dest]: { ...proof, owner: destination } } }; expect(verifyTransaction(wire, intent, context).spend).toBe('100'); for (const change of [{ owner: payer }, { mint: payer }, { receivedAt: 0 }, { decimals: 9 }])
    expect(() => verifyTransaction(wire, intent, { ...context, tokenAccounts: { ...context.tokenAccounts, [dest]: { ...proof, owner: destination, ...change } } })).toThrow(); const mutation = Buffer.from(wire); mutation[mutation.length - 10] = 6; expect(() => verifyTransaction(mutation, intent, context)).toThrow(); });
it('isolated signer signs only fixed-network capped native harness messages; signature is externally verifiable and idempotent', async () => { const signer = await HarnessSigner.start(destination); try {
    const f = fixture(signer.publicKey);
    const signed = await signer.sign(f.wire, f.intent);
    const bytes = Buffer.from(signed.transaction, 'base64'), publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), keyBytes(signer.publicKey)]), format: 'der', type: 'spki' });
    expect(verify(null, bytes.subarray(65), publicKey, bytes.subarray(1, 65))).toBe(true);
    expect(await signer.sign(f.wire, f.intent)).toEqual(signed);
    await expect(signer.sign(f.wire, { ...f.intent, mode: 'MAINNET' })).rejects.toThrow();
    await expect(signer.sign(f.wire, { ...f.intent, maxSpend: '1001' })).rejects.toThrow();
    await expect(signer.sign(f.wire, { ...f.intent, instructions: [{ kind: 'SOL_TRANSFER', destination: payer, amount: '100' }] })).rejects.toThrow();
}
finally {
    signer.close();
} expect(generateKeyPairSync('ed25519').publicKey.asymmetricKeyType).toBe('ed25519'); });
it('every single-byte mutation of a native adapter packet is refused, including authority and hidden account changes', () => { const f = fixture(); for (let i = 0; i < f.wire.length; i++) {
    const mutated = Buffer.from(f.wire);
    mutated[i] = mutated[i]! ^ 1;
    expect(() => verifyTransaction(mutated, f.intent, f.context), 'byte ' + i).toThrow();
} });
it('rejects noncanonical version/shortvec, oversize, invalid clock, zero amount and spurious mainnet declaration', () => { const f = fixture(); for (const raw of [Buffer.alloc(1233), Buffer.alloc(0), Buffer.concat([Buffer.from([128, 128, 4]), f.wire.subarray(1)]), Buffer.concat([f.wire.subarray(0, 65), Buffer.from([129]), f.wire.subarray(66)])])
    expect(() => verifyTransaction(raw, f.intent, f.context)).toThrow(); expect(() => verifyTransaction(f.wire, f.intent, { ...f.context, now: NaN })).toThrow(); expect(() => verifyTransaction(harnessTransfer(payer, destination, 0n), { ...f.intent, instructions: [{ kind: 'SOL_TRANSFER', destination, amount: '0' }] }, f.context)).toThrow('ZERO_AMOUNT'); expect(() => verifyTransaction(f.wire, { ...f.intent, mode: 'MAINNET' }, f.context)).toThrow('NETWORK_MISMATCH'); });
it('rejects unused packet accounts rather than accepting an adapter account list', () => { const f = fixture(), extra = k(12); const raw = Buffer.concat([Buffer.from([1]), Buffer.alloc(64), Buffer.from([1, 0, 2, 4]), keyBytes(payer), keyBytes(destination), keyBytes(extra), keyBytes('11111111111111111111111111111111'), keyBytes(HARNESS_BLOCKHASH), Buffer.from([1, 3, 2, 0, 1, 12]), f.wire.subarray(-12)]); expect(() => verifyTransaction(raw, f.intent, f.context)).toThrow('SPEND_OR_UNUSED_ACCOUNT'); });
it('v0 readonly mint resolution preserves SPL account metas and rejects table cap/future proof mutations', () => {
    const f = fixture(), mint = k(4), source = k(5), dest = k(6), table = k(7), data = Buffer.alloc(10);
    data[0] = 12;
    data.writeBigUInt64LE(100n, 1);
    data[9] = 6;
    const message = Buffer.concat([Buffer.from([128, 1, 0, 1, 4]), keyBytes(payer), keyBytes(source), keyBytes(dest), keyBytes(TOKEN), keyBytes(HARNESS_BLOCKHASH), Buffer.from([1, 3, 4, 1, 4, 2, 0, 10]), data, Buffer.from([1]), keyBytes(table), Buffer.from([0, 1, 0])]);
    const wire = Buffer.concat([Buffer.from([1]), Buffer.alloc(64), message]);
    const intent = { ...f.intent, instructions: [{ kind: 'SPL_TRANSFER_CHECKED' as const, source, destination: dest, destinationOwner: destination, mint, decimals: 6, amount: '100' }] }, metadata = { mint, owner: payer, program: TOKEN, decimals: 6, amount: '1000', genesis: HARNESS_GENESIS, receivedAt: f.context.now, slot: 100 };
    const alt = Buffer.alloc(88);
    alt.writeUInt32LE(1);
    alt.writeBigUInt64LE(0xffffffffffffffffn, 4);
    alt.writeBigUInt64LE(99n, 12);
    keyBytes(mint).copy(alt, 56);
    const proof = { address: table, owner: 'AddressLookupTab1e1111111111111111111111111', data: alt, genesis: HARNESS_GENESIS, slot: 100, receivedAt: f.context.now, expectedHash: hash(alt) }, context = { ...f.context, tokenAccounts: { [source]: metadata, [dest]: { ...metadata, owner: destination } }, lookups: [proof] };
    expect(verifyTransaction(wire, intent, context).resolvedAccounts[4]).toBe(mint);
    for (const change of [{ genesis: 'wrong' }, { receivedAt: f.context.now + 1 }])
        expect(() => verifyTransaction(wire, intent, { ...context, lookups: [{ ...proof, ...change }] })).toThrow('ALT_PROOF_INVALID');
    const tooLarge = Buffer.alloc(56 + 257 * 32);
    alt.copy(tooLarge);
    expect(() => verifyTransaction(wire, intent, { ...context, lookups: [{ ...proof, data: tooLarge, expectedHash: hash(tooLarge) }] })).toThrow('ALT_CAP');
});
it('bounds instruction allocation and refuses summing unlike assets into one spend budget',()=>{
 const f=fixture();expect(()=>verifyTransaction(Buffer.concat([f.wire.subarray(0,-18),Buffer.from([17])]),f.intent,f.context)).toThrow('INSTRUCTION_CAP');
 const raw=Buffer.concat([f.wire.subarray(0,-18),Buffer.from([2]),f.wire.subarray(-17),f.wire.subarray(-17)]);
 expect(verifyTransaction(raw,{...f.intent,maxSpend:'200',instructions:[...f.intent.instructions,...f.intent.instructions]},f.context).spend).toBe('200');
 const mixed={...f.intent,maxSpend:'200',instructions:[f.intent.instructions[0]!,{kind:'SPL_TRANSFER_CHECKED' as const,source:k(4),destination:k(5),destinationOwner:k(6),mint:k(7),decimals:6,amount:'100'}]};expect(()=>verifyTransaction(raw,mixed,f.context)).toThrow('MIXED_ASSET_BUDGET');
});
it('combined transfers cannot spend the same token balance twice',()=>{
 const f=fixture(),mint=k(4),source=k(5),dest=k(6),data=Buffer.alloc(10);data[0]=12;data.writeBigUInt64LE(100n,1);data[9]=6;
 const ix=Buffer.concat([Buffer.from([4,4,1,3,2,0,10]),data]);const raw=Buffer.concat([Buffer.from([1]),Buffer.alloc(64),Buffer.from([1,0,2,5]),keyBytes(payer),keyBytes(source),keyBytes(dest),keyBytes(mint),keyBytes(TOKEN),keyBytes(HARNESS_BLOCKHASH),Buffer.from([2]),ix,ix]);const instruction={kind:'SPL_TRANSFER_CHECKED' as const,source,destination:dest,destinationOwner:destination,mint,decimals:6,amount:'100'},proof={mint,owner:payer,program:TOKEN,decimals:6,amount:'150',genesis:HARNESS_GENESIS,receivedAt:f.context.now,slot:100};expect(()=>verifyTransaction(raw,{...f.intent,maxSpend:'200',instructions:[instruction,instruction]},{...f.context,tokenAccounts:{[source]:proof,[dest]:{...proof,owner:destination}}})).toThrow('TOKEN_BALANCE_EXCEEDED');
});
it('runtime proof contracts refuse NaN, invalid slots, coerced fees and undeclared context fields',()=>{
 const f=fixture();for(const patch of [{minimumSlot:NaN},{minimumSlot:-1},{feeLamports:'1.5'},{feeLamports:5},{now:Infinity},{unexpectedAuthority:true}])expect(()=>verifyTransaction(f.wire,f.intent,{...f.context,...patch} as unknown as VerifyContext)).toThrow();
});
it('shared bounded wire decoder resolves binary ALT proofs after JSON persistence and rejects unsupported layouts',async()=>{
 const {decodeUnsignedWire}=await import('../packages/execution/src/verifier.js');const f=fixture();expect(decodeUnsignedWire(f.wire,f.context).version).toBe('legacy');
 const table=k(7),data=Buffer.alloc(88);data.writeUInt32LE(1);data.writeBigUInt64LE(0xffffffffffffffffn,4);data.writeBigUInt64LE(99n,12);keyBytes(destination).copy(data,56);
 const raw=Buffer.concat([Buffer.from([1]),Buffer.alloc(64),Buffer.from([128,1,0,1,2]),keyBytes(payer),keyBytes('11111111111111111111111111111111'),keyBytes(HARNESS_BLOCKHASH),Buffer.from([1,1,2,0,2,12]),f.wire.subarray(-12),Buffer.from([1]),keyBytes(table),Buffer.from([1,0,0])]);
 const proof={address:table,owner:'AddressLookupTab1e1111111111111111111111111',data,genesis:HARNESS_GENESIS,slot:100,receivedAt:f.context.now,expectedHash:hash(data)},c={...f.context,lookups:[proof]};expect(decodeUnsignedWire(raw,c).keys).toContain(destination);expect(decodeUnsignedWire(raw,JSON.parse(JSON.stringify(c))).keys).toContain(destination);
 for(const bytes of [Buffer.alloc(1233),raw.subarray(0,90),Buffer.concat([raw,Buffer.from([0])]),Buffer.from(raw)]){if(bytes.length===raw.length)bytes[65]=129;expect(()=>decodeUnsignedWire(bytes,c)).toThrow();}
 expect(()=>decodeUnsignedWire(raw,f.context)).toThrow('ALT_PROOF_MISSING');for(const offset of [0,65,66,67,68,69,166,168,169,185,186,219]){const b=Buffer.from(raw);if(offset>=b.length)continue;b[offset]=255;expect(()=>decodeUnsignedWire(b,c)).toThrow();}
});
