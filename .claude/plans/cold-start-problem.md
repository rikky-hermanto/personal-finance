# Cold Start Problem — Smart Defaults via Curated Merchant Dictionary

## Context

User baru = `category_rules` kosong = 100% transaksi muncul "Untracked Expense" di preview pertama → leave-the-app moment. Ini pain point #1 cash tracker apps di pasar.

Dua dev mengusulkan solusi (A: silent System Rules cascade dengan Copy-on-Write, B: tabel `merchant_dictionary` terpisah + pgvector + LLM batch suggest dengan promote-on-edit). Setelah verifikasi kondisi proyek aktual, plan ini menggabungkan kekuatan keduanya — adopt struktur Dev B (tabel terpisah, batch LLM, seeding migration), pinjam framing "Copy-on-Write" Dev A (silent override), defer pgvector ke v2 berbasis telemetri.

**Tujuan:** user baru upload statement pertama → ≥80% transaksi auto-kategori "ajaib" tanpa lihat satu rule pun di UI Settings. UX inline "Apply to similar" memberi user mekanisme one-click rule creation tanpa context-switch.

**Out of scope (defer ke v2):** pgvector fuzzy match, retroactive re-categorization saat dictionary di-update.

---

## Architectural Decision Record

| Decision | Choice | Rationale |
|---|---|---|
| Storage model | **Tabel terpisah `merchant_dictionary`** (bukan flag `is_system` pada `category_rules`) | Aligned dengan PF-S08 multi-tenancy (user rules akan punya `user_id`, dictionary tetap global). Lifecycle berbeda: dictionary versioned via migrations, user rules per-user mutable. RLS lebih clean. |
| Cascade position | **Dictionary jadi Layer 2b**, di-merge in-memory dengan user `category_rules` saat batch categorize | Reuse pola `Order("keyword_length", Descending)` server-side sort + 3-tier in-memory loop existing. User rules tetap menang via priority discriminator. |
| Override UX | **Copy-on-Write silent** — saat user edit kategori dari row yang ter-resolve via dictionary, sistem create user rule baru tanpa prompt | Konsisten dengan auto-seed mechanism existing di Layer 3 (`TransactionPipelineService.cs:118-131`). Zero friction, predictable. |
| Inline rule UX | **"Apply to similar" toggle** di sebelah dropdown kategori (Dev B opsi #1) | Reuse `TransactionDto.categoryRuleDto: any` yang sudah wired di submit pipe ([transactionsApi.ts:20](apps/frontend/src/api/transactionsApi.ts#L20)). Toggle = populate field, bukan tambah API call baru. |
| LLM integration | **Endpoint baru `/suggest-categories`** di Python service, batch input merchant patterns → batch output dengan confidence | Cost discipline (.claude/rules/ai-service.md): batch + DB-cached, bukan per-row. Pattern mirror `categorizer.py` + `LlmCategorizationClient.cs`. |
| pgvector fuzzy match | **Defer ke v2** | Tambah complexity (embedding compute, threshold tuning) tanpa data justifikasi. Tambahkan telemetry dulu di v1, evaluasi setelah 2-4 minggu. |
| Seeding strategy | **Hybrid: manual curate (~100 high-confidence) + LLM-generate (~200-300 dari curated fixtures, NOT user data)** | Privacy-safe (no real statements). Version-controlled sebagai SQL migration. ~300-500 entries total covering common Indonesian merchants. |

---

## Implementation Phases

### Phase 1 — Foundation: `merchant_dictionary` table + cascade engine

**1.1 Domain entity & schema**

- Create `apps/api/src/PersonalFinance.Domain/Entities/MerchantDictionary.cs` mirip [CategoryRule.cs](apps/api/src/PersonalFinance.Domain/Entities/CategoryRule.cs):
  ```
  [Table("merchant_dictionary")]
  - Id (int, PK)
  - Keyword (string, varchar(100))
  - Category (string, varchar(100))
  - Type (string, varchar(50))  // "Expense" | "Income"
  - Flow (string?, varchar(5))  // "DB" | "CR" | null
  - KeywordLength (int, computed)
  - Version (int)  // for future telemetry / dictionary versioning
  ```
- Create migration `supabase/migrations/{timestamp}_create_merchant_dictionary.sql` mengikuti pola [20260101000000_initial_schema.sql:18-25](supabase/migrations/20260101000000_initial_schema.sql).
- RLS: `ALTER TABLE merchant_dictionary ENABLE ROW LEVEL SECURITY;` + `CREATE POLICY allow_read_all ON merchant_dictionary FOR SELECT USING (true);` (read-only buat semua user, tidak ada INSERT/UPDATE/DELETE policy).

**1.2 Repository / service interface**

- Create `apps/api/src/PersonalFinance.Application/Interfaces/IMerchantDictionaryService.cs`:
  ```
  Task<List<MerchantDictionary>> GetAllAsync(CancellationToken ct = default);
  ```
- Create `apps/api/src/PersonalFinance.Application/Services/MerchantDictionaryService.cs` — thin Supabase reader.
- Register di [Program.cs](apps/api/src/PersonalFinance.Api/Program.cs#L95) sebagai `AddScoped`.

**1.3 Cascade integration di `CategorizeBatchAsync`**

Modify [CategoryRuleService.cs:117-160 (Layer 2)](apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs#L117-L160):

- Inject `IMerchantDictionaryService` di constructor.
- Dalam `CategorizeBatchAsync`: tambah satu Supabase round-trip ketiga (`merchantDict.GetAllAsync()`).
- Build cascade in-memory:
  ```
  Layer 2a (existing): user category_rules — 3-tier (flow-specific → flow-agnostic → cross-type)
  Layer 2b (NEW):      merchant_dictionary  — same 3-tier ordering
  ```
  Loop user rules dulu, kemudian dictionary. First-hit wins. Total: 3 round-trips per batch (PERF-01 tetap respected).

**1.4 Copy-on-Write override mechanism**

Modify [TransactionsController submit handler](apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs) atau equivalent:

- Saat user submit transaksi dengan `categoryRuleDto != null` (dari inline UX) DAN kategori berbeda dari yang akan di-resolve via dictionary:
  - Jangan tulis rule kalau categoryRuleDto sudah explicitly diset (dari "Apply to similar" toggle).
- Saat user EDIT kategori inline tanpa toggle "Apply to similar" (cuma 1 row override) DAN row tsb sebelumnya ter-resolve via merchant_dictionary:
  - Gunakan mekanisme `EnsureCategoryRulesAsync` existing untuk auto-create user rule dengan keyword dari dictionary entry.
  - Test apakah behavior ini sudah cocok dengan auto-seed di [TransactionPipelineService.cs:118-131](apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs#L118-L131) — kalau iya, no new code needed; kalau belum, tambah branch.

### Phase 2 — Inline "Apply to similar" UX

**2.1 Frontend toggle component**

Modify [TransactionPreview.tsx renderRow (lines 182-302)](apps/frontend/src/components/TransactionPreview.tsx#L182-L302):

- Tambah `<Checkbox>` "Apply to similar" di samping `<select>` kategori (line 221-229), visible saat `editingId === tx.id`.
- State baru: `applyToSimilarMap: Record<id, boolean>` di parent component.
- Saat user toggle ON dan ubah kategori:
  - Auto-extract keyword dari `tx.description` via heuristic ringan client-side (gunakan strategi: ambil 1-2 kata pertama yang bukan stop-word "KARTU", "DEBIT", "CREDIT", "TARIKAN", dll). Tampilkan keyword di UI sebagai chip yang bisa di-edit user kalau salah.
  - Re-categorize semua rows lain di `editedTransactions` yang descriptionnya match keyword tsb (in-memory mutation, no API call).
- Saat submit:
  - Untuk row dengan `applyToSimilar = true`, populate `categoryRuleDto: { keyword, category, type, flow }` di payload (field sudah ada di [transactionsApi.ts:20](apps/frontend/src/api/transactionsApi.ts#L20)).

**2.2 Stop-word list shared**

- Create `apps/frontend/src/utils/keywordExtractor.ts` dengan heuristic + stop-word list (Indonesian banking terms).
- Test fixture: extract `"AZKO"` dari `"KARTU DEBIT A435 AZKO BALI BAT"`, extract `"GOPAY"` dari `"GOPAY/TOPUP"`.

### Phase 3 — LLM Batch Suggest endpoint (selective fallback)

**3.1 Python `/suggest-categories` endpoint**

Mirror pattern [llm_parser.py](services/ai-service/app/services/llm_parser.py):

- Create `services/ai-service/app/services/merchant_suggester.py`:
  - `_SCHEMA = {"suggestions": [{"merchant_pattern", "suggested_category", "confidence", "suggested_keyword"}]}`
  - `_SYSTEM_PROMPT` — Indonesia merchant knowledge, pakai `available_categories` constraint mirip [categorizer.py](services/ai-service/app/services/categorizer.py).
  - Method `suggest_batch(patterns: list[str], available_categories: list[str]) -> list[Suggestion]`.
  - Use `provider.extract_structured(system, user, schema)` (bukan `generate_json`) untuk batch shape.
- Add Pydantic models di [models.py](services/ai-service/app/models.py): `SuggestCategoriesRequest` / `SuggestCategoriesResponse`.
- Register endpoint di [main.py](services/ai-service/app/main.py) flat-style mengikuti pola `/parse`, `/categorize`. Wire singleton di `lifespan` (line 36-44).

**3.2 .NET `LlmSuggestionClient`**

- Create `apps/api/src/PersonalFinance.Application/Interfaces/ILlmSuggestionClient.cs` dengan method `Task<List<MerchantSuggestion>> SuggestBatchAsync(List<string> patterns, List<string> availableCategories, CancellationToken ct)`.
- Create `apps/api/src/PersonalFinance.Infrastructure/External/LlmSuggestionClient.cs` mirip [LlmCategorizationClient.cs](apps/api/src/PersonalFinance.Infrastructure/External/LlmCategorizationClient.cs):
  - Same `JsonSerializerOptions` (SnakeCaseLower).
  - Same graceful fallback (return empty list on failure, log warning, no throw).
  - POST `/suggest-categories` via injected typed `HttpClient`.
- Register di [Program.cs](apps/api/src/PersonalFinance.Api/Program.cs) sebagai typed HttpClient.

**3.3 Wiring ke TransactionPipelineService**

Modify [TransactionPipelineService.ApplyLlmCategorizationAsync](apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs#L82-L133):

- Sebelum jalankan per-row LLM categorize loop existing (yang call `LlmCategorizationClient`), kumpulkan unique merchant patterns dari rows yang masih `Untracked Expense` setelah Layer 2b.
- Batch call `ILlmSuggestionClient.SuggestBatchAsync(patterns)` SEKALI.
- Untuk setiap suggestion confidence ≥ 0.85: insert ke `category_rules` (auto-seed, mekanisme existing) dengan keyword dari `suggested_keyword`. Apply ke semua rows matching.
- Untuk pattern yang LLM tidak yakin (< 0.85): leave as Untracked Expense, log telemetry.

**3.4 Cache layer**

Tidak perlu code baru. Cache = `category_rules` table itu sendiri. Kalau pattern sudah pernah di-suggest di upload sebelumnya, sudah ada user rule (atau auto-seeded rule) yang nge-match di Layer 2a — LLM tidak akan dipanggil ulang.

### Phase 4 — Seeding migration

**4.1 Generate seed data (offline, sebelum migration)**

- Tulis script `scripts/generate-merchant-dictionary.py` (di luar production code path):
  - Curated test fixtures: ambil sample anonymized dari `apps/frontend/e2e/fixtures/bca-sample.csv` + 1-2 fixture serupa.
  - Manual list ~100 high-confidence patterns (TARIKAN ATM, BIAYA ADMIN, GOPAY, OVO, DANA, SHOPEE, TOKOPEDIA, dll).
  - LLM-generate via Gemini structured output: prompt dengan curated samples + manual list, ask for 200-300 additional Indonesian merchant patterns dengan suggested category.
  - Output: SQL file dengan format mirip [seed.sql:1-17](supabase/seed.sql).
- QA pass: human review semua 300-500 entries (1-2 jam kerja).

**4.2 Commit sebagai migration**

- Save sebagai `supabase/migrations/{timestamp}_seed_merchant_dictionary.sql` (BUKAN di `seed.sql` — agar idempotent dan version-controlled per bank/category).

### Phase 5 — Telemetry (untuk justifikasi v2)

Tambah simple counter logging di `CategorizeBatchAsync`:

- Log per categorize: layer mana yang resolve (`history`, `user_rule`, `dictionary`, `llm`, `untracked`).
- Format: structured log via `ILogger` (existing instrumentation OTel akan capture).
- Dashboard di Grafana (LGTM stack PF-100): % transactions per layer over time. Ini yang akan justifikasi pgvector v2 kalau `untracked` rate > X%.

---

## Critical Files (modify) + Blast Radius

### New files
- `apps/api/src/PersonalFinance.Domain/Entities/MerchantDictionary.cs`
- `apps/api/src/PersonalFinance.Application/Interfaces/IMerchantDictionaryService.cs`
- `apps/api/src/PersonalFinance.Application/Interfaces/ILlmSuggestionClient.cs`
- `apps/api/src/PersonalFinance.Application/Services/MerchantDictionaryService.cs`
- `apps/api/src/PersonalFinance.Infrastructure/External/LlmSuggestionClient.cs`
- `services/ai-service/app/services/merchant_suggester.py`
- `apps/frontend/src/utils/keywordExtractor.ts`
- `supabase/migrations/{timestamp}_create_merchant_dictionary.sql`
- `supabase/migrations/{timestamp}_seed_merchant_dictionary.sql`

### Modified files
- [CategoryRuleService.cs:39-163](apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs#L39-L163) — add Layer 2b di cascade. **Affected tests: [CategorizationLayerTests.cs](apps/api/tests/PersonalFinance.Tests/Services/CategorizationLayerTests.cs), [CategoryRuleServiceTests.cs](apps/api/tests/PersonalFinance.Tests/Services/CategoryRuleServiceTests.cs)** — extend mocks.
- [TransactionPipelineService.cs:82-133](apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs#L82-L133) — refactor LLM step jadi batch suggest first.
- [Program.cs:95](apps/api/src/PersonalFinance.Api/Program.cs#L95) — register `MerchantDictionaryService` + `LlmSuggestionClient`.
- [TransactionPreview.tsx:182-302](apps/frontend/src/components/TransactionPreview.tsx#L182-L302) — add "Apply to similar" toggle + keyword chip.
- [main.py](services/ai-service/app/main.py) — register `/suggest-categories` endpoint.
- [models.py](services/ai-service/app/models.py) — add request/response models.

### NOT modified (intentionally)
- Settings UI Category Rules page — `merchant_dictionary` is hidden by design.
- `category_rules` table schema — no new column.
- Existing parsers (BcaCsvParser, NeoBankPdfParser, dll) — semua call `CategorizeBatchAsync`, perubahan transparent.

---

## Verification

### End-to-end manual test
1. **Reset state**: `supabase db reset` → apply migrations including new dictionary seed.
2. **Empty user state**: `DELETE FROM category_rules;` (simulate user baru).
3. **Upload BCA fixture**: pakai [e2e/fixtures/bca-sample.csv](apps/frontend/e2e/fixtures/bca-sample.csv) via UI.
4. **Expected**: ≥80% rows ter-kategori non-"Untracked Expense" di preview, padahal `category_rules` kosong.
5. **Toggle "Apply to similar"** di salah satu Untracked row → toggle ON → ubah kategori → verify rows lain dengan deskripsi serupa ikut berubah di preview.
6. **Submit** → verify `category_rules` table sekarang punya entry baru (user rule), `merchant_dictionary` tidak berubah.
7. **Re-upload fixture sama** → verify rows sekarang di-resolve via Layer 2a (user rule), bukan dictionary lagi.

### Automated tests
- Extend `CategorizationLayerTests.cs` — assert dictionary fallback hits when user rule absent.
- New `MerchantDictionaryServiceTests.cs` — basic GetAllAsync.
- New `LlmSuggestionClientTests.cs` — mock HttpClient, verify request shape + graceful fallback.
- New Python `tests/test_merchant_suggester.py` — mock provider, verify batch shape + tool_use schema.
- E2E: extend [e2e/upload.spec.ts](apps/frontend/e2e/upload.spec.ts) — assert preview shows non-empty categories on first upload (cold start regression test).

### Telemetry verification
- Run `npm start`, upload BCA fixture, open Grafana `http://localhost:3000`.
- Query Loki for layer-hit logs, verify all 4 layers (history/user_rule/dictionary/llm) ada entries.

---

## What's Deferred to v2

1. **pgvector fuzzy match (Layer 2c)** — implementasi setelah telemetry tunjukkan persisten Untracked rate untuk typo/variation. Threshold akan ditune berbasis data nyata.
2. **Retroactive re-categorization** saat dictionary di-update via migration baru. v1: forward-only.
3. **Dictionary versioning UI** — list "what's in the dictionary" untuk transparency. v1: hidden completely.
4. **Cross-bank vs per-bank rule scope** — sekarang flow-based discriminator sudah cukup; bank-scoping ditunda sampai ada user rule conflict nyata.
5. **Crowdsourced dictionary contribution** — long-term, butuh user base dulu.
