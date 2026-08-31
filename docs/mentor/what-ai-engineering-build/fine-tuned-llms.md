# Fine-Tuned LLMs for Specific Domains

> **Topic doc, not a plan.** This is the reference for one line from the AI Engineering field
> guide's list of what "AI-First" roles build: *fine-tuned LLMs for specific domains*
> (https://github.com/alexeygrigorev/ai-engineering-field-guide/blob/main/role/02-skills.md). It
> covers what fine-tuning actually is, when it earns its cost over the alternatives, and — honestly
> — whether this project would ever need it. It does not assign build steps; there is currently no
> ticket for this and this doc does not create one.
>
> **The honest headline up front:** this project uses **zero fine-tuning**, anywhere, today. Every
> LLM call in `services/ai-service` hits a stock model — `gemini-2.5-flash` or `claude-sonnet-4-6` —
> through prompting, structured output, and retrieval. That is not a gap to fill. For almost
> everything this project does, it is the *correct* call, and this doc explains why, concept by
> concept, before it asks whether that verdict ever flips.

---

## What it is

**Fine-tuning takes a pretrained model's weights and keeps training them — on your own labelled
examples — so the model's *behavior* changes, permanently, without you writing a longer prompt at
request time.** The knowledge (or the habit) gets baked into the weights instead of being handed to
the model fresh on every call.

That's the whole idea, and it's the part worth sitting with before any of the vocabulary below,
because it's also exactly where people confuse fine-tuning with the two things it's most often
mistaken for:

- **Not the same as prompting.** A prompt is text you send *every request*. It costs input tokens
  every time, and the model forgets it the instant the response finishes. A fine-tune changes what
  the model *already knows how to do* before a prompt even arrives — the "system prompt" can get
  shorter, sometimes to nothing.
- **Not the same as RAG.** RAG (this project has it — `services/ai-service/app/services/retriever.py`
  onward) hands the model *facts* at request time by retrieving them first. Fine-tuning does not
  teach a model new facts reliably — it teaches it a *behavior*: a format, a tone, a domain
  vocabulary, a way of handling edge cases. Asking a fine-tune to "know" that a user's June grocery
  spend was Rp 2.3M is the wrong tool; that's what retrieval is for.

### The concrete difference, using this project's own categorizer

The system prompt in [categorizer.py](../../../services/ai-service/app/services/categorizer.py)
reads, in full:

```
You are a personal finance transaction classifier.
Given a bank transaction, return the most appropriate category from the provided list.
Set confidence to a value between 0.0 and 1.0 reflecting how certain you are.
If no category clearly fits, pick the closest one and set confidence below 0.5.
Never invent categories outside the provided list.
```

**Prompting** (what this project does): send that text plus the transaction, every single call,
to `gemini-2.5-flash`. The model has never seen this exact task before in training — it's inferring
"classifier behavior" from the instruction, live, on general-purpose weights.

**Fine-tuning** (the alternative): collect a few thousand labelled `(transaction_text, category)`
pairs, train a small open-weights model on them until it reliably outputs the right category with
little or no instruction at all, then serve that specialized model instead. The classifier behavior
is now a property of the weights, not of the prompt.

Both approaches solve the same task. They trade off completely different things, which is Part 1.

### What it's used for, generally

| Job | What fine-tuning buys over prompting |
|-----|---------------------------------------|
| **Narrow, repeated classification/extraction at massive volume** | Cuts per-call cost and latency once volume is high enough to amortize training cost |
| **A house style or voice that a prompt can't reliably hold** | The model *is* that voice, rather than being reminded to sound like it every call |
| **A domain vocabulary or jargon the base model handles poorly** | Legal, medical, or region-specific language (e.g. Indonesian banking shorthand) baked in rather than defined in-prompt each time |
| **Following a rigid output format under adversarial or messy input** | More robust than "please always respond in this JSON shape," especially on a smaller/cheaper base model |
| **Running fully offline / on-prem / at the edge** | A fine-tuned small model can replace a hosted API call entirely — relevant for compliance or latency, irrelevant if you're happy calling Gemini/Anthropic |

Every row on that list has a cheaper alternative today: bigger context windows, better base-model
instruction-following, structured output (`tool_use` / JSON mode), and RAG have each, independently,
eaten into the cases that used to justify fine-tuning by default. That's not a project-specific
observation — it's the industry-wide reason fine-tuning has become a *last* resort, not a first one,
over the last two years. Part 1 makes that case with numbers.

---

## The helicopter view

Where fine-tuning sits relative to the two techniques already live in this project's AI service:

```
                    increasing cost / engineering effort to build
   ────────────────────────────────────────────────────────────────────▶

   ┌───────────────┐     ┌────────────────────┐     ┌──────────────────────────┐
   │ PROMPTING      │     │ RAG                │     │ FINE-TUNING              │
   │ (this project) │     │ (this project)     │     │ (not in this project)    │
   │                │     │                    │     │                          │
   │ Give the model │     │ Give the model     │     │ Change the model's       │
   │ instructions   │     │ facts it doesn't   │     │ weights so a *behavior*  │
   │ + examples,    │     │ have — retrieved   │     │ (format, tone, domain    │
   │ every request  │     │ per-request from   │     │ habit) no longer needs   │
   │                │     │ pgvector           │     │ to be re-explained       │
   │                │     │                    │     │                          │
   │ Fixes: "the    │     │ Fixes: "the model  │     │ Fixes: "the model keeps  │
   │ model doesn't  │     │ doesn't know this  │     │ getting the *shape* or   │
   │ know the task" │     │ user's data"       │     │ *style* wrong even with  │
   │                │     │                    │     │ a good prompt"           │
   └───────┬────────┘     └─────────┬──────────┘     └────────────┬─────────────┘
           │                        │                              │
           ▼                        ▼                              ▼
   categorize, extract,    /ask semantic search,          nothing yet — the
   suggest-categories,     query_plan, followup           question this doc asks
   portfolio_review,       suggestions (PF-AI003–006)      is whether anything
   journey_advisor                                         in this project ever
                                                            crosses into this box
```

These three are not mutually exclusive and not a maturity ladder you're supposed to climb — a
production system commonly runs all three (RAG feeds facts to a fine-tuned model, still wrapped in
a prompt). The point of the picture is narrower: **fine-tuning is the only one of the three this
project has never needed**, because prompting plus structured output plus RAG have handled every
job so far. Part 1 through Part 3 explain the mechanics; the closing section asks the "would we ever
need this" question directly.

---

## Part 1 — What actually happens during fine-tuning

**Full fine-tuning.** Every weight in the model gets updated by gradient descent on your labelled
examples, exactly like pretraining but on a much smaller, task-specific dataset. This requires
storing a full new copy of the model's weights (multiple GB to hundreds of GB depending on model
size) and enough GPU memory to hold gradients and optimizer state for the *entire* parameter count —
for anything past a small model, that's serious infrastructure. It is now rare outside of labs
training foundation models themselves.

