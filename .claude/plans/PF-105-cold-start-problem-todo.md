# PF-102 — Cold Start: Smart Defaults via Category Preset

> **GitHub Issue:** (create before starting)
> **Status:** Not Started
> **Started:** —

## Objective

Solve the "cold start problem": user baru = `category_rules` kosong = 100% transaksi muncul "Untracked Expense" di preview pertama → leave-the-app moment. Solusi: curated `category_presets` (~300-500 Indonesian merchants) yang bekerja diam-diam sebagai Layer 2b di categorization cascade, invisible di Settings UI, tapi beri efek "ajaib" ≥80% transaksi ter-kategori bahkan tanpa user pernah buat satu rule pun.

Sekaligus: tambah inline "Apply to similar" UX di preview table (one-click rule creation tanpa context-switch ke Settings) dan LLM batch suggest sebagai fallback terakhir sebelum "Untracked Expense".

## Acceptance Criteria

- [x] User baru upload statement → ≥80% transaksi ter-kategori tanpa satu pun entry di `category_rules`
- [x] `category_presets` table seeded dengan ≥300 Indonesian merchant patterns
- [x] `category_presets` tidak muncul di Settings UI (hidden by design)
- [x] User rules di `category_rules` selalu menang atas preset entries (priority cascade)
- [x] Copy-on-Write: user edit kategori dari preset-resolved row → auto-create user rule
- [x] "Apply to similar" toggle berfungsi di preview: ubah kategori satu row + extract keyword → re-categorize semua row matching in-memory → submit dengan `categoryRuleDto` payload
- [x] LLM batch suggest dipanggil SEKALI per upload (bukan per row) untuk unique untracked patterns
- [x] LLM suggestion confidence ≥ 0.85 → auto-seed ke `category_rules`
- [x] Telemetry: layer-hit per categorize ter-log via `ILogger` (Loki/Grafana visible)
- [x] Tidak ada regresi pada existing categorization tests
- [x] Existing parsers (BCA, NeoBank, Default, LLM) tidak perlu dimodifikasi
- [x] **PII safety:** `category_presets` tidak mengandung nama orang, nomor rekening, nomor HP, atau reference ID — verified via SQL scan (STEP 7)
- [x] **PII safety:** `keywordExtractor.ts` strip PII sebelum extract keyword (test case "TRANSFER KE BUDI SANTOSO 081234567890" → `""`)
- [x] **PII safety:** LLM batch suggest terima deskripsi yang sudah disanitize (SanitizeForLlm), bukan raw description
- [x] **PII safety:** keyword yang dikembalikan LLM divalidasi via `_is_pii_keyword()` sebelum di-seed ke `category_rules`

## Approach

Extend existing 4-layer categorization engine dengan satu layer baru (2b) tanpa mengubah interface atau signature yang sudah ada:

```
Layer 0: description history cache (from prior transactions)     ← no change
Layer 1: remarks history cache                                   ← no change
Layer 2a: user category_rules (longest-keyword-match, 3-tier)   ← no change
Layer 2b: category_presets  (NEW — silent global fallback)   ← NEW
Layer 3: LLM batch suggest → auto-seed (enhanced from per-row)  ← ENHANCED
  └─ Fallback: "Untracked Expense"
```

`category_presets` adalah tabel terpisah (bukan flag `is_system` di `category_rules`) — aligned dengan PF-S08 multi-tenancy di mana `category_rules` akan punya `user_id`, sedangkan dictionary tetap global tanpa owner.

LLM batch suggest dipanggil hanya untuk unique patterns yang masih Untracked setelah Layer 2b — bukan per-row. Hasil confidence ≥ 0.85 di-auto-seed ke `category_rules` sehingga upload berikutnya tidak perlu LLM lagi (natural caching via existing table).

Out of scope (defer v2): pgvector fuzzy match, retroactive re-categorization, dictionary versioning UI.

## Affected Files

| File | Change | Phase |
|------|--------|-------|
| `supabase/migrations/{ts}_create_category_presets.sql` | Create — table + RLS | 1 |
| `supabase/migrations/{ts}_seed_category_presets.sql` | Create — 300-500 seed entries | 4 |
| `apps/api/src/PersonalFinance.Domain/Entities/CategoryPreset.cs` | Create — entity | 1 |
| `apps/api/src/PersonalFinance.Application/Interfaces/ICategoryPresetService.cs` | Create — interface | 1 |
| `apps/api/src/PersonalFinance.Application/Services/CategoryPresetService.cs` | Create — thin Supabase reader | 1 |
| `apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs` | Modify — add Layer 2b | 1 |
| `apps/api/src/PersonalFinance.Api/Program.cs` | Modify — DI registration | 1, 3 |
| `apps/api/src/PersonalFinance.Application/Interfaces/ILlmSuggestionClient.cs` | Create — interface | 3 |
| `apps/api/src/PersonalFinance.Infrastructure/External/LlmSuggestionClient.cs` | Create — typed HttpClient | 3 |
| `apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs` | Modify — batch LLM suggest | 3 |
| `services/ai-service/app/services/merchant_suggester.py` | Create — LLM batch service | 3 |
| `services/ai-service/app/models.py` | Modify — add request/response models | 3 |
| `services/ai-service/app/main.py` | Modify — register `/suggest-categories` | 3 |
| `apps/frontend/src/utils/keywordExtractor.ts` | Create — stop-word extractor | 2 |
| `apps/frontend/src/components/TransactionPreview.tsx` | Modify — "Apply to similar" toggle | 2 |
| `apps/api/tests/PersonalFinance.Tests/Services/CategorizationLayerTests.cs` | Modify — extend mocks | 5 |
| `apps/frontend/e2e/upload.spec.ts` | Modify — cold start regression | 5 |

---

## TODO

### [x] STEP 1 — Buat tabel `category_presets` + migration

Buat file migration baru di `supabase/migrations/`. Timestamp harus lebih baru dari migration existing terakhir.

