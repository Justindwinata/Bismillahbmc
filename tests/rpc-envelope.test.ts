import {it,expect} from 'vitest';
import {rpcResult,ProviderError} from '../packages/connectors/src/index.js';
import {providerDimensions,blockerCategory} from '../packages/domain/src/health.js';
it('RPC capability/history/node failures are distinct from failed on-chain receipts, and no provider text is exposed',()=>{
 for(const [code,reason]of [[-32015,'UNSUPPORTED_TRANSACTION_VERSION'],[-32601,'RPC_METHOD_UNSUPPORTED'],[-32004,'RPC_DATA_UNAVAILABLE'],[-32007,'RPC_DATA_UNAVAILABLE'],[-32009,'RPC_DATA_UNAVAILABLE'],[-32005,'RPC_NODE_UNHEALTHY'],[-32602,'RPC_ERROR']] as const){let error:unknown;try{rpcResult({jsonrpc:'2.0',id:1,error:{code,message:'FIXTURE_PROVIDER_TEXT_MUST_NOT_ESCAPE'}});}catch(e){error=e;}expect(error).toBeInstanceOf(ProviderError);expect((error as Error).message).toBe(reason);expect(providerDimensions('DEGRADED',reason,'solana-rpc')).toMatchObject({transport:'REACHABLE',quality:'ERROR'});}
 expect(blockerCategory('UNSUPPORTED_TRANSACTION_VERSION')).toBe('UNSUPPORTED_OR_UNREVIEWED');expect(blockerCategory('RPC_NODE_UNHEALTHY')).toBe('PROVIDER_OR_DEPENDENCY_FAILURE');const failed={meta:{err:{InstructionError:[0,'Fixture']}}};expect(rpcResult({jsonrpc:'2.0',id:1,result:failed})).toBe(failed);expect(rpcResult({jsonrpc:'2.0',id:1,result:null})).toBeNull();
});
it('missing/wrong-id/ambiguous RPC envelopes never turn into a success',()=>{for(const raw of [null,{},[],{jsonrpc:'2.0',id:2,result:0},{jsonrpc:'2.0',id:1},{jsonrpc:'2.0',id:1,error:null},{jsonrpc:'2.0',id:1,result:0,error:{code:-32015}}])expect(()=>rpcResult(raw)).toThrow('INVALID_RESPONSE');});
