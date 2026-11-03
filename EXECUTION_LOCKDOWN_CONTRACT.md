# SOLANA SENTINEL AI — EXECUTION LOCKDOWN CONTRACT

**Version:** 1.0 — 2 November 2026  
**Project:** Existing Solana Sentinel AI monorepo  
**Expected last reported checkpoint:** `d3816f6e09f3abc0e8354e3093969137ceb8b244` (verify in local Git; never assume)  
**Authority:** This document **tightens delivery and evidence requirements**; it does not supersede safety controls in `AGENTS.md`, the PRD, or owner authorization gates. The strictest safe constraint wins.  
**Mission:** Finish the existing web product as an integrated, continuously operating Solana market intelligence and trading system, without replacing genuine trading with mock UI or falsely promoting replay results to production evidence.

## 0. Mandatory execution rules — non-negotiable

1. **CODE FIRST, INCREMENTAL:** Read relevant baseline/PRD/contracts, reproduce working tree and focused tests, then edit and integrate production code immediately. Do not spend an entire iteration rewriting PRDs, producing plans, or redesigning working pages. Keep documents limited to implementation status, evidence, and decisions materially affecting the code.
2. **NO REWRITE / NO PARALLEL PRODUCT:** Preserve current monorepo, database, migrations, routes, APIs, agent contracts, event history, tests and UI unless a defect makes a change necessary. No new framework, agent count, product name, mock replacement or independent demo repo.
3. **ONE FUNCTIONING SYSTEM:** Agent Council, worker, data collectors, wallet intelligence, risk, PAPER/SHADOW ledger, order engine, API, DB, and dashboard must use shared typed contracts, durable events, explicit provenance and single-authority mode/policy state. A green isolated unit test is not an end-to-end deliverable.
4. **NO FAKE LIVE:** Never label replay, fixtures, synthetic prices, unsupported quotes, simulated fills, absent wallet balance, model-generated agent dialogue, or backtested performance as `LIVE`. Distinguish `REPLAY_TEST`, `LIVE_PROVIDER_PAPER`, `SHADOW`, and `MAINNET_EXECUTED` at the DB, API, and UI layers.
5. **NO UNSAFE GATE REMOVAL:** `UNKNOWN`, unreviewed upgradeable program revisions, stale receipts, incomplete token semantics, uncertain order state, and malformed wallet receipts remain fail-closed for **new entry**. Do not manipulate screening requirements merely to generate a BUY.
6. **NO AUTOMATIC FINANCIAL AUTHORIZATION:** Coding, tests, read-only mainnet observations, test harnesses, and devnet activity are authorized. Creating/importing the owner's private keys, depositing/transferring SOL, paid subscriptions, sending mainnet trades, and enabling unattended real-money activity are **not** authorized by this instruction. MICRO_LIVE and CAPPED_AUTO each require separate, explicit, bounded owner approval.
7. **NO SUCCESS-BY-STATUS:** Do not manually rename `IN_PROGRESS` to `LIVE_VERIFIED`, set readiness to 200, forge signatures, force `PASS`, edit test expectations to hide failures, or silently disable checks. A requirement passes only with actual demonstrated behavior and retained evidence.
8. **NO ABANDONED FAILURES:** A failed check must be fixed or precisely reported. Preserve failure evidence with the final green rerun. Do not leave stale processes, mixed test/production data, or uncommitted production changes.
9. **NO WAITING ON NON-BLOCKING DECISIONS:** If a specific provider or financial gate requires owner action, record it precisely and continue other safe engineering work. Do not stop at a plan when implementation can proceed.
10. **CLEAR FINISH LINE:** The target is `SOFTWARE_QUALIFIED_FOR_OWNER_ACTIVATION`, then owner-gated `MICRO_LIVE_VERIFIED`, then separately owner-gated `CAPPED_AUTO_VERIFIED`. These are distinct states. No one-session deadline can substitute for time-based security/soak evidence.

## 1. Current verified/reported baseline to confirm in code

Reported CP1 and CP2 checkpoints: `4a74e77` and `d3816f6e09f3abc0e8354e3093969137ceb8b244`.