**Wall:** full fine-tuning of even a 7B-parameter model needs real GPU clusters, careful learning-rate
schedules to avoid **catastrophic forgetting** (the model gets great at your narrow task and measurably
worse at everything else it used to do), and a separate full model checkpoint per fine-tune — you
can't cheaply run ten different fine-tunes side by side.

**LoRA (Low-Rank Adaptation).** Freeze the base model entirely. Instead of updating the original
weight matrices, train small "adapter" matrices injected alongside them — a few percent of the
original parameter count. At inference, the adapter's contribution gets added to the frozen base
weights. This is the technique that made fine-tuning practical outside big labs:

| | Full fine-tune | LoRA |
|---|---|---|
| **Trainable parameters** | 100% of the model | Typically 0.1–1% |
| **GPU memory needed** | Full model + full gradients + full optimizer state | A fraction — the frozen base model's weights don't need gradients at all |
| **Storage per fine-tune** | A full model copy (GBs–hundreds of GBs) | A small adapter file (MBs) |
| **Swap fine-tunes at runtime** | No — reload the whole model | Yes — swap adapters on one loaded base model |
| **Catastrophic forgetting risk** | Real, needs careful mitigation | Much lower — most of the model's original knowledge is literally frozen |

**QLoRA** goes one step further: quantize the frozen base model to 4-bit precision before attaching
LoRA adapters, cutting the memory footprint again. This is what makes fine-tuning a 7–13B model
feasible on a single consumer GPU rather than a multi-GPU server.

