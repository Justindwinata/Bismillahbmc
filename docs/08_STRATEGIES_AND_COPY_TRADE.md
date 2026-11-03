# 08 — Trading Strategies, Wallet Monitoring, Mirroring, Exit Policies

## A. Strategy mandate

This is a **strategy framework**, not a promise of profitable edge. Configure conservative deterministic baselines in PAPER first; evaluation must compare strategy vs null/no-trade and simple benchmarks after realistic costs. For meme coins, adverse selection, rugs, MEV, fake volume and inability to exit may dominate any signal.

## B. Discovery pipeline

- Ingest token/pool list from trusted adapter, validate chain/mint, collect liquidity, age, trade counts, volume windows, price, concentration/security data.
- Each `TokenCandidate` has input snapshot hash, time/slot and quality flags; duplicate pool listings do not trigger repeated buys.
- Exclude missing risk data, unidentified token program, unsupported extension, unsupported exit route, stale updates. Token names are displayed safely, never used as unique ID.

## C. Candidate scoring is never the safety gate

A transparent score may include momentum vs noise, changing liquidity, volume trend, spread/price impact, pool age, distribution and smart-wallet signals. Scores are **research features** with explicit lookback and no future leakage. Reweighting cannot override security checks. Record score version and source windows.

## D. Smart wallet watchlist & copy feed

1. User adds public address; backend validates base58 and existence when applicable, dedupes, optionally backfills wallet history.
2. Decode actual source wallet swaps where possible; show signature, trade direction, source wallet, mint, observed slot/time, lag, value estimate, decoder confidence and funding loops.
3. A copied trade becomes **candidate intent**, not immediate order: `observed BUY` → verify token/route/liquidity → independently check source-wallet age and suspicious links → compare current price impact/slippage with observed trade → strategy signal → sizer → Guard veto → own fresh quote → executor.
4. An observed SELL may inform exiting our own position, but does not create an unbounded SELL of an unrelated token. Avoid copying wallets with self-trades/related developer clusters or large lag.
5. Wallet returns/leaderboards based on limited transactions are not a verified trader track record; unrealized holdings, fees, transfers, airdrops and hidden account control make apparent success misleading.
6. When the observed wallet changes course within seconds, avoid order-churn and duplicate mimics; use cooldown and per-source limits.

## E. Decision concurrency and conflict

Several watched wallets or agents can signal the same token at once. The net policy computes one unique budget reservation per intent, portfolio-wide exposure and group concentration. If two strategies disagree, deterministic conflict rule defaults SKIP. No agent individually funds or moves assets.

## F. Exit strategy framework

Provide policy fields with owner-defined, paper-tested values: max holding time, trailing stop, take profit, hard loss, liquidity decline, abnormal token authority changes, watched-wallet reversal, quote deterioration, stale price, emergency HALT. **A stop-loss threshold is a signal, not a guaranteed exit**; illiquid or frozen coins may become unsellable. Warn of failed/partial SELL attempts, net of fees.

## G. Evaluation metrics

- Forward paper: number of candidates, pass/reject reason counts, eligible routes, quote-to-fill estimates, latency, fees, simulated drawdown, unrealized exposure, fail-to-exit rate.
- Micro-live: buy/sell signatures, actual received/paid, realized net PnL excluding funding, failed orders, slippage, network fees, max exposure, operational uptime and safety incidents.
- A winning strategy must demonstrate enough out-of-sample evidence and conservative transaction costs; no profit target or 100% win contract.
- Training/research data split chronological with embargo where applicable to avoid leakage. No cherry-picking only winners or survivor wallets.

## H. Safety/regulatory exclusions

No launchpad exploit, private mempool manipulation, sandwiching/front-running, wash trading, bot protections bypass, third-party account access, cashout by automating KYC, or copy trading with a third party's private key. Watch only public wallet activity and trade only funds controlled by the owner.
