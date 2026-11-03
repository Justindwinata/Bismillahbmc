# CODEX — SOLANA SENTINEL D1 → REAL OPERATION CRITICAL-PATH MANDATE

**ROLE:** Principal Solana Engineer + TypeScript Tech Lead + Quant Research Lead + AppSec/Signer Architect + SRE/QA Delivery Owner.

**THIS IS A CONTINUATION, NOT A NEW PROJECT.** Work in the **existing** `SOLANA_SENTINEL_CODEX_FOUNDATION_V2` repository. Expected HEAD from provided evidence: `10f5dd0c3cf180462b3da51b4b398184cb1664da`. Do not assume this HEAD if local repository differs: verify `git status`, `git log`, file hashes and reconcile first. Do not delete or rewrite valid source.

## PRIMARY DIRECTIVE
Our final product remains a **standalone, usable, real-time Solana meme-coin trading web app** showing eleven integrated functional roles (DESK, SCOUT, FILTER, RUG CHECK, ANALYST, STRATEGY, SIZER, GUARD, EXECUTOR, LOGGER, EQUITY), genuine market and public wallet observations, a real Phantom owner connection, trading wallet isolation, risk controls, positions/trades/equity, copy signals, transaction execution, audit and independent always-on runtime. Match the reference videos **functionally**; do not claim reproduction of unverifiable performance figures or exact video transactions.

**FOCUS CONTRACT:** No more broad PRD rewrite, UI reskin, new bots, cosmetic charts, broad architecture refactor, or speculative LLM feature. Use the existing architecture to complete the missing *end-to-end behaviors*. Work code-first, test-first on safety invariants, evidence-first. Continue safe implementation to the next attainable gate in the same turn/session, not merely a planning report.

Read and follow these newly supplied root documents completely:
1. `01_AUDIT_KODE_D1.md`
2. `02_RENCANA_CRITICAL_PATH.md`
3. This file, `03_PROMPT_LANJUTAN_CODEX_FOKUS.md`
Also read `AGENTS.md`, the original PRD/docs, `DELIVERY_SCORECARD.md`, `REQUIREMENT_TRACEABILITY.md`, `ops/AUTONOMOUS_PAPER.md`, all actual changed source + migrations, tests/e2e, and `evidence/D1/risk-all-in` first. Resolve contradictions in ADRs; avoid reading huge historical documents repeatedly when source/contract already clear.

## LATEST AUDIT FACTS — DO NOT MISREPRESENT
- 934/934 exported file hashes match `EXPORT_MANIFEST.json`.
- Final results are 79 combined and 22 browser tests according to **final risk-all-in** evidence; the earlier `RESULTS.json` (71/20) is superseded for final counting.
- Positive automatically scheduled BUY→SELL is **REPLAY_TEST**, not real-market PAPER and not on-chain trading. Genuine provider proof: scan/security/quote → SKIP, with current global HALT in logs.
- `apps/worker/src/paper-live.ts:16` intentionally converts PASS to UNKNOWN (`POOL_SECURITY_NOT_QUALIFIED`); do not remove the veto without independent on-chain pool evidence.
- `packages/engine/src/index.ts` demands entry-quality FILTER/RUG_CHECK PASS for SELL as well; distinguish exit risk-reduction from speculative new entry without bypassing transfer/quote safety.
- `packages/connectors/src/wallet.ts` hardcodes `copyEligible:false` and lacks complete native SOL/rent/CPI interpretation.
- `packages/storage/src/research.ts` passes `reservedLamports:'0'` although lease reservations exist; prove concurrency/risk state consistency.
- Provider fees are *modeled*, not actual fill costs. No signer and no mainnet BUY/SELL exists. Quant edge/forward win rate has **not been established**.

## WORK PACKAGES — EXECUTE, NOT JUST PLAN

### 0 — PRESERVE & REPRODUCE BASELINE (short, mandatory)
- Verify current code branch/commit and clean tree; preserve PRD and working code.
- Rerun frozen install, lint/typecheck, safe config check, unit/property/integration PostgreSQL tests, 22 Playwright desktop/mobile (where environment permits), with exact exit codes and raw sanitized evidence.
- Verify schema migrations 001–010 are idempotent on disposable DB; no production migration or wallet access without permission.
- Create one concise living `CRITICAL_PATH_STATUS.md` with source-level open issues and release gates. Do not spend remainder of iteration writing documentation.

