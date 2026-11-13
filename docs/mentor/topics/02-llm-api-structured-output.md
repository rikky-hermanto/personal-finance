# LLM API Mechanics and Structured Output

> **Topic doc, not a plan.** This is the study material for the first skim row of the
> [learning path](../ai-engineer-learning-path.md): *LLM API mechanics + structured output
> (tool_use / JSON mode)*. Everything here is already built in this project, so there are no build
> steps. The work is to be able to explain what you built, and the exercises at the end are short
> reading tasks in the real code.
>
> **Time:** one evening. **Read after:**
> [LLM fundamentals](01-llm-fundamentals.md) (tokens and stop reasons make more sense with it, but
> you can skim this one first). **Read before:**
> [prompt engineering](03-prompt-engineering.md) and
> [context engineering and prompt caching](04-context-engineering-prompt-caching.md).

## What you will be able to do

- Describe every field of an LLM API request and response, and say which ones this project sets.
- Explain why this project never parses free text, and how each provider is forced to return a typed object.
- Explain what a stop reason is and why a truncated response is treated as an error here.
- Explain how one schema serves two providers.

## What it is

**An LLM API call is a stateless HTTP request: you send text (and optionally images and tool
definitions), and you get generated text back, plus a count of the tokens you paid for.
Structured output is any mechanism that makes the model return data matching a schema you define,
so your code receives an object and not a paragraph.**

The real artifact is in [anthropic.py](../../../services/ai-service/app/providers/anthropic.py).
This is the call that extracts transactions from a bank statement:

```python
message = await self._client.messages.create(
    model=self._model,
    max_tokens=4096,
    temperature=0.0,
    system=system_prompt,
    tools=[tool],
    tool_choice={"type": "tool", "name": "extract_transactions"},
    messages=[{"role": "user", "content": content}],
)
```

Seven arguments, and each one is a decision. This matters because every later topic (RAG, agents,
MCP) is this same call with more things placed into it.

### What it's used for

| Job in this project | Call shape | File |
|---|---|---|
| Extract transactions from statement text or a screenshot | Forced tool call with the extraction schema | [llm_parser.py](../../../services/ai-service/app/services/llm_parser.py) |
| Categorize a transaction | Small JSON result (category, confidence) | [categorizer.py](../../../services/ai-service/app/services/categorizer.py) |
| Classify a chat question before answering | Temperature-0 planner returning a plan object | [query_planner.py](../../../services/ai-service/app/services/query_planner.py) |
| Answer a question with citations | JSON with `answer`, `cited_transaction_ids`, `confident` | [answerer.py](../../../services/ai-service/app/services/answerer.py) |
| Stream an answer token by token | Plain text stream, no schema | [anthropic.py](../../../services/ai-service/app/providers/anthropic.py) (`stream_generate`) |

## The helicopter view

```
 your code                         provider API                      your code
┌──────────────────┐   request    ┌──────────────────┐   response   ┌──────────────────┐
│ system prompt    │ ───────────▶ │ tokenize         │ ───────────▶ │ content blocks   │
│ messages         │              │ generate tokens  │              │ stop reason      │
│ tools + schema   │              │ one at a time    │              │ usage (tokens)   │
│ max_tokens, temp │              │ until a stop     │              │                  │
└──────────────────┘              └──────────────────┘              └──────────────────┘
```

Three things come back, and all three need handling: the content, the reason generation stopped,
and the usage. Most bugs in this area come from reading the first and ignoring the other two.

## The request

**The call is stateless.** The API remembers nothing between requests. A "conversation" is your
code resending the earlier turns in `messages` every time. This project's `/ask` endpoint sends no
history at all, which is why the follow-up suggester has to produce questions that name their own
category and period (see the docstring in
[followup_suggester.py](../../../services/ai-service/app/services/followup_suggester.py)).

**Roles.** The `system` prompt sets the job and the rules. `user` messages carry the input.
`assistant` messages are earlier model output that you send back as history. Tool results go back
in as a user-side message.

