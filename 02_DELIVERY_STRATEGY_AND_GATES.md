# SOLANA SENTINEL — Delivery Strategy: R3 to Complete Product
Baseline: R3 sanitized snapshot, source commit claimed `c378720f6e865018e168d25555fcede71f3a1181`; verify actual HEAD locally. All work within existing repository. Do **not** transplant sanitized export onto the live working tree automatically.

## Product contract
Build a standalone 24/7 Solana trading web app, with a dashboard equivalent in *function* and key visual information to BOTH reference videos: token discovery, independent smart wallet monitor and copy signals, eleven role pipeline with explicit coordination, trading decisions, risk guard, wallet balances and deposits, positions/entry/exit/tape, honest equity/PnL, and genuine independently verifiable Solana swap lifecycle after explicit approvals. The application must continue to operate when Codex and browser are closed. Copying video returns/profitability, artificial win rates, guaranteed returns, or matching unmeasured execution speed is NOT a requirement and must not be claimed.

## Work sequencing: prioritize COMPLETE VERTICAL SLICES, not stubs
Each increment must connect source → validation → durable event → backend API → dashboard → Playwright → crash/restart evidence. Do not create empty pages, fake portfolio figures, decorative agent conversations or success-only tests.

### R3.1 — Stabilize current foundation and remove deadlocks [FIRST]
1. Verify HEAD, working tree, CI and exported manifest; preserve commit.
2. Repair market candidate selection (top latest distinct mints, not lexical first five) and provide fairness/limit rationale.
3. Implement explicit market freshness semantics and a positive `FILTER PASS` path only when actually validated policy thresholds and sources are satisfied; stale/unknown still veto/skip.
4. Refactor role outputs so strategy/sizing/Guard can support **PAPER** approvals under rigorously validated policy, but mainnet stays locked. Preserve immutable decision traces, separated per-mode authority and fail-closed behavior.
5. Add integration testing for worker agent cycle, market cycle, WebSocket/cursor and storage; raise high-risk coverage and document branch percentage by module.
**Acceptance**: nonfinancial scenario can show VALIDATED + paper BUY/SELL PROPOSAL and missing-data scenario SKIP/VETO; no mainnet authority, no false balances. R3.1 PASS only with tested code/fixtures and browser trace.

### R3.2 — Trustworthy on-chain token security + robust market feeds
- Read mint owner, authority, supply, decimals, token program, extensions, freeze, metadata, holder distribution/ownership, liquidity pool/route ownership; classify PASS/VETO/UNKNOWN with slot, evidence age and hash. Token-2022 transfer fees/permanent delegates require explicit support/deny; never infer safety from a third-party "rug score" alone.
- Improve pool discovery beyond `token-profiles/latest` (profiles are not exhaustive), integrate an approved provider or on-chain program feed. Implement timeouts, quotas, watermark, dedupe, 429, provider failures, stale labels. Keep configurable watch sources/allowlists.
- Establish measurable freshness for market source, pool, quote, wallet signal and transaction separately.
**Acceptance**: positive/negative/unknown security fixtures and at least one non-fabricated trace from actual mainnet read-only mint/pool; expiration and unsupported programs SKIP.

### R3.3 — True wallet intelligence and copy feed
- Expand public wallet watchlist from bounded two-address prototype with measured provider capacity; per-wallet `logsSubscribe`, polling fallback, paginated `getSignaturesForAddress`, durable high-water marks, gap recovery and receipts. Handle native SOL, WSOL, rent, instructions+inner CPI, Token-2022, DEX venues, failed transactions, deposits/transfers vs swap; do not label a transfer as a trade.
- Produce `WalletSignal` with signature, slot, source time, ingest time, quote direction, amounts, latency, confidence, unknown flags; compute conservative copy eligibility based on independent security/liquidity/drift, freshness and user policy.
- Build wallet detail analytics and link to the observed Solana Explorer transaction; seed one *public known trade* through observed chain replay only when signature is independently verified, not fake.
**Acceptance**: at least one genuine independently verifiable observed public wallet swap (or mark externally BLOCKED and still validate fixtures), accurate no-signal state, no duplicate signal on reconnect; all copy orders disabled until later owner gate.

### R3.4 — Persistent PAPER / SHADOW full trading loop
- Replace standalone in-memory paper class as the only persistence with mode-separated DB ledgers, durable sessions, quotes, position lots, entry/exit rules and loss/fee/rent/slippage calculation; no-fills when quotes stale or trades impossible, price impact, available liquidity and fee reserve.
- Strategy proposals (original paper rule + conservative wallet mirror, both versioned), position sizing, account-level atomic exposure reservation, kill switch, cooldown, daily loss; Guard can authorize **paper-only synthetic intents** under hard restrictions. Exits not assumed executable; test unsellable/rug/route-unavailable.
- Build deterministic replay, out-of-sample comparisons and evidence of latency/cost; use real provider inputs but mark fills clearly `PAPER_SIM` and historical prices as replay, not LIVE.
**Acceptance**: accepted+rejected paper scenarios, persistent restarting, partial fills/FIFO/cost basis, deposit-adjusted P&L, capital controls; no signer and no mainnet broadcast.