### 1 — FIX REAL PROVIDER SECURITY ELIGIBILITY + EXIT CORRECTNESS (P0)
Inspect and modify `apps/worker/src/paper-live.ts`, `packages/connectors/src/security.ts`, `packages/engine/src/index.ts`, `packages/storage/src/research.ts`, relevant DB and tests.
- Implement **independent pool/LP verification for explicitly supported Solana venues/programs**, vault identity, liquidity proof at matching slot, program owner/upgrade authority policy, LP/burn/lock assumptions with evidence classification. Unknown venues remain UNKNOWN. Document supported venue scope; no guessed PASS.
- Implement holder/source confidence model; largest-20 supply equality is not a valid universal proof of complete holder distribution. Retain conservative UNVERIFIED classification where proof incomplete. Program owner/Token-2022 supported extension matrix must not be bypassed.
- Split `ENTRY_GATE` and `EXIT_GATE`. BUY must remain high strictness. Existing-position SELL can be evaluated when exit is demonstrably executable, even if fresh entry would be blocked; require genuine owned position, quote, spendable balance, correct mint, exact output, fees, transfer restrictions and no ability to create a new exposure. If unsafe/unroutable, mark `EXIT_UNAVAILABLE`, alert and do not invent fill. Verify STOP semantics: HALT blocks new buys; owner must explicitly define whether separately authorized risk-reducing exits can continue. Do not silently change the current HALT behavior.
- Add scenarios: false pool, LP rug, bad account owner, mint/freeze control, partial holders, Token-2022 unsupported, price-impact, stale quote, late liquidity disappearance, no sell route, profitable exit, loss-limiting exit, and duplicated requests. Verify invariant: **dangerous entry VETO is never disabled to create a green screenshot.**
- Commit this P0 as independently testable increment; record feature/evidence delta.

### 2 — REAL-PROVIDER-DRIVEN PAPER TRADING + ACCOUNTING (P0)
Use live read-only providers and correctly classified virtual fills; never spend SOL.
- Link actual candidate -> validated market & pool -> fresh GET Jupiter BUY quote -> 11-stage decision -> spending reservation -> virtual BUY -> on-going owned position monitor -> fresh SELL quote -> exit trigger (TP/SL/time or risk) -> virtual SELL -> accounting/marks/equity -> UI+audit, over separate worker cycles and restart.
- Do not use `REPLAY_TEST` or hard-coded price paths to claim a live-provider positive result. Replay remains a regression-only mode.
- Include fee model breakdown and independent caveats: signature/priority fees, ATA/rent, WSOL account handling, transfer tax, slippage, liquidity/exit failures. Avoid treating refundable rent as permanent loss when verified refundable; do not optimistically assume refund. Handle partial exits if authorized by policy, capital flows, lockups, stale marks, unknown exit prices, and zero/liquidation scenarios.
- Make `reservedLamports` consistent with durable lease reservations; prevent concurrent oversizing/double commitment across worker restarts. Add abuse tests for two workers, timeout, stale lease token, DB crash, provider 429, quote expiry, reverse quote mismatch, cancellation and HALT.
- Preserve provenance `{sourceClass, observedAt, sourceAt, slot, quoteId/hash, policyHash, workerRunId, decisionId, fillKind, feeModel}`. Dashboard MUST distinguish PAPER_SIMULATION from actual chain fills.
- **D1 REAL gate:** show real-provider PAPER BUY and SELL for a token that actually passes checks, including actual quote records and decision traces; if no token safely qualifies, show sampled rejection distribution, elapsed real observation, coverage, and `NO_SAFE_ENTRY_OBSERVED` (not a fake PASS). Let the scheduler continue observing without forcing a purchase.

### 3 — COPY SIGNALS AND PORTFOLIO (P0/P1)
- Actual public wallet signature demo: full chain signature, slot/finality, owned token/native SOL delta, network/priority/rent, CPI venue classification, receipt hash, detection lag and source. Support declared venues only, fail closed for unsupported.
- Unify watchlist, stale/disconnect backfill, stop/rehydrate, exactly-once event state, and `copyEligible` only when validated separately from simply detecting a swap; no blind copy of whales or unknown wallets.
- Finalize Phantom real extension sign-message owner/session on local browser **only after user manually connects**; never request a seed phrase. Fetch portfolio/token holdings, liabilities, rent, transaction reconciliation, and explicit deposit/withdraw cash-flow separation.
- UI must show wallets, copy signals, positions/trades/equity, risk, latency and reason codes truthfully.

