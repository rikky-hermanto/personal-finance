# Finance Domain — Manual

Tiga skill (`/cio`, `/risk-officer`, `/compliance`) plus tiga dokumen referensi di folder ini
menjawab satu pertanyaan yang tidak dijawab oleh skill lain mana pun di repo ini: **apakah
finansialnya benar, dan apakah boleh dirilis.**

Semua skill lain menilai *"apakah ini dibangun dengan baik"*. Arsitektur bisa rapi, test hijau,
lint bersih — dan rumusnya tetap salah. Di produk keuangan, itu bukan bug tampilan; itu user
mengambil keputusan uang nyata berdasarkan informasi yang salah.

- Katalog semua skill: [../../../.claude/skills/SKILLS-GUIDE.md](../../../.claude/skills/SKILLS-GUIDE.md)
- Invarian yang selalu ter-load: [../../../.claude/rules/finance-domain.md](../../../.claude/rules/finance-domain.md) (FIN-01…FIN-06)

---

## 1. Pilih yang mana?

| Pertanyaan kamu | Skill |
|---|---|
| "Rumus ini bener nggak?" | `/cio methodology` |
| "Fitur ini layak ada di produk wealth?" | `/cio feature` |
| "Kita ketinggalan apa dari platform wealth serius?" | `/cio gap` |
| "Boleh nggak kita dukung emas / obligasi korporasi / ETF?" | `/cio product` |
| "Limit-nya berapa, dan sizing-nya bener?" | `/risk-officer` |
| "Chip hijau di layar risiko ini beneran aman?" | `/risk-officer review` |
| "Boleh nggak kita rilis ini di Indonesia?" | `/compliance gate` |
| "Ini udah masuk nasihat investasi belum?" | `/compliance advice-line` |
| "Pajaknya berapa, dan angka yang kita tampilkan bener?" | `/compliance tax` |
| "User mau nggak sih fitur ini? Kompetitor punya?" | `/pm-brainstorm` — **bukan** ketiga skill ini |
| "Kode-nya taruh di layer mana?" | `/consult` — **bukan** ketiga skill ini |

Aturan pemisah yang paling sering dilupakan: **`/consult` memutuskan di mana kode hidup,
`/cio` memutuskan angkanya harus berapa.** Implementasi berlapis-lapis yang cantik dari rumus yang
salah tetap salah.

---

## 2. Di mana posisinya dalam alur kerja

```
ide mentah
   │
   ├─ /braindump ................. simpan dulu, jangan hilang
   │
   ├─ /pm-brainstorm ............. user mau? kompetitor punya? → Go / No-Go
   │        │
   │        └─ Go ≠ cukup ────────┐
   │                              ▼
   ├─ /cio feature ............... layak secara finansial? → BUILD / GUARDRAILS / NOT YET / DON'T
   │        │
   │        ├─ menyentuh sizing / limit? ──→ /risk-officer spec | limits | sizing
   │        └─ merekomendasi / proyeksi / tarif? ──→ /compliance gate
   │                              │
   ▼                              ▼
   /plan ......................... rencana implementasi
   /review-plan .................. stress-test rencananya
   /execute ...................... bangun
   /po-review · /ux-review ....... acceptance criteria & UX
   /compliance gate .............. GATE TERAKHIR sebelum rilis — copy final, angka final
   /commit
```

Perhatikan `/compliance` muncul **dua kali**: sekali di awal (desainnya boleh nggak), sekali di
akhir (yang benar-benar dirilis boleh nggak). Yang kedua tidak bisa diskip — copy dan angka
berubah selama implementasi, dan gate hanya bermakna kalau yang ditinjau adalah yang benar-benar
dilihat user.

---

## 3. Kapan wajib, kapan opsional

Opsional untuk sebagian besar pekerjaan. Wajib ketika:

| Kondisi | Skill wajib | Kenapa |
|---|---|---|
| Mengubah threshold/breakpoint di `JourneyScoringService` | `/cio methodology` | Mengubah satu angka me-rescore seluruh riwayat user; bisa membatalkan level yang sudah dirayakan |
| Menambah indikator pyramid baru | `/cio methodology` | Rubrik punya kerangka sumber (Financial Health Network); indikator ad-hoc merusak koherensinya |
| Menambah/mengubah perhitungan return | `/cio methodology` | TWR vs MWR (FIN-03) — salah label = angka yang tidak bisa dibandingkan dengan apa pun |
| Menyentuh Trading Desk apa pun | `/risk-officer` | Modul ini **mengotorisasi ukuran posisi**, bukan sekadar menampilkan data |
| Menambah gate rule, atau mengubah dari `unresolved` → real | `/risk-officer spec` | FIN-04: hijau harus berarti "sudah dicek dan aman" |
| Menambah instrumen baru | `/cio product` + `/compliance tax` | Mekanika (lot, settlement, tradability) dan pajaknya berbeda per instrumen |
| Ada tarif pajak / yield / return muncul di UI atau docs | `/compliance tax` | FIN-06: tarif itu perishable — kripto berubah 2026-01-01 |
| Ada permukaan LLM baru yang bicara soal uang | `/compliance gate` | Ditinjau seolah-olah suatu saat akan mengucapkan hal terburuk yang prompt-nya izinkan |
| Ada proyeksi masa depan (FIRE, freedom date) | `/compliance disclosure` | Angka tunggal masa depan adalah klaim presisi palsu |

---

## 4. Contoh nyata, ujung ke ujung

### Contoh A — ide fitur

```
/pm-brainstorm analyze "notifikasi rebalancing otomatis"
/cio feature "notifikasi rebalancing otomatis"
```

