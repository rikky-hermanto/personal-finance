# LLM Fundamentals

> **Topic doc, not a plan.** This is the study material for topic 24 of the
> [learning path](../ai-engineer-learning-path.md): *LLM fundamentals + the fine-tuning answer*.
> This page covers the first half, how a language model works at the depth of an interview
> conversation. The second half already exists: read
> [fine-tuned LLMs](08-fine-tuned-llms.md) for "when would you fine-tune?".
>
> There is nothing to build. No math is needed. **Time:** one evening for this page, one for the
> fine-tuning doc. **Read first** in this folder: the other docs use its vocabulary. The curriculum
> schedules it as topic 24, so the deadline is before Chapter 11, but nothing stops you reading it
> earlier. The fine-tuning half is the last doc in the folder, [08](08-fine-tuned-llms.md).

## What you will be able to do

- Explain in two minutes what happens between sending a prompt and receiving a response.
- Define token, embedding, attention, context window, KV cache, temperature and top-p in plain words.
- Connect each concept to a behaviour you have already seen in this project.
- Answer the common "why does an LLM do X?" interview questions.

## What it is

**A large language model is a neural network trained to predict the next token of a text. It
produces a response by predicting one token, appending it to the input, and predicting again,
until it emits a stop signal or reaches the output cap.**

Everything else on this page explains a consequence of that sentence.

You have already met the consequences in this repo. Every provider call in
[anthropic.py](../../../services/ai-service/app/providers/anthropic.py) and
[gemini.py](../../../services/ai-service/app/providers/gemini.py) sets `temperature=0.0`. Totals
in chat are computed by SQL and not by the model. A 200-token cap once produced an empty answer.
Each of these is a fundamentals fact showing up as an engineering decision.

### What it's used for

You will not implement any of this. It is used for three things:

| Use | Example |
|---|---|
| Explaining your own design decisions | "Why temperature 0?" "Why does SQL do the sum?" |
| Debugging | Truncated output, slow first token, cost that grows with history |
| Interview screening questions | "What is a token?" "Why do LLMs hallucinate?" "What is the KV cache?" |

## The helicopter view

```
 "Berapa total"                                                       " belanja"
       │                                                                  ▲
       ▼                                                                  │
┌────────────┐   ┌────────────┐   ┌───────────────────┐   ┌──────────────────────┐
│ tokenizer  │──▶│ embeddings │──▶│ transformer layers│──▶│ probabilities for    │
│ text → ids │   │ ids →      │   │ attention +       │   │ every possible next  │
│            │   │ vectors    │   │ feed-forward      │   │ token → pick one     │
└────────────┘   └────────────┘   └───────────────────┘   └──────────────────────┘
       ▲                                                                  │
       └────────────── append the picked token and run again ────────────┘
```

## Tokens

The model does not see characters or words. A **tokenizer** splits text into **tokens**, pieces
from a fixed vocabulary of some tens of thousands of entries, and maps each to a number. Common
English words are usually one token. Rare words, other languages, numbers and codes are split into
several.

Why it matters to you:

- **Billing and limits are in tokens**, not characters. `max_tokens`, the context window and the price list all count tokens.
- **Bank text is token-expensive.** A description like `TRSF E-BANKING DB 0307/FTSCY/WS95031` is mostly fragments, so it costs more tokens than a sentence of the same length. This is why extracting PDF text with PyMuPDF before the call, and not sending page images, cuts cost so much.
- **Numbers are split into pieces.** `1.250.000` is several tokens with no built-in notion of quantity. That is one reason models are unreliable at arithmetic, and why this project gives totals to SQL.

## Embeddings

Each token id is turned into a vector, a list of numbers that places the token in a space where
related meanings sit near each other. Position information is added so the model knows word order.

This is the same idea as the embeddings from Chapter 3, with one difference. There, a separate
embedding model turned a whole transaction into one vector for search. Here, the vectors are the
model's internal working representation, one per token.

## Attention and the transformer

A sentence's meaning depends on relationships between words. In "transfer ke rekening itu", the
model has to work out what "itu" refers to.

