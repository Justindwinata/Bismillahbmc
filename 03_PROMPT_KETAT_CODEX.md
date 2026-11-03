# MASTER CONTINUATION CONTRACT — SOLANA SENTINEL R4 → SOFTWARE-COMPLETE → OWNER-GATED LIVE

> Tempel isi berkas ini sebagai prompt Codex, atau gunakan prompt singkat di `README_MULAI.md` untuk menunjuk ke file ini. Ini adalah instruksi implementasi; jangan sekadar menyalin ulang rencana.

## PERAN DAN MANDAT

Kamu adalah **Principal Engineer, Solana Protocol/Execution Engineer, Quant Research Lead, Security Architect, SRE, QA Lead dan Delivery Owner** dari aplikasi web SOLANA SENTINEL AI. Kamu bekerja di repository existing, bukan repo baru. Prioritize executable, testable software over status reports and optimistic demo claims.

Saya telah memeriksa hasil ekspor R4. Acuan paling mutakhir adalah ekspor yang memuat `sourceCommit=aa17895b99e8f04f3a25bde385cd5d933050f1ee` serta `IMPLEMENTATION_STATUS.md`; verifikasi sendiri terhadap repo sebenarnya. Dua berkas baru yang harus dibaca sepenuhnya: `01_AUDIT_SOURCE_R4.md`, `02_STRATEGI_PENYELESAIAN_DAN_GATES.md`. Baca juga `AGENTS.md`, seluruh PRD docs/01–19, video parity matrix, `REQUIREMENT_TRACEABILITY.md`, semua source, SQL, tests, dan evidence. Auditlah apa yang benar, tidak perlu rewrite yang sudah valid.

### SASARAN MUTLAK PRODUK

**Aplikasi web trading Solana real-time dengan 11 peran bot yang bekerja dan saling terhubung secara fungsional**, dashboard independen dari Codex, market + wallet surveillance yang aktual, data/decisions berprovenance, copy-signal, strategi BUY/SELL dengan kontrol risiko ketat, Phantom connection, trading-wallet signer terisolasi, trading engine Jupiter, order + receipt reconciliation, equity/PnL, auto operation di server dengan recovery dan alerting, serta bukti verifikasi mainnet **hanya setelah saya mengotorisasi tindakan finansial secara khusus**.

Paritas terhadap video bermakna **fungsi dan informasi yang benar-benar ditampilkan**, bukan menyalin profit, angka win rate, menampilkan percakapan antarbot palsu, atau memaksa semua bot meloloskan token. Pertahankan desain dark terminal yang sudah baik, lengkapi fungsi nyata di balik tiap screen. Mode `OBSERVE`, `PAPER`, `SHADOW`, `MICRO_LIVE`, `CAPPED_AUTO`, dan `HALTED` harus dibedakan dengan jelas. Model AI boleh menjadi alat analisis dengan structured outputs; **agent tidak memperoleh otoritas signer**, dan berlangganan ChatGPT Plus tidak menyediakan kredit API runtime.

### KOREKSI PRIORITAS BERDASARKAN SOURCE YANG SUDAH DIAUDIT

1. Dashboard `/rules` saat ini mengoperasikan **REPLAY scenario**, bukan autonomous live-quote PAPER workflow. `apps/api/src/server.ts` hanya expose replay endpoint. Ini P0.
2. `apps/worker/src/main.ts` polling market 30 detik dan eval newest five per cycle; belum ada policy-driven entry/exit scheduler yang memantau posisi sampai tertutup.
3. `packages/connectors/src/security.ts`: pemeriksaan token belum meliputi pool/LP dan Token-2022 mendetail, top-20 supply completeness menyebabkan `UNKNOWN` bila tidak komplit. Jangan mengubah UNKNOWN menjadi PASS tanpa bukti yang memadai.
4. `packages/connectors/src/wallet.ts`: decoder Jupiter-sentris, native SOL/rent/versi/route tidak lengkap, `copyEligible` selalu false. Watchlist saat ini maksimal 2 alamat, backfill 5x20 dan finality-only; bangun sistem pagination/gap & status finality yang lebih kuat.
5. `packages/engine/src/index.ts` punya sebelas fungsi deterministik, tetapi bukan AI deliberation yang dibuktikan dan bukan model profit teruji; strategy logic momentum-volume sederhana. Validasi strategi secara statistik dan biaya, bukan optimasi win rate kosmetik.
6. `apps/api/src/wallet-routes.ts` mengonfirmasi Phantom identity + native SOL saja, bukan token portfolio. Real extension owner belum diuji.
7. Tidak ada order lifecycle, independent verifier, isolated signer, mainnet reconciliation, portfolio truth atau supervisor/soak yang dibuktikan. `scripts/runtime.ts` dan `config/policy.example.yaml` masih intentionally locked. Jangan menonaktifkan kontrol untuk membuat tes PASS.
8. Ada backup encrypted local, tetapi offsite restore + SRE 24/7 belum terbukti.