### R4 — Complete UI and Phantom identity (end-to-end)
- Create functional `/positions`, `/trades`, `/rules`, `/analytics`, `/settings/integrations`, `/setup` and enrich existing overview, token scanner, agent council, smart wallets, copy feed, risk and audit.
- Add equity chart, live position table, net P&L, gas/fee totals, liquidity status, candidate-to-intent drilldown, agent conversation as structured audited evidence, real-time speed/lag and polling indicators, alerts, wallet radar; accurate mode/record provenance on every finance value. UI states `UNKNOWN`, `STALE`, `BLOCKED`, `HALTED`, `NOT_CONNECTED` explicitly.
- Phantom connect + cryptographic sign-message nonce challenge, bound domain+chain+expiry+account and replay protection. Phantom is **owner wallet UI**, not auto-signing hot-wallet key. Show manual deposit/funding/withdraw guidance and address/chain verification; never ask for seed phrases.
- Maintain current charcoal terminal baseline, improve expressive agent visualization and dense chart layout to match both video information architectures. Side-by-side visual acceptance matrix and Playwright desktop + 390px mobile screenshots, keyboard and scroll usability.
**Acceptance**: every PRD-required route exists with useful real/paper backend data, wallet linkage validated; no placeholder pretend live profit; all high-risk buttons backend-enforced and security tested.

### R5 — Complete but disabled Jupiter execution/signer/reconciliation
- Implement typed versions/pinned API for Jupiter `/order` and `/execute` with requestId retention, independent Solana RPC transaction status/receipt checks, exact mint/amount/program/account/ALT/fee-payer and token-extension validation, quote freshness, slippage/price-impact and spend/rent budget, caller/authent constraints. No arbitrary serialized tx signing.
- Separate isolated signer process with narrow IPC and independently rechecked owner policy, no keys on frontend/API/LLM; test-only/devnet key provisioning. CI always signer disabled. Test malicious substituted destination, CPI, ALT, unknown program, wrong owner/mint, compromised provider response.
- Durable trade intent state machine, idempotent submit after uncertain timeout, `UNCERTAIN` quarantine (never blindly retry), independent confirmed/finalized receipt, reconciliation of exact pre/post token/SOL balances and fee/rent, self-trade block, safe exit monitoring.
**Acceptance**: end-to-end test harness can generate and refuse malicious intents, track transaction signature and receipts in sandbox/devnet where representative, no mainnet financial operations; security review passes or honestly BLOCKED.

### R6 — Production readiness and qualification
- Implement hardened deploy (public HTTPS web, isolated private API/worker/signer/DB, trusted reverse proxy, no browser service token, least-privilege DB, secret management, network ACL, rate limits, per-provider budgets, metrics, alerting, crash supervision), encrypted backup and verified restoration, disaster recovery/runbook.
- Actually execute **24 hours continuous SHADOW** + **7 days observation target** as specified in project roadmap, fault injections (RPC, 429, WS, chain reorg or gaps, DB, signing service, clock skew), replay audits, cost and SLO measurements. These durations cannot be compressed by artificial timestamps or prior logs.
- Independent code/security review, supply chain/dependency/license review; run all unit/property/integration/e2e and end-to-end chaoses; no open critical findings.
**Acceptance**: produce distinct G0–G3 gate reports with actual timestamps; `CODE_COMPLETE_OWNER_BLOCKED` only if all software gates really pass and only owner action prevents finance activation.

### R7 — Separate live financial activation (NEVER auto-authorize)
- No deposit, wallet-key provision, paid subscription, mainnet BUY or SELL in this coding prompt. Owner must separately approve an exact time-bounded micro-live mandate after reviewing the full risk and receipt matrix.
- With that approval only: isolated funded low-balance hot wallet, explicit caps/reserve and no auto withdrawal, manually reviewed address and terms; one micro BUY and micro SELL with links to *independently verified finalized* signatures and costs. Failed/no exit remains NOT_VERIFIED, not forged.
- Only AFTER micro-live reconciliation/security acceptance, request separate owner approval to enable CAPPED_AUTO; time-bound/amount-bound session, emergency halt, reconciled ledger, 24/7 alerts. Idle/no-trades are valid when risk veto applies. Never target a profit percentage.

## Engineering constraints and continuity
- No rewrite from scratch; preserve tests, migrations, archived evidence and original PRD. Implement in small reviewed commits; `git status --short`, `git diff --check`, source manifest, verified package lock, full last-green suite at every checkpoint.
- Store evidence at `evidence/R4/...` onward, with command, UTC timestamp, exit status, file hash, screenshot/trace, real versus fixture flags. Restrict keys, passwords, cookies, CSRF, recovery phrases and signing inputs from logs/evidence.
- Treat Python/Node/SQL production changes as reviewed code; DB migrations reversible/backupable, do not silently reset HALTED state or mutate financial records. Provide `RESUME` only when authenticated, policy-approved and audit logged; no direct SQL bypass.
- Prioritize domain business value and demonstrable working functionality over repeated generic docs or decorative dashboard.
- Each increment must conclude: what actually changed, demonstrated behavior, test commands/results, live/no-money proof, open risks, next smallest steps and exact git SHA.
- No profit, identical video earnings or real-time performance guarantee. Transparent costs (transaction fees, priority fees, rent, paid providers, VPS, model API independent of Plus).

## Completion scorecard (ALL required, except separate owner gate)
1. All pages and data provenance complete with desktop/mobile browser proof.
2. All eleven roles execute meaningful input-specific logic; demo validated accepted PAPER signals and vetoes, not 11 constant labels.
3. Mainnet public wallet monitoring decodes real swaps, with measurable latency and durable replay.
4. Security filter handles incomplete data and SPL/Token-2022 properly.
5. Durable PAPER+SHADOW can demonstrate calibrated entry/exits, fees, performance and crash recovery.
6. Phantom connects securely without revealing mnemonic or enabling unattended signing.
7. Jupiter order/execution code + signer harness hardened and disabled until owner mandates.
8. Test suites, security, backup/restore, monitoring/alert and actual qualification duration evidence.
9. Only owner-authorized finance gates permit micro-live and capped-auto; otherwise label CODE_COMPLETE_OWNER_BLOCKED if justified.