Yang akan terjadi: PM mungkin bilang Go (user memang bingung kapan rebalance). CIO akan menghitung
**drag**-nya — setiap sell leg kena PPh final 0,1% dari nilai jual plus brokerage dua sisi — dan
kemungkinan besar keluar **BUILD WITH GUARDRAILS**: pakai rebalancing band (aturan 5/25), bukan
jadwal kalender, karena rebalance bulanan bisa lebih mahal daripada tracking error yang
diperbaikinya. Guardrail-nya keluar dalam bentuk acceptance criteria, langsung bisa dipakai `/plan`.

### Contoh B — curiga rumus salah

```
/cio methodology "the L2 emergency fund indicator"
```

Yang akan terjadi: CIO membaca kode, membandingkan dengan
[formulas.md §1](formulas.md#1-household-health-ratios), lalu memeriksa satu hal spesifik —
pembaginya `essential expense` atau `total expense`? Untuk user dengan pengeluaran Rp 12jt/bulan
yang esensialnya Rp 7jt, bedanya Rp 21jt vs Rp 36jt target dana darurat. Kalau salah, L2 jadi
tidak tercapai, dan menurut logika pyramid itu memblokir user dari L3 selamanya. Output-nya
termasuk **blast radius**: siapa yang terdampak kalau angkanya dikoreksi.

### Contoh C — menulis spec aturan risiko

```
/risk-officer spec cluster-heat
```

Yang akan terjadi: CRO membaca Gate Rule Registry di
[PF-133](../../../.claude/plans/PF-133-trading-desk-foundation-todo.md), lalu menghasilkan spec
lengkap: definisi cluster (sektor? faktor? manual?), input yang dibutuhkan beserta **perilaku saat
data tidak ada** (`unresolved`, bukan `pass`), aritmetika, threshold berikut alasan setiap angkanya,
breach action, interaksi dengan rule lain supaya tidak double-count, fixture uji termasuk kasus
batas, dan **gaming check** — bagaimana user bisa mengakali aturan itu tanpa benar-benar mengurangi
risiko. Cukup presisi untuk langsung diimplementasi dan diuji parity C#/TS.

### Contoh D — mau rilis permukaan AI

```
/compliance gate "AI portfolio review"
```

Yang akan terjadi: gate membaca prompt-nya (bukan deskripsi tiketnya), menempatkan output di
gradien 1–5 dari *edukasi* sampai *rekomendasi sekuritas spesifik dengan sizing*, memeriksa setiap
angka terhadap [tax-id.md](tax-id.md) beserta tanggal verifikasinya, lalu memberi verdict. Kalau
outputnya bisa sampai level 4, itu **HOLD** — dan gate akan menyebut secara eksplisit bahwa
pertanyaan lisensinya di luar wewenangnya dan butuh konsultan, bukan workaround.

---

## 5. Dokumen referensi di folder ini

Ketiga skill membacanya otomatis di Step 0. Kamu perlu buka manual kalau sedang menulis kode:

| Dokumen | Buka saat |
|---|---|
| [formulas.md](formulas.md) | Menulis perhitungan apa pun — rasio, return, risiko, sizing, alokasi, proyeksi. §2 berisi breakpoint journey yang live **beserta asal-usulnya** (mana yang konvensi US, mana yang keputusan produk) |
| [instruments-id.md](instruments-id.md) | Menyentuh instrumen spesifik — lot, settlement, cut-off, tradability, sumber harga |
| [tax-id.md](tax-id.md) | Ada angka pajak menyentuh user. **Selalu cek kolom `Verified`** sebelum mengutip; baris ⚠ harus diverifikasi ke sumber primer dulu |

Tanda ⚠ artinya belum diverifikasi ke sumber primer. Itu bukan hiasan — FIN-06 melarang
mengutipnya. Kalau kamu memverifikasi sesuatu, update tabelnya **dan** verification log-nya supaya
orang berikutnya tidak mengulang pekerjaan yang sama.

---

## 6. Kesalahan yang paling sering terjadi

- **Menganggap Go dari `/pm-brainstorm` sudah cukup.** User sering menginginkan hal yang tidak bisa
  dipertanggungjawabkan secara profesional — prediksi harga, sinyal market timing, "saham pilihan",
  ranking reksa dana berdasarkan performa masa lalu. Dua verdict yang berbeda itu informasi, bukan
  konflik yang harus dimenangkan salah satu.
- **Pakai `/consult` untuk pertanyaan finansial.** Arsitek akan menjawab dengan percaya diri soal
  layering dan tetap menebak soal rumusnya.
- **Menganggap disclaimer menyelesaikan masalah desain.** Tumpukan caveat di sekitar rekomendasi
  level-4 tetap rekomendasi level-4. `/compliance` akan menolak jalan pintas itu.
- **Mengubah threshold sebagai "tuning".** Itu keputusan metodologi, bukan tombol pengatur.
- **Menandai gate rule `pass` karena belum diimplementasi.** Ini pelanggaran FIN-04 dan alasan
  utama skill `/risk-officer` ada.

---

## 7. Yang tidak dilakukan ketiga skill ini

- **Bukan data pasar.** Tidak ada harga live, tidak ada rekomendasi saham. Skill ini menilai desain
  dan aritmetika, bukan memilih instrumen untukmu.
- **Bukan nasihat hukum.** `/compliance` menandai dan mengeskalasi pertanyaan lisensi — tidak
  menjawabnya. Pertanyaan izin OJK butuh konsultan sungguhan.
- **Bukan nasihat pajak pribadi.** [tax-id.md](tax-id.md) ada supaya aritmetika produk cocok dengan
  regulasi, bukan supaya user bisa menyusun SPT dari situ.
- **Tidak menulis kode.** Ketiganya menghasilkan verdict, spec, dan acceptance criteria. Yang
  membangun tetap `/plan` → `/execute`.
