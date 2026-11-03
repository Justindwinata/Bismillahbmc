# AUDIT INDEPENDEN — SOLANA SENTINEL AI

**Tanggal:** 2026-11-01 (Asia/Jakarta)  
**Objek:** Enam dokumen hasil pengerjaan Codex (`AUDIT.md`, `DECISIONS.md`, `RESULTS.md`, `PLAN.md`, `IMPLEMENTATION_STATUS.md`, `DEVELOPMENT.md`).  
**Baseline pembanding:** paket spesifikasi `SOLANA_SENTINEL_CODEX_FOUNDATION_V2`, termasuk `AGENTS.md`, `docs/01..19`, dan tiga gambar referensi.

## A. Putusan dan batas audit

**Putusan audit dokumenter: CONDITIONAL CONTINUE — NOT_LIVE_VERIFIED.** Lanjutkan pengembangan **non-finansial** dan perbaiki evidence/checkpoint terlebih dahulu. **NO-GO** untuk wallet funding, automated signing, atau mainnet trade. Laporan menunjukkan fondasi teknis yang masuk akal, tetapi aplikasi dashboard dan trading belum selesai.

Audit ini **bukan source-code audit**, karena pengguna tidak melampirkan working tree yang telah dimodifikasi Codex, Git diff, lockfile, migrasi, unit test, log mentah, maupun evidence folder. Path lokal di Mac pengguna tidak bisa diakses dari sesi ini. **Tidak ada tes kode Codex yang dijalankan ulang oleh auditor ini.** Semua persentase, hasil perintah, dan jumlah tes dalam dokumen berikut adalah *reported by Codex*, bukan hasil reproduksi independen.

Sebagai kontrol, baseline PRD asli yang tersedia di sesi ini diperiksa: `shasum -a 256 -c SHA256SUMS.txt` mengonfirmasi seluruh item baseline dengan status `OK` di container auditor. Baseline **hanya berisi spesifikasi, scaffold kosong, dan referensi visual**, bukan perubahan hasil Codex. Dua MOV asli tidak dimasukkan ke paket baseline; karena itu Codex tidak bisa membuktikan perilaku temporal video hanya dari contact sheet.

## B. Audit file demi file

| Berkas | Temuan yang didukung isi berkas | Keterbatasan dan tindakan lanjutan | Severity |
|---|---|---|---|
| `AUDIT.md` | Inventaris 19 docs lengkap; baseline Git dilaporkan commit `1acfb16`; SDK, provider, security dan constraint diidentifikasi; M0/M1 saja. | Klaim baca semua docs dan akses jaringan berasal dari Codex; tidak tersedia log sumber/hasil aktual atau working tree. Penyelarasan PRD milestone belum dilakukan pada dokumen master; keluarkan change-note/traceability yang jelas. | P1 |
| `DECISIONS.md` | ADR-013..018 menempatkan OBSERVE/zero budget, wallet signer terpisah, truth-of-ledger, protected API dan opsi toolchain; ini relevan. | Next.js disebut **baru dipilih**, bukan terpasang; 11 role masih kontrak, bukan modul aktif; JWT/session browser belum ada. Override transitive `minimatch` lintas major harus diverifikasi dengan lockfile dan CVE audit aktual. Perlu ADR konkret untuk jadwal UI, provider/pool discovery, dan pemisahan AI council dari bot deterministik. | P1 |
| `RESULTS.md` | Melaporkan 19 tes unit/komponen, 5 integration PostgreSQL, coverage domain 97,56%, frozen install, lint, typecheck, build, smoke; riwayat kegagalan awal dijelaskan. | Raw `commands.jsonl`, `COMMANDS.md`, `coverage-summary.json`, source dan binary/artifact tes **tidak terlampir**. Coverage adalah **domain foundation 40/41 branches**, bukan 97,56% seluruh app. Early evidence filenames tertimpa, diakui sendiri; perlu bukti baru yang immutable. `pnpm check` tidak mencakup PostgreSQL integration atau Playwright. | P0 (evidence gap) |
| `PLAN.md` | Roadmap M0–M8 sejalan dengan tujuan akhir dan secara eksplisit memisahkan shadow serta mainnet. | Jangan habiskan iterasi untuk riset sempurna tanpa menyelesaikan vertical-slice UI yang dapat dibuka. Mulai market feed → DB → SSE → browser → test sekaligus, lalu lanjut role pipeline. Durasi observasi 7 hari/24 jam tidak dapat disubstitusi oleh smoke. | P1 |
| `IMPLEMENTATION_STATUS.md` | Status jujur: NOT_LIVE_VERIFIED, M0/M1 IN_PROGRESS, M2–M5 NOT_STARTED, M6/M7 BLOCKED; mengakui browser/e2e/backup/mainnet belum ada. | Perubahan implementasi **uncommitted pada `main`** menurut laporan; checkpoint aman berisi commit hash dan working tree bersih perlu disiapkan. Bukti `SOURCE_MANIFEST.json`, `FILES_CHANGED.md`, dan commands tidak dikirim; status tidak dapat direproduksi. | P0 |
| `DEVELOPMENT.md` | Menjelaskan API localhost:4000, DB PostgreSQL, worker observasi, token layanan internal, HALT persisten, perintah lokal. | Belum ada browser auth/Phantom, belum ada tampilan Next.js, server production atau signer. API bearer service **tidak boleh** dipakai langsung dari browser; readiness sengaja 503. Dokumentasi belum membuktikan `pnpm dev` berjalan di Mac saat ini, hanya menginstruksikan pengguna. | P1 |