**Attention** is the mechanism for that. For each token, the model computes how relevant every
earlier token is to it, and blends in information from the relevant ones. A **transformer** is a
stack of layers, each made of an attention step followed by a small feed-forward network. Early
layers pick up surface patterns and later layers pick up meaning. Generation models only look
backwards: a token can attend to earlier tokens, never later ones.

Two practical consequences:

- **Cost grows with length.** Every token attends to every earlier token, so long contexts are slower and more expensive.
- **Position affects use.** Material at the start and end of a long context is used more reliably than material in the middle. Put instructions first and the question last.

You do not need the equations. You should be able to say: "attention lets each token pull in
information from the earlier tokens that matter to it."

## Generating one token at a time

After the layers, the model outputs a score for every token in its vocabulary. Those become
probabilities, one token is picked, it is appended to the input, and the process repeats. This is
called **autoregressive** generation.

Consequences you have already seen:

- **Streaming is natural.** Tokens exist one at a time, so sending them as they are produced (Chapter 5) costs nothing extra.
- **The model does not plan to a length.** When it reaches `max_tokens` it stops wherever it is, including in the middle of a JSON object. That is the truncation error handled in the extraction path.
- **Output is slower and pricier than input.** Input is processed in one pass. Each output token needs its own pass.
- **Hallucination is the default behaviour, not a malfunction.** The model always produces a likely next token. Nothing inside it checks whether the result is true. If the answer is not in the context, a plausible one comes out anyway. Grounding, citations and the `confident` flag in `/ask` exist because of this.
- **Thinking is also generated tokens.** On models that reason before answering, that reasoning is output and counts against the cap. This is what starved the follow-up suggester at 200 tokens.

## The KV cache

Generating token 500 needs attention over tokens 1 to 499. Recomputing everything for each new
token would repeat almost all the work.

During attention each token produces two intermediate vectors, called a key and a value. The
**KV cache** stores them for all tokens processed so far, so each new step only computes the new
token and reuses the rest. It trades memory for speed and is standard in every serving stack.

Why you should know it:

- It explains **time to first token**: the whole prompt must be processed once before the first output token, and after that each token is fast.
- It is what **prompt caching** exposes as a product feature. The provider keeps the processed state of a prompt prefix between requests, so a repeated prefix is not processed again. See [context engineering and prompt caching](04-context-engineering-prompt-caching.md).
- It is a frequent screening question. One good sentence: "the KV cache stores each token's attention keys and values so generation doesn't recompute the whole sequence for every new token."

## Temperature, top-p and top-k

These control how the next token is picked from the probabilities.

| Setting | What it does |
|---|---|
| Temperature | Sharpens or flattens the probabilities. At 0 the most likely token is always taken. Higher values give less likely tokens a real chance |
| Top-p | Only the smallest set of tokens whose probabilities add up to p is considered |
| Top-k | Only the k most likely tokens are considered |

Use 0 for extraction, classification and anything evaluated against ground truth, which is every
call in this service. Use a higher temperature for brainstorming or varied wording. Adjust
temperature or top-p, not both at once.

Temperature 0 is not a guarantee of identical output. Hardware and serving differences can still
change a result between runs. For an eval, this means a single run is a sample, not a proof.

## The context window

The **context window** is the maximum number of tokens the model can handle in one call, input and
output together. It is also the model's only working memory. Nothing persists between calls.

- What you call "memory" in an application is your code putting earlier text back into the window.
- A window that fits your data does not mean you should fill it. Cost grows, speed drops, and accuracy on details in the middle falls.
- This is the practical argument for RAG even with very large windows: retrieve the few rows that matter and leave out the rest.

## Where the knowledge comes from

Models are trained in stages. **Pretraining** on a very large body of text teaches next-token
prediction, and language, facts and reasoning patterns emerge from it. Further training then
shapes the model to follow instructions and behave as an assistant.

Two limits follow:

- **A knowledge cutoff.** The model knows nothing after its training data ends, and nothing private. Your transactions were never in it.
- **Weights are frozen at inference.** The model does not learn from your prompts. To change what it knows on a call, you change the context (prompting, RAG). To change how it behaves by default, you change the weights (fine-tuning).

That last sentence is the bridge to the second half of this topic. Continue with
[fine-tuned LLMs](08-fine-tuned-llms.md).

## Common mistakes