**Instruction fine-tuning vs. domain fine-tuning — two different goals, often confused:**

- **Instruction fine-tuning** teaches a base model to *follow instructions at all* (this is what
  turns a raw pretrained model into something like a chat assistant). You are not doing this —
  `gemini-2.5-flash` and `claude-sonnet-4-6` already arrive instruction-tuned; that work is the
  provider's, not yours.
- **Domain/task fine-tuning** — the one relevant here — takes an already-instruction-tuned model and
  narrows it toward one recurring task or vocabulary: bank transaction categorization, medical
  coding, legal clause extraction, a specific customer-support tone.

**RLHF / DPO / RLAIF** — the family of techniques used to align a model toward *preferences*
(helpful, harmless, matches a house style) rather than toward labelled input→output pairs.
Reinforcement Learning from Human Feedback trains a reward model from human preference comparisons,
then optimizes the policy against it; Direct Preference Optimization skips the separate reward model
and optimizes directly on preference pairs, which is simpler to run and has become the more common
starting point for teams doing this themselves. Worth knowing by name — not something this project's
scale would ever justify building in-house; RLHF-style alignment is what you'd *buy* by choosing a
well-aligned base model, not something you'd run yourself for a transaction categorizer.

---

## Part 2 — What it costs, in numbers that make the decision concrete

Fine-tuning's pitch is real: a smaller, specialized model beats a bigger general one on *its one
task*, cheaper per call, forever. The catch is everything on the other side of the ledger, and this
is the part a "should we fine-tune?" conversation skips if it starts from enthusiasm instead of
arithmetic.

**Data.** A usable fine-tune needs on the order of hundreds to low-thousands of high-quality labelled
examples for a narrow classification task (categorization-shaped), climbing into the tens of
thousands for anything closer to open-ended generation (advice narrative, free-text extraction).
Compare: this project's categorization golden set —
[`categorize_cases.json`](../../../services/ai-service/evals/categorize_cases.json) — currently has
**7 hand-labelled cases**. That's an eval set, built to catch regressions in a prompt; it is roughly
three orders of magnitude short of what a training set for this task would need to be. Building that
gap is itself a real cost, before a single GPU-hour is spent — and this project does not have that
labelled corpus, has never needed it, and getting a system in place to accumulate it (real
transactions, human-verified labels, PII-scrubbed) would be a project on its own.

**Compute and ongoing hosting.** Every API call in this codebase today goes through
[`ProviderFactory.create()`](../../../services/ai-service/app/providers/factory.py) to a hosted
provider — you pay per token, no GPU to provision, no model to keep warm. A fine-tuned model needs
somewhere to live: your own GPU (rented or owned) serving requests continuously, or a hosted
fine-tuning platform (OpenAI, Together, Fireworks) that still charges you for training *and* for
every inference call against the custom model — often at a premium over the equivalent base-model
call. The "it's cheaper per call" pitch is true only once inference volume is high enough to amortize
that fixed cost; below that volume, prompting a hosted general model is strictly cheaper.

**Maintenance.** A fine-tuned model is now a *versioned artifact your team owns* — same discipline
this project's prompt topic doc already argues prompts need
([prompt-engineering.md](prompt-engineering.md)), except heavier: retraining instead of editing text,
an eval re-run before every promotion, and a real risk of the model drifting stale as your data
distribution changes (Indonesian bank statement formats, category taxonomy, merchant name patterns —
all of which have already changed in this project's lifetime; `PF-125` renamed a whole field across
the stack). A prompt edit is a text change and a re-run. A fine-tune edit is a training run, a new
model artifact, and the same eval discipline on top.

**What's actually improved since fine-tuning was the default answer (2021–2023).** Three
industry-wide shifts specifically erode the case for it:

1. **Structured output** (`tool_use` / JSON mode) — already mandatory in this project's own rules
   ([.claude/rules/ai-service.md](../../../.claude/rules/ai-service.md)) — solves the "the model
   won't reliably follow my output format" problem that used to be a common fine-tuning trigger,
   with zero training data and zero extra infrastructure.
