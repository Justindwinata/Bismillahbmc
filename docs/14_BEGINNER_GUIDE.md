# Panduan dari nol: SOL, wallet, deposit, withdrawal, dan mengoperasikan bot

**Target:** pemula yang belum pernah membeli atau memindahkan Solana. **Panduan ini bukan ajakan membeli token.** 1 SOL bisa hilang seluruhnya jika dipakai berspekulasi. Perubahan UI dan aturan layanan platform harus diperiksa lagi saat digunakan.

## 1. Istilah dasar (baca sebelum mengirim uang)

| Istilah | Arti praktis |
|---|---|
| `SOL` | Aset asli jaringan Solana; dipakai untuk membayar biaya transaksi (gas). |
| `Meme coin` | Token kripto dengan nilai sangat spekulatif, sering tanpa arus kas/manfaat dasar yang dapat diverifikasi. |
| `CEX / Exchange` | Platform untuk deposit IDR, jual-beli aset, dan tarik ke rekening bank; gunakan yang masih memenuhi aturan OJK. |
| `Self-custody wallet` | Aplikasi tempat **Anda** mengendalikan kunci privat; berbeda dari saldo di akun exchange. |
| `Seed phrase / private key` | Kunci rahasia kepemilikan aset; siapa pun yang mengetahuinya bisa menguras wallet. **Jangan pernah berikan kepada ChatGPT, Codex, bot atau pihak mana pun.** |
| `Public address` | Alamat wallet yang boleh dibagikan untuk menerima dana dan mengamati transaksi. |
| `On-ramp` | Mengubah rupiah/uang fiat menjadi kripto. |
| `Off-ramp` | Menjual kripto menjadi rupiah melalui provider yang mendukung dan menarik ke rekening bank. |
| `Swap` | Menukar SOL untuk token atau sebaliknya di DEX. |
| `DEX / Jupiter` | Infrastruktur pertukaran token di blockchain; Jupiter dapat menyusun dan merutekan swap, tidak menjamin profit. |
| `Mint address` | Identitas unik suatu token di Solana. Nama/ticker yang sama bisa digunakan token palsu. |
| `Liquidity` | Cadangan yang memungkinkan pembelian/penjualan; ketersediaan untuk membeli tidak menjamin dapat menjual. |
| `Slippage` | Selisih harga yang dapat terjadi antara perkiraan dan transaksi aktual. |
| `Price impact` | Dampak ukuran trade terhadap harga pool, terutama pada token illiquid. |
| `Rug pull` | Penarikan likuiditas atau skema merugikan yang membuat token turun tajam/tidak bisa dijual. |
| `Priority fee` | Tambahan biaya transaksi untuk meningkatkan prioritas pemrosesan di Solana. |
| `PAPER/SHADOW` | Simulasi keputusan; bukan transaksi dan bukan uang sungguhan. |
| `MICRO_LIVE` | Trade nyata nominal kecil, dengan persetujuan aktivasi dan pembatasan. |

## 2. Pilih jalur aman untuk memulai

1. Pelajari dulu cara wallet bekerja dan pantau transaksi publik di penjelajah Solana. Jangan hubungkan wallet ke situs acak yang dikirim di DM.
2. Cari daftar platform Indonesia **terbaru** yang diotorisasi/terdaftar pada **situs OJK resmi**; perizinan dan produk SOL yang tersedia dapat berubah. Jangan gunakan daftar screenshot lama sebagai bukti.
3. Buat akun melalui aplikasi/situs resmi penyedia pilihan. KYC mungkin diwajibkan. Aktifkan autentikasi kuat, akun email yang aman, serta penarikan yang memerlukan verifikasi.
4. Cek harga SOL, spread, minimum deposit/withdrawal, waktu pemrosesan, serta biaya yang ditagihkan oleh exchange. Hindari transfer dari rekening orang lain.
5. Siapkan sebuah wallet Solana yang diperoleh dari sumber resmi dan satu **wallet berbeda untuk trading bot**. Simpan seed phrase secara offline, jangan difoto dan jangan dimasukkan ke cloud chat.
6. Pelajari bahwa alamat tujuan dan jaringan harus sama: **Solana (SOL mainnet)**. Jangan memindahkan aset melalui chain yang salah atau langsung mengirim meme coin ke exchange yang tidak mendukung token tersebut.

