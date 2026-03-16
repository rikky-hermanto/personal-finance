# Bank Profiles Reference

Each bank is defined by a configuration profile (JSON/YAML). Adding a new bank = adding a config file, not writing code.

> **Source:** Extracted from CLAUDE.md — Bank Profiles section

## Bank Summary

| Bank | Format | Parser Strategy | Special Handling |
|------|--------|----------------|-----------------|
| BCA | CSV | Direct parser | Column mapping, DD/MM/YYYY dates |
| Superbank | PDF | LLM extraction | Multi-page statement, structured tables |
| NeoBank | PDF | LLM extraction | Colored/styled PDF, less structured |
| Wise | CSV | Direct parser | Multi-currency, FX rate conversion to IDR |
| Bank Jago | Screenshot | LLM extraction (vision) | Mobile app screenshots, OCR via vision API |

## Profile Schema — CSV Bank (BCA example)

```yaml
# bank-profiles/bca.yaml
bank_id: bca
display_name: "BCA"
format: csv
parser: direct_csv
date_format: "DD/MM/YYYY"
decimal_separator: ","
thousands_separator: "."
currency: "IDR"
column_mapping:
  date: 0
  description: 1
  debit: 3
  credit: 4
  balance: 5
```

## Profile Schema — LLM Bank (Superbank example)

```yaml
# bank-profiles/superbank.yaml
bank_id: superbank
display_name: "Superbank"
format: pdf
parser: llm_extraction
currency: "IDR"
llm_prompt_template: "superbank_pdf_v1"
extraction_model: "claude-sonnet"  # cost-efficient for extraction
```

## Adding a New Bank

- **CSV bank** → Create YAML profile + implement `IBankStatementParser` in .NET `Infrastructure/BankParsers/`
- **PDF/image bank** → Create YAML profile + create prompt template in `services/ai-service/app/prompts/` → use `/add-llm-extractor` skill

See THINK-01 in `.claude/rules/governance.md` for the routing decision rule.