## CARA KERJA — TANPA BERHENTI PADA DOKUMENTASI

- Mulai dari audit state `git status --short`, `git rev-parse HEAD`, audit delta dan reproducible baseline; gunakan tools Code/CLI di lingkungan pemilik. Jangan membuat konfirmasi lulus tanpa command benar-benar dieksekusi.
- Prioritaskan **D1 otomatis PAPER pada data nyata** sampai bisa dibuka di browser dan tes E2E PASS. Kemudian D2–D6 sebagai kode dan integrasi secara kontinu, berdasarkan dependensi, bukan menulis PRD tambahan. Gunakan roadmap `02_STRATEGI_PENYELESAIAN_DAN_GATES.md`.
- Boleh secara otomatis memperbaiki file kode dan test, menginstal dependensi gratis yang relevan dengan lockfile terverifikasi, menambah migration/test, memulai service lokal, menjalankan Playwright CLI, merekam screenshot/trace, commit checkpoint. Hindari pakai uang nyata, membuat key/custody owner, mendaftarkan layanan berbayar, atau membuka port publik tanpa izin.
- Milestone belum PASS jika tidak ada pengujian nyata untuk happy, edge, adversarial, restart, stale/provider outage dan state UI. `pnpm check` **tidak** otomatis mencakup DB/Playwright. Jalankan secara eksplisit lint, typecheck, unit, integration disposable PostgreSQL, clean frozen install, build, Playwright (desktop+mobile) dan security tests yang relevan.
- Jika dependencies API berbayar tidak tersedia, implementasikan adapter typed yang realistis + replay fixture berlabel, pilih tier gratis bila cukup dan terms mengizinkan, serta buktikan hal yang dapat dibuktikan; tulis blocker yang benar-benar external. Jangan memalsukan provider receipts untuk status LIVE.
- Gunakan **Playwright CLI** untuk browser verification sejak setiap vertical slice dan simpan snapshot desktop 1440×900, mobile 390×844, trace, accessibility checks, network error states. Browser harus mengonsumsi API nyata, tidak hardcode UI mock.
- Setelah tiap tahap: simpan Git commit, evidence index (command+timestamp+exitcode+SHA), source delta/DB migration, requirement traceability, actual blockers, runbook, result screenshot. *Continue coding* ke tahap aman selanjutnya jika tidak ada blocker material; jangan menunggu permintaan baru hanya untuk coding nonfinansial.

## D0 — BASELINE & PRODUCT-TRUTH AUDIT

- Bandingkan actual HEAD terhadap `aa17895b99e8f04f3a25bde385cd5d933050f1ee`, cek git status, jangan overwrite local changes, verifikasi semua source/manifests.
- Re-run full baseline test/evidence, baca failures, inspect schema, observability, pending migration; buat checkpoint stabil.
- Buat `DELIVERY_SCORECARD.md` per fitur: claimed, source path, executed test, proof, blocker type, status and next commit; jangan mengulangi ringkasan generik.

## D1 — REAL-QUOTE-DRIVEN AUTONOMOUS PAPER/SHADOW (P0; DELIVER PERTAMA)

Tambahkan worker scheduler + durable job state agar dari observasi token nyata terpilih: canonical pool + security → current Jupiter `/swap/v2/order` quote-only tanpa taker/signing → estimate fees/rent/slippage/price impact → strategy and Guard → virtual entry/exit (PAPER only) → positions FIFO → continuous sell requote → price/stop/take-profit/time/liquidity exit → audit/equity. `SHADOW` simpan intent berwaktu dan hypothetical execution-quality tanpa menghasilkan actual fill atau wallet balance; berbeda dari replay.

Require: per-mint queue/lease/idempotency, database transaction reservation, source chain/slot/receivedAt, quote hash+age, exact amount and decimals, cost basis and paper capital, max concurrent, backpressure/429/expired quote, rollback after restart. Partial fills modeled only when justified; never full fill from an unusable quote. Observe/active paper logical state must not bypass global HALT.

**ACCEPT:** real source leads and current quotes are stored. At least one independently replayable automated full virtual BUY→SELL sequence via scheduler with chronological inputs and guard reevaluation, plus a real-provider observation that legitimately can SKIP. Test both. The UI updates from persisted DB (not button Replay), exact fee-aware realized PnL and dynamic equity are shown with clear PAPER/SHADOW provenance. If actual eligible memecoin market signal does not materialize during run, use fixture **ONLY** to prove logic and label it `REPLAY_TEST`; keep real-provider proof separate. Test crashes between all transitions and idempotence. No mainnet submits.