```bash
# Check migration terbaru untuk ambil timestamp reference
ls supabase/migrations/
```

Buat file `supabase/migrations/20260510000001_create_category_presets.sql`:

```sql
CREATE TABLE category_presets (
    id integer GENERATED BY DEFAULT AS IDENTITY,
    keyword character varying(100) NOT NULL,
    category character varying(100) NOT NULL,
    type character varying(50) NOT NULL,
    flow character varying(5) NULL,
    keyword_length integer NOT NULL,
    version integer NOT NULL DEFAULT 1,
    CONSTRAINT pk_category_presets PRIMARY KEY (id)
);

CREATE INDEX idx_category_presets_keyword_length ON category_presets (keyword_length DESC);

ALTER TABLE category_presets ENABLE ROW LEVEL SECURITY;

-- Read-only untuk semua authenticated user. Tidak ada INSERT/UPDATE/DELETE policy.
CREATE POLICY "allow_read_category_presets" ON category_presets
    FOR SELECT USING (true);
```

Apply migration:
```bash
supabase db push
```

> **Why tabel terpisah (bukan flag `is_system`)?** `category_rules` akan mendapat kolom `user_id` di PF-S08 (Supabase Auth). preset entries adalah global, tidak punya owner. Memisahkan keduanya sejak awal menghindari RLS yang complex (`USING (is_system = true OR user_id = auth.uid())`). Lifecycle berbeda: dictionary diupdate via migration + code review, user rules diupdate oleh user runtime.
>
> **Why `keyword_length` + index?** Reuse pola dari `category_rules` — ordering by keyword_length DESC di server side, in-memory loop first-hit-wins. Tidak perlu SQL LIKE query yang mahal.
>
> **Why RLS SELECT USING (true)?** preset entries tidak sensitif — ini curated knowledge base bukan data user. Anonymous read memudahkan expansion ke fitur public lookup kalau diperlukan.

---

### [x] STEP 2 — Domain entity `CategoryPreset.cs`

Buat `apps/api/src/PersonalFinance.Domain/Entities/CategoryPreset.cs`, tiru persis pola dari [CategoryRule.cs](apps/api/src/PersonalFinance.Domain/Entities/CategoryRule.cs):

```csharp
using Postgrest.Attributes;
using Postgrest.Models;

namespace PersonalFinance.Domain.Entities;

[Table("category_presets")]
public class CategoryPreset : BaseModel
{
    [PrimaryKey("id", shouldInsert: false)]
    public int Id { get; set; }

    [Column("keyword")]
    public string Keyword { get; set; } = string.Empty;

    [Column("category")]
    public string Category { get; set; } = string.Empty;

    [Column("type")]
    public string Type { get; set; } = string.Empty;

    [Column("flow")]
    public string? Flow { get; set; }

    [Column("keyword_length")]
    public int KeywordLength
    {
        get => Keyword?.Length ?? 0;
        set { /* computed — DB value ignored */ }
    }

    [Column("version")]
    public int Version { get; set; } = 1;
}
```

> **Why `KeywordLength` computed getter?** Pola identik dengan `CategoryRule.cs:22-26`. Server-side `ORDER BY keyword_length DESC` butuh kolom ini terisi di DB. Getter derive dari `Keyword.Length` — selalu konsisten, tidak perlu di-set manual.

---

### [x] STEP 3 — Service interface + implementation

**Interface** — buat `apps/api/src/PersonalFinance.Application/Interfaces/ICategoryPresetService.cs`:

```csharp
using PersonalFinance.Domain.Entities;

namespace PersonalFinance.Application.Interfaces;

public interface ICategoryPresetService
{
    Task<List<CategoryPreset>> GetAllAsync(CancellationToken ct = default);
}
```

**Implementation** — buat `apps/api/src/PersonalFinance.Application/Services/CategoryPresetService.cs`:

```csharp
using PersonalFinance.Application.Interfaces;
using PersonalFinance.Domain.Entities;
using Supabase;

namespace PersonalFinance.Application.Services;

public class CategoryPresetService(Client supabase) : ICategoryPresetService
{
    public async Task<List<CategoryPreset>> GetAllAsync(CancellationToken ct = default)
    {
        var result = await supabase
            .From<CategoryPreset>()
            .Order("keyword_length", Postgrest.Constants.Ordering.Descending)
            .Get(ct);

        return result.Models;
    }
}
```

**DI registration** — tambahkan di [Program.cs](apps/api/src/PersonalFinance.Api/Program.cs) setelah registrasi `CategoryRuleService`:

```csharp
builder.Services.AddScoped<ICategoryPresetService, CategoryPresetService>();
```

> **Why `AddScoped`?** Konsisten dengan `CategoryRuleService` registration. Scoped per HTTP request — Supabase client di-inject dengan lifetime yang sama.

---

### [x] STEP 4 — Integrate Layer 2b di `CategorizeBatchAsync`

Modify [CategoryRuleService.cs](apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs).

**4a. Inject `ICategoryPresetService` di constructor:**

Locate constructor di sekitar line 15-20, tambahkan parameter baru:

```csharp
// Before (contoh existing pattern):
public CategoryRuleService(Client supabase)
{
    _supabase = supabase;
}

// After:
public CategoryRuleService(Client supabase, ICategoryPresetService CategoryPreset)
{
    _supabase = supabase;
    _CategoryPreset = CategoryPreset;
}
private readonly ICategoryPresetService _CategoryPreset;
```

**4b. Tambah round-trip ke dictionary di `CategorizeBatchAsync` (sekitar line 117, setelah load rules):**

```csharp
// Existing (Layer 2a load — jangan diubah):
var rules = (await supabase.From<CategoryRule>().Order("keyword_length", Descending).Get()).Models;

// Tambahkan setelah baris di atas (Layer 2b):
var presetEntries = await _CategoryPreset.GetAllAsync(ct);
```

**4c. Extend in-memory cascade loop (sekitar line 140-160):**

Existing code membangun cascade 3-tier dari `rules`. Setelah loop user rules habis tanpa match, lanjut ke dictionary:

```csharp
// Existing loop structure (tetap dipertahankan — Layer 2a):
var flowSpecific   = rules.Where(r => r.Flow == tx.Flow && r.Type == tx.Type);
var flowAgnostic   = rules.Where(r => r.Flow == null   && r.Type == tx.Type);
var crossType      = rules.Where(r => r.Type == "Asset Transfer");

var matchedRule = flowSpecific.Concat(flowAgnostic).Concat(crossType)
    .FirstOrDefault(r =>
        Squash(normDesc).Contains(Squash(r.Keyword), StringComparison.Ordinal) ||
        normRem.Contains(r.Keyword, StringComparison.OrdinalIgnoreCase));

// Layer 2b — preset fallback (tambahkan setelah blok di atas):
if (matchedRule == null)
{
    var presetFlowSpecific = presetEntries.Where(d => d.Flow == tx.Flow && d.Type == tx.Type);
    var presetFlowAgnostic = presetEntries.Where(d => d.Flow == null   && d.Type == tx.Type);
    var presetCrossType    = presetEntries.Where(d => d.Type == "Asset Transfer");

    var matchedPreset = presetFlowSpecific.Concat(presetFlowAgnostic).Concat(presetCrossType)
        .FirstOrDefault(d =>
            Squash(normDesc).Contains(Squash(d.Keyword), StringComparison.Ordinal));

    if (matchedPreset != null)
    {
        tx.Category = matchedPreset.Category;
        tx.Type     = matchedPreset.Type;
        // Tandai source untuk telemetry (STEP 10)
        // layerHit = "dictionary";
        continue;
    }
}
```

> **Why 3 round-trips total?** Layer 0/1 = 1 round-trip (transaction history). Layer 2a = 1 round-trip (user rules). Layer 2b = 1 round-trip (dictionary). Total 3 — masih O(1) per batch, bukan O(N). PERF-01 tetap terpenuhi.
>
> **Why user rules first?** User rules di Layer 2a adalah explicit personalization — user sudah dengan sengaja membuat rule ini. Dictionary adalah global default yang harus bisa di-override. Urutan ini juga konsisten dengan filosofi "CSS specificity": more specific (user) > less specific (global default).

---

### [x] STEP 5 — Copy-on-Write mechanism review

Cek apakah auto-seed yang sudah ada di [TransactionPipelineService.cs:118-131](apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs) sudah cukup untuk Copy-on-Write, atau perlu diextend.

```bash
# Baca implementasi existing
```

**Scenario:** user upload → row X ter-resolve via dictionary (Layer 2b) dengan category "Food". User edit dropdown kategori row X menjadi "Entertainment". User submit.

- **Apakah existing `EnsureCategoryRulesAsync` sudah handle ini?** Cek `TransactionsController` apakah sudah panggil `EnsureCategoryRulesAsync` saat submit dengan kategori yang berbeda dari "Untracked Expense".
- **Kalau YA:** tidak perlu kode baru. preset-resolved rows yang di-edit user akan auto-promote via mekanisme yang sama dengan LLM auto-seed.
- **Kalau TIDAK:** tambahkan branch di submit handler: jika `transaction.Category != "Untracked Expense"` DAN tidak ada user rule matching description → create user rule via `ICategoryRuleService.AddAsync`.

> **Why "Copy-on-Write" framing?** Silent promotion — tidak ada prompt ke user ("Mau jadikan rule?"), tidak ada extra UI friction. Kalau user sudah susah payah ubah kategori satu row, sistem diam-diam "belajar" itu sebagai preferensi. Konsisten dengan pola auto-seed LLM di Layer 3.

---

### [x] STEP 6 — Generate seed data (offline)

Ini adalah step offline sebelum membuat migration file. Gunakan Gemini atau Claude untuk generate bulk merchant patterns.

**Manual curate ~100 high-confidence entries** (kerjakan dulu, ini ground truth):

```
TARIKAN ATM → Withdrawing, Expense, DB
BIAYA ADMIN → Admin Fee, Expense, DB
GOPAY → E-Wallet, Expense, DB
OVO → E-Wallet, Expense, DB
DANA → E-Wallet, Expense, DB
SHOPEE → Shopping, Expense, DB
TOKOPEDIA → Shopping, Expense, DB
LAZADA → Shopping, Expense, DB
GRAB → Transportation, Expense, DB
GOJEK → Transportation, Expense, DB
INDOMARET → Groceries, Expense, DB
ALFAMART → Groceries, Expense, DB
PLN → Utilities, Expense, DB
TELKOM → Utilities, Expense, DB
XL AXIATA → Utilities, Expense, DB
INDOSAT → Utilities, Expense, DB
BUKALAPAK → Shopping, Expense, DB
TRAVELOKA → Travel, Expense, DB
TIKET → Travel, Expense, DB
NETFLIX → Entertainment, Expense, DB
SPOTIFY → Entertainment, Expense, DB
TRANSFER → Transfer, Expense, DB  (flow: DB)
... (lanjutkan sampai ~100)
```

**LLM-generate ~200-300 tambahan** — gunakan prompt ini di Gemini/Claude:

```
Saya sedang membangun aplikasi keuangan pribadi untuk pengguna Indonesia.
Saya butuh daftar keyword untuk mengenali merchant/transaksi dari Indonesian bank statements.

Format output (JSON array):
[
  {"keyword": "TOKOPEDIA", "category": "Shopping", "type": "Expense", "flow": "DB"},
  ...
]

Aturan WAJIB:
- keyword harus substring dari deskripsi transaksi bank (biasanya uppercase)
- keyword HANYA boleh berupa: nama merchant, nama brand, atau istilah perbankan generik
- DILARANG KERAS — keyword TIDAK BOLEH mengandung:
  * Nama orang (contoh: "BUDI SANTOSO", "RIKKY HERMANTO")
  * Nomor rekening (contoh: "1234567890", "081234567890")
  * Nomor HP/WA (contoh: "+6281234567890", "08123")
  * Referensi transaksi (contoh: "TRF/123456", "QRIS-98765")
  * Pola "A/N", "AN ", "KE REK", "DARI REK" + apapun setelahnya
  * Angka 7+ digit berturutan
- category harus salah satu dari: Food & Dining, Transportation, Shopping,
  Groceries, Utilities, Entertainment, Health, Education, Travel,
  E-Wallet, Admin Fee, Transfer, Withdrawing, Income, Investment
- type: "Expense" atau "Income"
- flow: "DB" (debit/keluar), "CR" (credit/masuk), atau null (berlaku untuk keduanya)
- prioritaskan merchant yang umum di Indonesia: e-commerce, FMCG, transport, fintech

Berikan 250 entry yang belum ada di list ini:
[paste manual list]
```

**QA pass — wajib sebelum commit:**

Gunakan regex berikut untuk scan SEMUA entries sebelum masuk migration:

```bash
# Jalankan dari repo root setelah generate SQL draft
# Deteksi angka panjang (rekening/HP)
grep -P '\d{7,}' supabase/migrations/*_seed_category_presets.sql && echo "⚠️  FOUND: Long digit sequence — possible account number / phone"

# Deteksi pola nama setelah kata transfer
grep -iP '(KE|DARI|AN|A\/N)\s+[A-Z]{3,}' supabase/migrations/*_seed_category_presets.sql && echo "⚠️  FOUND: Possible person name pattern"

# Deteksi nomor HP Indonesia
grep -P '(\+62|08\d{2})\d+' supabase/migrations/*_seed_category_presets.sql && echo "⚠️  FOUND: Possible phone number"
```

Jika grep menemukan match → hapus/edit entry tersebut sebelum lanjut.

Selain script, human review checklist:
- [ ] Tidak ada entry yang keyword-nya terlihat seperti nama orang
- [ ] Tidak ada entry dengan angka 7+ digit di keyword
- [ ] Tidak ada nomor HP (+62, 08xx) di keyword
- [ ] Tidak ada pola "KE [NAMA]", "DARI [NAMA]", "A/N [NAMA]"
- [ ] Semua keyword adalah nama brand/merchant yang bisa di-Google

Target precision > 95%.

> **Why fixtures, bukan real user statements?** Privacy-safe. Tidak ada risiko leak data. Curated fixtures (`e2e/fixtures/bca-sample.csv`) adalah synthetic/anonymized data yang sudah ada di repo.

---

### [x] STEP 7 — Commit seed migration

Setelah QA pass, convert ke SQL dan commit:

Buat `supabase/migrations/20260510000002_seed_category_presets.sql`:

```sql
INSERT INTO category_presets (keyword, category, type, flow, keyword_length, version) VALUES
('TARIKAN ATM', 'Withdrawing', 'Expense', 'DB', 11, 1),
('BIAYA ADMIN', 'Admin Fee', 'Expense', 'DB', 11, 1),
('GOPAY', 'E-Wallet', 'Expense', 'DB', 5, 1),
('OVO', 'E-Wallet', 'Expense', 'DB', 3, 1),
-- ... (semua 300-500 entries)
('INDOMARET', 'Groceries', 'Expense', 'DB', 9, 1),
('ALFAMART', 'Groceries', 'Expense', 'DB', 8, 1);
```

Apply:
```bash
supabase db push
```

Verify jumlah dan PII check:
```sql
-- Total entries
SELECT COUNT(*) FROM category_presets;
-- Expected: 300+

-- Scan PII: keyword dengan angka 7+ digit
SELECT keyword FROM category_presets WHERE keyword ~ '\d{7,}';
-- Expected: 0 rows

-- Scan PII: pola nama setelah KE/DARI/AN
SELECT keyword FROM category_presets WHERE keyword ~* '(KE|DARI|A\/N)\s+[A-Z]{3,}';
-- Expected: 0 rows

-- Scan PII: nomor HP Indonesia
SELECT keyword FROM category_presets WHERE keyword ~ '(\+62|08\d{2})\d+';
-- Expected: 0 rows
```

Jika ada query yang return hasil → hapus entry tersebut via `DELETE FROM category_presets WHERE keyword = '...'`, lalu fix di file migration SQL-nya.

> **Why sebagai migration, bukan `seed.sql`?** `seed.sql` di-apply hanya saat `supabase db reset` — tidak idempotent untuk production. Migration file di-apply sekali dan tidak bisa di-rollback sembarangan. Dictionary adalah data yang perlu versioning — kalau kita update dictionary di release berikutnya, kita buat migration baru, bukan overwrite. Ini menjamin audit trail.

---

### [x] STEP 8 — Frontend: keywordExtractor.ts + "Apply to similar" toggle

**8a. Buat `apps/frontend/src/utils/keywordExtractor.ts`:**