Prior evidence reports: 91 combined unit/PostgreSQL tests and 22 Playwright desktop/mobile tests passing; coverage focused on pool security ~97.98% branch; live provider verified **observation, quote and SKIP**; positive PAPER BUY/SELL only `REPLAY_TEST`. These are **claims to reproduce**, not a blanket PASS for the product. Two real CPMM pools were `UNKNOWN` because program revision was not independently reviewed/pinned. Existing Phantom proof is limited to address ownership and finalized native SOL; current executor does not submit mainnet swaps. Wallet mirroring eligibility is not complete. Persistent HALT after STOP is expected until authenticated recovery per policy.

**At startup:** `git status --short`, `git rev-parse HEAD`, inventory changed files, verify migrations and current database connections, replay last relevant checks. If HEAD differs, analyze legitimate intervening changes and preserve them. Never reset or discard owner changes.

## 2. Strict delivery priority: only the critical path

### P0-A — Make eligibility decisions correct and auditable

Deliver a supported venue/program registry (including explicit on-chain program revision pin review; never automatically approve a discovered upgrade) with bounded, immutable evidence for Raydium CPMM currently supported. For each candidate capture chain/genesis/slot, token mint and Token/Token-2022 semantics, authorities, holder coverage or unknown, pool/vault owners, principal liquidity, fee/rent assumptions, on-chain program identity/revision, quote route, freshness, and rejection reasons.

Separate **ENTRY** from **PROTECTIVE EXIT**: entry rejects incomplete/ineligible evidence; exits for an already-held token require independently safe transfer route, executable quote, fee-aware positive net proceeds, and actual quantity—do not block every risk-reducing exit merely because entry criteria deteriorated. If exit is impossible, preserve inventory, record `EXIT_UNAVAILABLE`, alert, and never fabricate proceeds. Unsupported venues/extensions stay UNKNOWN until qualified.

**Acceptance:** test legitimate support, revisions changed, revoked pin, mismatched vault, stale quote, unsupported Token-2022 extension, illiquid pool, fee-consumed SELL, halted state, concurrent spend, restart and lost provider. Use real read-only RPC samples when possible and replay fixtures only for negative/positive deterministic test cases.

### P0-B — Close the full live-provider PAPER/SHADOW loop

Persist a genuinely autonomous scheduler and ledger with the entire path:

`DISCOVER → ONCHAIN_VERIFY → GET_FRESH_BUY_QUOTE → ANALYST/STRATEGY → SIZE → GUARD → VIRTUAL_BUY → MONITOR_POSITION → FRESH_SELL_QUOTE → PROTECTIVE/STRATEGY_EXIT → VIRTUAL_SELL → RECONCILE → EQUITY/AUDIT/DASHBOARD`.

The scheduler must run with browser closed, survive restart, own durable leases and idempotency, revalidate quote TTL and budgets at each transition, support partial exits, account for fees/priority/rent/slippage and distinguish no-fill/blocked exits. No future-data leakage. Maintain correct deposits/withdrawals as capital flow, not profit. Every quote/fill and UI row must declare source mode. A valid `SKIP` is the correct outcome if no real candidate is qualified; provide a bounded evidence report (universe sampled, time window, reasons and feed-health), **not** a forced trade.

**Acceptance:** positive BUY→SELL from real provider signals only when independently qualified; separate replay BUY→SELL tests are still mandatory. A real-provider `SKIP` does not satisfy positive-real-market acceptance. Provide time-stamped provider receipts, database lineage, quote age, decision trace, positions/equity, worker restart proof and Playwright UI evidence.

### P0-C — Finish smart-wallet observation and Phantom UX

Observe owner-approved **public** smart-wallet addresses: finalized/confirmed receipt handling with explicit policy, dedup/cursor completeness, reconnection/backfill, native SOL/WSOL and rent changes, inner CPI and multi-hop routes, per-token pre/post deltas, owner attribution, transaction links, fees and token programs. Promote a copy signal to `ELIGIBLE` only after fully grounded swap semantics and all checks; a signal **never** bypasses market or Guard verification. Measure observation lag and provider gaps.

