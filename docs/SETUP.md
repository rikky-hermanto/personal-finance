# Personal Finance — Setup Guide

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

That's it. No need to install .NET, Node.js, or PostgreSQL locally.

---

## Quick Start (Docker)

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd personal-finance
```

### 2. Start the entire stack

```bash
docker compose up --build
```

This single command will:

- Start a **PostgreSQL 16** database on port `5432`
- Build and start the **.NET 9 API** on port `7208`
- Build and start the **React frontend** on port `8080`
- Automatically run all database migrations and seed data

### 3. Open the app

| Service    | URL                          |
| ---------- | ---------------------------- |
| Frontend   | http://localhost:8080        |
| API        | http://localhost:7208        |
| API Health | http://localhost:7208/health |
| Swagger    | http://localhost:7208/openapi/v1.json |

---

## Stopping the App

```bash
# Stop all containers (data is preserved)
docker compose down

# Stop all containers AND delete database data
docker compose down -v
```

---

## Rebuilding After Code Changes

```bash
# Rebuild and restart all services
docker compose up --build

# Rebuild only the API
docker compose up --build api

# Rebuild only the frontend
docker compose up --build frontend
```

---

## Running in Detached Mode (Background)

```bash
# Start in background
docker compose up --build -d

# View logs
docker compose logs -f

# View logs for a specific service
docker compose logs -f api
docker compose logs -f frontend
docker compose logs -f db
```

---

## Project Architecture

```
personal-finance/
├── docker-compose.yml          # Orchestrates all services
├── Dockerfile                  # Frontend build (React + Vite -> Nginx)
├── nginx.conf                  # Nginx config for SPA routing
├── src/                        # Frontend source code (React/TypeScript)
├── public/                     # Frontend static assets
├── package.json                # Frontend dependencies
├── api/
│   ├── Dockerfile              # API build (.NET 9 multi-stage)
│   ├── PersonalFinance.slnx    # .NET solution file
│   ├── src/
│   │   ├── PersonalFinance.Api/            # Web API (controllers, middleware)
│   │   ├── PersonalFinance.Application/    # Business logic (CQRS, services)
│   │   ├── PersonalFinance.Domain/         # Entities & domain events
│   │   ├── PersonalFinance.Infrastructure/ # CSV/PDF parsers
│   │   └── PersonalFinance.Persistence/    # EF Core, migrations, DbContext
│   └── tests/
│       └── PersonalFinance.Tests/          # Unit tests
```

### Services

| Service      | Technology       | Port  | Description                              |
| ------------ | ---------------- | ----- | ---------------------------------------- |
| `db`         | PostgreSQL 16    | 5432  | Database with persistent volume          |
| `api`        | .NET 9           | 7208  | REST API with auto-migration on startup  |
| `frontend`   | React + Nginx    | 8080  | Single-page app served via Nginx         |

---

## Local Development (Without Docker)

If you prefer to run services locally without Docker:

### Prerequisites

- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)
- [Node.js 20+](https://nodejs.org/)
- [PostgreSQL 16+](https://www.postgresql.org/download/)

### 1. Start PostgreSQL

Make sure PostgreSQL is running on `localhost:5432` with:
- Database: `personal_finance`
- Username: `postgres`
- Password: `postgres123`

### 2. Start the API

```bash
cd api
dotnet run --project src/PersonalFinance.Api
```

The API will start on `http://localhost:7208`.

### 3. Start the frontend

```bash
# From the project root
npm install
npm run dev
```

The frontend will start on `http://localhost:8080`.

---

## Database Management

### Connecting to the database

```bash
# Via Docker
docker compose exec db psql -U postgres -d personal_finance

# Or with any PostgreSQL client
Host: localhost
Port: 5432
Database: personal_finance
Username: postgres
Password: postgres123
```

### Running migrations manually

Migrations run automatically on API startup. To run them manually:

```bash
cd api
dotnet ef database update --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api
```

### Creating a new migration

```bash
cd api
dotnet ef migrations add <MigrationName> --project src/PersonalFinance.Persistence --startup-project src/PersonalFinance.Api
```

---

## Troubleshooting

### Port already in use

If ports 5432, 7208, or 8080 are already taken, stop the conflicting process or change the port mapping in `docker-compose.yml`:

```yaml
ports:
  - "5433:5432"   # Map to a different host port
```

### Database connection refused

The API waits for PostgreSQL to be healthy before starting. If you still see connection errors, check:

```bash
docker compose ps        # Verify db container is healthy
docker compose logs db   # Check PostgreSQL logs
```

### Rebuilding from scratch

```bash
docker compose down -v       # Remove containers and volumes
docker compose up --build    # Rebuild everything fresh
```