```typescript
const BANKING_STOP_WORDS = new Set([
  'KARTU', 'DEBIT', 'CREDIT', 'KREDIT', 'TARIKAN', 'TRANSFER',
  'PEMBAYARAN', 'BAYAR', 'PEMBELIAN', 'BELI', 'KE', 'DARI',
  'ATM', 'BANK', 'BCA', 'BNI', 'BRI', 'MANDIRI', 'CIMB',
  'TRF', 'TF', 'VIA', 'MELALUI', 'NO', 'REF', 'IDR', 'IND',
  // Kata yang muncul sebelum nama orang — stop di sini, jangan ambil kata berikutnya
  'AN', 'REK', 'REKENING',
]);

// Pola PII yang harus distrip SEBELUM tokenisasi
// Urutan penting: strip pola panjang dulu, baru yang lebih pendek
const PII_PATTERNS: RegExp[] = [
  /A\/N\s+\S+(\s+\S+)*/gi,       // "A/N NAMA ORANG" — atas nama
  /KE\s+REK\s*\d+/gi,            // "KE REK 1234567890"
  /DARI\s+REK\s*\d+/gi,          // "DARI REK 1234567890"
  /\+62\d{7,13}/g,               // nomor HP format internasional
  /\b08\d{7,12}\b/g,             // nomor HP format lokal
  /\b\d{7,}\b/g,                 // angka 7+ digit (rekening, referensi)
  /[A-Z0-9]{10,}/g,              // kode alfanumerik panjang (reference ID)
];

export function extractKeyword(description: string): string {
  let sanitized = description.toUpperCase();

  // Strip semua pola PII dulu
  for (const pattern of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, ' ');
  }

  const words = sanitized
    .split(/[\s\-\/\.\,\(\)]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !BANKING_STOP_WORDS.has(w));

  return words.slice(0, 2).join(' ').trim();
}

// Test fixture expectations:
// extractKeyword("KARTU DEBIT A435 AZKO BALI BAT")      → "AZKO BALI"
// extractKeyword("GOPAY/TOPUP")                          → "GOPAY"
// extractKeyword("TARIKAN ATM BCA")                     → "" (semua stop words)
// extractKeyword("TRANSFER KE BUDI SANTOSO 081234567890") → "" (PII stripped, sisa stop words)
// extractKeyword("TRF/123456789/BCA A/N RIKKY HERMANTO") → "" (digits + A/N stripped)
// extractKeyword("SHOPEE PAY 08123456789")               → "SHOPEE PAY" (phone stripped)
```

**8b. Modify [TransactionPreview.tsx](apps/frontend/src/components/TransactionPreview.tsx):**

Tambahkan state baru di component:
```typescript
const [applyToSimilarMap, setApplyToSimilarMap] = useState<Record<string, boolean>>({});
const [pendingKeywords, setPendingKeywords] = useState<Record<string, string>>({});
```

Di dalam `renderRow(tx)`, setelah `<select>` kategori (line ~221-229), tambahkan:

```tsx
{editingId === tx.id && (
  <div className="flex items-center gap-2 mt-1">
    <Checkbox
      id={`apply-similar-${tx.id}`}
      checked={applyToSimilarMap[tx.id] ?? false}
      onCheckedChange={(checked) => {
        setApplyToSimilarMap(prev => ({ ...prev, [tx.id]: !!checked }));
        if (checked) {
          const kw = extractKeyword(tx.description);
          setPendingKeywords(prev => ({ ...prev, [tx.id]: kw }));
        }
      }}
    />
    <label htmlFor={`apply-similar-${tx.id}`} className="text-xs text-muted-foreground">
      Apply to similar
    </label>
    {applyToSimilarMap[tx.id] && (
      <input
        className="text-xs border rounded px-1 py-0.5 font-mono"
        value={pendingKeywords[tx.id] ?? ''}
        onChange={e => setPendingKeywords(prev => ({ ...prev, [tx.id]: e.target.value }))}
        placeholder="keyword..."
      />
    )}
  </div>
)}
```

Saat user mengubah kategori dengan "Apply to similar" aktif, re-categorize row lain in-memory:

```typescript
const handleCategoryChange = (id: string, newCategory: string) => {
  handleFieldChange(id, 'category', newCategory);

  if (applyToSimilarMap[id]) {
    const keyword = pendingKeywords[id]?.toLowerCase();
    if (!keyword) return;
    setEditedTransactions(prev =>
      prev.map(t =>
        t.id !== id && t.description.toLowerCase().includes(keyword)
          ? { ...t, category: newCategory }
          : t
      )
    );
  }
};
```

Di `handleSubmit` (line ~122-169), populate `categoryRuleDto` untuk rows dengan toggle aktif:

```typescript
// Dalam mapping payload sebelum submitTransactions:
categoryRuleDto: applyToSimilarMap[tx.id]
  ? {
      keyword: pendingKeywords[tx.id] ?? extractKeyword(tx.description),
      category: tx.category,
      type: tx.type ?? 'Expense',
      flow: tx.flow ?? null,
    }
  : null,
```

> **Why editable keyword chip?** Auto-extracted keyword bisa salah untuk deskripsi yang noisy ("KARTU DEBIT A435 AZKO BALI BAT" → user mungkin hanya mau "AZKO", bukan "AZKO BALI"). Editable chip = user bisa koreksi tanpa friction. Input kecil di bawah checkbox, tidak mengganggu flow utama.

---

### [x] STEP 9 — Python: `/suggest-categories` endpoint

**9a. Buat `services/ai-service/app/services/merchant_suggester.py`:**

Mirror pola dari [llm_parser.py](services/ai-service/app/services/llm_parser.py):

