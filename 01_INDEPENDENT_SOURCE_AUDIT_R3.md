# SOLANA SENTINEL AI — Independent R3 Source Audit
Date: 2026-11-01 | Basis: user's `solana-sentinel-source-evidence.zip`, 10 provided screenshots and `RESULTS(1).md`.
Status: SOURCE_INSPECTED / INTEGRITY_VERIFIED / TEST_RESULTS_REVIEWED / TESTS_NOT_INDEPENDENTLY_RERUN / NOT_LIVE_VERIFIED.

## 1. Scope, integrity and limits
- Safely unpacked ZIP: 277 entries, ~12.85 MB uncompressed. Checked all 275 entries listed in `EXPORT_MANIFEST.json`: **275/275 exist and SHA-256 values match**, no mismatches.
- Directly inspected monorepo manifest, API auth/routes, runtime config, worker cycles, market and wallet connectors, engine roles, paper ledger, storage and migrations, browser components, Playwright E2E, R3 coverage summary, R3 command records, previous roadmap, and screenshot evidence.
- R3 `playwright-results.json` records `expected=12, unexpected=0, skipped=0, flaky=0`, with desktop/mobile projects. R3 command log records successful final `pnpm check`, frozen install, offline frozen reproduction, audit and E2E, including earlier failed frozen attempts and later fixes. These are archived **execution records**, not tests rerun by this auditor.
- Code was examined offline. The auditor's environment has Node 22.16.0, not the project-required Node >=22.23.2 <23, with no installed pnpm and no imported project PostgreSQL; it would be incorrect to certify reproducibility by re-running tests here. No live market wallet transactions, production environment, or provider credentials were accessed. `.git` is absent from the sanitized export, therefore recorded Git SHA and clean worktree status are self-declarations, not independently verified via `git status` or Git object integrity.
- `RESULTS(1).md` also says the 11 roles are observational, with no runtime paper/shadow sessions, no complete security evaluation, no signer/mainnet execution. This is consistent with actual source.

## 2. Verified current architecture
| Area | Found in source | Classification |
|---|---|---|
| Next.js dashboard | `apps/web/app/dashboard.tsx`, `page.tsx`, `globals.css`, Next rewrites | Implemented OBSERVE vertical slice; not full product |
| API authentication | `apps/api/src/server.ts`, `auth.ts`, persisted sessions, origin/CSRF checks | Implemented baseline; not production security review |
| Market feed | `DexScreener`, `DexMarket`, `marketCycle`, persisted snapshots/pairs | Real read adapter; market freshness/provenance incomplete |
| Public chain | Genesis checked RPC finalized slot, WebSocket processed slot | Genuine observation; latency != live trading |
| Public smart-wallet watchlist | `wallet-monitor.ts`, `WalletReadRpc`, WS logs, finalized backfill | Partial; no proved copy signal in supplied screenshots |
| Multi-role engine | `packages/engine/src/index.ts`, 11 named deterministic functions | Runs and persists reasons; **not decision-capable trading system** |
| Risk/authority | `bootstrapVeto`, mode restrictions, `HALTED`, zero caps | Safe deny-only bootstrap; no configurable owner-approved governor |
| Paper ledger | `packages/accounting/src/paper.ts` | In-memory library only, not persistent trade lifecycle |
| Execution | No independent signer/order verifier/submit/chain reconciler | Not implemented |
| Phantom | UI text NOT_CONNECTED only | Not implemented |
| Portfolio/equity | Placeholder UNKNOWN, no owned wallet or live ledger | Not implemented |
| Ops 24x7 | Worker runs without browser | Production supervisor, backup/restore, alerts/chaos still missing |

