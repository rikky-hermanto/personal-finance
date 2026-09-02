# Instruksi Integrasi: Macro Scenario Engine ke Aplikasi Personal Finance

> Copy seluruh isi file ini sebagai prompt pertama ke Claude Code di VS Code,
> dengan file referensi `simulator-makro-v3.jsx` sudah ada di root repo.

---

Saya ingin mengadopsi **logika domain** dari file referensi `simulator-makro-v3.jsx` ke dalam aplikasi personal finance ini, sebagai fitur baru bernama **Macro Scenario Lab**.

## Batasan keras

1. **Ambil logikanya saja, buang seluruh lapisan visualnya.** File referensi memakai warna hex hardcoded, inline style, dan palet gelap yang tidak ada hubungannya dengan proyek ini. Semua itu dibuang. Jangan menyalin satu pun nilai hex, `style={{}}` object, atau nama token dari file itu.
2. **UI harus lahir dari design system proyek ini.** Turunkan tema, tipografi, spacing, komponen, dan pola layout dari yang sudah ada di repo. Kalau proyek punya `<Card>`, `<Slider>`, `<StatTile>`, pakai itu. Kalau belum ada, buat mengikuti konvensi komponen yang sudah berjalan, bukan mengikuti file referensi.
3. **Jangan sentuh file referensi.** Perlakukan sebagai spesifikasi read-only. Setelah selesai, pindahkan ke `docs/reference/` atau hapus — jangan biarkan tersisa sebagai komponen aktif.
4. **Jangan pasang dependensi baru** kecuali benar-benar tidak ada padanannya di repo. Kalau proyek sudah punya library chart, pakai itu; jangan tambah `recharts` hanya karena referensinya memakai itu.

## Fase 0 — Discovery, sebelum menulis kode apa pun

Baca repo dan laporkan dulu dalam bentuk ringkas:

- Framework, versi, bahasa, bundler, struktur folder, konvensi routing.
- Design system: di mana token warna/tipografi/spacing didefinisikan, komponen primitif apa saja yang tersedia, apakah ada Storybook.
- Manajemen state dan lapisan data: bagaimana data portofolio, transaksi, dan aset user disimpan dan diambil.
- Model domain yang sudah ada: entitas untuk holding, akun, kategori pengeluaran, tujuan keuangan, utang/cicilan.
- Setup testing dan linting.

Lalu ajukan rencana integrasi dan **tunggu persetujuan saya** sebelum lanjut. Jangan langsung generate.

## Fase 1 — Ekstrak domain logic sebagai modul murni

Buat modul bebas framework — tanpa React, tanpa import UI, tanpa akses DOM, deterministik, mudah diuji.

Lokasi menyesuaikan konvensi repo, misalnya `src/domain/macro/`:

```
types.ts        // MacroDrivers, MacroState, InstrumentView, StakeholderImpact
solver.ts       // solveMacro(drivers): MacroState
instruments.ts  // priceInstruments(state, drivers): InstrumentView[]
stakeholders.ts // scoreStakeholders(state, drivers): StakeholderImpact[]
presets.ts      // skenario historis
constants.ts    // R_NEUTRAL, OKUN, U_NAT, KAPPA, dan bobot lainnya
```

Yang harus dipindahkan persis, dengan koefisien yang sama:

- **Solver iteratif kurs ↔ inflasi.** 4 putaran fixed-point. Urutannya penting: output gap → PDB → kurva Phillips → arus modal → kurs → ulangi. Jangan disederhanakan jadi satu lintasan; itu akan menghilangkan umpan balik depresiasi terhadap inflasi impor.
- **Output gap:** kesenjangan suku bunga riil, impuls fiskal, permintaan eksternal, terms of trade minyak vs komoditas ekspor dengan tanda berlawanan, dan hambatan neraca dari utang valas.
- **Kurva Phillips berbasis ekspektasi**, termasuk pass-through biaya tenaga kerja per unit dan inflasi impor.
- **Hukum Okun teredam informalitas**, plus setengah pengangguran sebagai indikator pendamping.
- **Dekomposisi arus modal** menjadi 8 komponen dengan nilai mentahnya, karena UI perlu menampilkan kontribusi per komponen.
- **Penetapan harga 10 instrumen** dalam imbal hasil riil rupiah, termasuk konversi aset valas `nominalUSD − ΔIDR − π`.
- **Skor sentimen fear/greed** per instrumen berikut flag divergensi.
- **Enam skor pemangku kepentingan** dan klasifikasi rezim.

Semua magic number dipindahkan ke `constants.ts` dengan komentar satu baris yang menjelaskan asal-usulnya, bukan disebar di dalam rumus.

## Fase 2 — Personalisasi, ini bagian yang membedakan dari artefak aslinya

Artefak referensi memakai portofolio generik dan keranjang belanja generik. Di aplikasi personal finance, keduanya harus datang dari data user yang sebenarnya. Ini inti nilai fiturnya.