2. **Long context + better base-model instruction-following** means a well-written prompt with
   few-shot examples now gets most tasks to the accuracy fine-tuning used to be needed for, without
   the data-collection cost.
3. **RAG** solves the "the model doesn't know this" problem that people sometimes mistakenly reach
   for fine-tuning to fix — and does it *without* baking facts into weights that go stale the moment
   the underlying data changes. This project's own RAG work (PF-AI003–006) is a working example: the
   `/ask` answer path is grounded in retrieved transactions, not in anything trained into the model.

**The honest summary, stated as a rule of thumb used across the industry (not invented for this
doc):** reach for prompting first, RAG second (when you need facts the model doesn't have),
fine-tuning last (when a specific behavior a good prompt can't reliably produce is worth thousands
of dollars in data + infra to fix permanently). Most products, including this one, never clear that
bar.

---

## Part 3 — When fine-tuning *does* win, and how you'd tell

Fine-tuning is not a bad idea in general — it is a bad *default*. It is the right call when several
of these hold at once, not just one:

| Signal | Why it points at fine-tuning |
|--------|-------------------------------|
| **Very high call volume on one narrow, repeated task** | The per-call savings on a small specialized model compound enough to pay back the training + hosting cost |
| **A prompt genuinely can't get the behavior right, no matter how it's engineered** | Some formatting/tone/domain habits resist even careful few-shot prompting on the base model |
| **You need to run smaller/cheaper/on-prem** | A fine-tuned small model can hit the accuracy a much bigger general model gets, at a fraction of the inference cost or fully offline |
| **You already have (or can cheaply get) thousands of high-quality labelled examples** | The data-cost line item is already paid down |
| **Latency budget is tight and RAG's extra retrieval hop is the bottleneck** | A fine-tuned model with the behavior baked in skips a network round-trip |

Notice what's *not* on that list: "the task is important" or "I want the accuracy number to go up."
Those are true of almost every prompt in this codebase and don't move the needle — importance
justifies building a good eval (this project has two:
[`eval_extraction.py`](../../../services/ai-service/evals/eval_extraction.py),
[`eval_categorize.py`](../../../services/ai-service/evals/eval_categorize.py)), not committing to a
training pipeline.

---

## Would this project ever need it? — walking every candidate use case honestly

### Transaction categorization — the closest candidate, and still a "not yet"

This is the highest-volume, most repetitive, most narrowly-scoped LLM call in the codebase — exactly
the shape fine-tuning is built for. The current system is a **4-layer categorizer**
(rule-match against 106 rules → category presets → history cache → LLM fallback, per
`.claude/rules/backend.md` and this project's own README): the LLM is only reached when the first
three deterministic, free layers miss. The most recent eval run
([`20260805-categorize-eval.md`](../../../services/ai-service/evals/results/20260805-categorize-eval.md))
shows the LLM layer at **7/7 (100%) on a 7-case seed set**, average confidence 0.96 on correct
answers, $0.00002 per call.

Read that number carefully, the way the eval file itself does: 7 cases is not evidence the model
holds up broadly — it's a hand-picked sample skewed toward clear-cut merchants, and the file says so
explicitly. But even taking it at face value: **the LLM fallback is already the cheapest, least-used
layer in the pipeline** (rules and presets absorb most calls before the LLM ever runs), and swapping
it for a fine-tuned model would mean paying real data-collection and hosting cost to optimize the
one layer that's already fast and nearly free. **Verdict: not yet.** If categorization volume ever
grew to where the LLM fallback rate itself became the cost driver — and the eval set grew from 7
hand-picked cases into a real thousand-plus-example labelled corpus — this is the first place in the
project a fine-tune would earn its cost. It isn't there today.

### Indonesian bank statement extraction — a domain-vocabulary case, still better served by prompting

Superbank and NeoBank PDFs use bank-specific prompt templates today
([`superbank_v1.py`](../../../services/ai-service/app/prompts/superbank_v1.py),
`journey_advisor_v1.py`) rather than one generic extractor — this is *already* a form of
specialization, done at the prompt layer instead of the weight layer. A domain fine-tune would try to
bake "Indonesian date formats, decimal conventions (`1.000.000,50`), bank-specific column semantics"
into the model's weights instead of into the prompt text. It's a real fit *in kind* — this genuinely
is the "domain vocabulary a base model handles poorly" case from Part 1's table — but the volume
argument fails the same way: this project ingests statements from five banks at personal/small-scale
volume, not millions of documents a day. Pre-processing (PyMuPDF text extraction, 40–60% token
reduction) plus a well-written bank-specific prompt has already gotten this to a working pipeline
with two real golden sets. **Verdict: no** — this is exactly what THINK-01 in
[governance.md](../../../.claude/rules/governance.md) already argues at the parser-selection level
(direct parser before LLM, LLM before anything heavier): don't reach for more machinery than the
volume justifies.

### Journey advisor tone / financial-health narrative — the case fine-tuning is worst-suited for

The journey advisor writes free-text financial encouragement grounded in a user's pyramid scores. This
looks like a "house voice" case from Part 1's table — but two things rule it out specifically for
*this* task: first, the content has to change with the user's real, current data (their actual score,
their actual gaps) every single call, which is a retrieval/context problem, not a style problem — a
fine-tune would still need the live numbers handed to it in-prompt regardless, so it doesn't remove
the need for careful prompting. Second, and more important per
[FIN-05](../../../.claude/rules/finance-domain.md): computed financial output is "a tool, not
licensed advice," and Indonesian regulatory exposure has to be checked with `/compliance` before it
ships. Baking a persuasive advisory voice into model *weights* makes that voice harder to audit,
harder to change fast when compliance flags a phrase, and harder to attribute to "why did it say
that" than a prompt sitting in a reviewable file. **Verdict: no**, and not "not yet" — the
auditability requirement here argues for less indirection between the words and the reviewer, not
more.

### Portfolio review — same shape as journey advisor, same answer

AI-generated portfolio review narrative faces the identical two objections: the content is
necessarily grounded in the user's live holdings (a retrieval-shaped need, not a style-shaped one),
and it's advisory output subject to the same `/compliance` and `/cio` gates. No case for fine-tuning
here either.

### The pattern across all four

Every genuine candidate in this project either (a) doesn't have the training-data volume to justify
the cost, (b) is already well-served by structured output + a good prompt, or (c) actively wants
*less* indirection between the reviewable prompt text and the output, for compliance reasons —
which fine-tuning would make worse, not better. That's not a coincidence specific to this codebase;
it's the shape of most products at this scale, which is exactly why the industry-wide "prompt → RAG
→ fine-tune, in that order, and stop as soon as one works" heuristic from Part 2 holds up here too.

---

## What you should be able to say in an interview

> *"We don't fine-tune anything in production — every LLM call in our AI service goes through a
> stock Gemini or Claude model via prompting, structured output, and RAG. That's a deliberate
> ordering, not an oversight: prompting is free to iterate on and versioned like any other artifact,
> RAG solves 'the model doesn't know this user's data' without baking facts into weights that go
> stale, and fine-tuning only pays for itself once you have real training-data volume — thousands of
> labelled examples, not the seven-case eval set we use today — and a behavior a good prompt genuinely
> can't produce.*
>
> *Our highest-volume, most repetitive LLM call is transaction categorization, and it's the closest
> thing we have to a fine-tuning candidate — narrow task, high call count. But it's the fallback layer
> in a 4-layer pipeline that resolves most transactions with free rule-matching before the LLM ever
> runs, so the actual LLM call volume is small, and it's already 100% accurate on our (admittedly
> small) eval set at $0.00002 per call. There's no cost problem to solve yet.*
>
> *For anything that generates advisory narrative — portfolio review, financial journey advice — I'd
> actively avoid fine-tuning even at higher volume, because that output is subject to compliance
> review, and a fine-tuned model's behavior is baked into weights instead of sitting in a reviewable
> prompt file. Less auditability is the wrong direction for regulated-adjacent output."*