## 3. Confirmed product blockers and source-level findings
### F-R3-01 — FILTER has no PASS path [CRITICAL FUNCTIONAL]
File `packages/engine/src/index.ts`, `FILTER`: returns VETO when stale; UNKNOWN for missing liquidity/sourceAt; and its final unconditional return is UNKNOWN (`OWNER_MARKET_THRESHOLDS_UNCONFIGURED`). No state satisfies PASS. Thus even perfect external inputs cannot currently create an approved candidate. Design finite, versioned thresholds and explicit positive PASS with audited evidence; no loosening security just to force BUY.

### F-R3-02 — Trading agents have hardcoded no-action behavior [CRITICAL FUNCTIONAL]
Same file: `STRATEGY` returns SKIP even after hypothetical upstream PASS; `SIZER` always proposes zero; `GUARD` calls deny-only bootstrap and always VETO; `EXECUTOR` always SKIP; `EQUITY` is always UNKNOWN. `evaluate()` hardcodes `action:'SKIP'`. This is an *authentic observation council*, NOT autonomous entry/exit/trading. Replace in separately gated stages: researched strategy proposals, amount caps, account reservations, Guard permits only safe PAPER/SHADOW and eventually owner-authorized LIVE, execution/verifier separate.

### F-R3-03 — Eleven roles do not imply eleven LLM agents [HONEST LABELING]
`packages/engine/src/index.ts` implements typed deterministic functions. No inter-bot LLM discussion, market learning or real multi-LLM inference is deployed; report states LLM OFF. To match videos' visible bot collaboration, display genuine typed disagreement, evidence and decision logs; add optional structured LLM analyst/summarizer if approved/budgeted. Never fabricate AI chats or give any LLM signing authority.

### F-R3-04 — Candidate selection may starve recently observed tokens [HIGH]
`apps/worker/src/agent-cycle.ts`: `SELECT DISTINCT ON(m.mint)... ORDER BY m.mint,m.received_at DESC LIMIT 5` chooses five lexicographically first mints (subject to distinct), not the five most recent distinct mints. Use a latest-per-mint subquery followed by ordering newest received_at globally and stable tie-breakers; add deterministic tests for >5 candidates, fair rotation and stale exclusion.

### F-R3-05 — Source timestamp vs observed freshness [HIGH]
`agent-cycle.ts` always sets `sourceAt:null` because DEX Screener's API doesn't provide a trusted token market-source time. `FILTER` also requires sourceAt and never PASS. Treat provider receipt timestamp and independent on-chain slot/time as *different evidence*: establish a documented freshness gate from last trusted read plus chain verification, label estimates. Never invent timestamps or equate HTTP response to fresh tradable liquidity.

### F-R3-06 — Smart wallet decoder and history materially limited [HIGH]
`packages/connectors/src/wallet.ts`: `maxSupportedTransactionVersion:0`, Jupiter program detection only in the top-level `message.instructions`, two-token delta heuristic, incomplete native SOL/wrapped SOL/rent/fees/inner instructions/CPI and supported venue recognition; `copyEligible:false` is hardcoded. `backfill()` uses 20 signature limit, errors when a later window is full instead of paginating; high-throughput wallets can remain DEGRADED. `wallet-monitor.ts` checks at most 2 wallets (WebSocket implementation); no proof of actual captured watched-wallet swaps is included. Add paginated bounded recovery, watermarks, finalized chain proofs, duplicate/reorg handling, correct accounting and chain-supported swap interpretation. Start with wallet-owned public addresses only; no secret access.

### F-R3-07 — "STREAMING" ≠ low-latency market ticks [HIGH PRODUCT HONESTY]
`apps/web/app/dashboard.tsx` uses backend SSE for persisted events, but `apps/worker/src/main.ts` runs a 30-second market cycle; WebSocket slot/log notifications are not continuous DEX price ticks. UI should show separate statuses and latency for SSE/event sync, market freshness, wallet detection, quotes, and confirmations. Don't claim video-level latency without measured percentile and an identified data source.

