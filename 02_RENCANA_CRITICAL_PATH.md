# SOLANA SENTINEL — CRITICAL PATH DELIVERY & RELEASE CONTRACT

## Prinsip program
1. **Bekukan scope:** 11 peran dan dashboard yang ada dipertahankan. Tidak ada fitur kosmetik, agent baru, orkestrator baru, blockchain/DEX alternatif, deployment kompleks, atau LLM berbayar sebelum jalur inti lulus.
2. **Vertical slice end-to-end:** perubahan kecil harus terhubung dari provider/chain → typed evidence → engine → ledger → API → dashboard → test. Jangan PASS berdasarkan unit test saja.
3. **Satu status per capability:** `IMPLEMENTED/TESTED_REAL_READONLY/TESTED_REPLAY/TESTED_DEVNET/OWNER_BLOCKED/LIVE_VERIFIED/FAIL`. `IN_PROGRESS` digunakan hanya bila memang ada pekerjaan yang tersisa; jangan menghapus label agar terlihat selesai.
4. **Kebenaran data:** `LIVE_PROVIDER` berarti observasi/quote sungguhan, bukan LIVE fills. `PAPER` adalah virtual. Hasil profit yang diperlihatkan pada video referensi bukan benchmark yang bisa diasumsikan.
5. **Risk-first:** tujuan minimum adalah **keandalan dan kerugian terkendali**, bukan janji win rate. Seluruh 1 SOL bukan mandat trading.

## Work package yang harus diselesaikan berurutan

### CP0 — Audit checkpoint dan perbaikan correctness
- Verify Git HEAD `10f5dd0...`, clean tree, export hash, no secret leakage; snapshot existing results 79/22 dan rerun di environment lokal.
- Triage bypass, provenance, accounting/integrity, config and identity risks. Commit fix/README updates only if tested.
- Deliver `DELIVERY_CRITICAL_PATH.md` (living scorecard). **Tidak boleh mengulang PRD panjang.**

### CP1 — Complete source and venue security without false PASS
- Definisikan pool/LP proof per supported venue, vault/rent/mint constraints, holder concentration verifiable bounds, Token-2022 support matrix.
- Entry gate unchanged fail-closed; separate risk-reducing SELL policy dengan kondisi siapa yang boleh mengeksekusi dan bagian mana yang tidak boleh dilewati.
- Truth-table tests: legitimate pool, fake pool, revoked/freeze mint, admin authority, partial holder coverage, unsupported extension, fake quote, manipulated upstream, stalled data, underwater position with exit liquidity, no exit liquidity.
- Gate: aman untuk *mengizinkan strategi dievaluasi* bila evidence PASS dan log reasons complete. Tidak meminta data palsu agar BUY.

### CP2 — Forward PAPER from true provider (no REPLAY as proof)
- Worker mengambil fresh market and chain, GET Jupiter quote, memperoleh decision, mengisi virtual position sesuai policy; monitor quote SELL dan stop/take-profit/time exits; do not modify real funds.
- Persist fill assumptions and estimated vs unpriced states, FIFO partials, capital deposits/withdrawals virtual, rent-refund, fees, TTL, quote expiry, cost basis and equity.
- Integrate reservations across all in-flight jobs and account state, separate own/other lease; crash/restart replay and concurrency negative tests.
- Acceptance: 1 real-provider BUY→SELL *PAPER* cycle when a defensibly qualified market event happens, with complete evidence; **if no safe opportunity occurs, keep no-trade and show a bounded observation report and real-provider SKIPs, do not loosen gates.** This gate is not universally guaranteed by a calendar deadline.
- Dashboard shows data class and sources near every BUY/SELL/P&L; no replay gains on real performance chart.

### CP3 — Wallet radar and mirror signal real proof
- Decoder supports transfer ownership, native SOL/WSOL, CPI/inner instructions, rent, ATA creations, taxes/Token-2022 where supported, swap venues in explicit allowlist; fail UNKNOWN for unsupported.
- Use real public on-chain signature and verify deltas independently; persisted history, stable cursor, gap/reorg handling, backfill and latency P50/P95.
- Copy signal is hypothesis not authority to transact; require risk/route/fee freshness and eligibility. Add explicit permission for wallet watch only. Never infer smart wallet profitability from a few winners.