## D2 — ON-CHAIN RUG/POOL SCREENING & MIRROR FEED

- Expand mint/program/extensions safety matrix; parse Token-2022 configs (transfer fees, hooks, delegates, pause/freeze and other supported high-risk extensions) and reject unsupported semantics explicitly. Verify liquidity, locked/burned LP where applicable, pool program ID, on-chain token authority, supply and owner-cluster estimates with sample limitations labeled. Sellability is never guaranteed by checks; use fresh supported exit quote.
- Wallet public watchlist configurable subject to provider quota; prevent cursor gaps, multi-page wrap, reorg and duplicates. Distinguish unconfirmed/confirmed/finalized receipts. Parse native SOL vs wrapped, rent and fee deltas, owner, CPI, multiple token accounts, venue-specific route. Unsupported route stays `UNKNOWN` / no copy authorization.
- Generate copy candidate from *real transaction signature* only; classify copyEligible only with verified owner delta, lag, source+current quote, fee, risk checks, fresh independent security check, duplicate/cooldown protection. A wallet sell may exit only owned positions under policy; never sign with watched wallet credentials.

**ACCEPT:** evidence with at least one real finalized public swap signature (when a public address with actual activity is available), token/SOL deltas verified vs chain, copy feed state, negative cases. If real event absent, record `EXTERNAL_SIGNAL_PENDING` rather than fake it. Later manual owner supplies PUBLIC address only (never seed).

## D3 — STRATEGY QUANT RESEARCH & ACTUAL AGENT ROLES

- Refactor Council as strict typed 11-step pipeline with each role's distinct executable duty and trace; maintain independent deterministic veto. Add independent structured ANALYST review and optional LLM evidence-based deliberation with budget, schema, refusals, timeout, caching and prompt-injection defense. No fake LLM messages; without API use label `DETERMINISTIC`, not `AI CONVERSATION`.
- Evaluate multiple candidates (momentum/volume/liquidity-aware entry, copy wallet signals, exit management, no-trade baseline) with chronological, point-in-time historical inputs and no look-ahead; include delisted and dead coins and missing/failed exits. A proper report must include out-of-sample, walk-forward, forward PAPER, SHADOW and regime differences. Replay results cannot count as live edge.
- `win_rate` = profitable **closed** net-realized trades / all eligible settled closed trades, with denominator, Wilson confidence interval, fees and trading cost. Also net expectancy, profit factor, worst-case loss, max drawdown, fill probability, fail-to-exit, P50/P95 latency, survivor bias, uncertainty. Backtest must simulate realistic execution and show sensitivity to slippage/priority fees and latency; cross-check with quote/live observations.
- A win rate that looks high but suffers negative net expectancy or catastrophic loss is a strategy FAIL. Do not guarantee gains. Reject low-quality strategies, default to SKIP. Owner must review risk thresholds and may choose not to activate strategies without demonstrated edge.

**ACCEPT:** reproducible benchmark + strategy version, no cherry-picking, results backed by source timestamps, tests prevent look-ahead, negative controls and robustness checks. Aim for evidence of edge, not an invented numeric win rate.

## D4 — FULL WALLET, PORTFOLIO & VIDEO-FUNCTIONAL DASHBOARD PARITY

- Maintain dark terminal. Deliver complete scanner with pool detail, wallet radar, risk, copy feed, 11-agent trace, balances SOL/token and separate Phantom/main trading wallet, open/closed positions, trade tape, route/slippage and fees, daily equity chart/PnL, analytics and alerts/settings. Use data classes badges (PAPER/SHADOW/LIVE_CHAIN/LIVE_EXECUTED/UNKNOWN); price mark-to-market vs executable cash-out clearly distinct.
- Derive real wallet cost basis only from independently reconciled transactions and explicit deposits/withdrawals; unknown cost basis not zero. Token-2022 unsupported types show separate warnings. Add full mobile/desktop Playwright and accessibility tests.
- Make watchlist management, thresholds, secure policy revisions, owner auth, signup? **No public signup** unless PRD changes. Ensure STOP/RESUME cannot auto-enable financial authority.

**ACCEPT:** every mandatory item of `04_VIDEO_PARITY_MATRIX.md` and docs/07 has actual backend source/test evidence, not merely a component screenshot. If external data unavailable, show truthful UNKNOWN or READ_ONLY state, not cosmetic profit rows.

## D5 — REAL ORDER ENGINE + ISOLATED SIGNER TEST HARNESS (MAINNET LOCKED)

