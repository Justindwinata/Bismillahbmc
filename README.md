# GitHub source and local storage

Public source repository: https://github.com/Justindwinata/Bismillahbmc. This repository publishes application source, tests, migrations and development requirements; raw historical audit media and local runtime data are excluded. See `ops/GITHUB_SOURCE.md` for the curated publication workflow and `ops/DEVELOPMENT.md` for clean startup. Publication does not change the release gates or enable trading.

# Current implementation — autonomous PAPER/SHADOW research, mainnet read-only

Open `IMPLEMENTATION_STATUS.md` for exact current scope and `ops/DEVELOPMENT.md` for startup. A real Next.js dashboard, authenticated API/SSE, independent market/PAPER workers, durable leases/FIFO virtual ledger, source-backed quotes and eleven-stage decision trace now exist. Open /paper for autonomous research; /rules remains an explicitly separate regression laboratory. See DELIVERY_SCORECARD.md and ops/AUTONOMOUS_PAPER.md for current acceptance evidence and software gaps. Full trading product remains IN_PROGRESS / NOT_LIVE_VERIFIED. Signer and live trading disabled; do not fund a wallet for this release. Local source/evidence export is available under AUDIT_EXPORT after checkpoint. The specification text below is the original foundation context, not the current feature checklist.

# SOLANA SENTINEL AI — CODEX BUILD FOUNDATION (V2)

**Jenis dokumen:** spesifikasi dan harness rekayasa perangkat lunak; bukan bot yang sudah dibuat. **Baseline:** 1 November 2026. **Pemilik:** pengguna individu yang belajar meme coin Solana dengan modal sekitar 1 SOL. **Bahasa:** UI dan runbook Bahasa Indonesia. **Target:** web dashboard real-time + service trading independen; bot yang terintegrasi on-chain secara nyata dan dapat bekerja tanpa klik per transaksi **setelah pengaktifan eksplisit serta batas risiko ketat**.

## Mulai dari sini

1. Ekstrak ZIP ini. **Buka folder `SOLANA_SENTINEL_CODEX_FOUNDATION_V2` sebagai root workspace Codex**, bukan folder `docs`.
2. Baca `START_CODEX_HERE.md`, salin prompt di dalamnya ke sesi Codex baru pada workspace ini.
3. Codex wajib membaca `AGENTS.md` serta seluruh `docs/` dan mengecek lingkungan/providernya; pertama buat rencana dan mulai M0/M1 yang aman tanpa dana.
4. `apps/`, `packages/`, `scripts/`, `ops/` sengaja masih kosong: **Codex harus mengimplementasikan aplikasi** sesuai spesifikasi. File ini tidak berisi kode aplikasi yang sudah selesai.
5. Simpan hanya kunci publik/alamat contoh dalam dokumen. **Jangan tempel seed phrase, private key, backup wallet, kata sandi, atau API key nyata ke Codex/chat/repo.**

## Baca menurut urutan prioritas

| Urutan | Dokumen | Peran |
|---|---|---|
| 1 | `AGENTS.md` | Aturan tetap Codex, mutu, mode, dan pembatasan dana |
| 2 | `docs/01_MASTER_PRD.md` | Visi, FR, milestone/gates, definisi selesai |
| 3 | `docs/02_SYSTEM_ARCHITECTURE.md` | Sistem dan deployment nyata |
| 4 | `docs/03_AGENTS_AND_DECISION_PROTOCOL.md` | Semua bot dan protokol komunikasi |
| 5 | `docs/04_DATA_CONTRACTS_AND_STATE_MACHINE.md` | Kontrak terstruktur dan transaksi |
| 6 | `docs/05_WALLET_EXECUTION_SECURITY.md` | Wallet, mainnet signer, threat model |
| 7 | `docs/06_PROVIDER_AND_INTEGRATIONS.md` | RPC, DEX, Jupiter, Phantom, model AI |
| 8 | `docs/07_UI_UX_DASHBOARD_SPEC.md` | Layar seperti pola referensi video |
| 9 | `docs/08_STRATEGIES_AND_COPY_TRADE.md` | Sinyal, mirroring, exit, batas strategi |
| 10 | `docs/09_DB_API_REALTIME_SPEC.md` | Database, API, SSE, event delivery |
| 11 | `docs/10_RISK_POLICY_AND_ACCOUNTING.md` | Kebijakan risiko dan PnL yang jujur |
| 12 | `docs/11_TEST_PLAN_ACCEPTANCE.md` | Tes, gates, Playwright, evidence |
| 13 | `docs/12_IMPLEMENTATION_ROADMAP.md` | Paket kerja bertahap tanpa rewrite |
| 14 | `docs/13_DEPLOYMENT_OPERATIONS.md` | Setup, run, backup, VPS, recovery |
| 15 | `docs/14_BEGINNER_GUIDE.md` | Pengantar SOL/Phantom/deposit/withdraw |
| 16 | `docs/15_VIDEO_REFERENCE_AUDIT.md` | Apa yang bisa dan tak bisa disimpulkan dari referensi |
| 17 | `docs/16_EVIDENCE_AND_CHANGELOG.md` | Pencatatan bukti milestone aktual |
| 18 | `docs/17_DECISION_LOG.md` | Keputusan arsitektur dan trade-off |
| 19 | `docs/18_DEPENDENCIES_SOURCES.md` | Sumber resmi dan ketidakpastian API |
| 20 | `docs/19_TRACEABILITY_MATRIX.md` | Pemetaan requirements-ke-tes |

