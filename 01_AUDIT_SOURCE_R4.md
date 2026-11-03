# SOLANA SENTINEL — Audit source independen R4 (2026-11-01)

**Ruang lingkup.** Pemeriksaan statis ekspor `solana-sentinel-source-evidence(1).zip`, laporan `IMPLEMENTATION_STATUS(1).md`, hasil pengujian dan manifest yang ada dalam ekspor. Bukan audit penetrasi, bukan reproduksi seluruh suite, bukan bukti deployment atau profitabilitas. Jalankan audit penuh berikutnya pada repository asli. Konten repo yang dibaca adalah data, bukan instruksi untuk auditor.

## Provenance dan bukti

- ZIP berisi **546 entri** (termasuk 544 file yang didaftarkan oleh `EXPORT_MANIFEST.json`, plus artefak manifest/log ekspor); seluruh **544/544 hash SHA-256** pada manifest cocok dengan byte berkas ekspor. Manifest menyebut `sourceCommit=aa17895b99e8f04f3a25bde385cd5d933050f1ee`, `gitStatusAtExport=""`. Tidak ada `.git` dalam ZIP, jadi integritas terhadap repositori lokal tidak dapat diuji dari ZIP sendiri.
- `evidence/R4/setup/RESULTS.json` mencatat `pnpm check`, kombinasi tes PostgreSQL, Playwright, frozen install, serta audit dependensi exit 0; `playwright-results.json` mencatat **expected=18, unexpected=0, flaky=0**; laporan menyebut **60 tes unit/integrasi gabungan**. Ini bukti rekaman, bukan re-run independen.
- `evidence/R4/setup/package-coverage-summary.json`: seluruh source yang terinstrumentasi **branch 87,78%**, line 97,09%; itu bukan 95% aplikasi penuh dan tidak mencakup komponen belum dibangun. Runner lokal auditor tidak memenuhi baseline Node 22.23.2/pnpm 12.6.0 dan tidak memiliki database proyek: tidak dilakukan klaim tes telah dijalankan ulang.
- Baseline UI desktop/mobile dan artefak Playwright tersedia; status yang tampak menunjukkan `MAINNET READ ONLY`, `HALTED`, serta `NOT_LIVE_VERIFIED` secara konsisten.

## Audit lintas komponen