## C. Matriks fitur produk terhadap bukti yang ada

| Kemampuan target | Status berdasarkan enam laporan | Syarat verifikasi berikutnya |
|---|---|---|
| Monorepo, API, worker, migration Postgres | DIKLAIM DIBANGUN; belum direproduksi auditor | Git diff/source, migrations, perintah + log + DB proof |
| Data pasar Solana/DEX real read-only | DIKLAIM SEBAGIAN BEKERJA | raw response/snapshot yang dirahasiakan seperlunya, slots/sources, freshness, reconnect test |
| Dashboard web Next.js real-time | BELUM ADA | browser running + backend+DB, Playwright screenshot/trace |
| Pemantauan smart wallet dan mirror signal | BELUM ADA | monitor address publik, decode swap, backfill/dedupe/lag, audit source |
| 11 bot menjalankan logika masing-masing | BELUM ADA | role code, stage events nyata, test veto/skip/trace, browser evidence |
| Agent 'diskusi' | BARU PROTOKOL DI PRD | structured proposals, dissent and policy decisions; jelaskan deterministic vs LLM optional |
| Phantom connection / signed nonce login | BELUM ADA | wallet challenge/nonce + replay/CSRF tests, no secret extraction |
| PAPER/SHADOW ledger / equity | BELUM ADA | deterministic replay, full fees, deposits excluded from profit, invariant tests |
| Jupiter quote tradable + prepared tx | BELUM ADA; hanya GET tanpa taker (transaction null) | valid unsigned order with isolated test flow, transaction verifier |
| Hardened signer/mainnet execution | BELUM ADA | independent security review, isolated signer, hard caps, chain receipts, separate owner activation |
| Auto trading unattended 24/7 | BELUM ADA | VPS/run supervisor, alerts, restart + reconciliation, capped operation proof |
| Browser Playwright, chaos, restore, 24h/7d | NOT_RUN | full evidence run; status never fake PASS |

## D. Temuan prioritas

**F-01 P0 — Evidence utama tidak tersedia.** Enam dokumen menunjuk artefak yang tidak terlampir: `evidence/M0/commands.jsonl`, `evidence/M1/commands.jsonl`, `COMMANDS.md`, `EARLY_ATTEMPTS.jsonl`, `SOURCE_MANIFEST.json`, `FILES_CHANGED.md`, coverage dan source. Tindak lanjut: Codex audit file sumber aktual, rerun instalasi/tes, simpan log unik dengan SHA256, sediakan manifest dan ekspor evidence bebas rahasia. Jangan menyatakan tes terverifikasi independen sebelum dijalankan auditor.

**F-02 P0 — Perubahan saat ini uncommitted.** Sebelum perluasan scope, periksa `git status`, staged/unstaged/untracked, secret scan dan file besar. Commit hasil yang valid secara atomik, buat tag/checkpoint, log commit SHA. Jangan `git reset --hard`/`git clean -fd` tanpa meninjau dan mengamankan kerja. Tidak melakukan push atau akses pihak ketiga tanpa otorisasi jika repo privat.

**F-03 P0 — Produk inti belum ada.** Dashboard, market streams, role engine, wallet monitor, ledger, signer bukan hasil yang selesai. Arahkan Codex pada **vertical slice operasional** sejak pekerjaan berikutnya: market read-only → Postgres → API/SSE → Next UI real-time → Playwright, kemudian keputusan agent yang nyata dan dapat diaudit.

**F-04 P1 — Angka 97,56% berpotensi disalahpahami.** 40/41 branch milik domain awal tidak mengukur keamanan sistem trading, wallet, UI, atau provider. Laporkan cakupan per-package dan critical branch (risk/signer/ledger) tersendiri, bukan persentase total semu.

**F-05 P1 — AI agent tidak sama dengan 11 panggilan LLM.** Baseline `docs/03` memang mengutamakan 11 modul logika deterministik yang menghasilkan keputusan terstruktur; LLM council opsional. Keinginan pengguna tentang bot 'berdiskusi' harus diwujudkan sebagai event decision/proposal/dissent yang sebenarnya, bukan chat buatan. Tambahkan AI read-only jika API dan biaya tersedia, tanpa hak memerintah penandatangan.