### F-R3-08 — Missing complete release functions [CRITICAL SCOPE]
`docs/07_UI_UX_DASHBOARD_SPEC.md` specifies `/positions`, `/trades`, `/rules`, `/analytics`, `/settings/integrations`, `/setup`, but `apps/web/app/[[...view]]/page.tsx` permits only `''`, `/discover`, `/agents`, `/risk`, `/wallets`, `/audit`, `/smart-wallets`, `/copy-feed`; wallet view still NOT_CONNECTED. No realtime portfolio/exits, performance graph, mainnet transaction links, fee-aware P&L or risk editor. Treat pages as requirements, not done based on sidebar-only navigation.

### F-R3-09 — No verified transaction architecture [CRITICAL SECURITY]
No Jupiter order/execute implementation, pre-sign transaction decoder/allowlist/ALT validation, isolated key boundary, independent chain-status checker, durable intent state machine, budget reservations, uncertain-send quarantine or reconciliation exist. Develop and attack-test before ever provisioning a funded wallet. A successful `/execute` response alone is not independent finality proof.

### F-R3-10 — Policy and HALT are intentionally deny-only [MEDIUM IN CURRENT PHASE, REQUIRED FOR FUTURE]
`config/policy.example.yaml` and `scripts/runtime.ts` enforce OBSERVE/zero limits, and current API readiness returns 503 unconditionally. Existing HALTED after STOP is a deliberately safe state; do not edit DB or rewrite policy to bypass. Design separate owner-authenticated, versioned policy/activation and safe HALT/RESUME for OBSERVE/PAPER later; activation requires proof and finance gate.

### F-R3-11 — Evidence coverage uneven [HIGH TEST]
`evidence/R3/package-coverage-summary.json`: overall branch 81.05%; server 76.53%; wallet connector 80.26%; websocket connector 64.51%; storage 65.51%; worker agent-cycle 0%; market-cycle 0%. Domain 97.56%, engine 96.07%, paper 97.22% are real *reported local package figures*, but do not protect key orchestration, restart or financially critical code. Increase decision-path and connector negative tests, persistence and replay coverage. Initial failed frozen installs were corrected by later runs; no need to inflate them as current defects.

### F-R3-12 — Browser and deployment gaps [MEDIUM/HIGH]
The desktop UI is consistent and mobile pages render. Mobile feed is compressed/horizontally scrollable; labels, table accessibility and touch ergonomics require deeper verification. Browser uses one large `dashboard.tsx` containing pages and state. Production HTTPS, reverse proxy, multiple instances, session store policy, SSE scale/backpressure, DB least-privilege, cache, alerts, hardened backup and independent security review remain unverified. Current dev-only Next rewrite to localhost is not a deploy design. Replace readiness 503 with meaningful readiness checks only once true conditions are met.

## 4. Reference-video feature parity (functional, not guaranteed profit)
Video A: overview, positions, smart wallets, copy feed, rules, risk guard, equity plot and trading tape; Video B: SCAN→CHECK→SIZE→EXECUTE→LOG→EQUITY. Source screenshots' percentage profits/huge returns are **not audited and never acceptance targets**.

| Target | R3 state | Acceptance proof to require |
|---|---|---|
| Original real-time desktop/mobile control room | PARTIAL | Responsive Playwright, actual backend and data lineage |
| Live token discovery + pool/liquidity | PARTIAL | Accurate chain/DEX source, timestamp, age, filters and alerts |
| On-chain rug/security checks | NOT BUILT | Mint/authorities/Token-2022/holders/liquidity verified or UNKNOWN |
| Smart wallet and mirror signal | PARTIAL | At least one independently verifiable observed public swap, with receipt signature and measured lag |
| 11 functioning agent roles | OBSERVATION ONLY | Cases PASS/SKIP/VETO; typed decisions with real evidence; strategy supports valid proposals |
| Multi-agent structured discussion | NOT BUILT | Real persisted rationale/disagreements, optional audited LLM calls, Guard veto immutable |
| PAPER/SHADOW execution + persistent P&L | LIBRARY ONLY | Persistent sessions, quote/exit/no-fill accounting and deterministic replay |
| Phantom wallet integration | NOT BUILT | Wallet connect/sign-message challenge; no mnemonic access |
| Live positions, history, equity, win rate | NOT BUILT | Linked actual receipts/balances or clearly marked paper; deposit-adjusted P&L |
| Jupiter mainnet execution | NOT BUILT | Isolated signer, intent/verifier and proofs after distinct owner authorization |
| Exit monitoring and risk failsafes | NOT BUILT | Fee/liquidity aware exits, stop, restart recovery, uncertainty quarantine |
| Server 24/7 operational qualification | NOT BUILT | Actual 24h shadow and 7-day data observations, fault/backup/restore and security review |