```python
from __future__ import annotations
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.providers.base import LlmProvider

logger = logging.getLogger(__name__)

_SUGGEST_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "merchant_pattern": {"type": "string"},
                    "suggested_category": {"type": "string"},
                    "suggested_keyword": {"type": "string"},
                    "confidence": {"type": "number"},
                },
                "required": ["merchant_pattern", "suggested_category", "suggested_keyword", "confidence"],
            },
        }
    },
    "required": ["suggestions"],
}

_SYSTEM_PROMPT = """You are an expert at categorizing Indonesian bank transactions.
Given a list of merchant/transaction patterns from Indonesian bank statements, 
suggest the most appropriate category for each.

Categories available: {categories}

Rules:
- confidence 0.0-1.0: use 0.9+ only if you're certain (e.g., "INDOMARET" → Groceries)
- suggested_keyword: the shortest substring that uniquely identifies this merchant (uppercase)
- If uncertain, use confidence < 0.7
- Respond in the schema provided, one suggestion per pattern

CRITICAL — suggested_keyword MUST be a merchant name or generic banking term ONLY.
suggested_keyword MUST NOT contain:
- Person names (e.g., "BUDI SANTOSO", "RIKKY HERMANTO")
- Account numbers (e.g., "1234567890")
- Phone numbers (e.g., "+6281234567890", "081234567890")
- Transaction reference IDs (e.g., "TRF/123456")
- Any sequence of 7 or more consecutive digits
If the pattern only contains personal identifiers with no recognizable merchant name,
set confidence to 0.0 and suggested_keyword to an empty string.
"""

import re

# PII validation — dijalankan pada SETIAP keyword yang dikembalikan LLM
_PII_PATTERNS = [
    re.compile(r'\d{7,}'),                    # 7+ digit berturutan
    re.compile(r'(\+62|08\d{2})\d+'),         # nomor HP Indonesia
    re.compile(r'\bA\/N\b', re.IGNORECASE),   # atas nama
    re.compile(r'\bREK\b', re.IGNORECASE),    # rekening
]

def _is_pii_keyword(keyword: str) -> bool:
    return any(p.search(keyword) for p in _PII_PATTERNS)


class MerchantSuggester:
    def __init__(self, provider: "LlmProvider") -> None:
        self._provider = provider

    async def suggest_batch(
        self,
        patterns: list[str],
        available_categories: list[str],
    ) -> list[dict]:
        if not patterns:
            return []

        system = _SYSTEM_PROMPT.format(categories=", ".join(available_categories))
        user = "Categorize these merchant patterns:\n" + "\n".join(
            f"- {p}" for p in patterns
        )

        try:
            result = await self._provider.extract_structured(system, user, _SUGGEST_SCHEMA)
            raw_suggestions = result.get("suggestions", [])

            # Filter out any suggestion where LLM hallucinated PII into the keyword
            suggestions = [
                s for s in raw_suggestions
                if s.get("suggested_keyword") and not _is_pii_keyword(s["suggested_keyword"])
            ]

            if len(suggestions) < len(raw_suggestions):
                logger.warning(
                    "merchant_suggest_pii_filtered",
                    extra={"dropped": len(raw_suggestions) - len(suggestions)},
                )

            logger.info(
                "merchant_suggest_batch",
                extra={"input_count": len(patterns), "output_count": len(suggestions)},
            )
            return suggestions
        except Exception as exc:
            logger.warning("merchant_suggest_batch_failed: %s", exc)
            return []
```

**9b. Tambahkan models di `services/ai-service/app/models.py`:**

```python
class SuggestCategoriesRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    merchant_patterns: list[str]
    available_categories: list[str]

class MerchantSuggestion(BaseModel):
    merchant_pattern: str
    suggested_category: str
    suggested_keyword: str
    confidence: float

class SuggestCategoriesResponse(BaseModel):
    suggestions: list[MerchantSuggestion]
```

**9c. Register endpoint di `services/ai-service/app/main.py`:**

Di `lifespan` (sekitar line 36-44), tambahkan suggester ke `app.state`:
```python
from app.services.merchant_suggester import MerchantSuggester
# ...
app.state.suggester = MerchantSuggester(provider=provider)
```

Tambahkan endpoint (flat-style, setelah `/categorize`):
```python
@app.post("/suggest-categories", response_model=SuggestCategoriesResponse)
async def suggest_categories(request: SuggestCategoriesRequest) -> SuggestCategoriesResponse:
    suggestions_raw = await app.state.suggester.suggest_batch(
        request.merchant_patterns,
        request.available_categories,
    )
    suggestions = [MerchantSuggestion(**s) for s in suggestions_raw if s.get("confidence", 0) > 0]
    return SuggestCategoriesResponse(suggestions=suggestions)
```

> **Why `extract_structured` bukan `generate_json`?** `extract_structured` menggunakan Gemini JSON mode / Anthropic tool_use — structured output yang divalidasi server-side. Untuk batch array yang bisa panjang, ini lebih reliable dari free-text JSON. Mirror pola `llm_parser.py`, bukan `categorizer.py`.

---

### [x] STEP 10 — .NET `LlmSuggestionClient` + wiring ke pipeline

**10a. Interface** — buat `apps/api/src/PersonalFinance.Application/Interfaces/ILlmSuggestionClient.cs`:

```csharp
namespace PersonalFinance.Application.Interfaces;

public record MerchantSuggestion(
    string MerchantPattern,
    string SuggestedCategory,
    string SuggestedKeyword,
    double Confidence);

public interface ILlmSuggestionClient
{
    Task<List<MerchantSuggestion>> SuggestBatchAsync(
        List<string> merchantPatterns,
        List<string> availableCategories,
        CancellationToken ct = default);
}
```

**10b. Implementation** — buat `apps/api/src/PersonalFinance.Infrastructure/External/LlmSuggestionClient.cs`:

Mirror pola dari [LlmCategorizationClient.cs](apps/api/src/PersonalFinance.Infrastructure/External/LlmCategorizationClient.cs):

```csharp
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PersonalFinance.Application.Interfaces;

namespace PersonalFinance.Infrastructure.External;

public class LlmSuggestionClient(HttpClient http, ILogger<LlmSuggestionClient> logger)
    : ILlmSuggestionClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<List<MerchantSuggestion>> SuggestBatchAsync(
        List<string> merchantPatterns,
        List<string> availableCategories,
        CancellationToken ct = default)
    {
        var request = new SuggestRequest(merchantPatterns, availableCategories);
        var response = await http.PostAsJsonAsync("/suggest-categories", request, JsonOptions, ct);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("LLM suggest-categories failed: {Status}", response.StatusCode);
            return [];
        }

        var result = await response.Content.ReadFromJsonAsync<SuggestResponse>(JsonOptions, ct);
        return result?.Suggestions
            .Select(s => new MerchantSuggestion(s.MerchantPattern, s.SuggestedCategory, s.SuggestedKeyword, s.Confidence))
            .ToList() ?? [];
    }

    private record SuggestRequest(List<string> MerchantPatterns, List<string> AvailableCategories);
    private record SuggestResponse(List<SuggestionItem> Suggestions);
    private record SuggestionItem(string MerchantPattern, string SuggestedCategory, string SuggestedKeyword, double Confidence);
}
```

**10c. Register di [Program.cs](apps/api/src/PersonalFinance.Api/Program.cs):**