Two follow-ups worth having an answer for:

- *"Have you ever fine-tuned a model?"* → Be honest: no, and explain *why not*, using the cost/data/
  auditability argument above rather than "I haven't gotten to it yet." The reasoning is the signal
  interviewers are actually checking for — knowing when *not* to reach for a technique is the senior
  behavior, not having used every technique.
- *"What would change your mind?"* → Volume high enough that the LLM layer's cost, not the rule
  layers, becomes the categorization pipeline's bottleneck, *and* a real labelled corpus (thousands
  of cases, not seven) already existing or affordable to build.

---

## Common mistakes (the ones this doc exists to prevent)

1. **Reaching for fine-tuning to fix "the model doesn't know my data."** That's RAG's job. A
   fine-tune trained on last month's transactions is stale the moment this month's arrive; retrieval
   is current by construction.
2. **Treating "the task matters a lot" as a fine-tuning signal.** Importance argues for a good eval,
   not a training pipeline. Confusing the two is the single most common version of this mistake.
3. **Underestimating the data-labeling cost.** The GPU-hours are the visible cost; the labelled
   dataset is usually the larger one, and it's invisible until you try to build it.
4. **Fine-tuning a house voice for regulated/advisory output.** Baking persuasive language into
   weights makes it *harder* to review and change fast when compliance flags something — the wrong
   direction for exactly the outputs where auditability matters most.
