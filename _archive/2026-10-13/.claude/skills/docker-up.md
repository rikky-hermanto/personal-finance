---
name: docker-up
description: Start the full Docker stack and verify all services are healthy
---

# Docker Up

Start all services via Docker Compose and verify they are running correctly.

## Steps

1. **Start all services:**
   ```
   docker compose up --build -d
   ```

2. **Wait for services** — check status (retry up to 60 seconds):
   ```
   docker compose ps
   ```

3. **Verify API health:**
   ```
   curl -sf http://localhost:7208/health
   ```
   Expected: HTTP 200 with `{"status":"Healthy"}`

4. **Verify frontend:**
   ```
   curl -sf -o /dev/null -w "%{http_code}" http://localhost:8080
   ```
   Expected: HTTP 200

5. **If any service fails**, check logs:
   ```
   docker compose logs --tail=50 <failed-service>
   ```

6. **Common issues:**
   - Port 5432 in use → another PostgreSQL instance is running locally
   - API connection refused → DB not ready yet, wait and retry
   - Frontend 502 → API container not started, check `docker compose logs api`
   - Build fails → check for .NET restore errors or npm install errors