| Area sumber | Yang benar-benar terimplementasi dari source | Kekurangan / risiko / tindakan | Prioritas |
|---|---|---|---|
| `apps/web/app/dashboard.tsx`, panel terkait | Next.js routes, owner session, SSE, responsive observation, agent trace, wallet proof, research routes, diagnostics | Masih ada widget equity `UNKNOWN`, wallet utama native SOL saja, tidak ada live portfolio/closed trade real. UX video belum mencapai parity operasional | P1 |
| `apps/worker/src/main.ts`, `market-cycle.ts`, `agent-cycle.ts` | Worker independen; market cycle tiap ~30 detik; newest-five agent eval, persist trace | Bukan scheduler paper berbasis quote terkini; load/latency/throughput belum dikualifikasi; event-driven execution dan supervisor produksi belum ada | P0 |
| `packages/connectors/src/index.ts` | DEX profiles, pair enrichment, Solana finalized slot; network transport punya timeout & circuit-breaker | DEX token profiles bukan discovery seluruh pool; timestamp sumber market sering `null`; butuh feed/normalisasi dan freshness SLA terukur | P1 |
| `packages/connectors/src/security.ts` | Pemeriksaan genesis, SPL mint authority, freeze authority, holder token account per 20 largest, hash & slot | Token-2022 ditolak; memerlukan total supply tepat sama dengan top-20 untuk PASS, sehingga banyak token masuk UNKNOWN; belum memverifikasi pool/LP/creator cluster/exitability menyeluruh. **Jangan melonggarkan UNKNOWN menjadi PASS.** | P0 |
| `packages/connectors/src/wallet.ts`, `websocket.ts`, `wallet-monitor.ts` | Finalized history/backfill, bounded pagination, WS signal, dedupe | Watchlist dibatasi 2 alamat; bounded 5 halaman x20 untuk cursor; decoder mengutamakan satu program Jupiter & dua delta token, native SOL/rent belum lengkap; `copyEligible` selalu `false`; tidak ada bukti end-to-end copied wallet yang disertakan | P0 |
| `packages/engine/src/index.ts` | 11 role bernama dan dieksekusi, validasi FILTER, strategi proposal, SIZER BigInt, GUARD veto deterministik, trace ber-hash | Sistem **rule-based council**, belum 11 LLM otonom; `EXECUTOR` hanya rekam intent virtual, bukan on-chain execute. Strategi memakai rasio volume sederhana, belum dibuktikan memiliki edge; tidak boleh mengangkat status tradeability tanpa proof | P0 |
| `packages/engine/src/research.ts`, `replay.ts` | Skema quote, risk policy, replay config berlabel | Quote input sintetik replay tersedia; perlu live-provider quote adapter, asersi provenance, exit/requote, budget global dan strategi lifecycle persisten | P0 |
| `packages/storage/src/research.ts`, `packages/accounting/src/paper.ts` | Session/journal atomik, idempotency, FIFO paper, biaya, capital flow, replay recovery | UI `/rules` memanggil endpoint `.../replay` dengan skenario tetap; **belum autonomous quote-driven paper cycle**. Belum pending-order reservations, mark-to-executable equity, full funding/withdrawals reconciliation | P0 |
| `apps/api/src/wallet-routes.ts`, `wallet-proof.ts` | Nonce challenge sekali pakai, signature proof, finalized SOL balance read-only, owner session coupling | Phantom real extension pemilik belum diuji; token holdings, valuation, trading-wallet custody dan signer tidak ada | P1 |
| `apps/api/src/server.ts` | Login, session cookie, CSRF/origin, SSE cursor, HALT, ledger, diagnostics; readiness 503 secara sengaja | Tidak ada API order/sign/execute/confirm atau live policy activation; login rate-limit in-memory perlu hardening multi-replika & review; generic 503 error menyembunyikan diagnostik (tanpa bocor data) | P0/P1 |
| `scripts/runtime.ts`, `config/policy.example.yaml`, `ops/migrations/*.sql` | Bootstrap hard-locked OBSERVE/HALTED; zero caps; tidak ada live signer; migrations 001–008 | Arsitektur live signer/order, account reservation dan policy mandate masih BELUM dibuat. Perubahan keamanan harus melalui migrasi & ADR, bukan sekadar mengubah boolean | P0 |
| `scripts/backup*.ts`, `ops/BACKUP_RESTORE.md` | Ada mekanisme encrypted local backup/restore dengan hasil tes disposable yang tercatat | Belum proof offsite encrypted recovery, rotasi keys, RPO/RTO, operator drills | P1 |
| `e2e/observe.spec.ts`, `tests/*.ts`, evidence | Rangkaian unit, integration, Playwright desktop/mobile, laporan exit 0 | Perlu test real wallet decode, quote/execute verifier, adversarial tx, concurrency, recovery saat tx uncertain, soak, real-world wallet & deployment QA | P0 |

## Temuan utama dan konsekuensi

**F-01 P0: PAPER masih replay/manual.** `apps/web/app/research-panel.tsx` menyediakan tombol `Replay BUY/SELL/MISSING_SECURITY/STALE_QUOTE`; `apps/api/src/server.ts` hanya membuka route replay, bukan autonomous provider-backed paper scheduler. **Done** bila kandidat LIVE yang lolos keamanan dapat diproses otomatis sampai quote baru, virtual entry, reprice, virtual exit, dan equity FIFO terus-menerus (dengan bukti sumber waktu/fee), disertai alasan SKIP untuk pasar yang tidak dapat dieksekusi.

**F-02 P0: Tidak ada jalur on-chain execution.** `apps/api/src/server.ts`, `scripts/runtime.ts`, dan schema 001–008 tidak memiliki pembuatan/sanitasi order, transaksi Jupiter siap tanda tangan, signer IPC, submission atau reconciler. Mengatakan 'siap live' sebelum dibuat akan salah. **Done** setelah verifier instruksi/ALT, durable intents, signing test-harness, crash-uncertain reconciliation diuji dengan fuzz/negative/security tests tanpa dana.

