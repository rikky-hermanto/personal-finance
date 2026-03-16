# PF-009 — Hello LLM: First Anthropic API Call

> **GitHub Issue:** #17
> **Status:** In Progress
> **Started:** 2026-03-14

## Objective

Write a minimal Python script that calls the Anthropic API, receives a response, and demonstrates core LLM API concepts (tokens, temperature, system vs user prompt, API key management). This is Day 0-1 of the AI learning path — a quick win to establish the foundation before building the full FastAPI extraction service.

## Acceptance Criteria

- [x] Python 3.12+ virtual environment set up under `services/ai-service/`
- [x] Anthropic SDK installed (`pip install anthropic`)
- [ ] Script `services/ai-service/scripts/hello_llm.py` calls Claude API with a system prompt and user message
- [ ] Successfully receives and prints a response
- [ ] Token usage logged from response metadata
- [x] API key read from `ANTHROPIC_API_KEY` environment variable (never hardcoded)
- [ ] Script is runnable: `python scripts/hello_llm.py`

## Approach

Create a standalone learning script (not part of the FastAPI app yet). Set up the Python virtual environment and `pyproject.toml` for the ai-service project at the same time — this scaffolding is needed anyway for Sprint 1. The script will call Claude with a financial-domain system prompt and a sample user message, then pretty-print the response and token stats.

Out of scope: FastAPI app, LLM extraction, PDF parsing — those are Sprint 1 tasks (PF-010+).

## Affected Files

| File | Change |
|------|--------|
| `services/ai-service/scripts/hello_llm.py` | Create — main learning script |
| `services/ai-service/pyproject.toml` | Create — project + dependency declaration |
| `services/ai-service/.env.example` | Create — template for API key env var |

---

## TODO

### [x] STEP 1 — Navigate to the ai-service directory
```bash
cd services/ai-service
```
> **Why:** All Python work lives here. Terminal must be inside this directory for venv and pip to work correctly relative to this project.

---

### [x] STEP 2 — Create `pyproject.toml`
Create the file `services/ai-service/pyproject.toml` with this content:

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "ai-service"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "anthropic>=0.49.0",
]

[project.optional-dependencies]
dev = [
    "python-dotenv>=1.0.0",
]
```

> **Why `pyproject.toml`?** This is Python's modern equivalent of `.csproj`. It declares your project name, Python version requirement, and runtime dependencies. `anthropic` is a runtime dep (needed in production). `python-dotenv` is dev-only — it's a convenience to load `.env` files locally; production will inject env vars via Docker/cloud.
>
> **`requires-python = ">=3.12"`** — pin this so the team uses a consistent Python version. Claude API SDK requires 3.8+ but we want 3.12 for modern features.

---

### [x] STEP 3 — Create the virtual environment

Prerequisite: You need to install Python 3.12+ from python.org and ensure "Add Python to PATH" is checked during installation.


```bash
python -m venv .venv
```
> **What this does:** Creates a `.venv/` folder inside `services/ai-service/` that is an isolated Python installation. It contains its own `python`, `pip`, and site-packages.
>
> **Why isolation matters:** Without venv, `pip install anthropic` goes into your system Python, polluting the global environment and causing version conflicts across projects. This is the Python equivalent of having separate NuGet package restores per solution — but you manage it manually.
>
> **Check:** You should see a new `.venv/` directory appear: `ls .venv/`

---

### [x] STEP 4 — Activate the virtual environment
```bash
# On Windows (Git Bash / bash terminal, for VSCode in the top-right corner of the terminal panel, look for the + icon. and select Git Bash from the list):
source .venv/Scripts/activate