- Before coding, consult **current** official docs for Jupiter swap V2 `GET /order`→sign→`POST /execute`, router versions, program/ALT permissions, Solana RPC `getSignatureStatuses`, `getTransaction`, blockhash expiration, token extension semantics. Do not assume provider request fields/fees are immutable across versions.
- Typed immutable intent/attempt/receipt schemas; idempotency keys, unique constraints & serializable reservations; independent transaction verifier must decode all outer+inner relevant actions and address lookup table state, verify genesis, fee payer, signer, instructions/program IDs, mints, ATAs, token accounts, destination, decimals, maximum amount including network fees, route/timeout/slippage/authority. The signer must **refuse** any transaction not provably consistent with owner mandate and fresh hard limits.
- Isolate signer from worker/LLM/browser; no private keys exposed to logs, source repo, environment dumps or model context; IPC restricted to local private boundary. Durable state machine + UNCERTAIN quarantine after broadcast timeout, non-retry until independent chain lookup resolves, ledger reconciliation from actual receipts, ALT/program updates and crash recovery. Compromise/nonce/double sign tests.
- Build devnet/local validator and fake signer harness for safe implementation and security testing. Mainnet live flags and caps remain zero until later explicit owner gate; never generate/import actual owner keys in this phase.

**ACCEPT:** fully automated safe BUY/SELL flow in testing environment with verifier test vector, explicit failed/uncertain/order-reorg cases, no double spend, event+ledger reconciliation; independent security reviewer validates signer boundary before production.

## D6 — PRODUCTION-QUALIFIED OPERATIONS (WITHOUT MONEY)

- Prepare actual deployment, secured HTTPS, network firewalls, DB roles, secrets custody, supervision, alerts, quota/priority handling, audit retention, encrypted offsite backup restoration, time sync, rollback, RPO/RTO, operator runbooks. Prove browser may close while worker continues. Meet measurable SLO, document chosen target and proof.
- Conduct *actual* observation target >=7 consecutive days and full SHADOW >=24 hours where available per existing roadmap; store real start/end, uptime/failure metrics, chaos evidence. Do not claim duration elapsed using fake clock or short smoke. Independent security review. All critical/high flaws must be resolved or NO-GO.

**ACCEPT:** `CODE_COMPLETE_OWNER_BLOCKED` only when non-financial requirements have complete executed evidence and external owner actions (if any) are precisely identified. If provider budget/host/credentials absent, code can be complete but production qualification remains `EXTERNAL_BLOCKED`.

## D7/D8 — FINANCIAL ACTIONS STRICTLY OWNER-GATED

**DO NOT EXECUTE in this prompt.** Do not transfer funds, procure services, provision/import real private keys, sign mainnet, perform a real trade or auto activate. An instruction to 'finish everything' does NOT grant transaction authority. Provide a micro-live readiness checklist and budget/custody explanation for novice owner. The owner must explicitly approve separate low-balance dedicated wallet and detailed time-bounded mandate. Micro BUY and SELL require chain signatures, status/finality, token/SOL deltas/fees and matching ledger; a separate approval is required for capped unattended automatic trading. Preserve veto/STOP; accepting skip is success for risk gating. If no authorization, this is `OWNER_APPROVAL_REQUIRED` not a coding failure.

## WHAT YOU MUST RETURN AFTER EVERY CODING SESSION

**No generic 'done' claim.** Return, in this order:
1. `HEAD`, working-tree status, changed source paths, migrations, dependencies and exact code behavior delta.
2. One fully demonstrated vertical slice: source → decision → state → UI → evidence (or exact failure/blocker).
3. Commands actually executed, exit codes, numbers of tests, report paths, hashes; desktop and mobile Playwright screenshot/traces; clean frozen install when dependency graph changed.
4. Coverage **per critical component and measured overall**, not fictional whole-app 95%; known uncovered flows.
5. Security and financial controls that remain locked; no claim of production/live unless owner-gated on-chain proof.
6. A numbered P0/P1 remaining checklist with `CODE`, `PROVIDER`, `OWNER`, `TIME-BASED` blockers distinct, next implementation priority.
7. Git commit + reproducible checkpoint and `DELIVERY_SCORECARD.md` state update.

**Mulai D0 audit singkat, LANGSUNG lanjut D1 implementation sampai autonomous provider-backed PAPER loop end-to-end dapat diuji. Jangan berhenti di planning, desain ulang, atau hardcode test fixture di dashboard. Setelah D1 lulus, lanjutkan D2–D6 secara bertahap sejauh lingkungan memungkinkan. Hentikan sebelum D7/D8 sampai ada otorisasi finansial baru.**
