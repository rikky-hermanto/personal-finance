# Strategi Algoritma Kategorisasi Transaksi (Transaction Categorization Engine)

Berdasarkan analisis file `Cashflow 2024 2025.csv` dan workflow Excel lama Anda, masalah utama dari pendekatan Dictionary (brute-force keyword matching) adalah:
1. **Rentang Error & Tumpang Tindih:** Keyword pendek bisa salah sasaran (false positive).
2. **Kaku (Rigid):** Tidak mempertimbangkan konteks lain seperti kolom `Flow` (DB/CR) atau `Item`.
3. **Maintenance Berat:** Harus terus update manual setiap kali ada jenis transaksi baru dengan nama unik.

Mengingat kita sekarang berada di level kode (TypeScript/Node.js) dan sistem memiliki `ai-service`, kita bisa menerapkan algoritma yang jauh lebih efisien, dinamis, dan akurat. 

Berikut adalah 3 opsi strategi algoritma dari yang paling sederhana hingga yang paling canggih untuk kita diskusikan:

---

## Opsi 1: Smart Rule-Based Engine (Evolusi dari Dictionary)

Alih-alih sekadar mencocokkan teks `includes()`, kita membuat *Rules Engine* terstruktur. Setiap rule (aturan) memiliki kondisi yang lebih spesifik dan prioritas.

**Mekanisme:**
Kita mendefinisikan rules berdasarkan kombinasi `Remarks`, `Flow` (CR/DB), dan regex.
*   **Contoh:** `IF Flow == "CR" AND Remarks MATCHES Regex(/(SAVING\sINTEREST|Bunga)/i) THEN Type="Income", Category="Saving Interest"`
*   **Contoh:** `IF Remarks MATCHES Regex(/TARIKAN ATM/i) THEN Type="Expense", Category="Withdrawing"`
*   **Prioritas:** Rule dengan kondisi spesifik punya prioritas tinggi (akan dieksekusi lebih dulu), sementara rule generik di bawahnya.

**Kelebihan:** 
* Mudah dikontrol dan di-debug. 
* Lebih presisi dari sekadar keyword Excel karena memperhitungkan tipe *Flow* dan pola Regex.
**Kekurangan:** 
* Masih manual. Tetap butuh mendaftarkan rule baru jika ada vendor baru (misal: warung kopi baru).

---

## Opsi 2: Statistical Machine Learning (Text Classification)

Karena Anda sudah punya data historis yang bagus (file `Cashflow 2024 2025.csv` dengan ~800+ baris data terlabeli), kita bisa melatih model *Machine Learning* sederhana (seperti algoritma **Naive Bayes** atau **FastText**) di backend (Local ML).

**Mekanisme:**
*   Algoritma akan "belajar" dari CSV Anda. Model ini mempelajari probabilitas bahwa kata "Go Mie Go" di `Remarks` jika `Flow="DB"` maka 99% kemungkinan `Category="Food"`.
*   Tidak butuh mendefinisikan rules manual lagi.

**Kelebihan:** 
* Otomatis! Tidak perlu setup dictionary panjang.
* Bisa mengenali pola baru yang mirip (Fuzzy matching) meskipun nama vendor sedikit berbeda (misal "Es Teh Indonesia" vs "Es Teh").
**Kekurangan:** 
* Bisa salah tebak jika data training kurang.
* Susah di-debug ("kenapa transaksi ini dikategorikan Food?").

---

## Opsi 3: The Hybrid Engine (Rekomendasi Utama)

Ini adalah praktik terbaik yang dipakai aplikasi *Personal Finance* modern (seperti Mint, YNAB, Wallet). Kita menggabungkan kecepatan Rule-based dengan kecerdasan AI.

Mekanisme ini berjalan secara berjenjang (Waterfall) dari atas ke bawah:

1. **Layer 1: Exact Match History (Cache).** 
   Jika `Remarks` sama persis (100%) dengan transaksi yang *pernah* dikategorikan sebelumnya, langsung gunakan itu. (Sangat cepat & pasti benar).
2. **Layer 2: User-Defined Rules (Smart Engine).** 
   Mengecek rule spesifik buatan user. Misal: `Remarks contains "PLN" -> Electricity`.
3. **Layer 3: Local ML Classifier (Naive Bayes).** 
   Jika tidak ada di history dan rules, minta Machine Learning (model lokal yg ditraining dari CSV) untuk menebak. Jika tingkat keyakinannya (confidence) > 85%, pakai hasil tebakan ini.
4. **Layer 4: LLM AI Fallback (Gemini / AI Service).** 
   Jika ML lokal ragu (confidence rendah), lempar prompt ke AI Service (LLM) untuk dianalisa berdasarkan konteks umum. 
   *(Contoh Prompt: "Transaksi debit 'Steam Games' ini masuk ke kategori apa di antara pilihan berikut: Food, Entertainment, Bills?")*.
5. **Layer 5: "Uncategorized".** 
   Jika semua gagal, tandai sebagai "Uncategorized" agar user mereview manual. Setelah user mereview, data ini otomatis masuk ke Layer 1 (History), sehingga bulan depan tidak akan salah lagi!

---

## Open Questions

> [!IMPORTANT]
> Pertanyaan untuk Anda:
> 1. **Pilihan Arsitektur:** Dari ketiga pendekatan di atas, apakah Anda setuju untuk mengejar **Opsi 3 (Hybrid Engine)**? Kombinasi ini menutupi kelemahan satu sama lain.
> 2. **AI vs Local ML:** Mengingat kita sudah punya `ai-service` (Gemini), apakah Anda ingin langsung meloncat menggunakan Gemini di Layer 4 (setelah Rules & Exact Match gagal), atau tetap ingin membangun Local ML (Layer 3) terlebih dahulu?
> 3. **Fleksibilitas Kategori:** Apakah `Category` dan `Type` di aplikasi ini sifatnya statis (hanya dari yang ada di Excel), atau dinamis (user bisa tambah kategori sendiri ke depannya)? Ini menentukan seberapa fleksibel engine kita.

Mari diskusikan arah ini sebelum masuk ke eksekusi!