**F-06 P1 — Market feed baseline tidak cukup untuk mirroring cepat.** DEX token-profile polling 2 RPM bukan detector lengkap token baru atau transaksi smart wallet. Integrasikan pool/pair stream, Solana WS/monitoring address, cursor backfill, ordering/finality dan provider lag; ukur latency dengan sumber tepercaya. Jangan janjikan zero-delay atau copy profit.

**F-07 P1 — Keamanan session dan signer belum ada.** Service bearer token localhost tidak boleh disematkan pada bundle browser. Tambahkan sign-message nonce, owner sessions, CSRF, credential rotation, RBAC, explicit activation, signer isolation dan verifier sebelum menawarkan tombol live.

**F-08 P1 — Accounting/transaction uncertainty belum dibuktikan.** Test dua kali submit, timeout after broadcast, blockhash expiry, shadow ledger, deposit/withdraw, partial fees, illiquid exits, external wallet transfers dan rent harus lewat properti dan integration tests. `sendTransaction` yang mengembalikan signature tidak menjamin transaksi finalized (Solana official docs).

**F-09 P2 — Prioritisasi UI dan dokumentasi.** Rencanakan screenshot 1440×900 dan 390×844, empty/stale/halted/error states, terminal overview dan agent events yang disumberkan dari DB. Pilih tahapan vertikal yang memberikan output browser nyata tanpa memalsukan fills/equity.

## E. Rencana perbaikan dan acceptance

1. **R0 — Preserve and reproduce:** periksa repo yang benar, pastikan secrets dikecualikan, commit checkpoint aman, generate inventory/filehash/diff dan rerun tests. PASS hanya dengan evidence.
2. **R1 — First honest dashboard:** `apps/web` Next.js berjalan, login aman, status API/worker/data, market candidates asli, SSE resume & staleness, Playwright. Mode OBSERVE, semua saldo unavailable bila belum diverifikasi.
3. **R2 — Market and wallet intelligence:** pool info, RPC WS, monitoring wallet publik, decode swaps, mirror proposal feed, backfill + dedupe, latency measurement.
4. **R3 — Eleven bot roles and paper accounting:** typed runnable pipeline, hard Guard veto, immutable trace, paper/shadow ledger, exit scenarios, reason codes dan UI drilldown; AI summary optional, billed API explicit.
5. **R4 — Phantom and complete dashboard:** nonce signed auth, wallet read-only, setup/onboarding, security, positions, risk, trades, audit, equity, STOP; real backend; desktop/mobile/e2e.
6. **R5 — Disabled execution foundation:** Jupiter order, transaction/ALT instruction verifier, test-only isolated signer, atomic budgets, idempotent lifecycle, chain reconciliation, chaos/restore; still mainnet live disabled.
7. **R6 — Qualification:** real observation ≥7 hari bila masih merupakan gate resmi, actual 24h shadow, security review, production RPC/hosting assessment and backups; honest incomplete on early exit.
8. **R7 — Owner-gated live:** only after explicit separate approval, segregated wallet, low caps, actual micro buy/sell with independently validated signatures; then separate approval capped-auto/production.

Release modes must always say `OBSERVE`, `PAPER`, `SHADOW`, `MICRO_LIVE`, `CAPPED_AUTO`, with provenance in every persisted event. A release can be **CODE_COMPLETE_BUT_OWNER_BLOCKED** without inventing evidence of financial activity.

## F. Minimum owner information and handoff

For a true independent *source-code* audit at the next checkpoint, upload a sanitized ZIP of the **actual Codex-modified repository** (not the original PRD ZIP), including `package.json`, lockfile, `apps/`, `packages/`, `ops/`, `scripts/`, migration and test files, `IMPLEMENTATION_STATUS.md`, `DECISIONS.md`, `evidence/M0` and `evidence/M1`. Exclude `.env`, `node_modules`, `.git` credentials, wallet keys, private endpoints, database dumps with sensitive information and `.tmp/pgdata`. Record `git status --short`, `git log -5 --oneline`, and `pnpm check` outputs in redacted evidence.

## G. Independently consulted official technical references

- Solana transaction submission is not confirmation: https://solana.com/docs/rpc/http/sendtransaction
- Solana production RPC guidance: https://solana.com/docs/rpc
- Jupiter Meta-Aggregator /swap/v2 order & execute: https://developers.jup.ag/docs/swap/order-and-execute
- Phantom web integration: https://docs.phantom.com/solana/integrating-phantom
- DEX Screener API profiles: https://docs.dexscreener.com/api/reference
- OpenAI Codex / `AGENTS.md` usage: https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex

**Bottom line:** The Codex report is more transparent than a false '100% finished' claim. It is a credible engineering-start *report*, but its test evidence has not been independently inspected, and the deliverable still lacks the main dashboard/trading product. Continue non-financial implementation with stronger checkpoints and end-to-end browser proof.
