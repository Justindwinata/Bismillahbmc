# SOLANA SENTINEL — Strategi penyelesaian ketat dan gerbang rilis

## Kontrak produk yang tidak berubah

**Output:** aplikasi web Next.js independen dengan backend/API, data Solana/DEX nyata, beroperasi terus pada server, 11 peran agent terukur, real-time wallet radar/copy feed, strategi buy/sell dengan Risk Governor, Phantom primary read-only/manual funding, signer trading wallet terpisah, transaksi Jupiter mainnet terverifikasi jika dan hanya jika owner mengotorisasi. Dashboard menampilkan scanner, real-time decision trace, posisi, trade tape, equity/PnL, biaya, risiko, latency, alerts, serta mode setiap data.

**Tidak ditargetkan:** klaim PnL dari video, win rate tertentu yang dijamin, menyamai kecepatan video tanpa pengukuran, transaksi tanpa pengujian/kebijakan. Membuat semua role "PASS" demi UI, menghapus HALT atau mengakali approval **bukan** penyelesaian.

## Prinsip eksekusi

1. **Deliver vertical slices**: satu alur mulai input provider sampai keputusan, posisi dan UI beserta tes, bukan fitur terpisah yang tidak terhubung.
2. **Audit sebelum optimize**: source/slot/freshness, identitas token, quote, fee, risiko, idempotency dan bukti persistensi menjadi wajib. Dashboard hanya memproyeksikan kejadian nyata.
3. **Satu rantai otoritas**: Agent mengajukan; Guard memiliki veto; signer secara independen memverifikasi kebijakan dan transaksi sebelum signing. LLM tidak pernah mengakses kunci atau mengirim order secara langsung.
4. **Default aman, tidak stall**: ketika provider/wallet/signing belum diotorisasi, tetap implementasikan dan uji seluruh komponen lain. Status blocked harus menyebut aktor, bukti, solusi dan syarat spesifik; `UNKNOWN` bukan alasan untuk memalsukan PASS.
5. **Tidak bergantung pada ChatGPT Plus untuk runtime LLM**: OpenAI API mempunyai billing dan credential tersendiri; pengujian model opsional wajib dibatasi budget serta fallback deterministik.

## Fase pengerjaan terprioritas

### D0 — Baseline dan reliability repair (langsung)
- `git status`, `git log -5`, cocokkan dengan manifest SHA `aa17895...`; audit perbedaan terhadap ekspor; tes ulang clean install, pnpm check, PostgreSQL dan Playwright asli; commit/checkpoint aman.
- Buat daftar blocker `P0/P1`, ownership dan dependent tests, jangan menulis ulang PRD.
- **Exit:** build reproducible, semua tes baseline yang valid lulus, tidak ada file source hilang, evidence command+hash tersedia.

### D1 — Autonomous market-to-paper end-to-end (prioritas tertinggi)
- Live market/pool discovery yang memadai, on-chain security proof, initial risk metrics, *live Jupiter executable quote* dalam mode quote-only, age/source/fee handling, event queue dengan lease + dedupe.
- Scheduler dapat membuat PAPER session berdasar policy yang ditentukan owner, melakukan valid entry, mengelola posisi (TP/SL/time/liquidity), periodically quote fresh exit, partial exit, fee/gas/rent, capital flow, mark-to-exit; state durable melalui restart.
- Beri dashboard feed PAPER live (bukan REPLAY). Matikan PAPER fill bila quote unavailable/unfillable. SHADOW mencatat keputusan yang tidak mengasumsikan transaksi dan tidak menambahkan inventori.
- **Exit:** satu siklus `LIVE SCAN → VERIFY → QUOTE → STRATEGY → SIZE → GUARD → PAPER BUY → EXIT REQUOTE → PAPER SELL → P&L/EQUITY → AUDIT` terjadi melalui scheduler **tanpa klik Replay**, diverifikasi ke DB dan Playwright dengan live data + replay fixture deterministic saat pasar tidak memunculkan sinyal. Instrumen source class dan policy hash untuk keduanya.

