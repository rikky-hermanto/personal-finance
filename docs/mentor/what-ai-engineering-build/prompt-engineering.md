# Prompt Engineering — Iteration, Testing, Versioning

> **Topic doc, not a plan.** This is the reference for one line on the "What You Need to Learn"
> list: *prompt engineering — iteration, testing, versioning*. It covers what the topic actually
> contains, in the order the ideas depend on each other, with the state of this project used as the
> worked example throughout. It does not assign build steps — if a chapter ticket comes out of this,
> it lives in `.claude/plans/learning/`.
>
> **Read order matters.** Iteration → Testing → Versioning is not alphabetical; each part exists
> because the previous one hits a wall. Skipping to Versioning gives you a registry with nothing
> to promote and no way to decide.

---

## What it is

Ten prompts run inside this project's AI service right now. Not one of them carries a version the
running code can read, a test that fails when it's edited badly, or any way to tell you which text
produced a given answer in the Langfuse dashboard — and each one is a single careless sentence away
from moving the accuracy of a live feature.

**A prompt is the instruction text you send to an LLM. Prompt engineering is the practice of
designing, improving, and maintaining that text so the model's output is reliably correct enough to
build a product on.**

That's it. It is not a mystical skill and it is not a personality trait — it is the work of turning
a request written in English into a component that behaves predictably.

Concretely, in this project: when the AI service categorizes a bank transaction, something has to
tell the model *what job it is doing*. That something is a prompt — a real one, from
[categorizer.py](../../services/ai-service/app/services/categorizer.py):

```
You are a personal finance transaction classifier.
Given a bank transaction, return the most appropriate category from the provided list.
Set confidence to a value between 0.0 and 1.0 reflecting how certain you are.
If no category clearly fits, pick the closest one and set confidence below 0.5.
Never invent categories outside the provided list.
```

Send that, plus the transaction, and the model returns `{"category": "Groceries", "confidence": 0.9}`.
Change a sentence in that text and the accuracy of the whole feature changes. **That is the entire
subject: the text is a lever on product behaviour, and prompt engineering is how you pull it
deliberately instead of by feel.**

### What it's used for

Anywhere an LLM sits inside a product, a prompt is the interface to it. In this codebase alone:

| Job | What the prompt has to make the model do |
|-----|------------------------------------------|
| **Extraction** | Read a Superbank PDF and return structured transaction rows — right dates, right decimal convention, debit vs credit |
| **Classification** | Pick one category for a transaction from a fixed list, and say how sure it is |
| **Answering (RAG)** | Answer "berapa pengeluaran makan bulan Maret?" using only the retrieved transactions, with citations, without inventing numbers |
| **Analysis / advice** | Review a portfolio or a financial-health score and write something useful and non-reckless |
| **Agent control** | Decide which tool to call next, with which arguments |

Same model, five completely different behaviours. The prompt is what makes the difference.

### Why this topic has three words in its title

Writing the categorize prompt above took an afternoon. The techniques behind it — give examples,
state the output format, forbid inventing values — are a half-day read, and they work.

Then it shipped, and the actual work started. The text the model actually receives has changed since
— `PF-125` added the `Bank/Account:` line to it while renaming a field across the whole stack, a
commit that was not about prompt quality and carries no eval run. That change may have helped, hurt,
or done nothing; there is no record either way, because the harness that could have answered it
([eval_categorize.py](../../services/ai-service/evals/eval_categorize.py)) only runs when someone
remembers to run it.

That gap — not the writing — is the part that takes skill and the part interviews probe:

> **"How do you change a prompt without breaking production?"**

That's the real job, because prompts are never written once. They are edited constantly, by
different people, against a model whose behaviour you don't control and can't see inside. And that
question has three parts, which are exactly the three words in this topic's title:

| Word | The question it answers | What it fails like when missing |
|------|-------------------------|--------------------------------|
| **Iteration** | How do I decide what to change? | You fix one case and silently break three others |
| **Testing** | How do I know the change was good? | "It looked better when I tried it" |
| **Versioning** | How do I ship, trace, and revert it? | A bad output from last month is untraceable; rollback is a git archaeology session |

