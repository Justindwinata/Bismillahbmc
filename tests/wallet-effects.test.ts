import { it,expect } from 'vitest';
import { walletEffects } from '../packages/connectors/src/wallet-effects.js';
const wallet='11111111111111111111111111111111',wrapped='So11111111111111111111111111111111111111112',account='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const balance=(amount:string)=>({accountIndex:1,owner:wallet,mint:wrapped,uiTokenAmount:{amount,decimals:9}});
function wrap(){return {meta:{err:null as unknown,fee:5,preBalances:[2000,0],postBalances:[895,1100],preTokenBalances:[] as ReturnType<typeof balance>[],postTokenBalances:[balance('1000')]},transaction:{message:{accountKeys:[{pubkey:wallet},{pubkey:account}]}}};}
it('preserves SOL/WSOL account backing and reserve residual without inventing rent expense or swap profit',()=>{
 const result=walletEffects(wrap(),wallet);expect(result).toMatchObject({status:'OBSERVED',nativeDeltaLamports:'-1105',walletFeeLamports:'5',wrappedQuantityDelta:'1000',controlledLamportsDeltaExcludingFee:'0',pnlLamports:null,copyAuthority:false});
 // The wrapping movement nets to zero across known accounts after the independently identified fee.
 expect(result.tokenAccountEffects?.[0]).toMatchObject({opened:true,reserveOrBackingDelta:'100',rentClassification:'UNVERIFIED_NOT_REFUND_OR_EXPENSE'});
});
it('closed WSOL account, third-party fee payer and failed receipt remain account effects rather than fills',()=>{
 const raw=wrap();raw.meta.preBalances=[895,1100];raw.meta.postBalances=[1990,0];raw.meta.preTokenBalances=[balance('1000')];raw.meta.postTokenBalances=[];expect(walletEffects(raw,wallet)).toMatchObject({nativeDeltaLamports:'1095',controlledLamportsDeltaExcludingFee:'0',wrappedQuantityDelta:'-1000'});
 raw.meta.err={InstructionError:[0,'Custom']};expect(walletEffects(raw,wallet).reason).toContain('FAILED_RECEIPT');
 raw.transaction.message.accountKeys.unshift({pubkey:wrapped});raw.meta.preBalances.unshift(10);raw.meta.postBalances.unshift(5);raw.meta.preTokenBalances[0]!.accountIndex=2;expect(walletEffects(raw,wallet).walletFeeLamports).toBe('0');
});
it('missing native arrays, unsafe quantities, duplicate/missing keys, index/owner changes and malformed wrapped units stay UNKNOWN',()=>{
 const mutations=[(r:ReturnType<typeof wrap>)=>{r.meta.preBalances=[];},(r:ReturnType<typeof wrap>)=>{r.meta.preBalances[0]=Number.MAX_SAFE_INTEGER+1;},(r:ReturnType<typeof wrap>)=>{r.transaction.message.accountKeys[1]={pubkey:wallet};},(r:ReturnType<typeof wrap>)=>{r.meta.postTokenBalances[0]!.accountIndex=9;},(r:ReturnType<typeof wrap>)=>{r.meta.postTokenBalances.push(balance('1'));},(r:ReturnType<typeof wrap>)=>{r.meta.preTokenBalances=[{...balance('1'),owner:account}];},(r:ReturnType<typeof wrap>)=>{r.meta.postTokenBalances[0]!.uiTokenAmount.decimals=6;}];
 for(const mutate of mutations){const r=wrap();mutate(r);expect(walletEffects(r,wallet).status).toBe('UNKNOWN');}expect(walletEffects(null,wallet).nativeDeltaLamports).toBeNull();expect(walletEffects(wrap(),wrapped).status).toBe('UNKNOWN');
});

it('reports ordinary token-account lamport changes as unclassified reserve effects, not token valuation',()=>{
 const raw=wrap();raw.meta.postTokenBalances[0]!.mint=account;expect(walletEffects(raw,wallet)).toMatchObject({status:'OBSERVED',wrappedQuantityDelta:'0',rentClassification:'UNKNOWN'});
 const old=balance('0');old.uiTokenAmount.decimals=6;raw.meta.preTokenBalances=[old];expect(walletEffects(raw,wallet).status).toBe('UNKNOWN');
});
it('handles unchanged owner balances/string keys and refuses missing status or native/token aliases',()=>{
 const r=wrap();r.meta.preTokenBalances=[balance('900')];expect(walletEffects(r,wallet).wrappedQuantityDelta).toBe('100');
 const foreign=wrap();foreign.meta.postTokenBalances[0]!.owner=account;expect(walletEffects(foreign,wallet).tokenAccountEffects).toEqual([]);
 const alias=wrap();alias.meta.postTokenBalances[0]!.accountIndex=0;expect(walletEffects(alias,wallet).reason).toBe('NATIVE_AND_TOKEN_ACCOUNT_ALIAS');
 const missing=wrap();missing.meta.err=undefined;expect(walletEffects(missing,wallet).status).toBe('UNKNOWN');
 const stringKeys={...r,transaction:{message:{accountKeys:[wallet,account]}}};expect(walletEffects(stringKeys,wallet).status).toBe('OBSERVED');
});
it('wrap/close conserve controlled lamports across generated quantities, reserve and fee without recognizing PnL',async()=>{
 const fc=await import('fast-check');fc.assert(fc.property(fc.integer({min:0,max:1000000000}),fc.integer({min:1,max:10000000}),fc.integer({min:0,max:100000}), (quantity,reserve,fee)=>{
  const r=wrap(),cash=1000000;r.meta.fee=fee;r.meta.preBalances=[cash+quantity+reserve+fee,0];r.meta.postBalances=[cash,quantity+reserve];r.meta.postTokenBalances=[balance(String(quantity))];
  expect(walletEffects(r,wallet)).toMatchObject({controlledLamportsDeltaExcludingFee:'0',pnlLamports:null,copyAuthority:false});
  r.meta.preBalances=[cash,quantity+reserve];r.meta.postBalances=[cash+quantity+reserve-fee,0];r.meta.preTokenBalances=[balance(String(quantity))];r.meta.postTokenBalances=[];expect(walletEffects(r,wallet).controlledLamportsDeltaExcludingFee).toBe('0');
 }),{numRuns:200});
});