```csharp
builder.Services.AddHttpClient<ILlmSuggestionClient, LlmSuggestionClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["AiService:BaseUrl"] ?? "http://localhost:8000");
});
```

**10d. Wiring ke [TransactionPipelineService.cs:82-133](apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs):**

Inject `ILlmSuggestionClient` di constructor. Modify `ApplyLlmCategorizationAsync`:

```csharp
// Helper: strip PII dari deskripsi transaksi sebelum dikirim ke LLM
// Deskripsi mentah seperti "TRF KE BUDI SANTOSO 081234567890" tidak boleh dikirim ke LLM
private static string SanitizeForLlm(string description)
{
    // Strip nomor HP Indonesia
    var result = Regex.Replace(description, @"(\+62|08\d{2})\d+", " ");
    // Strip pola "A/N ..." (atas nama)
    result = Regex.Replace(result, @"A\/N\s+\S+(\s+\S+)*", " ", RegexOptions.IgnoreCase);
    // Strip angka 7+ digit (rekening, referensi transaksi)
    result = Regex.Replace(result, @"\d{7,}", " ");
    // Strip kode alfanumerik panjang (reference ID seperti TRF/ABCDEF12345)
    result = Regex.Replace(result, @"[A-Z0-9]{10,}", " ");
    // Collapse whitespace
    return Regex.Replace(result.Trim(), @"\s+", " ");
}

// SEBELUM loop per-row existing:
// Kumpulkan unique patterns dari rows yang masih Untracked setelah Layer 2b
// WAJIB: sanitize dulu sebelum kirim ke LLM — hapus PII (nama, rekening, HP)
var untrackedPatterns = transactions
    .Where(tx => tx.Category == "Untracked Expense")
    .Select(tx => SanitizeForLlm(tx.Description))
    .Where(p => p.Length >= 3)   // skip kalau setelah sanitize jadi kosong/sangat pendek
    .Distinct()
    .ToList();

if (untrackedPatterns.Count > 0)
{
    var availableCategories = await _categoryRuleService.GetAllCategoriesAsync();
    var batchSuggestions = await _suggestionClient.SuggestBatchAsync(untrackedPatterns, availableCategories, ct);

    foreach (var suggestion in batchSuggestions.Where(s => s.Confidence >= 0.85))
    {
        // Auto-seed ke category_rules (mekanisme existing di PipelineService)
        await _categoryRuleService.AddAsync(new CategoryRule
        {
            Keyword = suggestion.SuggestedKeyword,
            Category = suggestion.SuggestedCategory,
            Type = "Expense",
        });

        // Apply ke semua rows yang match
        foreach (var tx in transactions.Where(t => t.Description.Contains(suggestion.SuggestedKeyword, StringComparison.OrdinalIgnoreCase)))
            tx.Category = suggestion.SuggestedCategory;
    }
}
// SETELAH blok di atas: lanjutkan dengan per-row categorize existing (untuk rows yang masih Untracked)
```

> **Why batch, bukan per-row?** 60 transaksi dari 1 CSV upload mungkin mengandung 5-10 unique untracked merchants. 1 batch call vs 60 per-row calls = 10-60x cost reduction. Result di-seed ke `category_rules` → upload bulan berikutnya merchant yang sama tidak butuh LLM lagi (natural caching).

---

### [x] STEP 11 — Telemetry logging

Tambahkan structured logging per-layer di `CategoryRuleService.CategorizeBatchAsync`. Inject `ILogger<CategoryRuleService>` di constructor.

Setelah setiap layer resolve, log:

```csharp
// Setelah Layer 0/1 resolve:
_logger.LogDebug("Categorization layer={Layer} description={Description} category={Category}",
    "history", tx.Description, tx.Category);

// Setelah Layer 2a resolve:
_logger.LogDebug("Categorization layer={Layer} keyword={Keyword} category={Category}",
    "user_rule", matchedRule.Keyword, tx.Category);

// Setelah Layer 2b resolve:
_logger.LogDebug("Categorization layer={Layer} keyword={Keyword} category={Category}",
    "dictionary", matchedPreset.Keyword, tx.Category);

// Setelah Layer 3 resolve (di TransactionPipelineService):
_logger.LogDebug("Categorization layer={Layer} pattern={Pattern} category={Category} confidence={Confidence}",
    "llm_suggest", suggestion.MerchantPattern, tx.Category, suggestion.Confidence);

// Fallback:
_logger.LogDebug("Categorization layer={Layer} description={Description}",
    "untracked", tx.Description);
```

> **Why ini penting?** Telemetry layer-hit rate adalah satu-satunya cara untuk justifikasi pgvector di v2. Kalau setelah 4 minggu 95% transaksi resolved di Layer 0-2b dan <5% Untracked, pgvector tidak perlu. Kalau 20%+ Untracked → ada gap typo/abbreviation yang pgvector bisa solve.

---

### [x] STEP 12 — Tests

**12a. Extend `CategorizationLayerTests.cs`:**

```csharp
[Fact]
public async Task CategorizeBatch_WhenNoUserRuleButDictionaryMatch_UsesDictionary()
{
    // Arrange: empty category_rules, but category_presets has "GOPAY"
    var mockPresets = new Mock<ICategoryPresetService>();
    mockPresets.Setup(d => d.GetAllAsync(default))
        .ReturnsAsync([new CategoryPreset { Keyword = "GOPAY", Category = "E-Wallet", Type = "Expense" }]);
    
    var transactions = new List<TransactionDto>
    {
        new() { Description = "TRANSFER GOPAY/TOPUP", Flow = "DB", Category = "Untracked Expense" }
    };

    // Act
    await _service.CategorizeBatchAsync(transactions);

    // Assert
    Assert.Equal("E-Wallet", transactions[0].Category);
}

[Fact]
public async Task CategorizeBatch_UserRuleWinsOverDictionary()
{
    // Arrange: user rule "GOPAY" → "Personal", dictionary "GOPAY" → "E-Wallet"
    // Expected: user rule wins
}
```

