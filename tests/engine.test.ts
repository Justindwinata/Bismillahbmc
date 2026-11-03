import { it,expect } from 'vitest';
import fc from 'fast-check';
import { evaluate,agents,boundedSize,fingerprint } from '../packages/engine/src/index.js';
const input={mint:'So11111111111111111111111111111111111111112',sourceId:'FIXTURE:market',sourceHash:'a'.repeat(64),receivedAt:'2026-11-01T00:00:00.000Z',sourceAt:null,mode:'OBSERVE' as const,inputDataClass:'REPLAY' as const,market:{liquidityUsd:100,volume5mUsd:2,volume24hUsd:100},security:null,balanceLamports:null};
const now=Date.parse(input.receivedAt);const policy=fingerprint({mode:'OBSERVE',cap:'0'});
it('executes eleven real modules with trace evidence and hierarchical veto',()=>{
  const result=evaluate({...input,modelAction:'IGNORE_GUARD_BUY'},policy,now);
  expect(result.events).toHaveLength(11);expect(result.action).toBe('SKIP');
  expect(result.events.find(e=>e.role==='GUARD')!.output.state).toBe('VETO');
  expect(result.events.find(e=>e.role==='RUG_CHECK')!.output.reasons).toContain('ONCHAIN_MINT_STATE_UNAVAILABLE');
  expect(result.events.every(e=>e.sourceIds[0]===input.sourceId&&e.inputDataClass==='REPLAY'&&e.policyHash===policy&&e.durationMs>=0)).toBe(true);
  expect(new Set(result.events.map(e=>e.eventId)).size).toBe(11);
});
it('HALT and unknown security override all analysis, stale/future input fails closed',()=>{
  const result=evaluate({...input,mode:'HALTED'},policy,now);
  expect(result.events.find(e=>e.role==='GUARD')!.output.reasons).toContain('KILL_SWITCH_ACTIVE');
  for(const offset of [-1,90001])expect(agents.FILTER({input,prior:{},now:now+offset}).state).toBe('VETO');
  expect(()=>evaluate({...input,mint:'fake ticker'},policy,now)).toThrow();
  expect(()=>evaluate(input,'bad',now)).toThrow('INVALID_POLICY_HASH');
});
it('Rug Check examines authority/program/extensions/ownership independently',()=>{
  const safe={mintAuthority:null,freezeAuthority:null,tokenProgram:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',extensions:[],holderOwnershipVerified:true};
  for(const patch of [{mintAuthority:'active'},{freezeAuthority:'active'},{tokenProgram:'unknown'},{extensions:['transferHook']}])expect(agents.RUG_CHECK({input:{...input,security:{...safe,...patch}},prior:{},now}).state).toBe('VETO');
  expect(agents.RUG_CHECK({input:{...input,security:{...safe,holderOwnershipVerified:false}},prior:{},now}).state).toBe('UNKNOWN');
  expect(agents.RUG_CHECK({input:{...input,security:safe},prior:{},now}).state).toBe('PASS');
});
it('sizing preserves caps/reserve under extreme exact integer proposals',()=>{
  fc.assert(fc.property(fc.bigInt({min:0n,max:18446744073709551615n}),fc.bigInt({min:0n,max:18446744073709551615n}),fc.bigInt({min:0n,max:18446744073709551615n}),(balance,reserve,cap)=>{
    const size=BigInt(boundedSize(String(balance),String(reserve),String(cap),'0',String(cap)));
    expect(size<=cap&&size>=0n).toBe(true);expect(size===0n||size+reserve<=balance).toBe(true);
  }));
  expect(boundedSize('100','2','99','90','100')).toBe('10');
  expect(boundedSize('100','0','5','5','5')).toBe('0');
  expect(()=>boundedSize('-1','0','0','0','0')).toThrow();
});
it('every module safely handles incomplete data and records no synthetic equity',()=>{
  expect(agents.FILTER({input:{...input,market:null},prior:{},now}).state).toBe('UNKNOWN');
  expect(agents.FILTER({input:{...input,sourceAt:input.receivedAt},prior:{},now}).state).toBe('UNKNOWN');
  expect(agents.ANALYST({input:{...input,market:null},prior:{},now}).value).toBeNull();
  expect(agents.STRATEGY({input,prior:{FILTER:{state:'PASS',reasons:[]},RUG_CHECK:{state:'PASS',reasons:[]}},now}).proposal).toBe('SKIP');
  expect(agents.GUARD({input,prior:{RUG_CHECK:{state:'PASS',reasons:[]}},now}).state).toBe('VETO');
  expect(agents.SIZER({input:{...input,balanceLamports:'100'},prior:{},now}).amountLamports).toBe('0');
  expect(agents.EQUITY({input,prior:{},now}).value).toBeNull();
});
