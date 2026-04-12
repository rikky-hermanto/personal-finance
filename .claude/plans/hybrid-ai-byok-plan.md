# Implementation Plan: Hybrid BYOK (Bring Your Own Key) Architecture

## Overview
This document outlines the architecture and implementation steps for transitioning the AI extraction pipeline into a **Hybrid Model**:
1. **Free Tier (Default):** Runs on a pre-defined, cheap, fast model (e.g., Gemini 1.5 Flash) heavily rate-limited by our backend.
2. **Power User Tier (BYOK):** Users provide their own API key (Anthropic, OpenAI, etc.) to bypass rate limits and use smarter inference models (e.g., Claude 3 Opus, GPT-4o).

---

## 🏛️ Architecture Modifications

### 1. Database (Supabase)
To securely store third-party API keys, we will utilize **Supabase Vault** to ensure keys are encrypted at rest and never exposed in plaintext within standard table querying.

- **New Table `user_ai_settings`:** 
  - `user_id` (PK, FK to auth.users)
  - `ai_tier` (enum: `free`, `byok`)
  - `default_provider` (enum: `gemini`, `openai`, `anthropic`)
  - `vault_secret_id` (uuid, FK to vault.secrets)
- **Supabase Vault:** We will store the actual string of the user's API key here.

### 2. Frontend (React / TypeScript)
- **New Settings UI:** Add a "Developer / AI Settings" tab in the dashboard.
- **Provider Selection:** Dropdown to select model provider.
- **Secure Input:** A password-masked input field to save their API Key.
- **Client Fallbacks:** If the user gets a 429 (Rate Limit) on the free tier, the UI should prompt: *"Rate limit reached. Upgrade to BYOK to connect your own API account."*

### 3. Middle Tier (.NET 9 Web API)
- **Settings Endpoints:** `GET /api/users/ai-settings` and `POST /api/users/ai-settings`
- **Key Management:** When a user submits an API key, the .NET backend securely passes this to Supabase Vault via the Supabase C# SDK to generate the `vault_secret_id`.
- **Rate-Limiting (Free Tier):** Implement `AspNetCore.RateLimiting` on the upload/AI processing endpoints, scoped to `user_id`, applied **only** if they are on the `free` tier.

### 4. AI Service (Python FastAPI)
- **Dynamic Provider Routing:** Replace hardcoded singleton AI clients with dynamic initialization per request.
- **Webhook Update:** When the database webhook fires, the AI service will:
  1. Retrieve the user's configuration (`ai_tier`).
  2. If `free`, use the system's `GEMINI_API_KEY` environment variable.
  3. If `byok`, fetch the decrypted key from Supabase Vault (using Service Role).
  4. Initialize the requested LangChain/LiteLLM provider.
  5. Run the parsing inference asynchronously.

---

## 📦 Implementation Steps

### Phase 1: Database & Secret Storage
- [ ] Enable `vault` extension in Supabase (`create extension if not exists supabase_vault;`).
- [ ] Create `user_ai_settings` table and hook it to `auth.users`.
- [ ] Set up RLS on `user_ai_settings` so users can only read/update their own settings (but cannot query `vault.secrets` directly).

### Phase 2: .NET API Updates
- [ ] Create `UserAiSettingsController` with MediatR queries/commands.
- [ ] Add `RateLimitingMiddleware` configured specifically for users on the `free` tier (e.g., max 5 statements per day).
- [ ] Add Vault integration in `SupabaseService.cs` to insert/update keys securely.

### Phase 3: AI Service (Python) Updates
- [ ] Install an abstraction library like `litellm` (or implement unified LangChain wrappers).
- [ ] Update the `webhooks.py` entrypoint. Inject logic to fetch `user_ai_settings`.
- [ ] Add error mapping for user-provided keys:
  - If a user's API key is invalid or out of credits, return a specific error status (`auth_error` or `insufficient_quota`) back to the `statement_uploads` table.

### Phase 4: Frontend UI
- [ ] Build the `/settings/ai` page.
- [ ] Implement UI indicators: The dashboard should clearly state which mode the user is running in (e.g., a green badge "BYOK Active").
- [ ] Handle AI webhook failure notifications in the UI (e.g., gracefully telling the user their BYOK API key has zero balance).

---

## 🔒 Security Considerations
1. **Never return API Keys to the Client:** The `GET /api/users/ai-settings` endpoint must **never** return the actual API key. It should only return a boolean `has_key_configured: true`.
2. **Service Role Isolation:** The Python FastAPI backend should be the only service with the Supabase Service Role Key authorized to actually decrypt and read strings from `vault.secrets`.
3. **Usage Logging:** Ensure that debug logs on both .NET and Python sides do not accidentally log user API keys during variable dumping.
