"""Disposable local PF-S08 harness only: real access-token expiry and refresh.

Requires the harness Auth `jwt_expiry` to be short (<= 60 s) so the browser's
access token genuinely expires during the test; restore it afterwards. Starts
the API with the pilot enabled, provisions one disposable user with one
transaction, runs e2e/auth-session-expiry.spec.ts and always cleans up.

    python scripts/pf_s08_session_expiry.py <harness-workdir>
"""

import os
import re
import socket
import subprocess
import sys
import time
import uuid
from datetime import date
from pathlib import Path

from pf_s08_local_http_smoke import OWNED_TABLES, request, require

REPO = Path(__file__).resolve().parents[1]


def main(harness):
    config = (harness / "supabase" / "config.toml").read_text(encoding="utf-8")
    require('project_id = "personal-finance-pf-s08-harness"' in config, "Not the disposable harness")
    match = re.search(r"^jwt_expiry\s*=\s*(\d+)", config, re.MULTILINE)
    ttl = int(match.group(1)) if match else 3600
    require(ttl <= 60, f"Set [auth] jwt_expiry <= 60 in the harness config and restart it (now {ttl})")

    status_env = subprocess.run(
        ["npx", "--no-install", "supabase", "status", "--workdir", str(harness), "-o", "env"],
        cwd=REPO, capture_output=True, text=True, check=True, shell=os.name == "nt").stdout
    values = dict(line.split("=", 1) for line in status_env.splitlines() if "=" in line)
    values = {k: v.strip().strip('"') for k, v in values.items()}
    base, anon, admin = values["API_URL"].rstrip("/"), values["ANON_KEY"], values["SERVICE_ROLE_KEY"]
    require(base.endswith(":55421"), "Status points outside the disposable harness")

    email = f"pf-s08-expiry-{uuid.uuid4().hex}@example.invalid"
    password = uuid.uuid4().hex + "Aa1!"
    user_id, api_process = None, None
    try:
        status, created = request(base, "/auth/v1/admin/users", admin, admin, "POST",
                                  {"email": email, "password": password, "email_confirm": True})
        require(status in (200, 201) and created and created.get("id"), "Admin provisioning failed")
        user_id = created["id"]
        status, _ = request(base, "/rest/v1/transactions", admin, admin, "POST", {
            "user_id": user_id, "date": f"{date.today().isoformat()}T00:00:00Z",
            "description": "PF-S08 Expiry marker", "remarks": "", "flow": "CR", "type": "Income",
            "category": "Test", "amount_idr": 1, "currency": "IDR"})
        require(status in (200, 201), f"Fixture transaction insert failed (HTTP {status})")

        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            api_base = f"http://127.0.0.1:{probe.getsockname()[1]}"
        environment = os.environ.copy()
        environment.update({
            "ASPNETCORE_URLS": api_base, "ASPNETCORE_ENVIRONMENT": "Development",
            "Supabase__Url": base, "Supabase__AnonKey": anon,
            "Supabase__JwtValidationMode": "Jwks", "Supabase__JwtIssuer": base + "/auth/v1",
            "Supabase__JwtAudience": "authenticated",
            "CashflowPilot__Enabled": "true", "CashflowPilot__CheckedMutationsEnabled": "true",
            "Cors__AllowedOrigins__0": "http://127.0.0.1:8088",
            "AiService__InternalApiKey": "local-test-internal-key-only",
        })
        api_process = subprocess.Popen(
            ["dotnet", "run", "--no-build", "--no-launch-profile", "--project",
             str(REPO / "apps/api/src/PersonalFinance.Api/PersonalFinance.Api.csproj")],
            cwd=REPO, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(240):
            require(api_process.poll() is None, "API exited before readiness")
            # An unlisted /api route answers 404 once the gate is in the pipeline.
            if request(api_base, "/api/pf-s08-readiness-probe", anon, anon)[0] == 404:
                break
            time.sleep(0.25)
        else:
            raise AssertionError("API did not become ready")

        browser_env = os.environ.copy()
        browser_env.update({
            "VITE_SUPABASE_URL": base, "VITE_SUPABASE_ANON_KEY": anon, "VITE_API_URL": api_base,
            "PF_S08_EXPIRY_EMAIL": email, "PF_S08_EXPIRY_PASSWORD": password,
            "PF_S08_API_URL": api_base, "PF_S08_JWT_EXPIRY_SECONDS": str(ttl),
        })
        run = subprocess.run(
            ["npx", "playwright", "test", "-c", "playwright.pf-s08.config.ts",
             "e2e/auth-session-expiry.spec.ts"],
            cwd=REPO / "apps/frontend", env=browser_env, capture_output=True, text=True,
            timeout=ttl + 300, shell=os.name == "nt")
        output = (run.stdout + run.stderr).replace(password, "[redacted]")
        require(run.returncode == 0 and "1 passed" in output,
                "Session expiry browser test failed:\n" + "\n".join(output.splitlines()[-40:]))
        print(f"PASS: access token expired after {ttl}s, API rejected it, the app refreshed "
              "and kept loading owner data, and reload restored the session")
    finally:
        if api_process is not None:
            api_process.terminate()
        if user_id is not None:
            for table in OWNED_TABLES:
                request(base, f"/rest/v1/{table}?user_id=eq.{user_id}", admin, admin, "DELETE")
            request(base, f"/auth/v1/admin/users/{user_id}", admin, admin, "DELETE")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