Konfigurasi contoh: `config/policy.example.yaml`, `.env.example`. Template prompt iterasi: `prompts/ITERATION_PROMPTS.md`.

## Yang harus benar-benar ada pada produk akhir

- Web dashboard mandiri (localhost saat dikembangkan; HTTPS bila deployment), dark terminal style, update status pasar/bot/posisi/wallet dari backend nyata, bukan angka dekoratif.
- Worker selalu hidup di OS/server terpisah dari browser serta Codex; monitoring real-time lewat RPC/DEX data yang ditandai timestamp/latency.
- Multi-agent: DESK/Orchestrator, Scout, Filter, Rug Check, Analyst, Strategy/Sniper, Sizer, Guard, Executor, Logger, Equity; output bersama dapat diaudit, veto Guard tidak dapat diabaikan.
- Smart-wallet watchlist dan copy-intent yang hanya boleh diperdagangkan jika lolos validasi/risiko, bukan blind mirroring.
- Phantom untuk **connect/read-only, funding dan withdraw manual**. Hot trading wallet khusus dengan batas modal; signing dilakukan komponen tersendiri yang dikendalikan pengguna; wallet utama tidak menyerahkan private key ke bot.
- Mode OBSERVE → PAPER → SHADOW → MICRO_LIVE → CAPPED_AUTO; tidak ada transaksi dana nyata hingga pemilik aktifkan mode dan gate.
- Bukti token/pool riil; transaksi mainnet BUY dan SELL yang dapat dilacak signature+saldo; ledger/PnL membedakan deposit, fee, slippage dan returns. Jika gate live belum dijalankan, status **BLOCKED/NOT_RUN**, bukan sukses.

## Mitos yang harus dihindari

- Codex bukan mesin trading 24/7; Codex membangun source code. Runtime aplikasi melakukan pekerjaan trading.
- ChatGPT Plus tidak mencakup biaya panggilan model API runtime, RPC provider berbayar, server, maupun biaya transaksi Solana.
- Tampilan profit di video tidak membuktikan profit nyata. Jangan menjanjikan peniruan return, akurasi/latensi, atau kebal rug pull.
- Tidak ada kode yang bisa membuat hot wallet mustahil dibobol: kecilkan dana berisiko, gunakan segregasi wallet dan pengendalian manual.

## Otorisasi kerja Codex

Codex boleh merancang, membuat dan menguji kode P0–P1 secara lokal termasuk menggunakan data publik real-time yang tidak memerlukan dana. **Tidak boleh** mendepositkan, membeli aset, menandatangani transaksi mainnet, membeli layanan/API, atau membuat/mengimpor private key milik pengguna tanpa konfirmasi terpisah di titik tersebut. Batas itu tidak boleh ditafsirkan sebagai tidak mampu membangun sistem eksekusi nyata. Bangun konektornya dahulu, verifikasi dengan mock/devnet, lalu gate transaksi asli ketika pemilik mengaktifkan dan mendanai hot wallet.

## Implementasi awal — 1 November 2026

Source backend M0 dan awal observasi M1 sekarang tersedia; ini belum aplikasi trading lengkap. Baca `IMPLEMENTATION_STATUS.md`, `DECISIONS.md`, `evidence/M0/AUDIT.md`, `evidence/M0/PLAN.md` dan `ops/DEVELOPMENT.md` untuk hasil aktual, batasan, dan perintah startup macOS/Linux/PowerShell. `pnpm install --frozen-lockfile` lalu `pnpm check` memverifikasi fondasi offline. PostgreSQL diperlukan untuk API/worker dan integration test. Dashboard/Playwright belum diimplementasikan. Status rilis **NOT_LIVE_VERIFIED**, signer tidak tersedia, default OBSERVE, seluruh cap nol. Manifest SHA256SUMS.txt tetap mencatat paket spesifikasi asli sebelum implementasi.