# On macOS/Linux:
source .venv/bin/activate
```
> **What this does:** Prepends `.venv/Scripts/` to your `$PATH`. Now `python` and `pip` both point to the venv, not your system Python.
>
> **How to tell it worked:** Your terminal prompt will change to show `(.venv)` prefix, e.g.:
> ```
> (.venv) user@machine services/ai-service $
> ```
>
> **To deactivate later:** Just type `deactivate`

---

### [x] STEP 5 — Install dependencies
```bash
# On Windows (Git Bash / bash):
pip install -e ".[dev]"
```
> **What this does:** Installs the `ai-service` project in "editable" mode (`-e`) PLUS the `dev` optional dependencies. This reads `pyproject.toml` and installs both `anthropic` and `python-dotenv`.
>
> **Why `-e` (editable)?** Like a `ProjectReference` in .NET — changes to the project are reflected immediately without reinstalling. Required for local development of packages.
>
> **Verify installation:**
> ```bash
> pip list | grep -E "anthropic|dotenv"
> ```
> You should see both packages with version numbers.

---

### [x] STEP 6 — Get your Anthropic API key
1. Go to https://console.anthropic.com/
2. Sign in (or create a free account)
3. Navigate to **API Keys** → **Create Key**
4. Copy the key — it starts with `sk-ant-api03-...`

> **Cost awareness:** The free tier gives you $5 credit. `claude-sonnet-4-6` costs approximately:
> - Input: $3 per million tokens
> - Output: $15 per million tokens
>
> A single test message costs ~$0.0001 (one-tenth of a cent). You won't run out of free credit during PF-009.

---

### [x] STEP 7 — Create `.env` and `.env.example`

**`.env`** (your real key — never commit this):
```
ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here
```

**`.env.example`** (commit this as documentation):
```
ANTHROPIC_API_KEY=your-key-here
```

> **SEC-01 compliance:** API keys MUST come from environment variables, never hardcoded. `.env` is your local override file.
>
> **Verify .gitignore covers it:**
> ```bash
> # Run from repo root
> git check-ignore -v services/ai-service/.env
> ```
> Expected output: `.gitignore:XX:*.env   services/ai-service/.env`
> If nothing prints, the file is NOT ignored — you need to add `.env` to `.gitignore` before continuing.

---

### STEP 8 — Understand the key LLM concepts (read before coding)

Before writing the script, internalize these — they map to concepts you already know from building APIs:

| LLM Concept | .NET/backend analogy | What it does |
|---|---|---|
| **Messages API** | HTTP request body | Sends conversation turns to Claude |
| **System prompt** | Constructor / app config | Persistent instructions that define Claude's persona and rules. Applied before every user message. |
| **User message** | Request payload | The actual input the "user" sends |
| **`model`** | Service version / feature flag | Which Claude model to call. `claude-sonnet-4-6` = fast + cost-efficient. `claude-opus-4-6` = most capable but 5x more expensive. |
| **`max_tokens`** | Response size limit | Hard cap on output length. If Claude hits this, `stop_reason` = `"max_tokens"` (truncated!). Set it generously for learning. |
| **`temperature`** | Randomness dial | `0.0` = always same answer (use for extraction, categorization — deterministic). `1.0` = creative/varied (use for writing, brainstorming). For our financial parser: **always 0.0**. |
| **Input tokens** | CPU per request | Tokens in your prompt (system + user message). Cheaper to bill. |
| **Output tokens** | CPU per response | Tokens in Claude's reply. More expensive to bill. |

**Token sizing rule of thumb:**
- 1 token ≈ 4 characters in English
- "Hello, world!" ≈ 4 tokens
- A typical 1-page PDF ≈ 500–1500 tokens
- A BCA bank statement row: "14/03/2024 TRANSFER GoPay 500000" ≈ 15 tokens

---

### STEP 9 — Write `scripts/hello_llm.py`

Write the file line by line, understanding each part:

```python
"""
PF-009: Hello LLM — First Anthropic API call.
Learning script: NOT production code, NOT part of FastAPI app.
"""

# ── 1. Load .env file (dev-only convenience) ──────────────────────────────────
# python-dotenv reads the .env file and injects vars into os.environ.
# In production (Docker/cloud), env vars are injected externally — load_dotenv() is a no-op.
from dotenv import load_dotenv
load_dotenv()