A backend engineer already has the mental model for all three — it's code review, unit tests, and
deployments. The whole difficulty is that a prompt looks like a string, so it gets treated like a
string, and none of the machinery you'd apply to code gets applied to it.

**The one-sentence version of this entire doc:** a prompt is not a string constant, it is a
*deployed artifact* — so give it an identity, a test, and a rollback path.

---

## The helicopter view

Here is the loop this topic describes, end to end. Everything below is one of these boxes.

```
                    ┌──────────────────────────────────────────┐
                    │  1. ERROR ANALYSIS                       │
                    │  Look at real failures. Group them.      │
                    │  Pick ONE failure mode to attack.        │
                    └───────────────────┬──────────────────────┘
                                        │  a hypothesis
                                        ▼
                    ┌──────────────────────────────────────────┐
                    │  2. ITERATE                              │
                    │  Change ONE thing. Write down what you   │
                    │  expect to happen, before you run it.    │
                    └───────────────────┬──────────────────────┘
                                        │  a candidate version
                                        ▼
    ┌───────────────────────────────────────────────────────────────────────┐
    │  3. TEST — two tiers, different jobs                                  │
    │                                                                       │
    │   contract tests (free, fast, CI)   golden-set eval (paid, slow,      │
    │   • renders, no stray placeholders   manual, before promotion)        │
    │   • required instructions present   • accuracy / faithfulness / etc.  │
    │   • versions unique, label resolves • vs. a RECORDED BASELINE         │
    └───────────────────┬───────────────────────────────────┬───────────────┘
                        │ pass                              │ fail
                        ▼                                   ▼
    ┌──────────────────────────────────────────┐   ┌────────────────────────┐
    │  4. VERSION + PROMOTE                    │   │  reject, keep the      │
    │  new version, changelog entry,           │   │  old version, write    │
    │  flip the `production` label             │   │  down WHY it lost      │
    └───────────────────┬──────────────────────┘   └────────────────────────┘
                        │
                        ▼
    ┌──────────────────────────────────────────┐
    │  5. OBSERVE                              │
    │  prompt name + version on every trace    │──┐
    │  → cost, latency, and failures per       │  │  new failures
    │    version, in production                │  │
    └──────────────────────────────────────────┘  │
                        ▲                         │
                        └─────────────────────────┘
```

Note the shape: it is a **closed loop**, and production observability feeds the next round of error
analysis. A prompt process that stops at step 4 has no way to learn from what actually shipped.

---

## Part 1 — Iteration

**Edit the string, look at one output.** This is how essentially every prompt in every codebase
starts, and it isn't stupid — it's the fastest possible loop. You notice the categorizer labelled a
Rp 2.000 `GRAB* A-6XKQ4RN` charge as `Transportation` when it's a service fee. You add a sentence
about fees to the system prompt. You re-run that transaction. It comes back `Admin Fee`. Ship it.

The catch is that you only looked at the case you were already thinking about. The same sentence
that fixed the Grab fee may have dragged `PLN PREPAID TOKEN 20K` from `Utilities` toward `Admin Fee`
as well — same word, "fee," now weighted heavier — and nothing told you. This is the defining
property of prompt changes and the reason this topic exists at all:

> **A prompt edit is a global change validated by a local test.** One sentence touches every input
> the prompt will ever see, forever.

**Run a fixed set of cases and read one number.** Instead of one transaction, keep 20–50 labelled
ones and score the whole set on every change. Now the Grab fix *and* the PLN regression show up in
the same table. This is a **golden set** (also: eval set, regression set) — a fixed collection of
inputs with known-correct outputs.

Fine as far as it goes, but the number is only useful if you can attribute it. Suppose accuracy goes
0.78 → 0.86 across an afternoon in which you added examples, reordered the category list, and
switched the model from `gemini-2.5-flash` to `claude-sonnet-4-6` to see if it was faster. Eight
points of lift, three candidate causes, no way to split them — and one of those changes might be a
regression hidden under a bigger gain.

**Change one variable, hold everything else.** The discipline is straight from A/B testing: one
hypothesis per run, one edit per hypothesis, same cases, same model, same temperature.

