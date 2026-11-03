import { describe,it,expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { baseUnits,parseUnits,validAddress,freshness,bootstrapEnv,bootstrapPolicy,transition,intentStates,bootstrapVeto } from '../packages/domain/src/index.js';
describe('exact money and canonical identity',() => {
  it('accepts u64 only',() => {
    for (const value of ['0','18446744073709551615']) expect(baseUnits.parse(value)).toBe(value);
    for (const value of ['-1','01','1.1','1e9',' 1','18446744073709551616']) expect(baseUnits.safeParse(value).success).toBe(false);
  });
  it('scales decimal strings exactly, including decimals 0..255',() => {
    fc.assert(fc.property(fc.bigInt({min:0n,max:10n**30n}),fc.integer({min:0,max:255}),(amount,d) => {
      expect(parseUnits(amount.toString(),d)).toBe(amount*10n**BigInt(d));
    }));
    expect(parseUnits('0.000000001',9)).toBe(1n);
    expect(parseUnits('12.30',2)).toBe(1230n);
    expect(parseUnits('2',0)).toBe(2n);
    expect(parseUnits('0',0)).toBe(0n);
    for (const d of [-1,256,1.5,NaN]) expect(() => parseUnits('1',d)).toThrow('INVALID_DECIMALS');
    for (const v of ['-1','01','1e9','1.','NaN']) expect(() => parseUnits(v,9)).toThrow('INVALID_AMOUNT');
    expect(() => parseUnits('1.001',2)).toThrow('PRECISION_LOSS');
  });
  it('rejects malformed and wrong-length base58',() => {
    expect(validAddress('So11111111111111111111111111111111111111112')).toBe(true);
    expect(validAddress('11111111111111111111111111111111')).toBe(true);
    for (const v of ['SOL','0'.repeat(32),'1'.repeat(33),'z'.repeat(44)]) expect(validAddress(v)).toBe(false);
  });
});
it('does not infer source freshness from receipt time',() => {
  expect(freshness(100,200,100)).toBe('FRESH');
  expect(freshness(100,201,100)).toBe('STALE');
  for (const [s,n,t] of [[null,1,1],[NaN,1,1],[1,NaN,1],[1,1,NaN],[1,1,0],[2,1,1]] as const) expect(freshness(s,n,t)).toBe('UNKNOWN');
});
it('bootstraps only in observe with all authority disabled',() => {
  expect(bootstrapEnv.parse({}).DEFAULT_MODE).toBe('OBSERVE');
  for (const [key,value] of Object.entries({DEFAULT_MODE:'MICRO_LIVE',SIGNER_ENABLED:'true',LIVE_TRADING_ENABLED:'true',LLM_ENABLED:'true',OWNER_AUTH_REQUIRED:'false',ALLOW_EXTERNAL_TELEMETRY:'true'})) expect(bootstrapEnv.safeParse({[key]:value}).success).toBe(false);
  const policy: unknown = parse(readFileSync('config/policy.example.yaml','utf8'));
  expect(bootstrapPolicy.safeParse(policy).success).toBe(true);
  expect(bootstrapPolicy.safeParse({...policy as object,signer_enabled:true}).success).toBe(false);
  expect(bootstrapVeto(false).authorized).toBe(false);
  expect(bootstrapVeto(true).reasons).toEqual(['KILL_SWITCH_ACTIVE']);
});
it('checks every transaction edge, ambiguous orders cannot restart',() => {
  const allowed: Record<string,string[]> = {CREATED:['PRECHECKED','CANCELLED'],PRECHECKED:['QUOTED','FAILED','CANCELLED'],QUOTED:['TX_VERIFIED','EXPIRED','CANCELLED'],TX_VERIFIED:['SIGNED','EXPIRED','CANCELLED'],SIGNED:['SUBMITTED','UNCERTAIN'],SUBMITTED:['UNCERTAIN','CONFIRMED','FAILED'],UNCERTAIN:['CONFIRMED','FAILED'],CONFIRMED:['FINALIZED'],FINALIZED:['RECONCILED']};
  for (const from of intentStates) for (const to of intentStates) {
    if (allowed[from]?.includes(to)) {
      expect(transition(from,to,true)).toBe(to);
      if (from === 'UNCERTAIN' || ['CONFIRMED','FINALIZED','RECONCILED'].includes(to)) expect(() => transition(from,to)).toThrow('CHAIN_PROOF_REQUIRED');
      else expect(transition(from,to)).toBe(to);
    } else expect(() => transition(from,to,true)).toThrow('INVALID_TRANSITION');
  }
});
