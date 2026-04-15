# PF-009 — Hello LLM: First Gemini API Call

> **GitHub Issue:** #17
> **Status:** In Progress
> **Started:** 2026-03-14

## Objective

Write a minimal Python script that calls the Google Gemini API, receives a response, and demonstrates core LLM API concepts (tokens, temperature, system vs user prompt, API key management). This is Day 0-1 of the AI learning path — a quick win to establish the foundation before building the full FastAPI extraction service.

## Acceptance Criteria

- [x] Python 3.12+ virtual environment set up under `services/ai-service/`
- [x] Google GenAI SDK installed (`pip install google-genai`)
- [ ] Script `services/ai-service/scripts/hello_llm.py` calls Gemini API with a system instruction and user message
- [ ] Successfully receives and prints a response
- [ ] Token usage logged from response metadata
- [ ] API key read from `GEMINI_API_KEY` environment variable (never hardcoded)
- [ ] Script is runnable: `python scripts/hello_llm.py`

## Approach

Create a standalone learning script (not part of the FastAPI app yet). Set up the Python virtual environment and `pyproject.toml` for the ai-service project at the same time — this scaffolding is needed anyway for Sprint 1. The script will call Gemini with a financial-domain system instruction and a sample user message, then pretty-print the response and token stats.

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
    "google-genai>=0.1.0",
]

[project.optional-dependencies]
dev = [
    "python-dotenv>=1.0.0",
]
```

> **Why `pyproject.toml`?** This is Python's modern equivalent of `.csproj`. It declares your project name, Python version requirement, and runtime dependencies. `google-genai` is a runtime dep (needed in production). `python-dotenv` is dev-only.
>
> **`requires-python = ">=3.12"`** — pin this so the team uses a consistent Python version.

---

### [x] STEP 3 — Create the virtual environment

Prerequisite: You need to install Python 3.12+ from python.org and ensure "Add Python to PATH" is checked during installation.

```bash
python -m venv .venv
```
> **What this does:** Creates a `.venv/` folder inside `services/ai-service/` that is an isolated Python installation.
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

---

### [x] STEP 5 — Install dependencies
```bash
# On Windows (Git Bash / bash):
pip install -e ".[dev]"
```
> **What this does:** Installs the `ai-service` project in "editable" mode (`-e`) PLUS the `dev` optional dependencies. This reads `pyproject.toml` and installs both `google-genai` and `python-dotenv`.
>
> **Verify installation:**
> ```bash
> pip list | grep -E "google-genai|dotenv"
> ```
> You should see both packages with version numbers.

---

### [x] STEP 6 — Get your Gemini API key
1. Go to https://aistudio.google.com/app/apikey
2. Sign in with your Google account.
3. Click **Create API key**.
4. Copy the key.

> **Cost awareness:** Google AI Studio provides a free tier for Gemini 1.5 Flash and Gemini 2.5 Flash, offering generous limits (like 15 requests per minute) that are more than enough for learning and development entirely for free.

---

### [x] STEP 7 — Create `.env` and `.env.example`

**`.env`** (your real key — never commit this):
```
GEMINI_API_KEY=your-actual-api-key-here
```

**`.env.example`** (commit this as documentation):
```
GEMINI_API_KEY=your-key-here
```

> **SEC-01 compliance:** API keys MUST come from environment variables, never hardcoded. `.env` is your local override file.

---

### [x] STEP 8 — Understand the key LLM concepts (read before coding)

Before writing the script, internalize these concepts:

| LLM Concept | .NET/backend analogy | What it does |
|---|---|---|
| **Messages API** | HTTP request body | Sends conversation turns to Gemini |
| **System instruction**| Constructor / app config | Persistent instructions that define the model's persona and rules. Applied before every user message. |
| **User message** | Request payload | The actual input the "user" sends |
| **`model`** | Service version | Which Gemini model to call. `gemini-2.5-flash` or `gemini-1.5-flash` = fast + cost-efficient. |
| **`temperature`** | Randomness dial | `0.0` = always same answer (use for extraction, categorization). `1.0` = creative/varied. For our financial parser: **always 0.0**. |
| **Input tokens** | CPU per request | Tokens in your prompt (system + user message). |
| **Output tokens** | CPU per response | Tokens in the reply. |

---

### [ ] STEP 9 — Write `scripts/hello_llm.py`

Write the file line by line, understanding each part:

```python
"""
PF-009: Hello LLM — First Gemini API call.
Learning script: NOT production code, NOT part of FastAPI app.
"""

