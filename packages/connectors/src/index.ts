import { createHash } from 'node:crypto';
import { z } from 'zod';
import { address } from '../../domain/src/index.js';

export class ProviderError extends Error {
  constructor(readonly code: 'HTTP_ERROR'|'RATE_LIMITED'|'TIMEOUT_OR_NETWORK'|'INVALID_RESPONSE'|'CIRCUIT_OPEN'|'WRONG_NETWORK'|'UNSUPPORTED_TRANSACTION_VERSION'|'RPC_METHOD_UNSUPPORTED'|'RPC_DATA_UNAVAILABLE'|'RPC_NODE_UNHEALTHY'|'RPC_ERROR') {super(code);}
}
export type Transport = typeof fetch;
export class ReadTransport {
  private failures = 0;
  private retryAt = 0;
  constructor(private readonly fetcher: Transport = fetch, private readonly now = Date.now,private readonly maxBytes=1_000_000) {if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2_000_000)throw new Error('RESPONSE_BOUND_INVALID');}
  async json(url: string, init: RequestInit = {}): Promise<unknown> {
    if (this.now() < this.retryAt) throw new ProviderError('CIRCUIT_OPEN');
    try {
      const response = await this.fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw new ProviderError(response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR');
      // Bound streamed input, not only Content-Length. Never log URL, headers or response text.
      if (!response.body) throw new ProviderError('INVALID_RESPONSE');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > this.maxBytes) {await reader.cancel(); throw new ProviderError('INVALID_RESPONSE');}
        chunks.push(next.value);
      }
      let result: unknown;
      try {result = JSON.parse(Buffer.concat(chunks).toString('utf8'));}
      catch {throw new ProviderError('INVALID_RESPONSE');}
      this.failures = 0;
      return result;
    } catch (error) {
      if (++this.failures >= 3) this.retryAt = this.now() + 30_000;
      throw error instanceof ProviderError ? error : new ProviderError('TIMEOUT_OR_NETWORK');
    }
  }
}
export interface SourceObservation {
  provider: 'dexscreener'|'solana-rpc'|'jupiter-tokens'; sourceKey: string; dataClass: 'LIVE_PROVIDER'|'LIVE_CHAIN';
  receivedAt: string; sourceAt: string | null; slot: string | null; hash: string; payload: unknown;
}
export function observation(provider: SourceObservation['provider'], sourceKey: string, payload: unknown, now: number, slot: string | null = null): SourceObservation {
  return {provider,sourceKey,dataClass:provider === 'solana-rpc' ? 'LIVE_CHAIN' : 'LIVE_PROVIDER',receivedAt:new Date(now).toISOString(),sourceAt:null,slot,hash:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),payload};
}
const profile = z.object({chainId:z.string(),tokenAddress:z.string()});
const profiles = z.array(profile).max(1000);
export class DexScreener {
  constructor(private readonly http = new ReadTransport(), private readonly now = Date.now) {}
  async discover(): Promise<SourceObservation[]> {
    const raw = await this.http.json('https://api.dexscreener.com/token-profiles/latest/v1');
    const parsed = profiles.safeParse(raw);
    if (!parsed.success) throw new ProviderError('INVALID_RESPONSE');
    const unique = new Map<string,SourceObservation>();
    for (const item of parsed.data) {
      if (item.chainId !== 'solana' || !address.safeParse(item.tokenAddress).success) continue;
      unique.set(item.tokenAddress,observation('dexscreener',item.tokenAddress,item,this.now()));
    }
    // Profiles are discovery leads only, not complete market snapshots or fresh trade signals.
    return [...unique.values()];
  }
}
export function rpcResult(raw:unknown):unknown {
 const envelope=z.object({jsonrpc:z.literal('2.0'),id:z.literal(1)}).safeParse(raw);if(!envelope.success)throw new ProviderError('INVALID_RESPONSE');
 const body=raw as Record<string,unknown>;if(Object.hasOwn(body,'error')){const error=z.object({code:z.number().int()}).safeParse(body.error);if(!error.success||Object.hasOwn(body,'result'))throw new ProviderError('INVALID_RESPONSE');const code=error.data.code;throw new ProviderError(code===-32015?'UNSUPPORTED_TRANSACTION_VERSION':code===-32601?'RPC_METHOD_UNSUPPORTED':[-32004,-32007,-32009].includes(code)?'RPC_DATA_UNAVAILABLE':code===-32005?'RPC_NODE_UNHEALTHY':'RPC_ERROR');}
 if(!Object.hasOwn(body,'result')||body.result===undefined)throw new ProviderError('INVALID_RESPONSE');return body.result;
}
export class SolanaReadRpc {
  constructor(private readonly endpoint: string,private readonly http = new ReadTransport(), private readonly now = Date.now) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['127.0.0.1','localhost'].includes(parsed.hostname))) throw new Error('HTTPS_RPC_REQUIRED');
  }
  private async call(method: 'getGenesisHash'|'getSlot', params: unknown[] = []): Promise<unknown> {
    const raw = await this.http.json(this.endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
    return rpcResult(raw);
  }
  async observeSlot(): Promise<SourceObservation> {
    if (await this.call('getGenesisHash') !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw new ProviderError('WRONG_NETWORK');
    const result = z.number().int().nonnegative().safe().safeParse(await this.call('getSlot',[{commitment:'finalized'}]));
    if (!result.success) throw new ProviderError('INVALID_RESPONSE');
    return observation('solana-rpc','finalized-slot',{slot:String(result.data),commitment:'finalized'},this.now(),String(result.data));
  }
}

const decimal=z.string().max(80).regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/);
const metric=z.number().finite().nonnegative();
const pairSchema=z.object({chainId:z.string(),pairAddress:address,dexId:z.string(),
  baseToken:z.object({address:address,name:z.string().max(200),symbol:z.string().max(80)}),
  quoteToken:z.object({address:address,symbol:z.string().max(80)}),
  priceUsd:decimal.nullish(),liquidity:z.object({usd:metric.nullish()}).nullish(),
  volume:z.object({m5:metric.nullish(),h24:metric.nullish()}).nullish(),
  pairCreatedAt:metric.nullish()});
export type MarketPair=z.infer<typeof pairSchema>;
export class DexMarket {
  constructor(private readonly http=new ReadTransport()) {}
  async pairs(mints:string[]):Promise<MarketPair[]> {
    if (!mints.length || mints.length>30 || mints.some(m=>!address.safeParse(m).success)) throw new ProviderError('INVALID_RESPONSE');
    const raw=await this.http.json('https://api.dexscreener.com/tokens/v1/solana/'+mints.join(','));
    const parsed=z.array(pairSchema).max(1000).safeParse(raw);
    if (!parsed.success) throw new ProviderError('INVALID_RESPONSE');
    return parsed.data.filter(p=>p.chainId==='solana' && mints.includes(p.baseToken.address));
  }
}