**`max_tokens` is a hard cap on output, not a target.** The model does not plan its answer to fit.
When it reaches the cap it stops mid-sentence, or mid-JSON.

**`temperature` controls randomness when the next token is picked.** At 0 the model takes the most
likely token each time. Every call in this service uses `temperature=0.0`, because extraction and
classification should give the same answer twice. Temperature 0 makes output far more stable, but
providers do not guarantee identical output across runs.

**Content can be multimodal.** A message's content is either a string or a list of blocks. The
screenshot path sends an image block followed by a text block in the same user message. That is
how Bank Jago screenshots, which have no text layer, get extracted.

## The response

**Content blocks.** An Anthropic response is a list of blocks, each with a type: `text` or
`tool_use`. The extraction code looks for the `tool_use` block and reads its `input`, which is
already a parsed dict.

**Stop reason.** This says why generation ended. `end_turn` means the model finished. `tool_use`
means it wants a tool called. `max_tokens` means it was cut off. Gemini calls the same idea
`finish_reason`.

A cut-off extraction is worse than a failed one. A statement with 80 rows that returns 61 looks
like a success, and the 19 missing rows surface later as a balance that does not reconcile. So the
extraction path raises:

```python
if message.stop_reason == "max_tokens":
    raise RuntimeError(
        "Response truncated — statement too long. Split into pages before re-extracting."
    )
```

**Usage.** Every response reports input and output tokens. This project turns them into a cost
estimate and records both in Langfuse on every call. Output tokens cost several times more than
input tokens on every major provider, so a long output is the expensive part.

One detail that cost real debugging time here: on models that think before answering, **the
thinking tokens come out of the same output budget**. A 200-token cap on the follow-up suggester
left `gemini-2.5-flash` no room for the visible JSON, and the response came back empty. The cap is
now 2048. The comment recording this is at the top of
[followup_suggester.py](../../../services/ai-service/app/services/followup_suggester.py).

## Structured output

The simplest approach is to ask for JSON in the prompt and call `json.loads` on the reply. It
works in a demo. In production the model adds a sentence before the JSON, wraps it in a code
fence, or returns a number as the string `"1.250.000"`. Each fix is another regex, and the next
bank format breaks it again.

The two mechanisms below move the guarantee from your parsing code to the provider.

**Forced tool use (Anthropic).** You describe a tool with a JSON Schema as its `input_schema`,
then set `tool_choice` so the model must call it. The model's "arguments" are your data. Nothing
is ever executed: the tool is only a typed container.

- `tool_choice={"type": "tool", "name": "..."}` forces that specific tool. Extraction uses this.
- `tool_choice={"type": "any"}` forces some tool. The JSON helper uses this with a single tool, so the effect is the same.
- `tool_choice={"type": "auto"}` lets the model decide. That is for agents, not extraction.

**JSON mode with a response schema (Gemini).** You set `response_mime_type="application/json"`
and pass `response_schema`. The model's text output is then constrained to match the schema, and
you parse `response.text`.

**One schema, two providers.** `EXTRACT_SCHEMA` in
[llm_parser.py](../../../services/ai-service/app/services/llm_parser.py) is a single dict. Gemini
receives it as `response_schema` and Anthropic receives it as the tool's `input_schema`. The
parser depends only on the `LlmProvider` interface, and
[factory.py](../../../services/ai-service/app/providers/factory.py) picks the implementation from
settings. In C# terms this is one interface with two implementations registered by configuration.

**What the schema does and does not guarantee.** It guarantees shape: field names, types, enums
(`flow` can only be `DB` or `CR`), required fields. It does not guarantee the values are true.
The model can still return a wrong amount in a perfectly valid object. That is why extraction
output goes through the validation pipeline and why the eval harness exists.

Three schema habits used here:

- **Enums for closed sets.** `"enum": ["DB", "CR"]` removes a whole class of typos.
- **Descriptions on fields.** `"description": "ISO 8601: YYYY-MM-DD"` is read by the model. It is prompt text.
- **A field-by-field check before changing a schema** (rule THINK-03): name, type, a real example value, and the matching `TransactionDto` field. A wrong type here corrupts data without any error.

## Common mistakes

1. **Reading the content without checking the stop reason.** In this repo the check exists on the
   extraction path. Open `generate_json` in the same file and look for it (exercise 2).
2. **Setting `max_tokens` from the visible answer size.** Thinking tokens share the budget. This
   produced an empty response here.
3. **Treating a valid schema match as a correct answer.** Shape and truth are checked by different tools.
4. **Using temperature above 0 for extraction.** It adds variety to something that should not vary.
5. **Assuming the API has memory.** Anything the model should know must be in this request.

## What you should be able to say in an interview

> "We never parse free text. Anthropic gets a forced tool call and Gemini gets JSON mode with a
> response schema, and both receive the same schema dict behind one provider interface. The schema
> guarantees shape, not truth, so we validate downstream and measure accuracy with an eval set.
> Temperature is 0 everywhere, and a `max_tokens` stop on extraction is a hard error, because a
> truncated statement looks like a success and corrupts the ledger quietly."

Follow-up questions to prepare:

- Why forced tool use and not "please return JSON"?
- What happens when the statement is too long for one call?
- How would you add a third provider?
- What does the schema not protect you from?

## Exercises

No building. Each takes ten to fifteen minutes in the real code.

1. Open [anthropic.py](../../../services/ai-service/app/providers/anthropic.py) and name the
   purpose of each of the seven arguments in `extract_structured` without looking at this page.
2. In the same file, compare `extract_structured` with `generate_json`. One checks the stop reason
   and one does not. Work out what `generate_json` does today if the response is cut off, and
   whether that is acceptable for a 256-token classification. Then check whether the Gemini
   extraction path looks at `finish_reason`.
3. Open [llm_parser.py](../../../services/ai-service/app/services/llm_parser.py). For each field of
   `EXTRACT_SCHEMA`, say its type and give a real example value from a statement.
4. Open a recent extraction trace in Langfuse. Find the input tokens, output tokens and cost, and
   work out what share of the cost was output.

## Resources

- **Anthropic Academy** — *Building with the Claude API* (messages, tool use, vision, streaming sections).
- **Anthropic docs** — *Tool use* and *Handling stop reasons*.
- **Google AI docs** — *Structured output* for the Gemini API.
- This repo: [ai-service rules](../../../.claude/rules/ai-service.md), section "LLM Extraction Patterns".

## Self-check

**1. An extraction returns a valid object with 61 transactions from an 80-row statement. No exception was raised. What is the most likely cause, and where should it have been caught?**

<details>
<summary>Show answer</summary>

The output hit `max_tokens` and was cut off, or the path did not check the stop reason. It should be caught by checking the stop reason before reading the content, and treated as an error.
</details>

**2. Why does forcing a tool call give stronger guarantees than asking for JSON in the prompt?**

<details>
<summary>Show answer</summary>

The provider constrains the output to the schema, so field names, types and enums are enforced before your code sees the response. Asking in the prompt only makes JSON likely, and your parser carries the risk.
</details>

**3. A response schema is satisfied, but the amount is wrong. Which part of the system is responsible for catching that?**

<details>
<summary>Show answer</summary>

Not the schema. Validation rules downstream catch impossible values, and the eval harness measures how often values are wrong against ground truth.
</details>

**4. A model that thinks before answering returns an empty response with a 200-token output cap. Why?**

<details>
<summary>Show answer</summary>

Thinking tokens are counted against the output cap. The thinking pass used the budget and nothing was left for the visible answer.
</details>

**5. The user asks a follow-up, "and last month?", and the answer is wrong. The API call itself succeeded. What is missing?**

<details>
<summary>Show answer</summary>

Conversation history. The API is stateless and `/ask` sends a bare question, so "last month" has nothing to refer to. Either send the history or make every question self-contained.
</details>