# ── 2. Standard imports ───────────────────────────────────────────────────────
import os

# ── 3. Anthropic SDK ──────────────────────────────────────────────────────────
import anthropic

# ── 4. Create the client ─────────────────────────────────────────────────────
# anthropic.Anthropic() automatically reads ANTHROPIC_API_KEY from os.environ.
# No need to pass the key manually. This is the correct pattern.
client = anthropic.Anthropic()

# ── 5. Build the request ─────────────────────────────────────────────────────
print("Calling Claude API...")
print("─" * 50)

message = client.messages.create(
    model="claude-sonnet-4-6",           # Model ID — the specific Claude version to call
    max_tokens=1024,                      # Max output length. 1024 = enough for a paragraph response.
    system=(
        "You are a financial assistant helping categorize Indonesian bank transactions. "
        "Respond concisely with: (1) category name, (2) confidence (high/medium/low), "
        "(3) one-sentence reason. Use standard finance categories like Food & Dining, "
        "Transportation, Shopping, Utilities, Transfer, Entertainment."
    ),
    messages=[
        {
            "role": "user",
            "content": (
                "Categorize this transaction:\n"
                "Description: TRANSFER TO GOFOOD MERCHANT - GEPREK BENSU BALI\n"
                "Amount: IDR 85,000\n"
                "Type: DEBIT"
            )
        }
    ]
)

# ── 6. Print the response ────────────────────────────────────────────────────
print("Claude's Response:")
print(message.content[0].text)
print()

# ── 7. Inspect the response object ───────────────────────────────────────────
# The response object contains metadata about the call — always check stop_reason!
print("─" * 50)
print("Response Metadata:")
print(f"  Message ID:   {message.id}")
print(f"  Model used:   {message.model}")
print(f"  Stop reason:  {message.stop_reason}")
# stop_reason values:
#   "end_turn"   = Claude finished naturally (good)
#   "max_tokens" = Response was TRUNCATED — increase max_tokens if this happens

print()

# ── 8. Token usage ───────────────────────────────────────────────────────────
print("Token Usage:")
print(f"  Input tokens:  {message.usage.input_tokens}")
print(f"  Output tokens: {message.usage.output_tokens}")
print(f"  Total tokens:  {message.usage.input_tokens + message.usage.output_tokens}")
print()

# ── 9. Estimate cost ─────────────────────────────────────────────────────────
# Sonnet 4.6 pricing (as of 2025): $3/M input tokens, $15/M output tokens
# Source: https://www.anthropic.com/pricing
INPUT_COST_PER_MILLION = 3.00
OUTPUT_COST_PER_MILLION = 15.00

input_cost  = message.usage.input_tokens  * INPUT_COST_PER_MILLION  / 1_000_000
output_cost = message.usage.output_tokens * OUTPUT_COST_PER_MILLION / 1_000_000
total_cost  = input_cost + output_cost

print("Estimated Cost:")
print(f"  Input:  ${input_cost:.6f} USD")
print(f"  Output: ${output_cost:.6f} USD")
print(f"  Total:  ${total_cost:.6f} USD  (~${total_cost * 15000:.4f} IDR)")
print()
print("─" * 50)
print("Done.")
```

---

### STEP 10 — Run the script
```bash
# Make sure you are in services/ai-service/ with (.venv) active
python scripts/hello_llm.py
```

**Expected output structure:**
```
Calling Claude API...
──────────────────────────────────────────────────
Claude's Response:
Category: Food & Dining
Confidence: High
Reason: GoPay/GoFood transaction to a restaurant (Geprek Bensu) indicates a food delivery purchase.

──────────────────────────────────────────────────
Response Metadata:
  Message ID:   msg_01XxXxXxXxXxXxXx
  Model used:   claude-sonnet-4-6-20250514
  Stop reason:  end_turn

Token Usage:
  Input tokens:  120
  Output tokens: 35
  Total tokens:  155

