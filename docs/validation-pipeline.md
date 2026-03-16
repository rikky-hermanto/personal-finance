# Validation Pipeline & Master Cashflow Schema

> **Source:** Extracted from CLAUDE.md — Validation Pipeline and Master Cashflow Schema sections

## Validation Pipeline

The validation layer runs on ALL parsed output regardless of source parser. This is the component that eliminates the manual "check format, fix dates, fix decimals" pain:

1. **DateNormalizer** — converts any date format to ISO 8601 (YYYY-MM-DD)
2. **DecimalFixer** — detects and normalizes decimal/thousands separators (Indonesian convention: 1.000.000,50 → 1000000.50)
3. **CurrencyStandardizer** — ensures consistent currency codes, handles Wise multi-currency → IDR conversion
4. **SchemaValidator** — validates against master cashflow schema (required fields, types, ranges)
5. **DeduplicateCheck** — detects duplicate transactions across uploads (same date + amount + description hash)

Implementation: `IValidationPipeline` in `apps/api/src/PersonalFinance.Infrastructure/Validation/`

## Master Cashflow Schema

All banks converge to this unified schema before persisting:

```
Transaction {
  date: Date           // ISO 8601
  description: string  // original bank description
  amount: decimal(18,4)// positive for credit, negative for debit
  currency: string     // ISO 4217 (IDR, USD, EUR, etc.)
  amount_idr: decimal  // converted amount in IDR (for Wise multi-currency)
  type: enum           // DEBIT | CREDIT
  bank_id: string      // references bank profile
  account_name: string // e.g. "Jago Main Pocket", "BCA Checking"
  category: string     // auto-categorized by LLM or rule-based
  raw_text: string     // original unparsed line (for audit/debugging)
  source_file: string  // original filename
  fx_rate: decimal?    // exchange rate used (Wise only)
}
```

### .NET DTO (C#)

The actual C# DTO is at `apps/api/src/PersonalFinance.Application/Dtos/TransactionDto.cs`. Fields: `Date`, `Description`, `Remarks`, `Flow` ("DB"/"CR"), `Type` ("Expense"/"Income"), `Category`, `Wallet`, `AmountIdr`, `Currency`, `ExchangeRate`, `Balance`.

This is the **cross-service contract** between .NET and Python — see THINK-05 in `.claude/rules/governance.md`.
