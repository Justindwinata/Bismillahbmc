# 10 — Risk Governor Policy and Financial Accounting Truth

## A. Why risk policy is a separate authority

Meme coins may go to zero, cannot always be sold, can have deceptive pools, thin liquidity and smart-contract restrictions. Multi-agent agreement does not reduce these risks. The deterministic Risk Governor and separately hard-limited signer **cannot be voted out** by an LLM. The approximate starting funds (~1 SOL) represent an upper funding context, not permission to spend 1 SOL.

## B. Limits (initially disabled / zero)

Required owner-reviewed variables: max spend per trade, aggregate open exposure, max open positions, per-wallet/per-token exposure, hour/day trade frequency, max loss per day (inclusive realized + fee and mark-to-market uncertainty policy), max fees/day, max slippage/price impact, minimum supported liquidity, minimum SOL fee/rent reserve, data TTL and quote age, provider health quorum, minimum wallet copy signal confidence and max lag, cooldown/duplicate windows, active trading time window and activation expiry.

`config/policy.example.yaml` sets **ZERO** trading allowances. Codex must not silently fill optimistic thresholds or hardcode 1 SOL into a buy command. Owner can configure caps only after learning meaning and paper evidence, re-auth, budget/invariants validation, and signed policy revision audit. Fees and rent reserve calculation must use current actual chain conditions, not a constant assumption.

## C. Safety priority (strict)

1. Operator emergency halt, signer locked, or unauthenticated activation => DENY immediately.
2. Unknown chain state, unknown token authority/extension, uninspectable tx, suspicious transfer => DENY.
3. Stale/contradictory data, provider down, no route, quote expired, network fee high => SKIP.
4. Loss/exposure/frequency/concurrency budgets => DENY; reservations count while orders pending.
5. Valid proposal and verified quote still require **final** Guard+signer check on current wallet balance and policy.
6. Existing exposure is still observed during HALT, but SELL not guaranteed. Emergency close policy must be individually specified and separately tested.

## D. Accounting definitions

For each wallet/asset: opening balance, on-chain deposits, withdrawals, actual fills, network fees, priority fees, account rent, rent refunds, token transfers. Use token base-unit integer and exact currency conversion. No floating point `number` for lamports.

| Term | Calculation / display |
|---|---|
| Deposits/withdrawals | net capital flows, separate from profit |
| Realized PnL | realized proceeds from closed lots less allocated cost basis and execution/network fees |
| Unrealized PnL | executable current quote value (if available) less remaining lot cost basis and expected exit costs; otherwise UNKNOWN |
| Total equity | current reconciled SOL + token valuations with confidence/quote age; foreign-price USD view estimate |
| Net performance | change in equity net of external deposits/withdrawals with appropriate time-weighting/accounting method |
| Hit rate / win rate | settled net-positive closed trade outcomes / relevant closed trade sample; report denominator |
| Drawdown | peak-to-trough net of cash flows on reliable equity series; estimated if data incomplete |
| Execution quality | quote vs actual effective fill, slippage/impact, fees, latency |

External DEX price ≠ guaranteed cashout. Mark untradeable or illiquid inventory with explicit uncertainty and **do not manufacture a realizable USD value**. Balance increase due to funding must not be shown as profit. Paper trades must live in separate ledger and separate equity chart.

## E. Account invariant examples

- `availableLamports >= plannedInputLamports + reservedFeesAndRent + maxOutstandingReservedLamports`
- `proposedExposure + existingExposure + outstandingReservations <= maxTotalExposure`
- `actualDailyLoss + conservativeKnownExposureRisk <= user-defined loss budget` (exact policy semantics documented and tested)
- `max(allowableSignerSpend) <= activatedOwnerMandateCap`; signer cannot enlarge limits.
- a single `intentId` may have no second executed BUY if prior signed submission is UNCERTAIN; reconcile first.

## F. Must-run risk tests

Property-based tests for extreme/negative/overflow amounts, decimals 0..9+ from chain, different token programs, numerous concurrent agent proposals, stale timestamps, missing data, wrong network, replay, fake pool, action EXIT in HALT. Counterexample must lead SKIP/HALT rather than accidental sign. Track test failures and machine evidence.

## G. User education

A nominal 1 SOL can be depleted by losses and fees. No fixed win rate or positive return target is a valid acceptance gate. Before live, owner chooses explicitly affordable loss amount, not the entire bankroll, and reviews network cost and withdrawal logistics; do not default-enable or suggest automatic all-in.