1. **Portofolio nyata menggantikan bobot default.** Petakan holding user ke sepuluh kelas aset model (saham IDX, SBN/obligasi, deposito rupiah, properti, saham global, obligasi AS, kas dolar, emas, komoditas, kripto). Hitung imbal hasil riil portofolio user, bukan bobot tetap 25/25/15/10/10/10/5. Tampilkan kontribusi per posisi, bukan hanya total.

2. **Inflasi yang dirasakan memakai pola belanja user.** Model menghitung `IHK_bawah` dengan bobot tetap 42% pangan, 22% sewa, 10% BBM, 26% inti. Ganti dengan bobot aktual dari kategori transaksi user selama 12 bulan terakhir. Hasilnya: angka inflasi personal yang berbeda dari inflasi resmi, dan alasan perbedaannya bisa ditelusuri per kategori. Kalau data transaksi belum cukup, jatuh kembali ke bobot default dan beri label jelas bahwa ini estimasi.

3. **Hubungkan ke kewajiban user.** Kalau ada KPR atau cicilan berbunga mengambang, terjemahkan perubahan suku bunga acuan menjadi perubahan angsuran bulanan dalam rupiah. Kalau ada dana darurat, hitung ulang daya tahannya dalam bulan menggunakan biaya hidup pada skenario tersebut, bukan biaya hidup hari ini.

4. **Mode perbandingan skenario.** Simpan skenario dasar, lalu tampilkan delta terhadap satu skenario alternatif: perubahan nilai portofolio riil, perubahan daya beli, perubahan angsuran, perubahan daya tahan dana darurat. Ini yang membuat fiturnya menjawab pertanyaan "apa artinya bagi saya", bukan sekadar simulator makro.

5. **Skenario tersimpan.** User bisa menyimpan konfigurasi driver dengan nama sendiri, tersimpan lewat lapisan persistensi yang sudah dipakai proyek.

## Fase 3 — UI

- Pisahkan visual antara **input** dan **hasil**. Yang bisa digeser hanya penggerak eksogen dan pilihan kebijakan. Inflasi, PDB, pengangguran, dan kurs adalah keluaran dan harus tampak jelas sebagai keluaran — read-only, ditandai berbeda. Ini keputusan desain yang disengaja: user perlu paham bahwa pengangguran adalah akibat suku bunga, bukan tombol terpisah.
- 19 slider terlalu banyak untuk dibuka sekaligus. Buat bertingkat: tampilkan dulu 5–6 penggerak paling berpengaruh, sisanya di balik "pengaturan lanjutan", mengikuti pola disclosure yang sudah dipakai proyek.
- Responsif sampai layar ponsel. Slider harus nyaman disentuh, dan pastikan bisa dioperasikan lewat keyboard.
- Perhitungan berjalan di render — jika ada jeda terasa, debounce input atau pindahkan solver ke worker. Ukur dulu, jangan optimasi prematur.
- Format angka memakai locale `id-ID` dan helper formatting yang sudah ada di proyek.

## Fase 4 — Test

- Unit test untuk solver dengan fixture: satu skenario dasar dan setiap preset historis, kunci sebagai snapshot.
- Uji konvergensi: solver harus stabil, tidak berosilasi atau menghasilkan NaN pada nilai ekstrem di kedua ujung rentang setiap slider.
- Uji tanda, bukan hanya nilai. Contoh yang harus benar:
  - Harga minyak naik → skor pemerintah turun saat subsidi tinggi, dan inflasi naik saat subsidi rendah. Dua jalur, bukan satu.
  - Rupiah melemah → imbal hasil rupiah dari aset valas naik, dan kredit macet naik jika utang valas tinggi.
  - Pangsa informal naik → sensitivitas pengangguran terhadap output gap turun.
  - Suku bunga riil global naik → emas dan kripto turun bersamaan.
- Uji personalisasi dengan portofolio kosong, portofolio satu aset, dan portofolio yang mengandung kelas aset di luar kesepuluh kategori.

## Kriteria selesai

- Modul domain tidak mengimpor apa pun dari lapisan UI, dan bisa dijalankan di Node tanpa DOM.
- Tidak ada nilai warna hardcoded di kode fitur baru; semua lewat token proyek.
- Fitur terlihat seolah ditulis oleh orang yang sama dengan sisa aplikasi, bukan tempelan.
- Nilai dasar sebagai pemeriksaan cepat: dengan driver bawaan, inflasi mendarat sekitar 3,1%, PDB sekitar 5,1%, pengangguran sekitar 5,0%, arus modal sekitar +14, kurs mendekati datar. Ambil nilai persisnya dengan menjalankan file referensi, jangan pakai angka ini sebagai kebenaran.
- Ada penafian jelas bahwa ini indeks heuristik untuk pendidikan dan perencanaan skenario, bukan proyeksi ekonomi maupun nasihat investasi.

## Yang tidak boleh dilakukan

- Menyalin palet gelap atau tata letak file referensi.
- Menambah dependensi chart baru jika proyek sudah punya.
- Menyederhanakan solver iteratif menjadi perhitungan satu arah.
- Mengubah koefisien model tanpa memberi tahu saya alasannya.
- Menulis kode sebelum Fase 0 selesai dan saya setujui.

/plan ahead