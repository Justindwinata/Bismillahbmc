# 11 — Comprehensive Testing, Release Gates, and Evidence Contract

## 1. Testing pyramid (no test claim without execution)

- Static: pnpm lock, ESLint, TypeScript strict, dependency audit, secret scan, config validation.
- Unit: exact bigint/decimal math, canonical token addresses, strategy reason codes, market freshness, LLM output validation, quote verifier, Guard veto, signer allowance and refusal.
- Property/fuzz: amounts across caps, any token decimals, duplicate events, injected instructions, concurrency and mutable fee conditions.
- Integration: PostgreSQL migrations, transactions/outbox/leases, API auth+CSRF+RBAC, adapter fixtures, chain receipt parser, simulated wallet provider, risk budgets with two simultaneous workers.
- E2E: Playwright CLI screenshots and traces using actual running web/API/worker/test DB; no static UI-only proof.
- Chaos: WS drops and gap recovery, provider 429, signer unreachable, PostgreSQL down, SIGKILL after signing, timeout after broadcast, out-of-order confirmations, restart after backup, mismatched balance.
- Security: wallet key boundary, unauthorized transfer instruction, origin/cookie/CSRF/CSP, secret redaction, dependency review, threat model and negative tests.
- Live-read-only: observe real Solana events and provider health; no signing, sanitized evidence.
- On-chain live: **only after explicit owner mandate** verify genuine small mainnet BUY+SELL signature with actual token/SOL deltas.

## 2. Release gates

| Gate | Requirement for PASS | Can run without funds? |
|---|---|---|
| G0 — Feasibility | official live docs, provider feasibility/cost, reproducible toolchain, ADRs, risk policy zero | YES |
| G1 — Foundation | full lint/typecheck/build/unit; security invariants; protected API; migrations | YES |
| G2 — Observe/Paper | multiple live read-only sessions; candidate/wallet data; paper ledger, correct mode and rejects | YES |
| G3 — Shadow/Chaos/UI | 24h shadow *evidence* or INCOMPLETE, no duplicate order; Playwright, recovery, backup restore, signer disabled | YES |
| G4 — Micro-live | separate owner approval, approved disposable funding and caps, confirmed real BUY+SELL, reconciliation and explorer links | NO; owner action |
| G5 — Capped-auto | G4 PASS, policy review/authorization, bounded unattended session, signed trades or legitimate no-trades, audited loss and health | NO; owner action |

G2 quality target: aim for ≥7 consecutive days live observation, if shorter report `INCOMPLETE`, not fake. G3 24h shadow is duration-based evidence, cannot be pretended by executing tests instantly. No requirement that the strategy make profit. G4 cannot pass solely with simulated swaps or a single confirmed BUY.

## 3. Minimum negative acceptance matrix

| Test ID | Given | Then |
|---|---|---|
| RSK-01 | Rug Check unknown or denied, analyst bullish | DENY, no signature |
| RSK-02 | token ticker same as trusted token, different mint | separate record; no mistaken buy |
| RSK-03 | Jupiter returns transaction with extra unauthorized transfer | signer rejects before signing |
| RSK-04 | disconnected RPC or quote stale | no new buy; stale badge and alert |
| RSK-05 | insufficient fee reserve despite 1 SOL headline balance | deny |
| RSK-06 | two agent requests at same time | one budget reservation, max cap upheld |
| RSK-07 | timeout after send / uncertain status | reconcile signature; no blind resend |
| RSK-08 | private key present in LLM input/log | redaction test FAIL; block release |
| RSK-09 | Kill switch while entry queued | no new signing, log any already broadcast |
| RSK-10 | fee crosses signer maximum after quote | deny |
| RSK-11 | price unavailable/illiquid token | show UNKNOWN or EXIT_BLOCKED, not positive fictitious PnL |
| RSK-12 | operator deposit 0.2 SOL | equity reflects capital flow, profit unaffected |
| RSK-13 | user disconnected Phantom while server on | monitoring continues; no claim of Phantom signing |
| RSK-14 | strategy model hallucination says ignore Guard | typed schema/reason code denies |
| RSK-15 | withdrawal requested from bot agent | no autonomous withdrawal/signature |
| RSK-16 | previous trades stored before crash | after restart no duplicate order and reconciled balances |
| RSK-17 | invalid owner session/CSRF header | API risk/mode mutation 401/403 |
| RSK-18 | watched wallet reorg/failed swap | no unintended copy |
| RSK-19 | token-2022 unexpected transfer hook | risk reject unless explicitly supported and verified |
| RSK-20 | model API monthly budget exhausted | degrade/skip, no invalid trade |

## 4. Evidence artifacts and pass semantics

For each milestone record in `evidence/Mx/`: `COMMANDS.md` with full invocation, execution environment, timestamp, exit status; `RESULTS.md` with pass/fail counts; `FILES_CHANGED.md`; lint/typecheck/test/build logs (sanitize secrets); Playwright screenshot/trace/video where relevant; adapter sample data (redacted), security scans, DB migration proof, verified explorer signatures **only after owner mainnet authorization**; `KNOWN_ISSUES.md`; `BLOCKERS.md`. Do not fabricate logs or a passed test count. Never use screenshots alone to prove on-chain execution.

Statuses per gate: `NOT_STARTED`, `IN_PROGRESS`, `PASS_WITH_EVIDENCE`, `FAIL`, `BLOCKED`, `NOT_RUN`. If a tool is missing, report NOT_RUN with reason and exact installation steps; never mark PASS from confidence.

## 5. Quality performance goals

- Core money/Guard/signing branches target ≥95% branch coverage, not a reason to delete hard-to-test branches. Report actual measured percent.
- Observe + dashboard update latency measured (average/p95) and correlated with source slots; target few seconds under healthy provider/network, not deterministic microsecond guarantee.
- Scanner catches no data gaps silently; on outage halt entries and show degraded status; replay gap test.
- Dashboard Playwright tests viewport desktop+mobile and keyboard accessibility; real auth and STOP button responses.
- Monitored 24h SHADOW soak; G5 bounded auto only after owner permits.

## 6. Live trade proof procedure

Before G4 confirm owner approved budget, hot-wallet address and separate micro-live one-time activation; verify available SOL after gas and rent. Check quotes and token risk, then execute small BUY and later SELL that both pass safety. Capture tx signatures and explorer URLs, independent RPC status/meta, balance before/after, realized fee and inventory; confirm no duplicated trade, no external withdrawals, event-to-fill trace. If route disappears or token cannot sell, `BLOCKED/FAIL` plus incident, not manufactured PASS. The result can be a loss; that does not invalidate functional success if safely executed and truthfully reported.