Phantom connects as owner wallet for signature challenge and read-only balances/portfolio. Test the actual browser extension/mobile UX only with owner present and no seed phrase disclosure. Main wallet must not be unattended signing authority. Provide a separately provisioned, owner-funded **limited trading wallet** behind the isolated signer. Deposit/withdrawal between wallets stays explicit and manual; no auto-sweep.

**Acceptance:** watch-address known public receipt with independently matched token deltas, misclassified transfer/swap negatives, pagination/gap/restart tests, actual Phantom owner-device connection when authorized, SPL holdings and portfolio exact accounting, disconnect/reconnect/nonce/CSRF tests.

### P0-D — Build real order infrastructure, keep mainnet locked

Implement and test current Jupiter route and execution contract only after checking official documentation. Separate quote, order building, instruction/ALT validation, independent signing, submission, confirmation, and accounting into distinct least-privilege modules. Never allow an LLM, browser, or arbitrary plugin to invoke a raw signing operation.

Verifier must inspect all instructions/account metas, address lookup tables, programs, token mints/decimals, payer, recipient, amount, slippage, fees/rent, network/genesis, expiry, allowed destinations, and unexpected transfers. Signing service rechecks **owner-approved mandate**, exact intent hash, balance/reservation, token/venue allowlist and local risk caps, independently of agent recommendations.

Use durable state machine with `UNCERTAIN` recovery; broadcast timeout must not cause a blind second order. Reconcile actual finalized signature, `meta.err`, token/SOL changes, fees, rent and ledger. Include failed transactions, crash before/after broadcast, duplicated callbacks, expiry, reorg/slot errors, mismatched ALT, malicious extra transfer, signer outage and kill switch. Run with fake/test keys in isolated harness or devnet; **no owner wallet keys or mainnet broadcasts** at this step.

**Acceptance:** malicious transactions are refused; test harness proves single logical submission under retry/restart; verified receipt reconciliation is reproducible; no route from default OBSERVE/PAPER/SHADOW state to live signing.

### P1-E — Verify strategy quality and all 11 roles

Create an unambiguous role contract table in runtime/tests for DESK, SCOUT, FILTER, RUG_CHECK, ANALYST, STRATEGY, SIZER, GUARD, EXECUTOR, LOGGER, EQUITY. Each stage must consume typed input and emit meaningful output, reason codes, timestamps, evidence references, decision IDs and duration; non-applicable stages must explicitly SKIP/UNKNOWN. Only deterministic Guard/signer grants execution eligibility. If a model is not actually invoked, label the system **rule-based multi-agent**, not 11 conversational AI models.

Validate strategies on timestamped point-in-time historical data, temporal holdout/walk-forward with embargo, and actual forward observations. Report gross and net results, sample count, net expectancy, confidence intervals for win rate, drawdown, profit factor, tail loss, trapped/unfillable positions, fee/rent/slippage, and comparisons to no-trade and simple rules. Avoid data leakage/survivorship. No fixed guarantee of high win rate; if strategy fails, use `STRATEGY_NOT_VALIDATED` and keep live activation blocked.

### P1-F — Production operations, product parity, and duration gates

Finish all necessary user pages (scanner, agents, smart wallets, copy feed, PAPER/SHADOW, positions, trades, portfolio/equity, risk, analytics, setup, audit), all wired to real API/DB and honest statuses. Avoid cosmetic redesign. Playwright desktop/mobile, provider offline/recovery, auth/CSRF, wallet disconnect, exact state transitions, durable STOP and resume, and restart with browser closed.

Ship deployable separate web/API/worker/signer/DB topology with TLS, least privilege, secret handling, backups and verified restore, alerts, process supervision and SLO instrumentation; provider quotas/fallback and price/cost budgets documented. Qualify **seven continuous actual days of observation and 24 actual hours of shadow** as required in existing policy, with evidence of event continuity; do not compress durations or claim instant PASS. Independent security review is required before real capital.

