---
title: API Endpoints (Mini Reference)
updated: 2025-12-14
---

# Personal Finance API — Endpoints Reference

Base URL (dev): `http://localhost:7208`

This document is a compact reference for the running .NET API. It lists all available endpoints, request/response shapes (DTOs), examples, and helpful notes for running and integrating with the API.

## Quick facts
- No authentication by default (dev only)
- CORS: `http://localhost:8080` is allowed in development by default
- Content types: `application/json` for most endpoints; `multipart/form-data` for uploads

## Common DTOs

- TransactionDto

```json
{
  "id": 0,
  "date": "2025-12-14T00:00:00Z",
  "description": "string",
  "remarks": "string",
  "flow": "DB",
  "type": "Expense",
  "category": "Untracked Expense",
  "wallet": "BCA",
  "amountIdr": 100000.0,
  "currency": "IDR",
  "exchangeRate": null,
  "balance": 0.0,
  "categoryRuleDto": null
}
```

- CategoryRuleDto

```json
{
  "id": 0,
  "keyword": "TRANSFER OUT RIKKI H",
  "type": "Expense",
  "category": "Bill",
  "keywordLength": 0
}
```

## Endpoints

Prefix: `/api`

### GET /api/transactions/health
- Purpose: health check
- Request: none
- Response 200:
```json
{ "status": "Healthy" }
```

### GET /api/transactions/supported-types
- Purpose: return supported banks and MIME types for parsing
- Response 200: array of objects `{ Bank, Types[] }`

### POST /api/transactions/upload-preview
- Purpose: Upload a bank statement (CSV or PDF) and receive parsed transactions for preview. No persistence.
- Content-Type: `multipart/form-data`
- Fields:
  - `file` (IFormFile) — required
  - `pdfPassword` (string) — optional
- Allowed MIME types: `text/csv`, `application/pdf`
- Success (200): JSON array of TransactionDto (balance set to 0 for preview)
- Errors: 400 (bad file / unsupported type / unrecognized bank), 500 (parse error)

Example (PowerShell / curl):
```powershell
curl -X POST "http://localhost:7208/api/transactions/upload-preview" \
  -F "file=@C:\path\to\statement.csv;type=text/csv"
```

### POST /api/transactions/submit
- Purpose: Persist a list of transactions. Optionally creates category rules if `CategoryRuleDto` is present and the category is new.
- Content-Type: `application/json`
- Body: JSON array of TransactionDto
- Response 200:
```json
{
  "Message": "X transactions imported successfully.",
  "Transactions": [ /* persisted TransactionDto objects */ ]
}
```

Example:
```powershell
curl -X POST "http://localhost:7208/api/transactions/submit" \
  -H "Content-Type: application/json" \
  -d '[{ "date":"2025-12-01","description":"Lunch","amountIdr":50000,"category":"Food","type":"Expense","wallet":"BCA" }]'
```

### GET /api/transactions
- Purpose: List transactions. Supports lightweight filtering.
- Query params (optional): `wallet`, `category`, `type`
- Response 200: array of TransactionDto

Example:
```powershell
curl "http://localhost:7208/api/transactions?wallet=BCA&category=Food&type=Expense"
```

### GET /api/transactions/{id}
- Purpose: Get a single transaction by integer `id`.
- Response: 200 TransactionDto or 404 Not Found

Example:
```powershell
curl http://localhost:7208/api/transactions/123
```

### GET /api/transactions/aggregated
- Purpose: Dashboard/aggregated data (summary, month stats, top categories, 6-month cash flow)
- Query params (optional): `wallet`, `year`, `month`
- Response 200: object with `Summary`, `CurrentMonth`, `TopCategories`, `CashFlow`, `LastUpdated`

Example:
```powershell
curl "http://localhost:7208/api/transactions/aggregated?year=2025&month=12"
```

### GET /api/categoryrules
- Purpose: List all category rules
- Response 200: array of CategoryRuleDto

Example:
```powershell
curl http://localhost:7208/api/categoryrules
```

### POST /api/categoryrules
- Purpose: Create a new category rule
- Content-Type: `application/json`
- Body: CategoryRuleDto (id ignored on create)
- Response 200: created CategoryRuleDto with `id` and `keywordLength`

Example:
```powershell
curl -X POST "http://localhost:7208/api/categoryrules" \
  -H "Content-Type: application/json" \
  -d '{ "keyword":"PAYMENT XYZ","type":"Expense","category":"Utilities" }'
```

### PUT /api/categoryrules/{id}
- Purpose: Update an existing category rule
- Body: CategoryRuleDto
- Response 200: updated CategoryRuleDto or 404 if not found

Example:
```powershell
curl -X PUT "http://localhost:7208/api/categoryrules/5" \
  -H "Content-Type: application/json" \
  -d '{ "id":5, "keyword":"NEW KEY","type":"Expense","category":"Groceries" }'
```

### DELETE /api/categoryrules/{id}
- Purpose: Delete a category rule by id
- Response: 200 OK or 404 Not Found

Example:
```powershell
curl -X DELETE http://localhost:7208/api/categoryrules/5
```

### GET /WeatherForecast
- Purpose: Project template sample endpoint. Returns weather samples.

Example:
```powershell
curl http://localhost:7208/WeatherForecast
```

## Errors & Status codes (summary)
- 200 OK — success
- 400 Bad Request — validation errors or bad input (upload issues, validation)
- 404 Not Found — resource not found
- 500 Internal Server Error — unexpected errors (parsing, DB issues)

## Run & local dev notes

- Frontend (dev):
```powershell
cd C:\Workspaces\personal-finance
npm install
npm run dev
```

- Backend (.NET dev):
```powershell
cd C:\Workspaces\personal-finance\api\src\PersonalFinance.Api
dotnet restore
dotnet run --launch-profile http
```

- Database:
  - Dev default (this repo): `appsettings.Development.json` controls the connection string.
  - If you run PostgreSQL locally, set `ConnectionStrings:Default` to something like:

```text
Host=localhost;Port=5432;Database=personal_finance;Username=postgres;Password=postgres123
```

  - If you prefer SQLite for quick local dev, the project can be switched to SQLite by updating dependency injection and connection string (some devs temporarily do this). For production/dev matching your screenshot, use PostgreSQL and run EF migrations:

```powershell
cd C:\Workspaces\personal-finance\api\src\PersonalFinance.Api
dotnet ef database update
```

## Tips
- Upload `file` field name is required for `/upload-preview` and must be `multipart/form-data`.
- Category rule matching is case-insensitive and prefers longer keywords (server orders by keyword length).
- No auth is enabled by default — do not expose the dev server publicly without adding authentication.

---

If you want, I can also produce a Postman collection or a single-file OpenAPI (Swagger) snippet exported from the running API for import into tools. Which would you like next?
