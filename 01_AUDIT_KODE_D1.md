# SOLANA SENTINEL — AUDIT INDEPENDEN D1 / CHECKPOINT 10f5dd0
**Tanggal:** 2026-11-01 (Asia/Jakarta)  
**Objek:** `solana-sentinel-source-evidence(2).zip`, `DELIVERY_CHECKPOINT.json`, `RESULTS.json`, `DELIVERY_SCORECARD.md`  
**Jenis audit:** review source code dan arsip evidence; bukan audit keamanan independen atas mesin produksi dan bukan pengujian transaksi dana asli.

## 0. Putusan eksekutif
**GO untuk pengembangan; NO-GO untuk live mainnet, auto-copy, dan klaim profitable trading.** Jangan rewrite repository. D1 berhasil menghadirkan worker yang mengelola PAPER/SHADOW dan bertahan melalui restart pada skenario `REPLAY_TEST`. Bukti live-provider saat ini adalah **discovery → security → quote → SKIP**; belum ada PAPER BUY/SELL dengan kandidat pasar nyata yang lolos persyaratan. Jangan menyebut ini 'real successful trades'.

### Bukti yang diperiksa
- ZIP mengandung 936 entri termasuk `EXPORT_MANIFEST.json` dan `EXPORT_GIT_LOG.txt`; **934/934** file terdaftar cocok dengan hash SHA-256. Checkpoint `10f5dd0c3cf180462b3da51b4b398184cb1664da` dan working tree bersih **dilaporkan di manifest**, belum dikonfirmasi dari `.git` (tidak ikut ekspor).
- Evidence final `evidence/D1/risk-all-in/RESULTS.json` mencatat **79 tes gabungan** (59 non-DB + 20 DB) dan **22 browser**. `playwright-results.json` memuat `expected=22, unexpected=0, flaky=0, skipped=0`. Log `browser.txt` juga mencantumkan `22 passed`.
- Paket laporan `RESULTS.json` di root unggahan mencatat 71/20 pada checkpoint sebelumnya; **jangan gunakan itu sebagai hitungan final**. `evidence/D1/risk-all-in` adalah rujukan evidence final. Bukti menjalankan tes berasal dari log Codex yang diekspor, bukan rerun independen di sandbox auditor.
- Coverage final dari log: seluruh source **branch 88,59% (963/1087), lines 97,34% (808/830)**; domain 97,56%, engine 95,72%, ledger 97,22%, performance 96,46%. Area kritis di bawah: `paper-cycle.ts` branch 80,39%, `wallet.ts` 80,68%, `websocket.ts` 64,51%, `security.ts` 86,36%, `research.ts` 88,04%, `jupiter-paper.ts` 91,42%.
- `ops/AUTONOMOUS_PAPER.md` secara eksplisit menyebut quote-only, tak ada penandatanganan/submit dana, biaya model konservatif, dan jalur sukses provider nyata belum lulus. Ini konsisten dengan source.
- Rerun unit/integration dan produksi browser **tidak dijalankan ulang di auditor** karena baseline membutuhkan Node >=22.23.2 dan pnpm@12.6.0, sementara runtime ini Node v22.16.0 tanpa pnpm, dan tidak ada PostgreSQL data proyek. Tidak ada klaim rerun mandiri.

## 1. Matrix fitur — AS-IS versus target video
| Kemampuan target | Status saat audit | Bukti utama | Syarat kelulusan |
|---|---|---|---|
| Dashboard Next.js + authenticated streaming | Berfungsi menurut tes browser; review source | `apps/web/`, `apps/api/src/server.ts`, Playwright | Uji operasional 24/7 dan deployment HTTPS |
| Discovery token provider | Aktual read-only | `apps/worker/src/main.ts`, `jupiter-market-cycle.ts` | Sumber data, latency, pool identity & dedupe tervalidasi |
| 11 agen dan trace | Ada, **deterministik/rule-based** | `packages/engine/src/index.ts` | Semua keputusan yang layak bisa dihasilkan secara sah dan diaudit |
| Security mint + holder | Parsial, konservatif | `packages/connectors/src/security.ts` | Pool, LP, holder, Token-2022 evidence matrix |
| Autonomous PAPER BUY/SELL | **REPLAY_TEST saja untuk jalur positif** | `paper-cycle.ts`, `research.ts`, e2e | Provider-real full BUY→SELL atau no-trade gate dikualifikasi terpisah |
| Provider quote BUY | Terbukti read-only dalam evidence | `jupiter-paper.ts` dan `chain-cost-provider-proof.json` | Sell route, fee modeling, quote TTL, impact & slippage tervalidasi |
| Persistent journal/equity | Ada virtual FIFO dan marks | `packages/storage/src/research.ts` | Capital flows, partial exits, rent/refund, restart & reconciliation |
| Smart wallet mirroring | **Tidak eligible** | `packages/connectors/src/wallet.ts` | Native SOL/CPI accounting, wallet ownership proof, real public swap signal |
| Phantom login / native SOL | Parsial, synthetic owner browser tests | `apps/api/src/wallet-routes.ts` | Uji extension asli dengan pemilik; token holdings dan history |
| Mainnet execution | **Tidak ada** | `apps/api/src/server.ts`, policy bootstrap | Independent verifier, signer, state machine dan owner mandate |
| Deployment autosupervised 24/7 | Belum qualified | `ops/`, release status | SLO, production RPC, TLS, monitoring, restore & real soak |
| Win rate / edge tinggi | **Tidak terbukti** | `packages/accounting/src/performance.ts` | Forward & out-of-sample trade sample, CI, expectancy, P&L, exitability |

