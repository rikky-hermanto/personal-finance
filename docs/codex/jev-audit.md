# Jev opportunity audit — 2026-09-26

> **Follow-up status (2026-10-08):** The application categorizer opportunity was implemented under [PF-141](../../.claude/plans/PF-141-jev-categorizer-todo.md). It remains opt-in/default-disabled pending live evaluation and promotion; no measured savings are established. The audit below preserves its original opportunity assessment. See [current status](../STATUS.md).

Prepared with the installed official TypeSafe skill before integration changes.
Scope: visible repository call sites; no other conversations, production traces
or private statement files were accessed. No production code was changed.

All locations below are under `services/ai-service/app/`. Provider call-site
searches covered Python services/agents and API C# sources. Current cost and
latency are **unknown for every row**: provider token/cost instrumentation exists,
but measured traces were not available. Comments calling something cheap are not
measurements. Defaults include Gemini and Anthropic providers; runtime settings
were not inferred from secret files.

Verified [Jev pricing](https://docs.typesafe.ai/models): $0.042 per million input
tokens, output free. Let **J(n) = n × $0.042 / 1,000,000**, where n is the actual
input-token count for state plus questions. For example J(1,000) = $0.000042;
that is arithmetic, not a measured request cost. Latency is unmeasured.

| Location | Current job | Shape / smallest Jev replacement | Current cost/latency | Expected Jev cost | Failure impact | Reversibility | Recommendation |
|---|---|---|---|---|---|---|---|
| `services/categorizer.py:Categorizer.categorize` | Choose category and confidence | Choice among permitted categories plus no-match | Unknown | J(n) per transaction | Wrong cashflow classification | User-visible, recoverable | Good candidate; validate category and retain review fallback |
| `services/query_planner.py:QueryPlanner.plan` | Select aggregate/lookup, category filters, flow, dates | Choice for intent/flow; Noul per category; validated date resolution retained | Unknown | J(n) per question batch | Misleading totals from wrong filters | User-visible degradation | Needs guardrails; partial replacement |
| `services/merchant_suggester.py:MerchantSuggester.suggest_batch` | Category and reusable keyword suggestions | Choice per merchant; select only precomputed safe keywords | Unknown | J(n) per batch | Bad rule propagates to many records; PII keyword risk | Consequential | Needs guardrails and existing PII validation |
| `agents/financial_advisor.py:call_agent` | Choose tools and synthesize advice | Choice for initial read-only tool route with validated arguments | Unknown | J(n) per routing step; generation remains | Wrong/missing evidence and misleading advice | Consequential | Needs guardrails; retain reasoning LLM |
| `services/followup_suggester.py:FollowUpSuggester.suggest` | Generate three next questions | Score a bounded template catalog; render self-contained dates/categories in code | Unknown | J(n) per catalog batch | Irrelevant or unanswerable chips | Easy to recover | Good experiment; requires new templates, not direct replacement |
| `services/journey_advisor.py:JourneyAdvisor.advise` | Generate quests, difficulty and estimated gain | Score/Choice approved quests; calculate gains deterministically | Unknown | J(n) per catalog batch | Inappropriate priority or misleading gains | User-visible / consequential | Needs guardrails; preserve methodology |
| `services/portfolio_reviewer.py:PortfolioReviewer.review` | Portfolio recommendations, labels, scores and narrative | Choice/Score only for bounded evidence screens | Unknown | J(n) added per screen; synthesis remains | Misleading investment decisions | Consequential | Keep existing LLM for synthesis; validate financial logic independently |
| `services/llm_parser.py:LlmParser.parse/parse_image` | Full transaction extraction | Noul field verification / Choice among pre-parsed text candidates | Unknown | J(n) added per verification batch | Wrong dates, amounts, DB/CR semantics | Consequential | Keep extraction; Jev is text-only and cannot replace vision |
| `services/answerer.py:AnswerService` and streaming calls in `main.py` | Narrate totals and answer with evidence | Noul evidence sufficiency / Choice support-versus-contradiction | Unknown | J(n) added per check | Unsupported financial answer | Consequential | Keep generation; test bounded verification |

The last rows contain judgments embedded in generative jobs; they are not
standalone classification calls and would not disappear by swapping providers.
`services/reranker.py` uses local FlashRank MiniLM, not a paid generative LLM.
Embedding calls produce vectors, and `should_continue` uses deterministic graph
state. Neither is an obvious Jev replacement. Bank-specific prompt dispatch is
already a deterministic map; preserve it for known formats.

Potential features, subject to Indonesian-language evaluation and measured cost:

- An ambiguity queue for category suggestions with user corrections.
- Text-field verification before statement import, retaining exact numeric checks.
- Evidence-support checks on advisor answers and transparent unevaluated states.
- Low-cost ranking of self-contained follow-up templates.
- Ranking approved Journey quests without inventing score gains.
- Development-agent routing between focused inspection and a broader review.

These are opportunities, not implemented features. The installation task adds
only development support. Do not transmit real bank records during smoke tests.
