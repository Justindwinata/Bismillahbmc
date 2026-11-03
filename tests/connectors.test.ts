import { it,expect,vi } from 'vitest';
import { ReadTransport,DexScreener,SolanaReadRpc,observation } from '../packages/connectors/src/index.js';
const mint = 'So11111111111111111111111111111111111111112';
const response = (body: unknown,status=200) => new Response(JSON.stringify(body),{status});
it('normalizes actual provider contract and dedupes mints without fabricated source time',async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([{chainId:'solana',tokenAddress:mint},{chainId:'solana',tokenAddress:mint},{chainId:'ethereum',tokenAddress:'bad'},{chainId:'solana',tokenAddress:'bad'}]));
  const result = await new DexScreener(new ReadTransport(fetcher),() => 1000).discover();
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({sourceKey:mint,sourceAt:null,slot:null,dataClass:'LIVE_PROVIDER',receivedAt:'1970-01-01T00:00:01.000Z'});
  expect(result[0]!.hash).toHaveLength(64);
});
it('rejects invalid provider schema',async () => {
  await expect(new DexScreener(new ReadTransport(vi.fn<typeof fetch>().mockResolvedValue(response({})))).discover()).rejects.toThrow('INVALID_RESPONSE');
});
it('bounds payload, parses errors and suppresses raw provider secrets',async () => {
  for (const res of [new Response('invalid json'),new Response('x'.repeat(1000001)),new Response(null)]) {
    await expect(new ReadTransport(vi.fn<typeof fetch>().mockResolvedValue(res)).json('https://fixture')).rejects.toThrow('INVALID_RESPONSE');
  }
  await expect(new ReadTransport(vi.fn<typeof fetch>().mockRejectedValue(new Error('secret canary'))).json('https://fixture')).rejects.toThrow('TIMEOUT_OR_NETWORK');
  await expect(new ReadTransport(vi.fn<typeof fetch>().mockResolvedValue(response({},500))).json('https://fixture')).rejects.toThrow('HTTP_ERROR');
});
it('opens circuit after rate failures and recovers after cooldown',async () => {
  let now = 0;
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async () => response({},429));
  const transport=new ReadTransport(fetcher,() => now);
  for (let i=0;i<3;i++) await expect(transport.json('https://fixture')).rejects.toThrow('RATE_LIMITED');
  await expect(transport.json('https://fixture')).rejects.toThrow('CIRCUIT_OPEN');
  expect(fetcher).toHaveBeenCalledTimes(3);
  now=30001;fetcher.mockResolvedValue(response({ok:true}));
  expect(await transport.json('https://fixture')).toEqual({ok:true});
});
it('validates genesis and safe finalized slots, no send method',async () => {
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async (_url,init) => {
    const req=JSON.parse(String(init!.body)) as {method:string};
    return response({jsonrpc:'2.0',id:1,result:req.method === 'getGenesisHash' ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' : 123});
  });
  const rpc=new SolanaReadRpc('http://localhost:8899',new ReadTransport(fetcher),() => 1000);
  expect(await rpc.observeSlot()).toMatchObject({slot:'123',dataClass:'LIVE_CHAIN'});
  expect(fetcher.mock.calls.map(c => (JSON.parse(String(c[1]!.body)) as {method:string}).method)).toEqual(['getGenesisHash','getSlot']);
  expect(() => new SolanaReadRpc('http://untrusted.example')).toThrow('HTTPS_RPC_REQUIRED');
  await expect(new SolanaReadRpc('https://fixture',new ReadTransport(vi.fn<typeof fetch>().mockResolvedValue(response({jsonrpc:'2.0',id:1,result:'wrong'})))).observeSlot()).rejects.toThrow('WRONG_NETWORK');
});
it('rejects RPC error envelope',async () => {
  await expect(new SolanaReadRpc('https://fixture',new ReadTransport(vi.fn<typeof fetch>().mockResolvedValue(response({error:{message:'secret'}})))).observeSlot()).rejects.toThrow('INVALID_RESPONSE');
  expect(observation('solana-rpc','slot',{},0).sourceAt).toBeNull();
});
it('market enrichment accepts canonical pairs and leaves absent metrics unknown',async()=>{
  const {DexMarket}=await import('../packages/connectors/src/index.js');
  const pair={chainId:'solana',dexId:'FIXTURE',pairAddress:mint,baseToken:{address:mint,name:'FIXTURE token',symbol:'FIXTURE'},quoteToken:{address:mint,symbol:'SOL'},priceUsd:'0.001',volume:{m5:12},liquidity:null};
  const market=new DexMarket(new ReadTransport(vi.fn<typeof fetch>().mockResolvedValue(response([pair]))));
  expect((await market.pairs([mint]))[0]!.liquidity).toBeNull();
  await expect(market.pairs(['bad'])).rejects.toThrow('INVALID_RESPONSE');
  await expect(new DexMarket(new ReadTransport(vi.fn<typeof fetch>().mockResolvedValue(response([{...pair,priceUsd:'NaN'}])))).pairs([mint])).rejects.toThrow('INVALID_RESPONSE');
});

it('pool proof transport permits bounded program evidence without removing general response limits',async()=>{
 const data={proof:'x'.repeat(1_100_000)};const fetcher=()=>Promise.resolve(new Response(JSON.stringify(data)));await expect(new ReadTransport(fetcher).json('https://fixture')).rejects.toThrow('INVALID_RESPONSE');await expect(new ReadTransport(fetcher,Date.now,2_000_000).json('https://fixture')).resolves.toEqual(data);await expect(new ReadTransport(()=>Promise.resolve(new Response(JSON.stringify({proof:'x'.repeat(2_000_001)}))),Date.now,2_000_000).json('https://fixture')).rejects.toThrow('INVALID_RESPONSE');expect(()=>new ReadTransport(fetch,Date.now,2_000_001)).toThrow('RESPONSE_BOUND_INVALID');
});