## 2. Temuan prioritas — code-level

### F-D1-01 — P0: positive live-provider PAPER path terkunci oleh ketidaklengkapan bukti pool (BLOCKING)
- **Kode:** `apps/worker/src/paper-live.ts:16` mengubah `security.assessment === 'PASS'` menjadi `UNKNOWN` dengan alasan `POOL_SECURITY_NOT_QUALIFIED`; `packages/engine/src/index.ts:43,83–84` mewajibkan `PASS` untuk BUY.
- **Fakta:** jalur real-provider tidak bisa mengeksekusi PAPER entry menggunakan jalur ini, sekalipun mint lolos screening. Evidence provider menunjukkan quote dan `SKIP`, bukan profitable action.
- **Perbaikan:** bangun verifikasi on-chain pool/LP/program/authority yang independen dan mendukung venue terpilih. Ubah gate UNKNOWN → PASS **hanya untuk fakta yang benar-benar terverifikasi**; tetap UNKNOWN/VETO untuk pool tak dikenal. Negative cases wajib.
- **Acceptance:** paling tidak satu kandidat pasar nyata yang memenuhi screening benar-benar menghasilkan **keputusan PAPER positif** dan satu virtual fill (bukan REPLAY), atau laporkan hasil no-trade setelah cakupan observasi yang ditentukan; jangan paksa PASS untuk memenuhi target tes.

### F-D1-02 — P0: logika protective EXIT menggunakan gate BUY yang sama (DESIGN HAZARD)
- **Kode:** `packages/engine/src/index.ts:43–58,79–84`, `packages/storage/src/research.ts:57–64`.
- **Risiko:** setelah token dibeli lalu security/liquidity berubah menjadi UNKNOWN/VETO, `STRATEGY` menolak SELL dan `GUARD` mensyaratkan FILTER/RUG_CHECK PASS; bot dapat terkunci dengan aset berisiko, walaupun mungkin masih ada rute exit.
- **Perbaikan:** buat aturan **ENTRY vs RISK-REDUCING EXIT** terpisah: exit tetap butuh kepemilikan sah, swap semantics/transfer safety, quote dan gas, bukan mengandalkan kelayakan token untuk entry baru. Jangan mengklaim STOP menjamin liquidation; tidak ada bypass signer/policy.
- **Acceptance:** test `new-buy veto` + `sell existing only when verifiably executable`; unsupported transfer/zero liquidity => explicit `EXIT_UNAVAILABLE`, tidak membuat fill fiktif; mekanisme recovery/alert jika exit mustahil.

### F-D1-03 — P0: smart-wallet copy belum dapat memberi sinyal eligible
- **Kode:** `packages/connectors/src/wallet.ts:7–8,34` bertipe dan bernilai `copyEligible:false` untuk semua receipt; `apps/worker/src/wallet-monitor.ts` hanya backfill finalized ketika dirty/30s dan menerima batas provider.
- **Perbaikan:** decoder venue-aware untuk WSOL/native SOL, account creation/close/rent, CPI, token account owner dan exact source; reconcile signature/slot, *dedupe*, backfill gap, observability latency; eligibility harus memerlukan independen security + fresh price/quote. Copy *signal* bukan instruksi otomatis.
- **Acceptance:** 1 signature publik Solana yang dapat diverifikasi, delta dan sumber on-chain akurat, proof di dashboard, eligible/rejected reason; 429/disconnect/gap test.

### F-D1-04 — P0: verifier/signer dan durable chain transaction engine belum ada
- **Kode:** `packages/connectors/src/jupiter-paper.ts` `transaction:null`, tak ada signed path, `packages/domain/src/index.ts` `SIGNER_ENABLED='false'` dan zero caps; `apps/api/src/server.ts` readiness 503.
- **Perbaikan:** bangun *isolated verifier* parsing seluruh instruksi + Address Lookup Tables dan account owners, allowlisted programs, fee payer, exact in/out, min output, compute budget, restrictions Token-2022; signer terisolasi, durable DB intents/attempts/UNCERTAIN, independent finality+balance reconciliation, no duplicate restart, spending mandate.
- **Gate:** test harness/devnet dapat berjalan tanpa dana pemilik; mainnet tetap DISABLED sampai persetujuan eksplisit setelah audit.