5. **Comparing fine-tuning cost only against today's prompting cost, not against tomorrow's better
   base model.** A fine-tune trained against `gemini-2.5-flash` doesn't automatically benefit when
   the provider ships a better model next quarter; a prompt does, for free, the moment you bump the
   model string.

---

## Resources

**Concepts**
- Hugging Face — LoRA conceptual guide → https://huggingface.co/docs/peft/conceptual_guides/lora — the mechanics of frozen base + trainable adapter, in detail
- Tim Dettmers et al. — QLoRA paper → https://arxiv.org/abs/2305.14314 — the 4-bit quantization technique that makes single-GPU fine-tuning practical
- Sebastian Raschka — Practical tips for fine-tuning LLMs → https://sebastianraschka.com/blog/2023/llm-finetuning-tips.html — grounded, numbers-based, not hype
- Hugging Face — DPO vs RLHF → https://huggingface.co/blog/dpo-trl — why DPO became the more common starting point

**The "when NOT to" argument**
- OpenAI — Fine-tuning guide → https://platform.openai.com/docs/guides/fine-tuning — read the "When to use fine-tuning" section specifically; even the vendor selling it leads with the alternatives
- Eugene Yan — Patterns for building LLM-based systems → https://eugeneyan.com/writing/llm-patterns/ — situates fine-tuning correctly among prompting/RAG/agents rather than as a first move

**Project-local**
- [prompt-engineering.md](prompt-engineering.md) — the sibling topic doc; read this project's actual answer to "what do we do instead of fine-tuning" — the discipline for keeping a *prompt* production-grade
- [.claude/rules/ai-service.md](../../../.claude/rules/ai-service.md) — the structured-output rules that closed off one of the classic fine-tuning triggers
- [.claude/rules/finance-domain.md](../../../.claude/rules/finance-domain.md) — FIN-05, the reasoning behind why advisory-output auditability argues against baking behavior into weights
- [`evals/results/20260805-categorize-eval.md`](../../../services/ai-service/evals/results/20260805-categorize-eval.md) — the real numbers behind the "categorization is the closest candidate, still not yet" verdict

---

## Self-check

If you can answer these without looking, the topic has landed.

1. Your categorizer's LLM fallback is 100% accurate on 7 eval cases. Why doesn't that argue for
   fine-tuning it?
2. A teammate proposes fine-tuning the journey advisor "so it always sounds encouraging." Name the
   two reasons this project's own rules would push back on that, before cost even enters the
   conversation.
3. What's the difference between what RAG fixes and what fine-tuning fixes? Give one example of each
   from this project.
4. Why does LoRA let you run several fine-tunes on one base model, where full fine-tuning doesn't?
5. Name three industry shifts that have shrunk the set of problems fine-tuning used to be the default
   answer for.
6. If categorization volume in this project grew 1000x tomorrow, would that alone justify fine-tuning
   the categorizer? What else would need to be true first?