- ❌ "I improved the prompt" — not a claim you can accept or reject.
- ✅ "Adding four few-shot examples drawn from real fee/transfer failures will lift accuracy on
  those case types without hurting the rest" — a prediction that can be wrong.

Write the hypothesis down **before** running it. A prediction recorded afterward is not a
prediction; it's a story.

One thing remains, and it's the part people skip: how do you pick *which* hypothesis?

**Error analysis first.** Don't start from the technique menu ("should I add chain-of-thought?").
Start from the failures. Dump every wrong output from the last eval run, read them, and group them
by *cause* — not by category. Ten failures usually collapse into two or three real failure modes,
and the biggest group is your next hypothesis. This is the highest-leverage habit in the whole
topic, and it's the one that separates measured improvement from tinkering.

> Hamel Husain's phrasing, worth memorizing: **"look at your data."** Most teams that think they
> have a prompt problem have a *they've never read 50 failures in a row* problem.

### What edits actually move the number

Roughly ordered by expected payoff, for a typical extraction/classification/answering task:

| Technique | What it does | When it's the right move |
|-----------|--------------|--------------------------|
| **Few-shot examples** | Show 2–5 input→output pairs | Almost always the first thing to try. Highest payoff per token, and *measurable* — you can name the cases it should fix |
| **Structured output** (tool use / JSON schema) | The provider enforces the shape server-side | Any time you parse the output. Removes a whole class of failure rather than mitigating it |
| **Explicit negative rules** | "Never invent a category outside the list" | When the model's failure is *out of range*, not *wrong within range* |
| **Delimiters / XML tags** | `<transaction>…</transaction>` separates instruction from data | Long prompts, or any prompt where user data could be read as instruction (also a prompt-injection mitigation) |
| **Chain-of-thought** | "Reason step by step before answering" | Multi-step reasoning. Costs output tokens and latency — pointless for a one-token classification |
| **Prefill / response priming** | Start the assistant's turn for it | Forcing a format when structured output isn't available |
| **Role framing** ("you are an expert…") | Sets register and vocabulary | Real but small. Not where your first three iterations should go |
| **Splitting one prompt into two calls** | Each call does one job | When a prompt is failing at *two* things at once and you can't fix one without breaking the other |

Two notes worth internalizing:

- **Structured output is not a prompting technique, it's an architectural one.** `tool_use` /
  JSON-mode moves validation from your parser to the provider's. That's why
  [.claude/rules/ai-service.md](../../.claude/rules/ai-service.md) mandates it and forbids regex
  parsing of free text — a whole failure class deleted rather than prompted around.
- **`temperature=0.0` for anything extraction-shaped.** Creativity in an extraction task is
  hallucination with better PR. Same rule file makes this explicit.

---

## Part 2 — Testing

**Run it by hand and read the answer.** `curl` the endpoint, eyeball the JSON, decide. Catches a
catastrophe. Useless as a gate: not repeatable, not recorded, doesn't run when someone else edits
the prompt six weeks from now.

**A golden-set eval.** Fixed inputs, known-correct outputs, a score. This is the load-bearing
artifact of LLM engineering — more important than any individual prompt, because prompts are
disposable and the eval set is not.

Building one is mostly unglamorous work:

1. **Collect real inputs.** Anonymized production data beats invented examples every time — invented
   cases encode your assumptions about what's hard, which is exactly what you're trying to test.
2. **Label them.** By hand. This is the expensive part and there is no shortcut.
3. **Include adversarial cases deliberately.** The ones you expect to fail. A set of easy cases
   produces a high score and tells you nothing.
4. **Pick a metric that matches the task type** (see below).
5. **Freeze it.** A golden set you edit whenever it's inconvenient is not a measurement instrument.

**Metric per task type** — the wrong metric is worse than no metric, because it looks like rigour:

| Task shape | Primary metric | Also worth measuring |
|------------|----------------|---------------------|
| Classification (categorize a transaction) | Accuracy | **Confidence calibration** — is it confident when right and unsure when wrong?; out-of-vocabulary rate |
| Extraction (statement → rows) | Row-level F1 + per-field accuracy | Truncation rate; cost per document |
| Retrieval (search) | MRR@k, Precision@k, Recall@k | Latency p95 |
| Generation / RAG answers | Faithfulness (is it grounded in the retrieved context?) | Answer relevance; citation correctness |
| Agents | Tool-call accuracy; trajectory correctness | Step count; total cost per task |

> **Why calibration deserves the second slot for classification:** if downstream code branches on
> confidence — as this project's 4-layer categorizer does, accepting the LLM's answer only above a
> threshold — then a model that is 80% accurate and *well calibrated* is a better production
> dependency than one that is 85% accurate and equally confident when wrong. Accuracy alone hides
> this completely.

Now the wall. A golden-set eval costs real money and real quota, takes minutes, and needs a live API
key — which means the thing that gates prompt changes **cannot run on the thing that merges prompt
changes**. And there is a whole class of prompt bug it can't see at all, because those bugs fail
before the model is ever reached: an unresolved `$categories` placeholder sitting in the rendered
text, a prompt that no longer contains the exact instruction a scorer depends on, a template that
quietly grew past its token budget.

**Two tiers, split by what they actually catch.**

| | Contract tests | Golden-set eval |
|---|---|---|
| **Catches** | Bugs *before* the model: rendering, missing placeholders, duplicate versions, unresolved labels, required instructions removed | Quality regressions: accuracy, faithfulness, calibration |
| **Cost** | Free | Real money + quota |
| **Speed** | Milliseconds | Minutes |
| **Deterministic** | Yes | No |
| **Runs** | Every commit, in CI | Manually, before promoting a version |

Both are necessary and neither substitutes for the other. Putting the paid eval in CI is how you end
up with an API key in your build pipeline and a suite everyone learns to ignore.

That still leaves a hole: a manual eval only gates a change if someone remembers to run it, and
"remember to run it" is not a control.

**A recorded baseline plus a gate with a tolerance.** Freeze the current production version's
numbers into a file — accuracy, the secondary metrics, which prompt version and model produced them,
the date. Give the harness a `--gate` mode that re-runs the set and exits non-zero if the score
drops more than a stated tolerance below the baseline.

The tolerance is not bureaucratic softness, it is the thing that makes the gate survive:

> **LLM scores are not reproducible, even at `temperature=0.0`.** Provider-side batching
> non-determinism, silent model updates behind a stable alias, and retried calls all move the
> number. A zero-tolerance gate fails on runs where nothing changed, and a gate that cries wolf gets
> bypassed within a week and deleted within a month.

Size the tolerance against your set: 20 cases means one flipped case is ~5 points, so a 5% tolerance
says "one case of noise is fine, two is a signal."

**LLM-as-judge** — the technique you'll be asked about, and the one to be careful with. For outputs
with no single correct answer (a portfolio review, a financial-advice narrative), you use a second
LLM call to score the first against a rubric. It genuinely works, and it has two failure modes worth
knowing by name: judges are **positionally biased** (they favour the first option shown, so randomize
order in pairwise comparisons) and **self-biased** (a model rates its own output higher). The
mitigation is the same as for any measuring instrument — validate the judge against human labels on
a subset before trusting it, and keep the rubric specific rather than "rate this 1–10."

---

## Part 3 — Versioning

**A string constant next to the code that uses it.** `_SYSTEM_PROMPT = "You are a personal finance
transaction classifier…"` four lines above the class. Maximally readable, zero indirection, and
genuinely the right call for a service with one prompt.

It's a dead end the moment you want two of them alive at once. You can't run v1 and v2 side by side,
because there's only ever one binding of the name — which means you can't A/B at all. You can't
answer "which text produced this output" for anything already logged. Git blame records that a
change happened and when, never what it scored.

**A `_v1` suffix on the filename.** This buys something real: the file becomes a standalone artifact,
a v2 can sit next to it, and the name announces the thing is expected to change.