### F-D1-05 — P0: capital reservation belum dihubungkan penuh ke risk input
- **Kode:** `packages/storage/src/paper-scheduler.ts:27` menulis `reservation_lamports`, namun `packages/storage/src/research.ts:68` mengisi `reservedLamports:'0'` dalam evaluasi. Per sesi hanya satu lease aktif, jadi risiko concurrency saat ini sebagian dikurangi oleh serialized advisory lock, **bukan** bukti semua reservation path aman.
- **Perbaikan:** definisikan apakah own lease dikecualikan dan other in-flight dibebankan; audit invariant lintas session/wallet serta rounding/refund, stale lease, worker crash. Test concurrent parallel scheduling dan no double-spend.

### F-D1-06 — P1: holder screening terlalu sempit untuk pool nyata
- **Kode:** `packages/connectors/src/security.ts:49` mewajibkan total 20 akun terbesar = `mint.supply`; ini cenderung tidak terjadi pada aset dengan banyak holder, menghasilkan UNKNOWN permanen. `:25–29` semua Token-2022 ditolak secara konservatif.
- **Perbaikan:** sumber/indexer berprovenance untuk distribusi lengkap atau secara eksplisit lower/upper confidence bounds dan unknown-safe threshold; bedakan LP/vault/program owner dari konsentrasi individu. Jangan menginterpretasi snapshot parsial sebagai distribusi lengkap. Token-2022 matrix harus mendefinisikan safe-supported vs reject-by-extension dengan alasan.

### F-D1-07 — P1: paper P&L masih estimasi biaya, bukan real execution economics
- **Kode:** `packages/connectors/src/jupiter-paper.ts` menggunakan getFeeForMessage tanpa instruksi riil, priority upper bound, dan selalu memperlakukan rent satu token account sebagai expense; `ops/AUTONOMOUS_PAPER.md` mengakui keterbatasan.
- **Perbaikan:** bridge actual route transaction fee/ATA rent/priority/transfer tax/fee quote, dan kemungkinan refundable-rent ketika account ditutup; kalibrasi against independently verified confirmed receipts setelah owner-authorized micro-live. Paper quote tidak sama dengan executable fill.

### F-D1-08 — P1: scheduler / backfill / provider coverage kurang
- **Kode:** `apps/worker/src/main.ts` main market cycle 30 detik, paper polling 1 detik; `packages/storage/src/paper-scheduler.ts` max 5 latest mints/siklus dan 20 sessions; `packages/connectors/src/wallet.ts` batas 1 page awal dan 5 pages lanjutan.
- **Perbaikan:** desain real-time subscription/event-driven with bounded adaptive backfill, on-chain slot/receipt lag metrics dan 429 quota; prioritized owned positions, fairness, no silent drop/starvation; freeze unsafe trades during lag.

### F-D1-09 — P1: tidak ada bukti edge/win rate
- **Kode:** `packages/accounting/src/performance.ts` mengembalikan `STRATEGY_NOT_VALIDATED`, FORWARD_PAPER vs REPLAY terpisah. Test split chronology ada, tetapi dataset point-in-time lengkap belum ada.
- **Perbaikan:** independent actual timestamped histories, include lost/delisted/no-fill, fees, sellability, train/validation/test embargo, walk-forward baseline vs no-trade vs simple momentum vs mirror. Display Wilson CI, closed N, expectancy, drawdown, realized net P&L, not only win rate. Do not optimize from replay fixture.

### F-D1-10 — P1: operasional production belum layak
- **Kode:** health/ready 503 in `apps/api/src/server.ts`; own Phantom extension belum dites, public RPC bukan SLA; deployments, reverse proxy, production permissions, secrets, offsite backup, observability dan live soak belum lulus.
- **Perbaikan:** production infrastructure config, dedicated RPC SLA, cost/quotas, alerts, encryption/rotation, restore drills, incident runbooks, fail-closed startup, SLO latency/freshness; jangan klaim kesiapan 24/7 dari screenshot UI.

## 3. Yang sudah benar dan tidak boleh dibuang
- Source class LIVE_PROVIDER vs REPLAY_TEST dipisah; model WATCH/READ_ONLY tidak menyamar sebagai LIVE.
- Policy deterministic veto; bootstrap strict signer disabled; Phantom main wallet terpisah dari hot wallet belum tersedia.
- Quote-only HTTP, no taker/signer/execute di adapter.
- Durable persisted research journal, dedupe/idempotency, lease fencing dan atomic audit/outbox; beberapa recovery tests sudah ada.
- 11-stage trace dengan provenance dan UI yang sudah dapat dibuka; jangan rewrite dari nol.
- Evidence tes gagal awal tidak disembunyikan; tes browser final memperlihatkan 22 passed.

## 4. Prioritas keputusan
**Urutan kritis: (1) pool security + safe ENTRY/EXIT policy → (2) provider-actual PAPER forward trial dengan proper accounting → (3) smart-wallet signal + portfolio → (4) verifier/signer devnet harness & receipts → (5) independent security/soak/deployment → (6) owner-authorized micro-live → (7) separately owner-authorized capped-auto.**

Penting: kualifikasi no-trade dapat menjadi hasil yang benar bila pasar berbahaya. Jangan menurunkan verifikasi karena mengejar transaksi, win-rate, atau status `LIVE_VERIFIED`.