### D2 — Wallet mirroring dan tradability
- Track authorized public addresses (read-only), signature pagination (bukan fixed shallow history), WS reconnect / gap / reorg, native SOL and wSOL swaps, token balance delta, multiple CPI routes, all supported transaction versions / ALT semantics, fees and rent. Build explicit eligibility/veto reasons; no trade from unsupported unknown.
- Separate `source event time`, `observed time`, `confirmed/finalized time` and `actionable time` in latency histogram; design acceleration only if data quality & risk proven.
- **Exit:** at least one real PUBLIC wallet swap signature with independently checked owner delta and copy-candidate status, plus negative unsupported-route tests; the owner may need to supply a public watch address (not private key). If no external wallet event observed, correctly label external-proof BLOCKED, while decoders/fixtures pass.

### D3 — Agent council, strategy research and performance validation
- Freeze strict typed I/O per 11 role; implement diverse actual analytical responsibilities and *evidence-carrying* messaging. DESK orchestrates, SCOUT discovers, FILTER market gate, RUG_CHECK security, ANALYST scored features, STRATEGY entry/exit, SIZER exact position, GUARD independent veto, EXECUTOR manages only authorized intents, LOGGER audit, EQUITY reconciles balances and PnL.
- Optional real LLM deliberation (structured outputs, limits, refusal, cost budget, prompt-injection shielding); no invented AI conversations. If LLM unconfigured, label deterministic council; cannot claim AI-agent consensus. Require measurable incremental value over deterministic baseline.
- Research framework point-in-time historical dataset with missing/delisted tokens, realistic historical available feeds, training/validation/test chronological embargo, walk-forward, out-of-sample and forward paper. Compare: no-trade, naive momentum, selected wallet mirror, multi-agent. Include slippage sensitivity, liquidity shocks, unfilled exits and wallet survivor bias.
- **Exit:** reproducible strategy report: net expectancy, win rate with **N** closed trades and confidence interval, median return, PnL after fees, max drawdown, profit factor, quote-to-fill error, mean/percentile signal lag, failure-to-exit, survivorship assumptions, trade count and regime breakdown. Win rate alone does **not** pass. If edge not proven, mark `STRATEGY_NOT_VALIDATED` and decline auto-live, but complete software.

### D4 — Wallet, full dashboard and accurate accounting
- Preserve dark terminal UX. Complete SPL/Token-2022 support matrix (unknown extensions fail-closed), live native SOL plus verified token holdings, token decimals, quote-based liquidation estimate, cost basis derived from on-chain history (unknown if not reconstructible), deposits/withdrawals separate from profit; equity/PnL by mode.
- Dashboard scanner, multi-agent trace, wallet radar, copy feed, portfolio, trade tape, analytics with charts, rule settings, alerts and audit links; responsive desktop/mobile + screen reader/keyboard; error/loading/stale/empty states.
- **Exit:** parity matrix 100% mandatory functions backed by API evidence; user can distinguish `LIVE_CHAIN`, `LIVE_PROVIDER`, `PAPER`, `SHADOW`, `REPLAY`, `UNKNOWN`; 0 false live-fill displays; real Phantom browser extension manually qualified on user's own device when available.

### D5 — Order, independent verifier and isolated signer (disabled mainnet)
- Implement Jupiter swap/v2 order/execute adapter following current docs; quote+requested order binding, transactions v0/v1 where supported, lookup tables, exact accounts/program IDs, fee payer, signer, instruction decoding, source/destination accounts and mint/amount limits, fees/max rent, expiry, replay check.
- Signer separate process/custody boundary with independent mandate, no keys in repo/LLM; evaluate guard again on current quote/balance, serializable reservations and duplicate intent protection. Durable lifecycle `PROPOSED → RESERVED → ORDERED → VERIFIED → SIGNED → SUBMITTED → CONFIRMED → FINALIZED → RECONCILED`, with explicit `UNCERTAIN/FAILED/REJECTED`. Never blindly retry signed/submitted orders.
- **Exit:** complete adversarial fixture suite (malicious transfers, authority changes, ALTs, fake quote/route, wrong chain, stale blockhash, double-submit, crash at every transition); isolated test signer on non-production wallet/fakes; no mainnet execution authority yet.

### D6 — Production operations qualification
- Dedicated VPS/runtime, TLS, least-privileged DB, secrets service, isolated signer and network ACL, supervisor, watchdog, alerting, provider failover, quota/cost telemetry; encrypted offsite backup/restore; full incident response and recovery playbook.
- Measure observation 7 days and continuous shadow 24 hours **as actual elapsed time**, not mocked duration; chaos DB outage, duplicate, WS disconnect, rate limit, signer unavailable, clock drift, failed exit, provider stale, rollback, deployment upgrade, 24/7 browser-closed runtime.
- **Exit:** independent security review critical/high resolved, documented RTO/RPO evidence, measured uptime/latency/SLO thresholds agreed and met, zero unauthorized real transfers, robust post-crash reconciler; `CODE_COMPLETE_OWNER_BLOCKED` only when all non-financial gates pass.