There's a subtle trap in it, and this project is currently standing in it. Two prompts here live in
`app/prompts/superbank_v1.py` and `app/prompts/journey_advisor_v1.py`, imported as
`from app.prompts.superbank_v1 import SYSTEM_PROMPT`. After that import line executes, **the string
has no version attached to it**. The Langfuse trace for a Superbank extraction records the model,
the token counts, and the cost — but cannot record `superbank@v1`, because nothing in the running
process knows that's what it's holding. A filename is a fact about the source tree; a trace needs a
fact about the request.

**A registry that hands out objects, not strings.** Make the version a *value*:

```python
Prompt(name="categorize", version="v2", template=..., variables=("categories",))
```

resolved by a lookup keyed on name, with a `production` label pointing at whichever version is
currently live. Three things fall out immediately:

1. The version can be attached to a trace — a bad output found in the dashboard next month is
   traceable to exact text.
2. Two versions can exist in the same process, which is what makes an A/B run mechanically possible.
3. Promotion becomes a label change plus a changelog entry, not a code rewrite. Rollback is the
   same operation in reverse, and the old version file *is* the rollback — which is why you never
   delete it.

**Hosted prompt management** (Langfuse, LangSmith, PromptLayer). The text lives in a UI,
`langfuse.get_prompt("categorize", label="production")` fetches it at runtime, and a non-engineer
can promote a version without a deploy. Real value — and it introduces a network call into the
request path, so it needs two safeguards that are not optional:

- **A cache and a local fallback.** Any fetch failure — DNS, auth, rate limit, missing label — falls
  back to the in-code version and logs it. Otherwise a vendor outage takes down your feature.
- **Explicit version requests resolve locally.** An eval that silently pulls different text from a
  server is not an eval.

### The templating trap

Worth its own section because it is the single most common concrete bug in this area.

Python's `str.format()` treats **every** `{` in the template as a placeholder. So the day someone
adds a worked example to a structured-output prompt — a completely natural thing to do:

```python
_SYSTEM_PROMPT = """...
Categories available: {categories}
Return: {"category": "Groceries", "confidence": 0.9}
"""
system = _SYSTEM_PROMPT.format(categories=", ".join(available_categories))
```

…this raises `KeyError: '"category"'` **at request time**, not at import time, not in a test. This
project's [merchant_suggester.py](../../services/ai-service/app/services/merchant_suggester.py) uses
exactly this pattern today and is one worked example away from it.

The fix is `string.Template` with `$name` placeholders: literal braces are just characters, and
`.substitute()` **raises on a missing key** — where `.safe_substitute()` would silently ship a
literal `$categories` into the model's context and nobody would notice for weeks. Fail loud, in a
test, is the entire design goal.

> **If you're coming from .NET:** the closest familiar analogue to the whole registry idea is
> configuration, not code. A prompt has a name, a value, an environment-specific binding
> (`production`), a change log, and a rollback — that's `IOptions<T>` bound to a versioned config
> source, or a feature flag with variants, far more than it's a `const string`. The instinct to
> treat it as a constant is what makes it untestable and untraceable.

---

## The tooling landscape

You will be asked which of these you've used. Know what each one *is* even where you haven't
adopted it.

| Tool | What it's for | Verdict for this stack |
|------|---------------|------------------------|
| **Langfuse** | LLM tracing (cost, latency, tokens) + prompt management + eval scores | **In use** (PF-AI001). Prompt-management half not yet adopted |
| **Promptfoo** | Declarative prompt testing — matrices of prompt × model × case, assertions, side-by-side diffs, CI integration | Worth knowing by name. The natural next step after hand-rolling the loop once |
| **RAGAS** | RAG-specific metrics: faithfulness, answer relevance, context precision/recall | **In use** for the `/ask` answer path |
| **LangSmith** | LangChain's tracing + eval + prompt hub | Alternative to Langfuse; relevant if the stack is LangChain-heavy |
| **DSPy** | Programmatic prompt *optimization* — you define the task and metric, it searches for the prompt | The "you might not hand-write prompts forever" answer. Genuinely different paradigm; know the pitch |
| **Provider evals** (OpenAI Evals, Anthropic workbench) | Vendor-hosted eval harnesses | Fine, but vendor-locked — a self-hosted set survives a provider swap |

