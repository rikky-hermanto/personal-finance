# Categorization — Actual Call Paths

> **Code reviewed:** 2026-10-08. Reference for debugging import and category decisions. A service's existence does not establish that every upload invokes it.

## Standard upload and preview Suggest

The normal browser uses POST /api/transactions/upload-preview. The controller selects a parser (or image extraction), resolves account IDs and tags duplicates. BCA CSV, standard CSV and LLM PDF parsers call CategoryRuleService.CategorizeBatchAsync. NeoBank and image extraction do not call the complete TransactionPipelineService. Source category values may already be present.

In the preview, optional bulk Suggest calls POST /api/transactions/categorize-preview → CategorizePreviewCommand → ILlmSuggestionClient → Python /suggest-categories. It does not call /categorize, /categorize-agent or Jev. Submit saves explicit preview rules through EnsureCategoryRulesAsync, resolves accounts and persists nonduplicates.

## Deterministic service order

CategoryRuleService.CategorizeBatchAsync applies:

1. Preserve already-populated non-Uncategorized categories. The executable filter is category-based; it does not require both a nondefault Type and Category despite older comments.
2. Load categorized history once and build separate exact normalized description/remarks dictionaries keyed by flow. Duplicate history keys use GroupBy(...).First(), not a majority vote. Normalization lowercases/collapses whitespace; it is not fuzzy merchant matching.
3. Try description history, then remarks history.
4. For unresolved rows, load user rules and presets and apply flow/type-aware keyword matching with longer keywords preferred.
5. Keep unresolved rows for manual review or a caller's subsequent AI stage.

No measured universal cache/rule/LLM resolution percentages are established by this implementation. Seeded rules/presets are baseline data; actual runtime counts can change.

## Full pipeline (implemented, limited caller)

TransactionPipelineService.ProcessAsync is registered, but the only reviewed call site is the CSV branch of experimental upload-preview-new. It normalizes dates/amounts/currency, rejects invalid rows, applies AI fallback to rows unresolved by parser-level categorization, and filters duplicates. The standard wizard does not call this service.

AI fallback first calls merchant batch suggestions, applying high-confidence results and creating rules. It then calls /categorize sequentially for remaining Uncategorized rows. Legacy per-row output may be applied below 0.85; that threshold gates rule creation, not acceptance of every category. Consumer category/confidence validation and rule_seed_allowed are separate guards.

The pipeline sanitizes description text before merchant-pattern suggestions. Per-row requests also carry description/remarks/account display data. Do not describe this as complete PII protection across every provider path.

## Residual backend and Jev (PF-141)

Python /categorize uses an independent CATEGORIZATION_BACKEND switch:

| Backend | Behavior |
|---|---|
| llm (default) | Existing generative Categorizer using AI_PROVIDER; does not construct a TypeSafe client |
| jev (opt-in) | Closed-set choice, pinned model, configured acceptance threshold, timeout and abstention on no-match/low confidence/invalid output/provider failure |

CategorizeResponse contains category, bounded confidence and rule_seed_allowed. The .NET client canonicalizes against offered vocabulary, rejects invalid confidence, and defaults missing rule permission to false. Residual auto-seeding requires explicit permission AND confidence >=0.85. Jev never grants that permission; uncertain results remain Uncategorized. The earlier batch suggestion path can still create rules and is unchanged by Jev.

A versioned evaluator with 100 held-out cases plus 20 tuning cases is implemented. Live comparison, calibration, promotion and measured savings are pending; default remains llm. Enabling the backend does not connect the full pipeline to standard upload. Rollback changes the backend to llm and restarts the service without rewriting historical categories/rules.

## Separate agent path

POST /categorize-agent runs smolagents using search_category_rules, find_similar_transactions and list_all_categories. It exposes reasoning/tool-call information for demos/debugging and does not replace either preview Suggest or residual /categorize. Its learning plan records partial live smoke coverage; no performance/accuracy superiority is established here.

## Source and verification references

- [CategoryRuleService](../../apps/api/src/PersonalFinance.Application/Services/CategoryRuleService.cs)
- [TransactionPipelineService](../../apps/api/src/PersonalFinance.Application/Services/TransactionPipelineService.cs)
- [TransactionsController](../../apps/api/src/PersonalFinance.Api/Controllers/TransactionsController.cs)
- [Preview command](../../apps/api/src/PersonalFinance.Application/Commands/CategorizePreviewCommand.cs)
- [Residual client](../../apps/api/src/PersonalFinance.Infrastructure/External/LlmCategorizationClient.cs)
- [Categorization factory](../../services/ai-service/app/services/categorization_factory.py), [Jev backend](../../services/ai-service/app/services/jev_categorizer.py)
- [PF-141 plan](../../.claude/plans/PF-141-jev-categorizer-todo.md), [service README](../../services/ai-service/README.md), [current status](../STATUS.md)

Mock/pure tests exist for deterministic layers, suggestion/residual clients and Jev boundaries. Historical integration skips and live-evaluation gaps remain; no new runtime test was performed by this documentation sync.
