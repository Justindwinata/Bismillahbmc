# 12 — Codex Implementation Roadmap, Milestones, Deliverables, Exit Gates

## A. Execution policy

This is not a one-shot request to fabricate a complete dashboard. Build sequentially and test each stage with the actual environment. Codex may autonomously write code, fix failures, and advance through **non-financial** milestones without requesting repetitive approvals, keeping a durable status/handoff file. No automatically authorized mainnet wallet key generation/import, deposit, swap, withdrawal, paid provider purchase or activation. G4/G5 owner intervention is mandatory. If an external prerequisite is missing, mark that gate `BLOCKED`, continue other safe work, state exactly what user must provide **through secure local mechanisms (never in chat)**.

## M0 — Repository, architecture and feasibility

**Implement:** Git baseline, pnpm workspace, Node/tooling pin, shared ESLint/TS config, `docs` consistency review, ADR-001 stack, ADR-002 signer isolation, ADR-003 Jupiter path, ADR-004 data provenance, mock data boundary, deployment topology, `.env.example`/secrets scan. Confirm latest official provider docs. Runtime starts in `OBSERVE` and zeros.
**Deliver:** runnable monorepo skeleton, validated environment script, adapter contracts, a clear dependency/cost report, `IMPLEMENTATION_STATUS.md`, `DECISIONS.md`.
**Exit:** install, typecheck, lint, build and safe config check reproducible; no secret in repo; architecture accepted from evidence.

## M1 — Real read-only market/wallet feeds

**Implement:** Solana RPC HTTP+WS adapter, reconnect/backfill, DEX candidate discovery, token mint normalization, smart-wallet watchlist decode/public swaps, metrics, persistence, provider health. No real signer.
**Deliver:** live read-only observable token and monitored wallet events with timestamps, source/mint links, stale handling and dedupe. Evidence of actual queries without transacting.
**Exit:** integration tests for 429/timeout/parse error, market and wallet data integrity, no invented price, close browser worker continues.

## M2 — Multi-agent council & paper trading

**Implement:** all agent role modules, immutable event trace, security check, strategy and Guard, sizing, event bus, paper and shadow ledgers, full positions/exit policies, Mode/Policy UI and API auth. All roles observable and running real logic (not only visual cards).
**Deliver:** typed decision snapshots and replayable pipeline, reason codes, per-agent status and PnL paper clearly labeled.
**Exit:** risk veto tests, concurrency, math properties, deterministic replay, no paper tx in live ledger.

## M3 — Complete dashboard and operational backend

**Implement:** responsive dashboard pages specified in `07`, charts from DB data, agent timeline, smart-wallet screen, portfolio, wallet connect Phantom, owner setup/risk, SSE, alerting, audit explorer and export. Add Playwright CLI tests early.
**Deliver:** accessible functional web UI connected to actual backend live read-only/paper services; README startup commands.
**Exit:** desktop/mobile Playwright traces and screenshots, auth and STOP tests, no fabricated live data.

## M4 — Transaction verifier, signer, real Jupiter execution (disabled)

**Implement:** current Jupiter Swap V2 adapter, quote and assembled tx decoder/validator, signer isolation service with test-only keys, structured intent state machine, atomic reserved budgets, idempotency, blockhash/finality confirmation, ledger reconciliation. Test with mocked provider/devnet where appropriate. Explicit backend live mode disabled throughout CI and local defaults.
**Deliver:** tested executable code paths that WOULD sign an approved transaction in an authorized environment; signer refusal and chaos tests; secure local provisioning guide. No live trade.
**Exit:** malicious tx rejected, timeout recovered, no duplicate send, all secrets isolated, no route fails safely.

## M5 — Shadow, soak and security audit

**Implement:** live mainnet read-only quotes and unsigned intent replay, fault-injection harness, 24h soak collection, independent security/code audit, backup restore, transaction log reconciliation, Playwright full flows, SLO measurements.
**Deliver:** G0–G3 evidence matrix; documented exact risk limits/owner commands for micro-live, operational checklists.
**Exit:** complete gate evidence, unresolved blockers clearly reported; no unsupported PASS.

## M6 — Owner-authorized MICRO_LIVE mainnet proof

**Precondition:** separate owner approval, disposable funds on segregated wallet, active reviewed spend/fee/exposure budget and verified provider route. Codex cannot proceed financially without these actions.
**Implement/run:** one very small genuine BUY and SELL with explorer signatures, independent chain receipts, pre/post account balance, fee/slippage, audit trace, emergency STOP demonstration. Investigate failure without bypass.
**Exit:** G4 PASS only on verifiable on-chain proofs; otherwise BLOCKED/FAIL and safe stop.

## M7 — Owner-authorized CAPPED_AUTO and deployment

**Precondition:** G4 PASS, explicit owner activation for unattended bounded period and adequate hosting/alert/secret controls.
**Implement:** service supervisor/VPS HTTPS hardened, automatic restart/reconcile, stable provider telemetry, bounded autonomous sessions, circuit breaker alerts, backup/restore, documented safe shutdown.
**Exit:** G5 PASS based on actual bounded session evidence, no unauthorized withdrawal, honest metrics even if 0 trades.

## M8 — Optional research improvements (outside release necessity)

Out-of-sample copy-wallet evaluation, improved wallet clusters, fallback RPC, LLM explanations with cost/quality measured, more trade venues if documented and supported. Never hide core bug or absent live proof by adding optional analytics.

## B. Work package template (Codex writes per milestone)

`milestone_id`, baseline commit, scope, dependency, tasks and intended file changes, exit criteria, threat model delta, tests with expected commands, actual results, failure/risks, evidence folder, release decision and follow-on. Do not silently broaden scope, skip tests or replace test targets with mocks.

## C. Handoff across multiple Codex sessions

Persist `IMPLEMENTATION_STATUS.md` with current milestone, exact completed paths, commands/outputs, last known green tests, open blockers, uncommitted changes, next 3 smallest tasks. New Codex session must read this plus AGENTS/docs and inspect repo before acting. Never trust chat summary as canonical file proof. A final release ZIP/source repo includes lockfile, migrations, Docker/supervisor config, docs, test artifacts and hashes; no private keys.

## D. Exit definition

“Done” means **working product plus proof**, not 100% TODO unchecked. Full project status `NOT_LIVE_VERIFIED` until owner-authorized real BUY/SELL evidence. Codex must distinguish software completion from blocked external activation. A project may be development-complete but operationally BLOCKED by no wallet funds/keys or service quotas.