**Build-vs-adopt guidance:** hand-roll the loop once — case file, scorer, baseline, gate — before
reaching for Promptfoo. The tools are thin wrappers around ideas that are easy to hold once you've
implemented them, and impossible to evaluate if you haven't.

---

## Where this shows up in this project

The AI service has **ten live prompts** and, today, none of the three disciplines above:

| Prompt | Location | Notes |
|--------|----------|-------|
| categorize | `services/categorizer.py` `_SYSTEM_PROMPT` | Has a golden set ([`evals/categorize_cases.json`](../../services/ai-service/evals/categorize_cases.json)) — the tightest feedback loop available |
| answer / answer_narrate | `services/answerer.py` | RAGAS faithfulness scored |
| query_plan | `services/query_planner.py` | |
| followup | `services/followup_suggester.py` | |
| merchant_suggest | `services/merchant_suggester.py` | Uses `.format()` — the brace-collision trap above |
| portfolio_review | `services/portfolio_reviewer.py` | No eval; free-text output → LLM-as-judge territory |
| extract_generic | `services/llm_parser.py` | Concatenates the bank hint — a template variable in disguise |
| extract_superbank | [`app/prompts/superbank_v1.py`](../../services/ai-service/app/prompts/superbank_v1.py) | `_v1` in the filename only |
| journey_advisor | [`app/prompts/journey_advisor_v1.py`](../../services/ai-service/app/prompts/journey_advisor_v1.py) | `_v1` in the filename only |

**What's already good here:** structured output everywhere (Gemini JSON mode / Anthropic
`tool_use`), `temperature=0.0` on extraction, two real golden sets
([`eval_extraction.py`](../../services/ai-service/evals/eval_extraction.py),
[`eval_categorize.py`](../../services/ai-service/evals/eval_categorize.py)) with metrics chosen per
task type, and Langfuse tracing on every call. That is most of Part 1 and half of Part 2, already
shipped.

**What's missing, in order of leverage:**

1. **Prompt version on the trace.** Everything else is downstream of this. Right now a bad output in
   the Langfuse dashboard cannot be tied to the text that produced it.
2. **A recorded baseline + gate.** The eval harnesses exist and produce numbers; nothing compares
   those numbers to a previous run automatically.
3. **A registry with a `production` label**, so two versions can be A/B'd in one process.
4. **Contract tests in CI** — the free tier of testing is entirely absent.
5. **A prompt changelog** — hypothesis, numbers, verdict, per version. This is what makes the
   interview story concrete.

---

## What you should be able to say in an interview

Rehearse this until it's not recited. It's the whole topic compressed:

> *"We treat prompts as versioned artifacts rather than string constants. Each one has a name, a
> version, and a `production` label, so two versions can be live in the same process — which is what
> makes an A/B possible at all — and the name and version go into the trace metadata, so a bad
> output someone reports next month is traceable to the exact text that produced it.*
>
> *Changes start from error analysis, not from the technique list: I read the last run's failures,
> group them by cause, and attack the biggest group with one stated hypothesis and one edit. Then it
> runs against a golden set of labelled transactions — scored on accuracy, out-of-vocabulary rate,
> and confidence calibration, because our categorizer branches on confidence, so a model that's
> confidently wrong is worse for us than one that's less accurate but well calibrated.*
>
> *Testing is two tiers. Deterministic contract tests run in CI — the prompt renders, no unresolved
> placeholders, versions are unique, the production label resolves — and they're free and fast. The
> paid golden-set eval is a manual gate before promotion, compared against a recorded baseline with
> a tolerance, because LLM scores move between runs even at temperature zero and a zero-tolerance
> gate gets disabled the first week it fires on noise."*

Three follow-ups you should have an answer ready for:

- *"How do you evaluate something with no single right answer?"* → LLM-as-judge with a specific
  rubric, validated against human labels on a subset, with position randomization for pairwise
  comparisons. Name the biases.
- *"What if the eval set itself is wrong?"* → It usually is, at the start. The set is a living
  artifact built from real anonymized production failures; when a "failure" turns out to be a
  mislabelled case, you fix the label and record that you did — but you never edit the set just
  because a run was inconvenient.