# ── 1. Load .env file (dev-only convenience) ──────────────────────────────────
# python-dotenv reads the .env file and injects vars into os.environ.
from dotenv import load_dotenv
load_dotenv()

# ── 2. Standard imports ───────────────────────────────────────────────────────
import os

# ── 3. Google GenAI SDK ───────────────────────────────────────────────────────
from google import genai
from google.genai import types

# ── 4. Create the client ─────────────────────────────────────────────────────
# genai.Client() automatically reads GEMINI_API_KEY from os.environ.
# No need to pass the key manually.
client = genai.Client()

# ── 5. Build the request ─────────────────────────────────────────────────────
print("Calling Gemini API...")
print("─" * 50)

response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents=(
        "Categorize this transaction:\n"
        "Description: TRANSFER TO GOFOOD MERCHANT - GEPREK BENSU BALI\n"
        "Amount: IDR 85,000\n"
        "Type: DEBIT"
    ),
    config=types.GenerateContentConfig(
        temperature=0.0,
        system_instruction=(
            "You are a financial assistant helping categorize Indonesian bank transactions. "
            "Respond concisely with: (1) category name, (2) confidence (high/medium/low), "
            "(3) one-sentence reason."
        ),
    )
)

# ── 6. Print the response ────────────────────────────────────────────────────
print("Gemini's Response:")
print(response.text)
print()

# ── 7. Inspect the response object ───────────────────────────────────────────
# The response object contains metadata about the call
print("─" * 50)
print("Response Metadata:")
print(f"  Model used:          {response.model_version}")
print(f"  Finish reason:       {response.candidates[0].finish_reason if response.candidates else 'Unknown'}")

print()

# ── 8. Token usage ───────────────────────────────────────────────────────────
print("Token Usage:")
if response.usage_metadata:
    print(f"  Prompt tokens:       {response.usage_metadata.prompt_token_count}")
    print(f"  Candidates tokens:   {response.usage_metadata.candidates_token_count}")
    print(f"  Total tokens:        {response.usage_metadata.total_token_count}")
else:
    print("  Token usage data not available.")
print()

print("─" * 50)
print("Done.")
```

---

### [ ] STEP 10 — Run the script
```bash
# Make sure you are in services/ai-service/ with (.venv) active
python scripts/hello_llm.py
```

**Expected output structure:**
```
Calling Gemini API...
──────────────────────────────────────────────────
Gemini's Response:
Category: Food & Dining
Confidence: high
Reason: GoFood indicates a food delivery transaction from Geprek Bensu.

──────────────────────────────────────────────────
Response Metadata:
  Model used:          models/gemini-2.5-flash
  Finish reason:       FinishReason.STOP

Token Usage:
  Prompt tokens:       ...
  Candidates tokens:   ...
  Total tokens:        ...

──────────────────────────────────────────────────
Done.
```

---

### [ ] STEP 11 — Learning experiments

Run each experiment, observe the change, then reset to original before the next:

**Experiment A — Temperature effect on determinism:**
Change `temperature=0.0` in the config to `1.0`.

**Experiment B — Multi-turn conversation:**
Instead of `generate_content`, try creating a chat session:
```python
chat = client.chats.create(model='gemini-2.5-flash')
response1 = chat.send_message("Hello, remember the number 42")
response2 = chat.send_message("What number did I tell you?")
print(response2.text)
```

**Experiment C — System instruction impact:**
Change the `system_instruction` to `"You are a sarcastic assistant who hates banks."` and observe how the format changes.

---

### [ ] STEP 12 — Commit what was built

```bash
# From repo root
git add services/ai-service/pyproject.toml
git add services/ai-service/scripts/hello_llm.py
git add services/ai-service/.env.example
git status  # verify .env is NOT listed (should be gitignored)
git commit -m "PF-009: hello_llm.py — first Gemini API call, learning scaffold"
```

> **DO NOT `git add .env`** — confirm it doesn't appear in `git status` before committing.

---

## Notes

- **Model ID:** Use `gemini-2.5-flash` or `gemini-1.5-flash` as they are fast and have an excellent free tier in Google AI Studio.
- **`python-dotenv`:** Dev dependency only.
- **Token sizing rule of thumb:** 1 token ≈ 4 characters in English.