## 3. Engineering guardrails and priority management

- **WIP limit:** Work on only the current highest-priority failing *end-to-end* path and at most one dependent support fix at a time. Finish to tested checkpoint before opening a new feature area. No polishing old screens while a P0 path remains red.
- **90/10 delivery:** Put most effort into functional source, integration, fault injection and QA; keep narrative/documentation concise and evidence-linked. This is a prioritization guideline, not a license to omit security review.
- **No placeholder acceptance:** A stub, TODO, disabled flag, test-only signer, or route that always SKIPs cannot satisfy its production acceptance. Keep real scope limitations explicit.
- **No forced positivity:** Missing safe market candidates or unavailable venue/revision approvals must generate well-explained SKIP, not bypass screening.
- **No all-at-once risky merge:** Make focused commits after passing checks; prefer feature flags that preserve fail-closed behavior and migration integrity. Keep original working database isolated from destructive tests.
- **Tests:** unit/property/integration with disposable PostgreSQL, strict typecheck, lint, build, lockfile-clean-install, security/dependency scan, Playwright CLI desktop/mobile on real stack. Exercise unhappy paths, concurrency and restart. Retain exact commands, UTC timestamps, exit codes, log hash, screenshot/trace and data provenance.
- **Bug priority:** P0 safety/accounting/duplicate-transaction faults preempt convenience features. A bug fix cannot change the meaning of past live/finalized records.
- **Cost awareness:** No paid API subscription without owner approval; log provider rate limits and quote/inference budgets separately. ChatGPT Plus is not OpenAI API credit.
- **Scope of automatic continuation:** Continue all safe coding and test steps in the current session without repeated approval prompts. If session ends, checkpoint reproducibly and write the single next command/action; never claim that work will continue after the session ends.

## 4. Hard stop and operator gates

A. **Developer-only software work:** proceed without funding; use read-only mainnet and local/test environments.  
B. **Owner-dependent nonfinancial tasks:** choose deployment provider, approve externally billed services, connect real Phantom extension, select public watch addresses; provide exact instructions but never claim completion without owner evidence.  
C. **MICRO_LIVE (separately authorized):** only after A, B, strategy and operational/security reviews pass; owner explicitly approves limited wallet address, spend, max fees/slippage, daily loss, number of positions, allowed venues/tokens, time window, STOP behavior, and signing custody. Verify on-chain micro BUY and SELL independently.  
D. **CAPPED_AUTO (second authorization):** only after independent micro-live proof, with revocable bounded mandate, separation of withdrawal authority, monitoring and auto-halt. No unrestricted trading.

No prompt or developer-side change may waive these approvals, and an unprovable high win rate is never a release prerequisite that can be manufactured.

## 5. One concise machine-readable delivery record

Update `DELIVERY_LOCKDOWN_STATUS.md` and `NEXT_ACTIONS.json` at each checkpoint, with:

- Verified `HEAD`, clean/dirty status, files changed; feature implementation and acceptance gates.
- `PASS`, `FAIL`, `BLOCKED_OWNER`, `BLOCKED_PROVIDER`, `BLOCKED_TIME` or `NOT_RUN` for each critical path, each with direct source/test/evidence file references.
- Exact test commands, exit codes, UTC times, changed database migrations, hashes, and negative-case outcomes.
- Actual provider/provenance summary, candidate counts/UNKNOWN reasons, no-trade reasons; not a synthetic profit claim.
- Current wallet mode, signer disabled/enabled **based on actual proof**, real mainnet exposure and the durable HALT state.
- Next smallest actionable code change and exact human-only action if blocked. No generic 'in progress' paragraph that conceals deliverables.

**Exit criteria:** `SOFTWARE_QUALIFIED_FOR_OWNER_ACTIVATION` only with complete nonfinancial feature proof + qualified operations. `MICRO_LIVE_VERIFIED` only after separately authorized real BUY/SELL finalized and reconciled. `CAPPED_AUTO_VERIFIED` only after separately authorized live automated bounded execution and monitoring. If gates are incomplete, retain honest status without ceasing safe engineering.