### D7 — Owner-gated MICRO_LIVE validation
- Requires entirely new explicit owner authorization, provider credentials/production quota if needed, independent funded hot wallet small enough to lose entirely, nonzero owner-defined caps, signer and security review, mandatory fee reserve.
- One tiny BUY then SELL if legally and technically feasible; verify actual signature + finality + `meta.err`, pre/post token/SOL balance, fees/rent, idempotency, ledger reconciliation. If SELL impossible/market unsafe, stop and report inability; no forced unsafe order.
- **Exit:** `LIVE_VERIFIED` only if objective evidence exists; no financial action based on prior general project instruction.

### D8 — Owner-gated CAPPED_AUTO
- Requires **second** distinct owner mandate, expiry, caps/cooldown/universe and loss budget; emergency STOP and revocation tested, independent signer enforces scopes.
- Run limited monitored session; compare real performance to validated shadow, profit and losses; accept legitimate no-trades; halt on quota/lag/quality/safety failure.
- **Exit:** `CAPPED_AUTO_VERIFIED` with actual telemetry, financial reconciliation and incident ledger. No promised net-positive performance.

## Strategy dan win rate — kriteria tanpa memalsukan hasil

- Target awal adalah **expected value net positif yang tahan perubahan kondisi** dan probabilitas kerugian ekstrem yang terbatas; win rate hanya indikator pendamping. Contoh: win rate 80% dapat rugi bila 20% trade kalah sangat besar.
- Jangan menentukan `70%`, `80%`, `90%` win rate sebagai acceptance arbitrer. Definisikan hipotesis strategi dan toleransi pengguna sebelum pengujian; kalkulasi interval kepercayaan binomial agar sample kecil tidak terlihat pasti.
- Minimal keluarkan laporan berurutan: *backtest point-in-time* → *out-of-sample/walk-forward* → *forward PAPER* → *SHADOW* → owner-approved micro-live. Hasil tiap tahap tidak dipakai untuk fitting tahap berikutnya tanpa menandai kontaminasi.
- Laporkan semua token yang pernah ditemukan termasuk rug/delisted/untradeable; jangan hanya yang punya return tersedia. Sertakan biaya Jupiter/platform, network/priority, rent, price impact, MEV exposure, opportunity cost/lag, quote expiry, failed exit, failed/reverted transaction.
- Guard hard veto untuk unknown mint ownership, unsupported extension, wallet spoofing, liquidity cliffs, honeypot-like exit inability, stale/contradictory feed, concentrated holder/creator (grounded), excessive price impact, repeated losing streak, budget/cooldown breach, missing signer mandate.
- Satu trade hanya mendapat `CLOSED_WIN` setelah real exit/buy/sell semuanya rekonsiliasi, fee-aware realized P&L > 0. Unrealized gains tidak dihitung closed win. `SKIP` bukan win.

## Status dan metode pelaporan yang wajib

- `IMPLEMENTED_UNTESTED`, `TESTED_LOCAL`, `OBSERVE_VERIFIED`, `PAPER_E2E_VERIFIED`, `SHADOW_QUALIFIED`, `CODE_COMPLETE_OWNER_BLOCKED`, `MICRO_LIVE_OWNER_BLOCKED`, `LIVE_VERIFIED`, `CAPPED_AUTO_VERIFIED` — masing-masing hanya bila proof cocok.
- Setiap checkpoint: file changed, architecture delta, hash commit, deps, exact commands/exit codes, screenshot & trace, source of live data, signatures jika ada, measured performance, residual risks, next prioritized item, `BLOCKED_BY_OWNER` vs `BLOCKED_BY_CODE` vs `BLOCKED_BY_EXTERNAL_PROVIDER`.
- Tidak boleh mengubah status release hanya karena dashboard terbuka, coverage tinggi atau semua agent card hijau.
- Selesaikan D0–D6 sebisa mungkin tanpa meminta persetujuan berulang; **berhenti secara tegas pada D7/D8 financial gates**.