### CP4 — Execute test harness and independent verification
- Build isolated transaction verifier with complete v0/legacy/ALT/account resolution, instruction allowlist, fees/slippage/minOut, fee-payer and token-delta constraints, token extension fail-closed. Negative/adversarial fixtures mandatory.
- State machine `INTENT → QUOTE_VALIDATED → VERIFIED → SIGNING → SUBMITTED/UNCERTAIN → CHAIN_CONFIRMED → RECONCILED/FAILED`, immutable tx hashes and no double submit after network timeouts. Uncertain must never silently become a second BUY.
- Signer private Unix socket/mTLS, only policy-bounded explicit intent, no key/secret exposure to model, browser, Git or logs. Devnet/local validator + test key only. No mainnet authority.
- Receipt reconciled with independent Solana RPC status/meta.err, token balances, native SOL changes, gas/rent (a submission response alone is not evidence of execution).

### CP5 — Product operation and quant validation
- Finish Phantom extension actual ownership test (user-assisted), native+token portfolio reconciliation, principal vs P&L, positions/trades/fees/analytics, alert/halt/repair states.
- Dataset point-in-time, nested walk-forward (purged), baseline comparisons, transaction costs, exitability, Wilson 95% CI, net expectancy/profit factor/drawdown/tail loss; report no-trade and risk-adjusted return, not arbitrary win-rate target.
- Harden production: TLS, origin/session/CSP/rate limits, least-privilege DB, RPC budget+fallback, supervisor, retry/backoff, alerts, backup restore/offsite encryption, evidence 7 days observe and 24h shadow **measured by real elapsed timestamps**.

### CP6 — Operator handover and financial gates
- Produce realistic operator checklist for brand-new user: how to create Phantom, distinguish main wallet from capped trading hot wallet, use regulated on/off-ramp, set SOL reserve, interpret errors and losses. Never ask seed phrase in prompt/chat.
- Software sign-off only when all non-financial scope is implemented and independently tested; status may be `CODE_COMPLETE_OWNER_BLOCKED` if *only* owner provisioning/mandate remains.
- **MICRO_LIVE:** Owner-specific approval after independent security review, actual wallet funded only by owner, one bounded BUY and SELL, chain signature/finality/delta/ledger proof, recovery/fee accounted. Never auto-request approval through UI trick.
- **CAPPED_AUTO:** New separate owner approval; conservative caps, session expiry, max daily loss/trade fees, allowlists, manual STOP, alerting, time budget, periodic review. Can remain no-trade for safety; halt and alert on anomalies.

## Hard release gates (NO SHORTCUTS)
| Gate | What proves PASS | Fail if |
|---|---|---|
| G1 DATA | On-chain mint/pool and quote source verified, freshness/latency observed, fallback truthful | UNKNOWN labeled PASS, fake pool, missing route |
| G2 STRATEGY | Out-of-sample and forward evidence with all fees & negatives, strategy comparisons | REPLAY counted in forward win rate, profit guarantee |
| G3 ENGINE | Automated provider-fed paper loop, complete accounting, concurrency + restart | No real-provider route to qualifying candidate, duplicate jobs |
| G4 WALLET | Actual public wallet receipts; Phantom identity/portfolio correctly tied | copied transfer mistaken for swap, secrets leaked |
| G5 SECURITY | independent verifier & signer harness, denial tests, no unintended approval | blind signing, wrong mint/ALT, no no-double-execution |
| G6 OPERATIONS | real deployment tests, 7-day/24h elapsed logs, restore, SLO, security review | public RPC treated as production SLA, fictitious soak |
| G7 MICRO_LIVE | Explicit owner approval and independently verified micro BUY & SELL | funds used w/o mandate, broadcast mistaken for finalized |
| G8 CAPPED_AUTO | Second owner approval, ongoing bounded operation, audit, alerts and STOP | hidden caps, unbounded autonomy, no restart safety |

## Per-iteration report contract
`CHANGED_FILES`, `CODE_BEHAVIOR`, `TESTS_EXECUTED` (commands, env class, exit code, count, coverage), `REAL_PROVIDER_EVIDENCE` (source/mint/slot/time/signature or explicit NO), `REAL_PROVIDER_TRADE_EVIDENCE` (NO until owner-approved), `SECURITY/NEW_FAILURES`, `BLOCKERS CODE vs OWNER vs PROVIDER vs TIME`, `NEXT_CRITICAL_PATH`, `COMMIT SHA/clean tree`.

Stop drafting extra plans after CP0; prioritize code/test/evidence. If a gate is dependent on real elapsed time, don't fake it; complete unrelated safe code work and report exactly what remains.