## 5. Source-by-source audit inventory
- `apps/api/src/auth.ts`: scrypt password, opaque session crypto; baseline satisfactory, needs formal threat model and expiry/session revocation tests.
- `apps/api/src/server.ts`: origin, CSRF, bearer, SSE, STOP, watchlist endpoints; no owner risk editor/Phantom/live APIs; rate limiting is single-process in-memory.
- `apps/web/app/dashboard.tsx`, `globals.css`, `page.tsx`: visual real UI; some requirements placeholders; monolithic architecture.
- `apps/worker/src/main.ts`, `cycle.ts`, `market-cycle.ts`, `agent-cycle.ts`, `wallet-monitor.ts`: independent worker exists, time-bounded polling/market data; no supervised persistent trading loop.
- `packages/connectors/src/index.ts`, `wallet.ts`, `websocket.ts`: read-only connectors, schema checks, circuit-breaker; limited venue/account interpretation and recovery.
- `packages/domain/src/index.ts`, `engine/src/index.ts`: exact quantities and deny-only role pipeline; no complete strategy approvals.
- `packages/accounting/src/paper.ts`: exact integer accounting, FIFO lots; memory-only.
- `packages/storage/src/index.ts`, `ops/migrations/001..004`: transactions, audit/outbox, sessions, market and agent events; missing live order/ledger schemas and stronger DB role isolation.
- `tests/*.test.ts`, `e2e/observe.spec.ts`: genuine source test cases; no lifecycle of live signer or repeated paper sessions.
- `scripts/runtime.ts`, `config/policy.example.yaml`: safe config; not production authorization engine.
- `evidence/R3/*`, `EXPORT_MANIFEST.json`, `EXPORT_GIT_LOG.txt`: credible traceable archived evidence, exported from different environment; no independent replay.

## 6. Independent release verdict
CONTINUE development preserving current architecture. No rewrite. OBSERVE_UI_BASELINE evidenced by code/snapshots/archive, not full product. R2/R3 incomplete; R4–R6 missing; R7 FINANCIAL_OWNER_GATE. The next iteration must correct F-R3-01, 02, 04, 05, 06, introduce persistence/security and finance-proof pathway, and visibly deliver the missing core screens and backtested paper/shadow sessions. Mark release `NOT_LIVE_VERIFIED` until independently checked real mainnet buy/sell signatures after consent. Trading profits and identical execution speed are not guaranteed.

## 7. External developer documentation current at audit
- Solana RPC and commitment semantics: https://solana.com/docs/rpc
- Solana `logsSubscribe`, `getSignaturesForAddress`, `getTransaction`, `getSignatureStatuses`: https://solana.com/docs/rpc
- Jupiter Order & Execute: https://developers.jup.ag/docs/swap/order-and-execute (GET order → sign → POST execute, independent chain verification)
- Phantom browser provider and adapter: https://docs.phantom.com/solana/integrating-phantom
- Token-2022 permanent delegate and fees: https://solana.com/docs/tokens/extensions/permanent-delegate ; https://solana.com/docs/tokens/extensions/transfer-fees
