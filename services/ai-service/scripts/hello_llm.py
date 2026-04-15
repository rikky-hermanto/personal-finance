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

# Ex. Output.
# Calling Gemini API...
# ──────────────────────────────────────────────────
# Gemini's Response:
# Food & Dining, High, The transaction explicitly states a transfer to a GoFood merchant (Geprek Bensu) for food.

# ──────────────────────────────────────────────────
# Response Metadata:
#   Model used:          gemini-2.5-flash
#   Finish reason:       FinishReason.STOP

# Token Usage:
#   Prompt tokens:       80
#   Candidates tokens:   27
#   Total tokens:        338

# ──────────────────────────────────────────────────
# Done.
 