## 3. Deposit IDR -> SOL -> trading wallet (manual, contoh alur)

1. Pada akun exchange, pilih menu deposit rupiah dan ikuti rekening/VA resmi yang tertera di aplikasi Anda (instruksi provider berbeda-beda).
2. Setelah saldo IDR masuk, beli SOL sesuai modal yang benar-benar sanggup Anda kehilangan. Catat biaya, waktu dan kurs.
3. Di wallet self-custody buat atau salin **public address** yang akan menerima SOL. Cocokkan beberapa karakter pertama dan terakhir **di dua tempat independen**.
4. Di exchange pilih Withdraw SOL, lalu pilih **Solana network** yang didukung; masukkan alamat wallet, tinjau total biaya dan nominal akhir.
5. Lakukan **test transfer nominal kecil** terlebih dahulu, lalu verifikasi transaksi sukses dan saldo di wallet maupun Solana explorer. Pengiriman kripto yang salah umumnya tidak dapat dibatalkan.
6. Setelah siap, pindahkan **hanya saldo terbatas yang diperuntukkan bagi bot** ke dedicated hot wallet. Jangan letakkan seluruh tabungan atau seed phrase wallet utama di server bot.
7. Simpan sebagian SOL sebagai cadangan gas dan akun token. Prioritas fee, platform fee, rent deposit, spread dan exchange fees merupakan komponen biaya yang berbeda.
8. Bot harus tetap `OBSERVE` / `PAPER` sampai pemeriksaan teknis lulus. Memiliki dana di wallet **bukan berarti** bot telah diizinkan mengeksekusi swap.

## 4. Bagaimana aplikasi mulai bekerja tanpa klik per trade

**Urutan yang benar:** instal -> jalankan worker/dashboard -> verifikasi koneksi RPC -> real-time observation -> paper -> shadow -> audit signer -> aktifkan micro-live satu kali dan batasnya -> verifikasi BUY/SELL chain -> (jika disetujui) capped auto.

Dalam `CAPPED_AUTO`, bot dapat memantau dan mengeksekusi trade di bawah batas yang sudah diotorisasi tanpa menunggu klik untuk setiap posisi. Bot juga bisa memilih **SKIP** sepanjang hari jika tidak ada sinyal yang aman. Hal ini adalah perilaku benar, bukan bug. Jika kondisi berbahaya terjadi, bot harus otomatis menolak order baru/berhenti; bukan memaksakan target profit.

**Apa yang tetap menjadi tanggung jawab manusia:** membuat akun dan KYC, memilih penyedia resmi, menyimpan recovery phrase, memilih batas risiko, mengaktifkan live pertama kali, mengamati notifikasi penting, menekan STOP bila perlu, mengganti host/key yang kompromi, dan menarik uang. Keinginan “hanya deposit lalu tidak pernah ikut campur” tidak dapat dijadikan jaminan keselamatan aset.

## 5. Exit dan withdrawal (kembali menjadi rupiah)

1. Buka dashboard dan gunakan Pause/HALT untuk mencegah entry baru.
2. Periksa posisi yang masih terbuka. Tidak semua meme coin dapat dijual; lihat `tradeability`, quote, dan fee. Jika bisa, jual token menjadi SOL melalui wallet/DEX resmi, lalu verifikasi on-chain.
3. Pada aplikasi exchange Indonesia resmi, buka menu **Deposit SOL** dan dapatkan **alamat serta jaringan Solana yang valid**, periksa apakah deposit SOL didukung saat itu dan minimum depositnya.
4. Dari wallet pribadi kirim test SOL kecil ke alamat deposit exchange itu (bila jumlah minimum memadai). Tunggu konfirmasi dan kredit akun sesuai ketentuan platform.
5. Kirim sisa dana yang ingin ditarik setelah memastikan test berhasil. JANGAN lakukan auto-send dari bot ke alamat yang dibentuk model AI.
6. Jual SOL untuk IDR di exchange, lalu gunakan fitur withdrawal IDR ke rekening bank pribadi yang terverifikasi. Perhatikan biaya dan kewajiban pajak/pelaporan yang berlaku.