### 4 — FINISH DISABLED CHAIN EXECUTION STACK (P0)
- Implement Jupiter order/unsigned transaction capture, full transaction/instruction/ALT verifier, private isolated signer harness, durable order state machine, submit/uncertain/finality/reconciliation. Use only local-validator/devnet test keys for signing tests (never user's main Phantom key).
- Adversarial cases: fake account meta, hidden transfer, unexpected program, fee-payer switch, arbitrary recipient, ALT malicious rewrite, Token-2022 fee/hook/delegate, blockhash expiration, partial ledger, duplicate submit, crash after submit, provider disagreement, RPC outage, transaction succeeds but token delta differs.
- Keep mainnet signing and real funds gated; no environment-only flag can silently enable. Explicit owner mandate and bounded policy are enforced independently by signer, not LLM/bot/UI.
- Evidence must include verifier negative tests and genuine devnet/local-validator reconciliation where feasible; honest BLOCKED note for unavailable provider features.

### 5 — QUANT VALIDATION & PRODUCTION QUALIFICATION (P1)
- Build timestamp-safe point-in-time dataset, no leakage, delisted/missing/no-fill records, true costs and liquidity, train/validation/test embargo, walk-forward, strategy vs simple/no-trade/mirror baselines; include sample size, Wilson CI, expectancy, profit factor, drawdown, downside tail, exitability and sensitivity to slippage.
- Do **not** declare high win rate or profits from a 1–5 trade sample or from REPLAY_TEST fixtures. The correct output may be `STRATEGY_NOT_VALIDATED` or `NO_TRADES`.
- Qualify backend 24/7 independent of browser and Codex, production TLS, DB roles, secure secrets, provider quotas & costs, alerts, backup/restore, supervisor, shutdown/recovery. Actual >=7 consecutive days observation and 24h shadow must be logged by elapsed timestamps. No instant pass.

## EVIDENCE & QUALITY STANDARD
- For every work package, give exact source paths, design decisions, actual commands executed, exit codes, coverage (per impacted critical module plus overall), DB integration test evidence, Playwright desktop/mobile screenshots/traces, fault-injection results, test caveats, real timestamps, API & provider provenance.
- Every critical change should include positive, boundary, malicious and failure-path tests. Do not weaken existing tests or delete historical failure logs.
- Verify all writes are auth/CSRF/owner-scoped. No credentials in logs, reports, ZIP or frontend bundles.
- Keep status per capability, not a fake single 100% value; update traceability and the single concise status file. Use periodic tested Git commits with clean tree.
- Minimize unrelated modifications; no code rewrites, no new paid SaaS, no production funds, no unwarranted cloud provisioning.

## FINANCIAL AUTHORITY IS NOT INCLUDED IN THIS MESSAGE
You have permission to code, test, simulate/read-only, and run local-validator/devnet with disposable test assets. You do NOT have approval to generate/import/use MY private key, provision funded mainnet signer, connect to my actual Phantom without manual user action, fund an account, buy paid API service, trade real money, deploy public unsecured endpoints, or enable unattended mainnet trading.

`CODE_COMPLETE_OWNER_BLOCKED` is only valid once nonfinancial software + qualifying security/soak evidence are complete; `LIVE_VERIFIED` needs separate owner-approved real mainnet micro BUY+SELL with independently verified finalized receipts and reconciled balances. `CAPPED_AUTO_LIVE` requires another separately approved, risk-limited mandate. **Never relabel an incomplete result just because the owner wants finality.**

## FIRST ACTION NOW
1. Inspect Git and real code; reproduce current final D1 evidence.
2. **Immediately implement Work Package 1** and run tests; then continue into Work Package 2 without another high-level planning-only response.
3. Return a factual delivery report with code changes and hard evidence. If time/tool limits stop progress, preserve valid commit and identify exact next function/test; never promise background work.