1. **Saying the model "looks up" or "remembers" facts.** It predicts tokens. Facts come from training patterns or from the context you supply.
2. **Treating hallucination as a bug to be patched out.** It is the normal mechanism without grounding. You manage it with retrieval, citations, refusal paths and evals.
3. **Counting in characters or words.** Limits and prices are in tokens.
4. **Expecting temperature 0 to be perfectly repeatable.**
5. **Confusing the KV cache with prompt caching.** The first works inside one generation. The second reuses work across requests.
6. **Confusing the model's internal embeddings with the embedding model used for search.**

## What you should be able to say in an interview

The two-minute version:

> "Text is split into tokens and each token becomes a vector. A stack of transformer layers uses
> attention so each token can pull in information from the earlier ones that matter. The output
> is a probability for every possible next token. One is picked, appended, and the loop repeats
> until a stop token or the output cap. Temperature and top-p control how the pick is made. The KV
> cache stores per-token attention state so each step only computes the new token. The context
> window is the model's only memory, and the weights don't change at inference, so new knowledge
> comes in through the context and new default behaviour comes in through fine-tuning."

Questions to prepare, each answerable from this page:

- What is a token, and why does it matter for cost?
- Why do LLMs hallucinate?
- Why are LLMs bad at arithmetic, and what do you do about it?
- What is the KV cache?
- What is the difference between temperature and top-p?
- If the context window is a million tokens, why use RAG?
- When would you fine-tune instead of prompting or using RAG? (see [fine-tuned LLMs](08-fine-tuned-llms.md))

## Exercises

No building.

1. Say the two-minute version out loud, record it, and listen once. Repeat until it runs without notes.
2. Paste three real transaction descriptions and one ordinary Indonesian sentence into a provider's tokenizer tool. Note the tokens per character for each.
3. Open a streamed `/ask` trace in Langfuse. Compare the time before the first token with the time per token after it, and explain the difference using this page.
4. For each of these project decisions, name the fundamentals fact behind it: `temperature=0.0` everywhere; SQL computes totals; a `max_tokens` stop is an error; the follow-up suggester's cap is 2048.

## Resources

- **Andrej Karpathy** — *Intro to Large Language Models* (one-hour talk; the best single resource for this page).
- **Andrej Karpathy** — *Let's build the GPT Tokenizer* (optional, if tokens still feel abstract).
- **Chip Huyen** — *AI Engineering*, the chapter on understanding foundation models.
- **Jay Alammar** — *The Illustrated Transformer* (pictures for attention).
- Field guide: `interview/questions/01-theory.md` for the full list of theory questions.

## Self-check

**1. Why is generating 1,000 output tokens slower than reading 1,000 input tokens?**

<details>
<summary>Show answer</summary>

Input tokens are processed together in one pass. Output tokens are produced one at a time, each needing its own pass through the model.
</details>

**2. What does the KV cache store, and what would happen without it?**

<details>
<summary>Show answer</summary>

The attention keys and values of every token processed so far. Without it, each new token would require recomputing the whole sequence, so generation would get slower with every token.
</details>

**3. A model with a very large context window is available. Give two reasons to still retrieve a small set of rows.**

<details>
<summary>Show answer</summary>

Cost and latency grow with every input token, and accuracy on details drops in long contexts, especially in the middle. Irrelevant rows also distract the model.
</details>

**4. The model states a transaction amount that is not in the context. Is the model broken?**

<details>
<summary>Show answer</summary>

No. It produced a likely continuation, which is all it ever does. The system around it is missing grounding: an instruction to answer only from context, a refusal path, citations that can be checked, and an eval that measures faithfulness.
</details>

**5. You need the model to know about transactions uploaded today. Prompting, RAG or fine-tuning?**

<details>
<summary>Show answer</summary>

RAG. The data is new and private, and weights are frozen, so it has to arrive through the context. Fine-tuning changes behaviour and is the wrong tool for fresh facts.
</details>

**6. Two runs at temperature 0 give slightly different answers. What does that mean for an eval?**

<details>
<summary>Show answer</summary>

Temperature 0 reduces variation but does not remove it. Treat one run as a sample: run important evals more than once, or accept a small tolerance, before calling a change a regression.
</details>
