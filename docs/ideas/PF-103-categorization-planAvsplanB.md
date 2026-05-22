Comparative Review: Plan A vs Plan B — PF-103 Categorization
Diagnosis Pertama: Apakah keduanya menjawab pertanyaan yang benar?
Plan A — "Historical Cashflow Import with Fuzzy Deduplication"

Developer A pivot ke problem yang berbeda. Dia tidak menjawab pertanyaan kategorisasi sama sekali. Yang dia selesaikan adalah:

409 Conflict saat re-import file yang sama
Fuzzy deduplication "Listrik" vs "PLN 123456789"
Ini adalah masalah infrastruktur import, bukan masalah categorization engine. Teknisnya solid (Jaro-Winkler, three-bucket UI, backward-compatible shim), tapi itu jawaban untuk pertanyaan yang tidak ditanyakan.

Plan B — "Strategi Algoritma Kategorisasi Transaksi"

Developer B menjawab pertanyaan yang benar. Hybrid Engine-nya (Option 3) adalah pattern yang dipakai Mint, YNAB, Personal Capital. Secara arah, ini benar.

Score awal:

Dimensi	Plan A	Plan B
Menjawab pertanyaan yang ditanya	❌	✓
Kualitas teknis dari apa yang dibangun	✓✓	✓
Ready to implement	✓	❌ (ends with open questions)
Deep Review: Plan B (yang relevan)
Plan B propose Hybrid Engine 5-layer. Saya evaluasi tiap layer dengan data CSV aktual:

Layer 1: Exact Match History ✓ Benar

Match persis Remarks → ambil category dari history. Correct, fast, O(1).

Layer 2: User-Defined Rules (Smart Engine) ✓ Benar, tapi mengabaikan aset yang sudah ada

Ini sudah exist! System sudah punya 106 seeded category rules dengan CategorizeBatchAsync. Developer B tidak tahu ini, jadi dia rebuild dari nol. Seharusnya: enhance yang ada dengan signal tambahan, bukan reimplementasi.

Layer 3: Local ML Classifier (Naive Bayes) ❌ Over-engineered, salah tool untuk job ini

Data: ~800–1200 labeled rows, vendor names dalam Bahasa Indonesia + campuran English. Ini adalah:

Data terlalu sedikit untuk supervised ML yang reliable
Vendor baru (restoran baru, langganan baru) adalah out-of-distribution case
Training + serving infrastructure = complexity tanpa justifikasi untuk personal finance app
Developer B tergiur dengan buzzword "ML" tapi tidak menghitung ROI. Gemini sudah ada, lebih akurat, zero infra cost.

Layer 4: LLM Fallback ✓ Benar

Ini yang harusnya Layer 3. Tapi Plan B menyebutnya sebagai "last resort before uncategorized" — seharusnya ini dilakukan lebih awal, langsung setelah rules gagal.

Layer 5: Uncategorized ✓ Benar

Feedback loop manual → auto-seed ke history. Pattern yang tepat.

The Killer Miss: Kedua Developer Mengabaikan Item Column
Ini yang paling kritis, dan tidak ada satu pun plan yang menyebutnya.

Dari CSV data aktual:


Date;Item;Remarks;Flow;...;Category
13/01/2024;Go Mie Go;QRIS (PAYMENT);DB;...;Food
13/01/2024;Token Listrik;TRSF E-BANKING DB .../TOKOPEDIA...;DB;...;Electricity
14/01/2024;Go Mie Go;QRIS (PAYMENT);DB;...;Food
15/01/2024;BPJS;TRSF E-BANKING DB .../BPJS KES...;DB;...;Bill
15/01/2024;Roti Goolung;QRIS (PAYMENT);DB;...;Food
20/01/2024;Indihome;TOP-UP & BILLS;DB;...;Bill
Perhatikan baris dengan Remarks = "QRIS (PAYMENT)" — ini completely uninformative dari Remarks saja. Tanpa Item, keyword matching tidak bisa bedakan "Go Mie Go" (Food) vs "Es Teh" (Food) vs "Kantin Koe" (Food) vs "Gerobak Sushi" (Food). Semuanya QRIS (PAYMENT).

Item adalah human-labeled semantic layer yang sudah ada. Ini adalah Primary Key untuk kategorisasi, bukan Remarks. Algoritma yang ignore ini akan failed untuk semua NeoBank QRIS transactions.

Pattern Signal Hierarchy yang Benar (dari analisis CSV)
Priority	Signal	Example	→ Category
P0	Item non-empty	"Netflix", "BPJS", "Indihome"	Bill
P0	Item non-empty	"Go Mie Go", "Es Teh", "Roti Goolung"	Food
P1	Flow=CR + keyword SAVING INTEREST|INTEREST	NeoBank daily interest	Saving Interest
P1	Flow=DB + keyword TARIKAN ATM	ATM withdrawal	Withdrawing
P1	Remarks contains RIKKI H HASIBUAN (self)	Inter-bank transfer	Bank Transfer / Asset Transfer
P2	Flow=DB + Remarks contains vendor name	"Roti Goolung - Transfer"	Food (via rules)
P3	LLM	anything else	context-aware
Pola ini tidak muncul di kedua plan.

Verdict
Plan B menang secara relevansi. Plan A menjawab pertanyaan yang salah.

Tapi Plan B juga tidak cukup baik untuk langsung dieksekusi. Berikut gap-nya:

Issue	Severity
Tidak menyadari Item column sebagai primary signal	Critical
Tidak menyadari 106 rules sudah exist	Major
Local ML Layer adalah over-engineering	Major
Berakhir dengan "open questions", bukan implementation plan	Moderate
Plan A layak dikerjakan secara terpisah sebagai tiket import infrastructure (PF-104 atau semacamnya) — fuzzy dedup dan 409 bypass itu masalah nyata, tapi orthogonal dengan kategorisasi.

Rekomendasi Arsitektur yang Sebenarnya
Buang Local ML layer. Bangun ini:


NEW TRANSACTION
     │
     ▼
[Layer 0] Item field non-empty?
     │─ YES → exact lookup "Item → Category" from history cache
     │         (hash map, O(1), ~100% accurate for known merchants)
     │─ NO  → continue
     ▼
[Layer 1] Exact Remarks match?
     │─ YES → return cached category (existing system)
     │─ NO  → continue
     ▼
[Layer 2] Enhanced Rule Engine (106 rules + Flow signal)
     │        Rule schema: { flow: "DB"|"CR", keyword: "...", category: "..." }
     │─ MATCH → return category
     │─ NO MATCH → continue
     ▼
[Layer 3] Gemini LLM (ai-service sudah ada)
     │        Prompt: "Item: X, Remarks: Y, Flow: DB, Bank: NeoBank → classify: [Food|Bill|...]"
     │─ Confidence ≥ 0.85 → return + auto-create rule
     │─ Confidence < 0.85 → continue
     ▼
[Layer 4] Mark "Uncategorized" → user review
              │─ User confirm → seed Layer 0 cache + create rule
Ini bisa diimplementasi sepenuhnya dengan infrastruktur yang sudah ada. Zero new ML infrastructure. Total effort: ~1 sprint.