Estimated Cost:
  Input:  $0.000360 USD
  Output: $0.000525 USD
  Total:  $0.000885 USD  (~IDR 0.0133)

──────────────────────────────────────────────────
Done.
```

> **What to verify:**
> - `stop_reason` must be `"end_turn"` (not `"max_tokens"`)
> - Response text is sensible and matches expected format
> - Token count is small (< 300 total for this simple test)

---

### STEP 11 — Learning experiments (do these — they build muscle memory)

Run each experiment, observe the change, then reset to original before the next:

**Experiment A — Temperature effect on determinism:**
Add `temperature=0.0` to `client.messages.create()`, run 3 times → responses should be identical.
Then change to `temperature=1.0`, run 3 times → responses vary.
```python
# Add this parameter to client.messages.create():
temperature=0.0,   # Try 0.0, then 1.0
```
> **Takeaway for this project:** Financial extraction must use `temperature=0.0`. We want "IDR 85,000" every time, not a creative interpretation.

**Experiment B — max_tokens truncation:**
Change `max_tokens=10`, run the script. Observe:
- Response is cut off mid-sentence
- `stop_reason` becomes `"max_tokens"` instead of `"end_turn"`
> **Takeaway:** Always check `stop_reason` in your parser code. Truncated LLM output = corrupted extraction.

**Experiment C — Multi-turn conversation:**
Add a second message to the `messages` list (assistant + user):
```python
messages=[
    {
        "role": "user",
        "content": "Categorize: TRANSFER TO GOFOOD MERCHANT - GEPREK BENSU BALI, IDR 85,000"
    },
    {
        "role": "assistant",
        "content": "Category: Food & Dining, Confidence: High"
    },
    {
        "role": "user",
        "content": "Now categorize: GRAB-GRABCAR BALI, IDR 35,000"
    }
]
```
> **Takeaway:** The Messages API is stateless — you pass the FULL history on every call. There is no "session". This matters when we build the extraction pipeline.

**Experiment D — System prompt impact:**
Change the system prompt to `"You are a sarcastic assistant who hates banks."` and observe how the same user message produces a completely different tone and format.
> **Takeaway:** The system prompt is the most powerful lever for controlling output format. When we build the PDF extractor, we'll use the system prompt to enforce JSON output structure.

---

### STEP 12 — Commit what was built

```bash
# From repo root
git add services/ai-service/pyproject.toml
git add services/ai-service/scripts/hello_llm.py
git add services/ai-service/.env.example
git status  # verify .env is NOT listed (should be gitignored)
git commit -m "PF-009: hello_llm.py — first Anthropic API call, learning scaffold"
```

> **DO NOT `git add .env`** — confirm it doesn't appear in `git status` before committing.

---

## Notes

- **Model ID:** Use `claude-sonnet-4-6` — current efficient model. `claude-opus-4-6` exists but is 5x more expensive; use only for complex reasoning tasks.
- **`python-dotenv`:** Dev dependency only. Never import it in FastAPI app code — production env vars come from Docker/cloud injection.
- **`stop_reason` check:** Critical habit. In the extraction pipeline (PF-010+), truncated output breaks JSON parsing. Always assert `stop_reason == "end_turn"`.
- **Token math:** System prompt tokens are charged on EVERY call. Keep system prompts tight in production to control cost at scale (500 bank rows/month × token count = real cost).
- **ai-service directory:** Only `scripts/` exists. Full FastAPI scaffold (`app/`, `Dockerfile`, `tests/`) is Sprint 1 work — this ticket only needs `pyproject.toml` + the script.
- **Cost note:** `claude-sonnet-4-6` at ~$0.001 per categorization request. 500 transactions/month ≈ $0.50/month — negligible.
- **Next step after this (PF-010):** Build the FastAPI service skeleton with a `/health` endpoint, then add the `/extract/pdf` endpoint using structured output (`tool_use`) to force JSON matching our `TransactionDto` schema.