## 6. Contoh format risiko (harus dikonfigurasi pemilik, bukan preset profit)

```yaml
mode: PAPER                        # default; NEVER enable live on install
risk:
  max_trade_size_sol: null         # MANDATORY owner-approved limit before live
  max_open_positions: null
  max_total_open_exposure_sol: null
  max_daily_loss_sol: null
  max_daily_fees_sol: null
  reserve_sol_for_fees: null
  max_slippage_bps: null
  max_price_impact_bps: null
  stop_after_consecutive_errors: null
security:
  signer_enabled: false
  outbound_wallet_transfers_enabled: false
  enforce_program_allowlist: true
```

**Null = configuration incomplete => block live mode.** Jangan mengisi angka batas dengan menyalin screenshot influencer; ukuran posisi dan fee harus dievaluasi terhadap saldo aktual serta kondisi pasar.

## 7. Sinyal bahwa Anda harus STOP

- Bot meminta recovery phrase/private key di chat, web, atau Discord.
- Performa “profit” tidak disertai signature, fee ledger, deposit reconciliation dan saldo yang dapat diverifikasi.
- Ada pesan `uncertain transaction`, `wallet balance mismatch`, provider outage, data stale, atau double execution.
- Slippage / price impact / gas melebihi batas, holder concentration atau token authority tidak dapat diperiksa.
- Wallet terhubung ke layanan yang meminta unlimited approvals atau transaksi tidak dikenali.
- Bot memakai saldo penuh untuk setiap trade, menaikkan batas risiko otomatis, atau menolak STOP.
- Token tidak memiliki jalur jual dan UI tetap menandainya “profit”.

## 8. Biaya dan realitas operasional

| Pengeluaran | Kapan timbul | Catatan |
|---|---|---|
| SOL yang dibeli | di exchange | berisiko kehilangan nilai dan modal 100% |
| Exchange buy/sell/withdraw fees | on-ramp/off-ramp | lihat info real-time di platform terkait |
| Solana base + priority fee | broadcast transaksi | bisa terpotong bahkan jika tx gagal; 5.000 lamports per signature sebagai referensi base fee, tambahan dapat berubah |
| Token account rent | pembuatan token account | deposit akun dapat dikembalikan saat memenuhi syarat close; bukan biaya gas yang sama |
| Jupiter swap/platform costs | sesuai routing/order | quote & fee field harus diperiksa saat order |
| RPC/analytics | jika tier gratis terbatas atau paid | dapat menimbulkan biaya langganan/panggilan |
| AI model API | jika diaktifkan di runtime | langganan ChatGPT Plus tidak secara otomatis membayar penggunaan OpenAI API |
| Server hosting/internet | untuk operasi unattended 24/7 | PC tidur = worker bisa berhenti |
| Pajak/kepatuhan | sesuai peraturan yang berlaku | cek aturan & transaksi pribadi |

## 9. Referensi resmi untuk pemeriksaan ulang

- OJK legalitas dan whitelist: https://ojk.go.id/id/berita-dan-kegiatan/siaran-pers/Pages/OJK-Terbitkan-Whitelist-Penyelenggara-Perdagangan-Aset-Keuangan-Digital-Dan-Aset-Kripto-Berizin.aspx
- OJK aturan kripto: https://ojk.go.id/id/regulasi/Pages/POJK-27-2024-AKD-AK.aspx
- Solana fees: https://solana.com/docs/core/fees
- Solana tokens: https://solana.com/docs/tokens
- Jupiter v2 docs: https://developers.jup.ag/docs/swap
- OpenAI separate billing: https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform
