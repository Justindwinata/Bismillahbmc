# 19 — Requirements-to-Implementation Traceability

This matrix is **planned evidence**, not tests already passed. Codex must replace `NOT_STARTED` with evidence file paths only after execution.

| Group | Requirements | Module | Acceptance route | Status |
|---|---|---|---|---|
| Product UI | FR-001,019,026 | `apps/web`, `apps/api` | G1/G3 + Playwright onboarding, stop, mobile | NOT_STARTED |
| Live market | FR-002..004,024 | provider adapters, worker | G2 WS reconnect/backfill, provenance tests | NOT_STARTED |
| Security screening | FR-005,006 | Filter, Rug Check | RSK-01,02,19 and chain decoder | NOT_STARTED |
| Smart wallet | FR-007,008 | wallet observer/copy feed | RSK-18, source signatures and quality | NOT_STARTED |
| Multi-agent | FR-009,010,025 | agents, policy, strategy | stage trace, model failure fallback | NOT_STARTED |
| Governor | FR-011,021 | risk engine + signer caps | RSK-03,04,05,06,09,10,14 | NOT_STARTED |
| Paper/shadow | FR-012 | replay and paper ledger | G2/G3, zero live signatures | NOT_STARTED |
| Real execution | FR-013..016 | Jupiter, verifier, signer, executor | G4 actual BUY/SELL signatures + chain deltas | NOT_STARTED |
| Exits | FR-017 | exit monitor | illiquid, partial, failed sell tests | NOT_STARTED |
| Accounting | FR-018 | accounting+portfolio | RSK-11,12,16, ledger reconciliation | NOT_STARTED |
| Audit & state | FR-020,023 | PostgreSQL outbox & audit | crash/resume and replay | NOT_STARTED |
| Wallet custody | FR-022 | wallet UX, signer | secret scan + user separation gate | NOT_STARTED |
| Exports/analytics | FR-027,028 | API/analytics | independent trace/export tests | NOT_STARTED |

Do not close product as PASS until mandatory P0 tests and gates pass and owner-authorized G4/G5 evidence exists. Optional P2 features may be deferred with explicit scope/reason without claiming implemented.

## Continuation executed traceability — R0/R1, 2026-11-01

| Requirement | Actual source | Executed tests/evidence | Status |
|---|---|---|---|
| Preserve/reproduce F-01/F-02 | existing source + CODE_REVIEW_R0.md | evidence/R0; checkpoint 5e853258366c15f637e0150a8bb840947662ad3d | PASS_WITH_EVIDENCE (R0 scope) |
| FR-019 browser overview/provider/audit | apps/web/app, apps/api/src/server.ts | e2e/observe.spec.ts; evidence/R1/browser + browser-final log | PASS_WITH_EVIDENCE (OBSERVE slice) |
| FR-020 persistent event presentation | packages/storage/src/index.ts, migrations/002_browser.sql | database.test.ts 500 replay, transaction consistency; evidence/R1 | PASS_WITH_EVIDENCE (SSE scope) |
| FR-021 STOP | Store.halt, API+web control | DB idempotent halt + desktop/mobile reload | PASS_WITH_EVIDENCE (no execution exists) |
| FR-003 discovery/pair metadata | connectors DexScreener/DexMarket + worker market-cycle | fixture schema and actual persisted provider cycle | IN_PROGRESS (not exhaustive pool stream) |
| Browser security | API auth.ts, browser_sessions | login/CSRF/origin/logout tests, Playwright rejection | IN_PROGRESS (Phantom/production hardening absent) |
| Eleven roles, wallet decode, full ledger, signer | not implemented in R1 | NOT_RUN | NOT_STARTED |
| G2/G3 durations, restore, independent audit | absent evidence | NOT_RUN | NOT_RUN |
| G4/G5 chain BUY+SELL | no authorization or proof | NOT_RUN | BLOCKED |

R2 continuation: FR-002/004 partial source packages/connectors/src/websocket.ts and wallet.ts + worker/wallet-monitor.ts; executed wallet.test.ts and real ws-public evidence. FR-007/008 public owner watchlist and copy-feed routes backed by wallet_watchlists/wallet_observations; database.test.ts dedupe/cursor/limits, Playwright public form. R2 status IN_PROGRESS: no owner-selected live wallet, bounded gap freeze rather than full backfill, native SOL/rent attribution unresolved. No signing/mirror execution. See evidence/R2.

## R3 executed observation council and PAPER library

| Requirement | Source | Executed evidence | Current scope/status |
|---|---|---|---|
| FR-009/010/011 structured roles/veto | packages/engine/src/index.ts, worker/agent-cycle.ts | engine.test.ts, database atomic 11-stage test; evidence/R3 | Observation baseline verified; complete strategy/account budgets IN_PROGRESS |
| FR-019/020 actual trace UI | web dashboard, API decisions/:id, storage saveEvaluation, migration 004 | 12 Playwright tests incl. trace; R3/browser | PASS_WITH_EVIDENCE for observed-stage trace |
| FR-012/018 simulated accounting | packages/accounting/src/paper.ts | paper.test.ts FIFO/property/rent/deposit/no-fill tests, package coverage | Library verified; persistent PAPER/SHADOW/exit system IN_PROGRESS |
| FR-002 runtime independence | worker/main.ts + process launcher | actual event advance after closing tab on both viewports | PASS_WITH_EVIDENCE for tested local stack, not 24/7 deployment |
| Critical package coverage | vitest.packages.config.ts | 44-test combined run: domain 97.56%, engine 96.07%, paper 97.22% branch; overall measured 81.05% | Thresholds preserved; not app-wide 95% |
| R4–R6 full capabilities | not complete | missing Phantom/execution/restore/soak proof | NOT_STARTED/IN_PROGRESS only; no code-complete claim |