- *"How do you keep prompt costs down?"* → Token budget per prompt, cheaper model for
  single-decision classification, pre-processing before the call (this project extracts PDF text
  with PyMuPDF first, cutting 40–60% of input tokens), and per-call cost logged on the trace so
  regressions are visible.

---

## Common mistakes

1. **Changing the prompt and the model in the same eval run.** Two variables, one number, zero
   information.
2. **Refactoring prompt text and moving it in the same commit.** Move first, prove the score is
   unchanged, *then* edit. Otherwise the refactor isn't provably safe and the delta has two causes.
3. **Deleting the old version after promoting the new one.** It's the rollback, and it's the control
   arm of the next experiment.
4. **A zero-tolerance regression gate.** Fires on noise, gets bypassed, then removed.
5. **Putting the paid eval in CI.** API key in the build pipeline, minutes of wall clock, flaky
   results — the fastest route to a suite nobody trusts.
6. **`safe_substitute()` / lenient templating.** Ships `$categoies` to the model as literal text and
   nothing fails until someone reads an output closely.
7. **Starting from the technique menu instead of the failures.** "Should I add chain-of-thought?" is
   the wrong first question; "what are the last 30 failures actually failing at?" is the right one.
8. **Optimizing a prompt for a problem that isn't a prompt problem.** A lot of "bad answers" in RAG
   are retrieval failures — the model was never given the right context and no amount of prompting
   fixes that. Check what went into the prompt before rewriting it.

---

## Resources

**Techniques**
- Anthropic — Prompt engineering overview → https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview — read for the *ordering* by expected payoff, not as a checklist
- Anthropic — Use examples (multishot) → https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting — the highest-leverage single edit for classification
- OpenAI — Prompt engineering guide → https://platform.openai.com/docs/guides/prompt-engineering — provider-neutral advice survives a provider swap, which matters in a two-provider service

**Evaluation**
- Hamel Husain — *Your AI product needs evals* → https://hamel.dev/blog/posts/evals/ — the definitive argument that the eval, not the prompt, is the real artifact. Read this one twice
- Eugene Yan — *Task-specific LLM evals* → https://eugeneyan.com/writing/evals/ — how to pick the metric for a task shape
- Eugene Yan — *LLM-as-judge* → https://eugeneyan.com/writing/llm-evaluators/ — the biases and the mitigations, in detail
- RAGAS docs → https://docs.ragas.io — faithfulness / answer relevance / context precision definitions

**Versioning and tooling**
- Langfuse — Prompt management → https://langfuse.com/docs/prompts/get-started — the data model (name, version, label) worth imitating even in code
- Langfuse — Linking prompts to traces → https://langfuse.com/docs/prompts/get-started#link-with-langfuse-tracing — why the version has to be a runtime value
- Promptfoo — Getting started → https://www.promptfoo.dev/docs/getting-started/ — read the config format for the vocabulary ("providers", "tests", "asserts")
- Python `string.Template` → https://docs.python.org/3/library/string.html#template-strings — `substitute()` vs `safe_substitute()`

**Project-local**
- [.claude/rules/ai-service.md](../../.claude/rules/ai-service.md) — the structured-output and `temperature=0.0` rules, and why they're rules
- [`evals/`](../../services/ai-service/evals/) — the two golden sets and their scorers, as working examples of everything in Part 2

---

## Self-check

If you can answer these without looking, the topic has landed.

1. A prompt lives in a file called `superbank_v1.py`. Why can't the Langfuse trace record the
   version?
2. `str.format()` and `string.Template.substitute()` both fail on a bad template — but on different
   things, at different times. Which failure reaches production, and why?
3. Why does a regression gate need a tolerance? What specifically breaks if you set it to zero?
4. Which tests belong in CI and which don't, and what's the criterion that decides?
5. Your categorizer is 85% accurate. Why might that be worse in production than one that's 80%
   accurate?
6. You've moved prompts to a hosted service so a PM can promote versions without a deploy. Name the
   two safeguards you need before that reaches production.
7. Accuracy went from 0.78 to 0.86. You changed the examples, the category ordering, and the model.
   What do you actually know?
8. Where do you start when the output is bad — the technique list, or somewhere else?
