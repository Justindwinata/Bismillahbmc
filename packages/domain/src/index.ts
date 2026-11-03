import { z } from 'zod';

// No float, exponent, leading zero, sign, or whitespace may enter base-unit money.
export const baseUnits = z.string().refine(v => v.length <= 20 && /^(0|[1-9][0-9]*)$/.test(v) && BigInt(v) <= 18446744073709551615n);
export function parseUnits(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('INVALID_DECIMALS');
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) throw new Error('INVALID_AMOUNT');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error('PRECISION_LOSS');
  return BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

export const modes = ['OBSERVE','PAPER','SHADOW','MICRO_LIVE','CAPPED_AUTO','HALTED'] as const;
export const roles = ['DESK','SCOUT','FILTER','RUG_CHECK','ANALYST','STRATEGY','SIZER','GUARD','EXECUTOR','LOGGER','EQUITY'] as const;
export const dataClasses = ['LIVE_CHAIN','LIVE_PROVIDER','DERIVED','PAPER_SIM','REPLAY'] as const;
// Bootstrap intentionally supports no financial mode. A future gated activation is separate code.
export const bootstrapEnv = z.object({
  DEFAULT_MODE: z.literal('OBSERVE').default('OBSERVE'),
  LIVE_TRADING_ENABLED: z.literal('false').default('false'),
  SIGNER_ENABLED: z.literal('false').default('false'),
  LLM_ENABLED: z.literal('false').default('false'),
  OWNER_AUTH_REQUIRED: z.literal('true').default('true'),
  ALLOW_EXTERNAL_TELEMETRY: z.literal('false').default('false'),
});

const zero = z.literal('0');
const pending = z.null();
export const bootstrapPolicy = z.strictObject({
  version:z.literal('1'), mode:z.literal('OBSERVE'), network:z.literal('solana-mainnet'),
  live_trading_enabled:z.literal(false), signer_enabled:z.literal(false), owner_activation_id:pending,
  risk:z.strictObject({max_total_exposure_lamports:zero,max_new_position_lamports:zero,
    max_open_positions:z.literal(0),max_new_trades_per_hour:z.literal(0),max_daily_loss_lamports:zero,
    max_fees_per_day_lamports:zero,min_gas_reserve_lamports:pending,max_price_impact_bps:pending,
    max_slippage_bps:pending,min_liquidity_usd:pending,quote_max_age_ms:pending,source_max_age_ms:pending,
    cooldown_seconds:pending,require_security_check:z.literal(true),fail_closed_on_provider_loss:z.literal(true),
    halt_on_balance_discrepancy:z.literal(true),prohibit_auto_withdrawal:z.literal(true),
    allow_unverified_token_extensions:z.literal(false),exit_only_when_halted:z.literal(false)}),
  copy_trade:z.strictObject({enabled:z.literal(false),monitored_wallet_addresses:z.tuple([]),
    max_observed_trade_lag_ms:pending,max_quote_drift_bps:pending,skip_self_trades:z.literal(true),require_independent_entry_signal:z.literal(true)}),
  llm:z.strictObject({enabled:z.literal(false),max_calls_per_hour:z.literal(0),max_spend_usd_per_day:zero,on_error:z.literal('SKIP')}),
  execution:z.strictObject({allowed_program_ids:z.tuple([]),allowed_input_mints:z.tuple([]),allowed_output_mints:z.tuple([]),
    allowed_trading_wallet_addresses:z.tuple([]),withdrawal_whitelist_addresses:z.tuple([]),
    never_sign_arbitrary_serialized_tx:z.literal(true),max_signatures_per_intent:z.literal(1)}),
});

// Validate decoded length, including leading zero bytes; a ticker is never an address.
export function validAddress(address: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false;
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const char of address) value = value * 58n + BigInt(alphabet.indexOf(char));
  let bytes = 0;
  while (value > 0n) { bytes++; value >>= 8n; }
  return bytes + (address.match(/^1*/)?.[0].length ?? 0) === 32;
}
export const address = z.string().refine(validAddress, 'INVALID_ADDRESS');
export function freshness(sourceAt: number | null, now: number, ttlMs: number): 'FRESH'|'STALE'|'UNKNOWN' {
  if (sourceAt === null || !Number.isFinite(sourceAt) || !Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0 || sourceAt > now) return 'UNKNOWN';
  return now - sourceAt <= ttlMs ? 'FRESH' : 'STALE';
}
export const intentStates = ['CREATED','PRECHECKED','QUOTED','TX_VERIFIED','SIGNED','SUBMITTED','UNCERTAIN','CONFIRMED','FINALIZED','RECONCILED','FAILED','EXPIRED','CANCELLED'] as const;
export type IntentState = typeof intentStates[number];
const edges: Record<IntentState, readonly IntentState[]> = {
  CREATED:['PRECHECKED','CANCELLED'],PRECHECKED:['QUOTED','FAILED','CANCELLED'],
  QUOTED:['TX_VERIFIED','EXPIRED','CANCELLED'],TX_VERIFIED:['SIGNED','EXPIRED','CANCELLED'],
  SIGNED:['SUBMITTED','UNCERTAIN'],SUBMITTED:['UNCERTAIN','CONFIRMED','FAILED'],
  UNCERTAIN:['CONFIRMED','FAILED'],CONFIRMED:['FINALIZED'],FINALIZED:['RECONCILED'],
  RECONCILED:[],FAILED:[],EXPIRED:[],CANCELLED:[],
};
export function transition(from: IntentState, to: IntentState, chainProof = false): IntentState {
  if (!edges[from].includes(to)) throw new Error('INVALID_TRANSITION');
  if ((from === 'UNCERTAIN' || to === 'CONFIRMED' || to === 'FINALIZED' || to === 'RECONCILED') && !chainProof) throw new Error('CHAIN_PROOF_REQUIRED');
  return to;
}
export function bootstrapVeto(halted: boolean) {
  return {action:'SKIP' as const,authorized:false as const,reasons:halted ? ['KILL_SWITCH_ACTIVE'] : ['MODE_NOT_LIVE','SIGNER_LOCKED','OWNER_ACTIVATION_MISSING','ZERO_CAPS']};
}