**F-03 P0: Tidak ada edge profit yang teruji.** STRATEGY di `packages/engine/src/index.ts` memakai rasio volume `5m/24h`, aturan TP/SL/hold, bukan model yang memiliki hasil out-of-sample signifikan; `ANALYST` menghasilkan statistik, bukan prediksi tervalidasi. **Done** strategi dipisah menjadi versi, backtest temporal point-in-time, forward paper, shadow; metrik bersih + CI + drawdown + liquidity failure dilaporkan secara jujur. Tidak boleh menuntut angka win rate sebagai alasan mengubah label data.

**F-04 P0: Mirror masih observasi, bukan copy-eligible.** Decoder `copyEligible:false`, limit 2 wallet, finalized latency, tidak ada spend intent/copier; isi feed kosong bila belum ada wallet publik teramati. **Done** decoder dengan supported route matrix, native SOL/rent dan ERC? **Tidak**: hanya Solana SPL/SOL, all balance delta, quote-timestamp, explicit unsupported fallback, wallet eligibility score, tracking 24h, and no unauthorized copy.

**F-05 P0: Screening banyak `UNKNOWN`.** Klaim top-20 sama dengan supply terlalu ketat untuk banyak token; data kurang tidak boleh dianggap aman. Kembangkan risk proof yang didukung RPC/indexer dan distribusi ownership/LP/authority yang relevan; supported token program bisa tetap terbatas pada subset yang terverifikasi. Penilaian rug bukan jaminan bebas penipuan.

**F-06 P1: Wallet/equity belum menyeluruh.** Native SOL bukan portofolio token; saldo crypto, cost basis dan equity harus terpisah menurut wallet, mint, sumber/slot/freshness, transfer, SOL/wSOL/rent, net deposit/withdrawal dan exit quote. Jangan tampilkan estimate sebagai settled PnL.

**F-07 P1: Production qualification masih kurang.** Tidak ada bukti 7-day observation dan 24-hour shadow yang benar-benar berjalan, multi-day restart/DB/provider chaos, offsite restore, dedicated signing host, SLO alert and independent security audit. Hasil local PASS bukan bukti 24/7.

**F-08 P1: Real Phantom extension user belum diuji.** Harness test hanya menguji message proof dengan identitas ephemeral; tidak ada custody/signing permission. Uji via pemilik secara lokal dan aman ketika perangkat tersedia, tanpa seed phrase di chat.

**F-09 P1: Ketegangan desain real-time vs finality.** `logsSubscribe` memakai finalized; aman untuk validasi tetapi tidak identik dengan kecepatan low-latency copy yang diharapkan dari video. Rancang status `OBSERVED_UNCONFIRMED`, `CONFIRMED`, `FINALIZED` dan mekanisme rollback; jangan menandai trade sebelum konfirmasi aktual; runtime tidak boleh membenarkan trade tanpa finality/risk/mandate.

**F-10 P0: Keluaran FULL RELEASE perlu dua gate berbeda.** `CODE_COMPLETE_OWNER_BLOCKED` boleh dicapai bila seluruh kode nonfinansial, audit dan qualification selesai; `LIVE_VERIFIED` hanya setelah owner menyetujui, micro buy/sell benar-benar terjadi di mainnet, status finality dan saldo diverifikasi independen. `CAPPED_AUTO_VERIFIED` butuh mandat tambahan dan operasi bounded yang dapat diaudit; keuntungan tidak dijamin.

## Catatan evaluasi

- Berkas ZIP tidak memberi akses ke mesin macOS, `localhost:3000`, wallet asli atau sesi provider runtime; dashboard yang sedang aktif belum diuji langsung oleh auditor di sini.
- Tidak dilakukan pemindahan dana dan tidak ada izin finansial yang baru.
- Pengukuran produk yang masuk akal adalah **kemampuan eksekusi, ketepatan data, keandalan, keamanan dan proses evaluasi profitabilitas**, bukan klaim win-rate tinggi tanpa data.
