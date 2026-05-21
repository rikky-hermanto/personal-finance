# PF-104 — Final Recommendation: Format-Drift Tolerant BCA CSV Parser
 
## Context

BCA mengubah surface formatting CSV statement (delimiter `,` → `;`, amount `800000.00` → ` Rp800,000.00 `, header whitespace berbeda), tapi schema kolom dan semantic identik. Parser existing breaks karena tiga literal hard-coding:

1. [`BankIdentifier.cs:25`](apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs#L25) — substring match literal `"Tanggal,Keterangan,Cabang,Jumlah,,Saldo"`.
2. [`BcaCsvParser.cs:28`](apps/api/src/PersonalFinance.Infrastructure/Parsers/BcaCsvParser.cs#L28) — header detection literal yang sama.
3. [`BcaCsvParser.cs:54, 119-135`](apps/api/src/PersonalFinance.Infrastructure/Parsers/BcaCsvParser.cs#L54) — `decimal.TryParse` choke pada `Rp` prefix; `SplitCsvLine` hard-coded `,`.

**Goal jangka panjang:** Parser harus survive **future format drift** (BCA, atau bank lain dengan format mirip) **tanpa code change**. Setiap kali BCA tweak export, kita TIDAK ubah `BcaCsvParser.cs`.

---

## Architectural Principle: Anchor to Semantics, Not Bytes

Existing code mengikat ke **byte literal** (`"Tanggal,Keterangan,..."`). Solusi baru mengikat ke **semantic identity** kolom (token `TANGGAL`, `KETERANGAN`, `JUMLAH`, `SALDO` apapun delimiter/whitespace/casing).

| Layer                  | Old (byte-anchored)                  | New (semantic-anchored)                                 |
|------------------------|--------------------------------------|----------------------------------------------------------|
| Bank identification    | Literal substring of header line     | Token-set match (4 required header tokens + reinforcement) |
| Header location        | Literal `StartsWith` check           | Token-set scan first 15 lines                            |
| Delimiter              | Hard-coded `,`                       | Frequency count on header line (`,` vs `;` vs `\t`)       |
| Column position        | Index 0..5 hard-coded                | Lookup by normalized header name                         |
| Amount parsing         | `decimal.TryParse` raw               | `CsvAmountParser` (handles `Rp`, EU/US, parens, ambiguous) |
| Footer terminator      | `StartsWith("Saldo Awal")` literal   | `StartsWith("Saldo ", IgnoreCase)` — covers `Awal`/`Akhir`/future |

---

## What Future Format Changes Are Auto-Handled (No Code Touch)

Architecture ini **survive future drift** untuk semua kategori berikut tanpa modifikasi `BcaCsvParser.cs`:

| Kategori drift                                                | Contoh future change                                    | Auto-handled? |
|---------------------------------------------------------------|----------------------------------------------------------|---------------|
| **Delimiter swap**                                            | `,` → `;` → `\t` → balik `,`                              | YES           |
| **Header whitespace / casing**                                | `Tanggal` → ` TANGGAL ` → `tanggal `                      | YES           |
| **Currency prefix di amount**                                 | `800000.00` → `Rp800,000.00` → `IDR 800.000,00` → `$800` | YES (via `CsvAmountParser`) |
| **Thousands separator style**                                 | `1,000,000.00` (US) ↔ `1.000.000,00` (EU)                | YES           |
| **Decimal separator style**                                   | `.` ↔ `,` (auto-disambiguated dengan heuristic)          | YES           |
| **Negative format**                                           | `-100` ↔ `(100)` ↔ `100 DR`                              | YES (parens + flow column independent) |
| **Padding/whitespace di amount cell**                         | `800000.00` → ` Rp800,000.00 `                           | YES           |
| **Column reordering** (selama header kolom utama tetap ada)   | `Tanggal,Saldo,Keterangan,Jumlah,...`                    | YES (header-name lookup) |
| **Header line moved**                                         | Preamble jadi 5 baris bukan 3                            | YES (scan 15 lines) |
| **Footer label berubah**                                      | `Saldo Awal` → `Saldo Pembukaan` → `Saldo Bulanan`       | YES (prefix `Saldo ` match) |
| **Date format minor variant**                                 | `dd/MM/yyyy` ↔ `d/M/yy` ↔ `dd/MM`                        | YES (`ParseBcaDate` already covers) |
| **Apostrophe quirk pada date/branch**                         | `'01/02` (CSV escape Excel)                              | YES (existing trim) |

## What Still Requires Code Change (Honest Disclosure)

Kategori berikut **tidak** auto-handled — perlu touch kode, tapi sebagian besar **hanya menambah entry, bukan refactor**:

| Kategori drift                                                | Future change                                            | Effort                    |
|---------------------------------------------------------------|----------------------------------------------------------|----------------------------|
| **Header rename (semantic shift)**                            | `Tanggal` → `Tgl` → `Date`                               | Tambah alias di `HeaderTokens` (1 line) |
| **New required column**                                       | BCA tambah kolom `Reference No` yang harus di-capture    | Schema + DTO change (cross-service contract) |
| **Multi-line transaction wrapping**                           | Description span 2 baris CSV                              | Parser logic change       |
| **Switch ke fixed-width / non-CSV**                           | BCA pindah ke TXT positional layout                      | New parser class          |
| **New flow values selain `DB`/`CR`**                          | Tambah `RV` (reversal), `FE` (fee)                       | Type mapping (1-2 lines)   |

**Implication:** Untuk 12+ kategori drift surface-level (yang justru paling sering terjadi), zero code change. Untuk drift yang menyentuh **schema** atau **layout fundamental**, code change diperlukan — tapi ini drift kategori yang memang justified butuh review.

Untuk **full YAML-driven profile system** (e.g. menambah bank baru = config file saja, tanpa class C# baru) — itu scope **PF-045**, bukan PF-104. Refactor ini meletakkan foundation: `BcaCsvParser` bisa di-generalize ke `ProfiledCsvParser` di PF-045 dengan minimal effort.

---

## Implementation

### Files to modify

- [x] [`BankIdentifier.cs`](apps/api/src/PersonalFinance.Infrastructure/Parsers/BankIdentifier.cs) — Replace literal substring match dengan token-set detector. Private `Tokenize(string line)` helper: `Regex.Split(line, "[,;\\t]")` → trim → uppercase. BCA fingerprint: `tokens` contains `TANGGAL` ∧ `KETERANGAN` ∧ `JUMLAH` ∧ `SALDO`. Reinforcement: also require `NO. REKENING` atau `REKENING` token di first 5 lines (mitigates over-match). STANDARD detection: keep existing logic via same `Tokenize`.
- [x] [`BcaCsvParser.cs`](apps/api/src/PersonalFinance.Infrastructure/Parsers/BcaCsvParser.cs) — Rewrite `ParseAsync`: (1) scan until header found via token-set; (2) detect delimiter dengan frequency count di header line, pass eksplisit ke CsvHelper `Configuration.Delimiter`; (3) build column-index map by normalized header name (`TANGGAL`→idx, `KETERANGAN`→idx, `JUMLAH`→idx, `SALDO`→idx); flow column = `JUMLAH`+1 (BCA exports tanpa header); (4) per-row: `ParseBcaDate(row[dateIdx])`, trim apostrophe pada description, `CsvAmountParser.Parse(row[amountIdx])`, flow trim+upper, balance optional; (5) terminate ketika first column starts with `"Saldo "` (case-insensitive) atau row blank. Drop `SplitCsvLine`. Keep `ParseBcaDate`. Inline BCA constants (header tokens, date formats, default category) di parser.
- [x] [`DefaultCsvParser.cs`](apps/api/src/PersonalFinance.Infrastructure/Parsers/DefaultCsvParser.cs) — Replace inline `ParseAmount` dengan call ke `CsvAmountParser.Parse`. Pure refactor, no behavior change.

### Files to add

- [x] `apps/api/src/PersonalFinance.Infrastructure/Parsers/Shared/CsvAmountParser.cs` — Static helper, extracted dari `DefaultCsvParser.ParseAmount`. Handles `Rp`/`$`/`IDR` prefix, parens negatives, US `1,234.56`, EU `1.000,56`, ambiguous comma `931,51`. Public API: `Parse(string)` throws `FormatException`, `TryParse(string, out decimal)`.
- [x] `apps/api/tests/PersonalFinance.Tests/Parsers/CsvAmountParserTests.cs` — Cover `Rp` prefix (` Rp800,000.00 ` → `800000.00m`), parens negatives, EU/US formats, ambiguous comma, empty/whitespace.
- [x] `apps/api/tests/PersonalFinance.Tests/Parsers/BankIdentifierTests.cs` — `[Theory]` kedua fixture → `"BCA"`. Generic Date/Description/Amount → `"STANDARD"`. Gibberish → `null`. STANDARD fallback CSV dengan delimiter `;` (negative test for over-match).
- [x] `apps/api/tests/PersonalFinance.Tests/Parsers/BcaCsvParserTests.cs` — `[Theory]` kedua fixture → identical 60 transaksi (date, description, amount, flow, balance match). Footer detection regardless of delimiter. CR/DB sums match footer (`57,600,000` / `58,370,326`).
- [x] `apps/api/tests/PersonalFinance.Tests/Fixtures/Bca/sample_bca_working.csv` — Anonymized mock.
- [x] `apps/api/tests/PersonalFinance.Tests/Fixtures/Bca/sample_bca_notworking.csv` — Anonymized mock.

### Reused (no new code)

- `CsvHelper` package — sudah dependency di `Infrastructure.csproj`.
- `ICategoryRuleService.CategorizeBatchAsync` — unchanged, still called di end of parse.
- DI registration di [`Program.cs:79-96`](apps/api/src/PersonalFinance.Api/Program.cs#L79-L96) — unchanged (same class name, same `"BCA"` key).

### YAGNI deferrals (explicit)

- **`BcaProfile` static class** — defer ke PF-045. Inline constants di parser cukup untuk PF-104.
- **`CsvHeaderTokens` shared file** — inline `Tokenize` sebagai `private static` di kedua caller. Re-extract kalau parser ke-3 butuh.
- **Full YAML profile loader** — scope PF-045, bukan PF-104.

---

## Verification

### Unit tests

```csharp
// BcaCsvParserTests.cs
[Theory]
[InlineData("sample_bca_working.csv")]   // old format
[InlineData("sample_bca_notworking.csv")] // new format
public async Task ParseAsync_BothFormats_ProduceIdenticalTransactionSet(string fixture)
{
    // Both files = same statement. Should parse to logically identical output.
    // Assert: 5 transactions
    //         first row: date=01/02, desc="TRANSFER IN FROM JANE DOE...", amount=500000m, flow=CR, balance=1500000.00m
    //         last row:  balance=2150000.00m
    //         sum(CR) = 1_500_000m, sum(DB) = 350_000m
}
```

```csharp
// BankIdentifierTests.cs
[Theory]
[InlineData("sample_bca_working.csv", "BCA")]
[InlineData("sample_bca_notworking.csv", "BCA")]
public async Task IdentifyAsync_BcaFixtures_ReturnsBca(string fixture, string expected) { ... }

[Fact] public async Task IdentifyAsync_StandardCsv_ReturnsStandard() { ... }
[Fact] public async Task IdentifyAsync_GibberishCsv_ReturnsNull() { ... }
[Fact] public async Task IdentifyAsync_TanggalSemicolonNoRekening_ReturnsNull() { ... } // over-match guard
```

### Manual end-to-end

- [x] `cd apps/api && dotnet test --filter "FullyQualifiedName~Parsers"` — semua hijau.
- [x] Start full stack: `npm start` (di repo root).
- [x] Upload `sample_bca_notworking.csv` via `/cashflow/upload` — Identifier → `"BCA"` (no "Bank format not recognised" toast), preview 5 baris, amount numeric (no `Rp`), sum CR = 1,500,000, sum DB = 350,000.
- [x] Upload `sample_bca_working.csv` (regression) — hasil identik dengan step sebelumnya.
- [x] (Optional) Extend `e2e/upload.spec.ts` untuk cover new fixture.

### Acceptance criteria

- [x] Kedua BCA fixture parse ke `TransactionDto[]` yang logically identical (modulo decimal precision).
- [x] `BankIdentifier` returns `"BCA"` untuk both fixtures, `"STANDARD"` untuk Date/Description/Amount CSV, `null` untuk gibberish.
- [x] Tidak ada regression di existing `DefaultCsvParser` test set setelah `ParseAmount` extraction.
- [x] Tidak ada package dependency baru.
- [x] No `Console.WriteLine` (CODE-05). `ILogger<T>` di setiap class baru/changed (ERR-02).
- [x] No literal substring match `"Tanggal,Keterangan,..."` di kode setelah refactor (grep guard di code review).

---

## Risks & Rollback

| Risk | Mitigation |
|------|------------|
| Token-set match terlalu liberal → match non-BCA file | Reinforcement token: require `NO. REKENING` atau `REKENING` di first 5 lines |
| CsvHelper auto-delimiter misfire jika description punya `;` di tengah | Detect delimiter eksplisit dari header line (frequency count), pass ke `Configuration.Delimiter` — JANGAN pakai `DetectDelimiter = true` |
| `CsvAmountParser` extraction breaks `DefaultCsvParser` regression | Pure refactor — same code, beda lokasi. Existing tests cover. Run full test suite sebelum merge. |
| Footer terminator `"Saldo "` over-match on transaction description starting dengan "Saldo" | Cek di first column saja (after split), bukan substring di full line |

**Rollback:** Revert 3 modified files (`BankIdentifier.cs`, `BcaCsvParser.cs`, `DefaultCsvParser.cs`). New shared utility + tests adalah additive — drop kapan saja tanpa risiko.

---

## Out of Scope

| Item | Defer ke |
|------|----------|
| YAML bank-profile loader (config-driven banks) | PF-045 |
| `BcaProfile` static class extraction | PF-045 |
| Wise CSV parser dengan FX rate conversion | Separate ticket |
| PDF/screenshot parser robustness | Out of band (LLM service path, tidak terdampak) |

---

## Why This Solves the "Stop Touching Code" Problem

User concern: *"Jangan tiap perubahan format, saya harus ubah code berulang-ulang."*

**Sebelum (current state):**
- BCA ubah delimiter `,` → `;` → **code change required** (literal patch).
- BCA tambah `Rp` prefix → **code change required** (parser logic patch).
- BCA tambah whitespace di header → **code change required** (substring fix).

**Sesudah (architecture ini):**
- BCA ubah delimiter ke `\t` next year → **zero code change**. Auto-detected.
- BCA balik ke format lama → **zero code change**. Both formats parse via same code path.
- BCA pindah currency display ke `IDR` instead of `Rp` → **zero code change**. `CsvAmountParser` handles both.
- BCA reorder columns (`Saldo` jadi kolom kedua) → **zero code change**. Header-name lookup, bukan index.
- BCA tweak footer ke `Saldo Pembukaan` → **zero code change**. Prefix match `"Saldo "`.

**Code change masih dibutuhkan untuk:** schema additions, semantic header rename (`Tanggal` → `Date`), atau format fundamental shift (CSV → fixed-width). Ini drift kategori yang memang **wajib** review human — tidak bisa di-auto-handle tanpa risk silent data corruption.

Foundation ini juga **forward-compatible dengan PF-045** — kalau nanti kita mau bank baru = config file, refactor PF-045 tinggal generalize `BcaCsvParser` → `ProfiledCsvParser` dengan `BankProfile` loaded dari YAML. Tidak ada throw-away work.