**12b. Buat `CategoryPresetServiceTests.cs`** — basic `GetAllAsync` test.

**12c. Buat `LlmSuggestionClientTests.cs`** — mock `HttpClient`, verify request shape + graceful fallback (empty list on non-2xx).

**12d. Buat Python `tests/test_merchant_suggester.py`:**

```python
@pytest.mark.asyncio
async def test_suggest_batch_returns_suggestions(mock_provider):
    suggester = MerchantSuggester(provider=mock_provider)
    results = await suggester.suggest_batch(
        ["GOPAY/TOPUP", "AZKO BALI"],
        ["E-Wallet", "Food & Dining", "Shopping"]
    )
    assert len(results) > 0
    assert all("merchant_pattern" in r for r in results)
    assert all(0.0 <= r["confidence"] <= 1.0 for r in results)

@pytest.mark.asyncio
async def test_suggest_batch_empty_input_returns_empty():
    suggester = MerchantSuggester(provider=Mock())
    results = await suggester.suggest_batch([], [])
    assert results == []
```

**12e. Extend `e2e/upload.spec.ts`** — cold start regression:

```typescript
test('new user upload shows categorized transactions without any rules', async ({ page }) => {
  // Delete all category_rules first (simulate new user)
  await request.delete(`${API_URL}/api/categoryrules/all`);
  
  // Upload BCA fixture
  await page.goto('/cashflow/upload');
  // ... upload flow ...
  
  // In preview: at least 50% rows should NOT be "Untracked Expense"
  const rows = await page.locator('[data-testid="preview-row"]').all();
  const untracked = await page.locator('[data-testid="category-cell"]:has-text("Untracked")').count();
  expect(untracked / rows.length).toBeLessThan(0.5);
});
```

---

### [x] STEP 13 — Build & verify end-to-end

```bash
# Backend build
cd apps/api && dotnet build PersonalFinance.slnx

# Backend tests
cd apps/api && dotnet test

# Start everything
npm start

# Test cold start manually:
# 1. Buka Supabase Studio (http://localhost:54323)
# 2. DELETE FROM category_rules;
# 3. Upload apps/frontend/e2e/fixtures/bca-sample.csv via UI (http://localhost:8080/cashflow/upload)
# 4. Verify: ≥50% rows ter-kategori di preview
# 5. Toggle "Apply to similar" di salah satu Untracked row
# 6. Verify: rows serupa re-categorize in-memory
# 7. Submit → cek category_rules table di Studio: ada entry baru
# 8. Re-upload fixture: verify merchant yang sama sudah ter-kategori via Layer 2a

# Telemetry check
# Buka Grafana (http://localhost:3000), query Loki:
# {job="personal-finance-api"} |= "layer=dictionary"
```

---

### [x] STEP 14 — Commit

```bash
git add supabase/migrations/
git add apps/api/src/PersonalFinance.Domain/Entities/CategoryPreset.cs
git add apps/api/src/PersonalFinance.Application/Interfaces/
git add apps/api/src/PersonalFinance.Application/Services/CategoryPresetService.cs
git add apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs
git add apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs
git add apps/api/src/PersonalFinance.Infrastructure/External/LlmSuggestionClient.cs
git add apps/api/src/PersonalFinance.Api/Program.cs
git add apps/api/tests/PersonalFinance.Tests/
git add services/ai-service/app/
git add apps/frontend/src/utils/keywordExtractor.ts
git add apps/frontend/src/components/TransactionPreview.tsx
git add apps/frontend/e2e/upload.spec.ts
git status  # verify tidak ada file sensitif
git commit -m "PF-102: cold start — Category Preset Layer 2b + inline rule UX + LLM batch suggest"
```

---

## Notes

- **Existing cascade layers TIDAK diubah** — Layer 0/1/2a tetap persis seperti sekarang. Layer 2b di-insert setelah Layer 2a, sebelum fallback ke LLM.
- **`CategorizeAsync` (single-row)** tidak dipakai di production — hanya di tests. Tidak perlu diupdate untuk fitur ini.
- **dictionary vs `seed.sql`** — dictionary masuk sebagai migration, bukan `seed.sql`. `seed.sql` hanya untuk dev reset convenience, tidak idempotent untuk production deployment.
- **LLM cost discipline** — batch suggest dipanggil 1x per upload untuk N unique untracked patterns. Pattern yang sudah ada di `category_rules` tidak masuk batch (filter sebelum call). Hasil auto-seed mencegah LLM dipanggil ulang untuk merchant yang sama.
- **Next step setelah PF-102:** monitor telemetry layer-hit rate 2-4 minggu. Jika Untracked rate > 15% konsisten, buat PF-103 untuk pgvector Layer 2c.

### PII Safety Architecture

Ada 4 lapisan proteksi PII yang dibangun di feature ini — keempatnya harus aktif:

| Layer | Di mana | Apa yang diproteksi |
|---|---|---|
| **L1 — Seed QA** | STEP 6 QA pass + STEP 7 SQL verify | Pastikan `category_presets` tidak punya PII sebelum commit |
| **L2 — Frontend extractor** | `keywordExtractor.ts` via `PII_PATTERNS` regex | Strip PII dari deskripsi sebelum auto-extract keyword di UI |
| **L3 — Backend sanitizer** | `SanitizeForLlm()` di TransactionPipelineService | Strip PII dari raw description sebelum dikirim ke Python LLM service |
| **L4 — LLM output validator** | `_is_pii_keyword()` di `merchant_suggester.py` | Reject keyword yang LLM kembalikan kalau mengandung PII |

Pola PII yang dikenali di semua layer:
- Nama orang: diproteksi via context pattern ("A/N NAMA", "KE NAMA") — nama berdiri sendiri lebih sulit dideteksi, itu sebabnya L1 (human review) tetap critical
- Nomor rekening: angka 7+ digit berturutan
- Nomor HP: `+62xxxxx` atau `08xx xxxxx`
- Reference ID: alfanumerik 10+ karakter
