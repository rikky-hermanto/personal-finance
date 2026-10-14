"""Disposable local PF-S08 harness only: A/B isolation for the reopened modules.

Starts the API with the pilot enabled, provisions two disposable users, and
proves through real HTTP calls that Assets, Liabilities, Investments, Macro
Lab, Desk, Net Worth and Journey only ever show or change the caller's rows.
Optionally also checks the mapped legacy owner still sees their data.

    python scripts/pf_s08_module_isolation.py <harness-workdir>
        [--owner-email EMAIL --owner-password-file PATH --owner-assets N]
"""

import argparse
import os
import socket
import subprocess
import time
import uuid
from datetime import date
from pathlib import Path

from pf_s08_local_http_smoke import OWNED_TABLES, request, require

REPO = Path(__file__).resolve().parents[1]


def sign_in(base, anon, email, password):
    status, session = request(base, "/auth/v1/token?grant_type=password", anon, anon, "POST",
                              {"email": email, "password": password})
    require(status == 200 and session and session.get("access_token"), f"Sign-in failed (HTTP {status})")
    return session["access_token"]


def ids(api, anon, token, path):
    status, rows = request(api, path, anon, token)
    require(status == 200 and isinstance(rows, list), f"GET {path} failed (HTTP {status})")
    return {row["id"] for row in rows}


def main(args):
    harness = Path(args.harness)
    config = (harness / "supabase" / "config.toml").read_text(encoding="utf-8")
    require('project_id = "personal-finance-pf-s08-harness"' in config, "Not the disposable harness")
    status_env = subprocess.run(
        ["npx", "--no-install", "supabase", "status", "--workdir", str(harness), "-o", "env"],
        cwd=REPO, capture_output=True, text=True, check=True, shell=os.name == "nt").stdout
    values = {k: v.strip().strip('"') for k, v in
              (line.split("=", 1) for line in status_env.splitlines() if "=" in line)}
    base, anon, admin = values["API_URL"].rstrip("/"), values["ANON_KEY"], values["SERVICE_ROLE_KEY"]
    require(base.endswith(":55421"), "Status points outside the disposable harness")

    users, api_process = [], None
    try:
        for label in ("a", "b"):
            email = f"pf-s08-module-{label}-{uuid.uuid4().hex}@example.invalid"
            password = uuid.uuid4().hex + "Aa1!"
            status, created = request(base, "/auth/v1/admin/users", admin, admin, "POST",
                                      {"email": email, "password": password, "email_confirm": True})
            require(status in (200, 201) and created and created.get("id"), "Admin provisioning failed")
            users.append((created["id"], sign_in(base, anon, email, password)))
        (a_id, a), (b_id, b) = users

        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            api = f"http://127.0.0.1:{probe.getsockname()[1]}"
        environment = os.environ.copy()
        environment.update({
            "ASPNETCORE_URLS": api, "ASPNETCORE_ENVIRONMENT": "Development",
            "Supabase__Url": base, "Supabase__AnonKey": anon, "Supabase__ServiceRoleKey": admin,
            "Supabase__JwtValidationMode": "Jwks", "Supabase__JwtIssuer": base + "/auth/v1",
            "Supabase__JwtAudience": "authenticated",
            "CashflowPilot__Enabled": "true", "CashflowPilot__CheckedMutationsEnabled": "true",
            "AiService__InternalApiKey": "local-test-internal-key-only",
        })
        api_process = subprocess.Popen(
            ["dotnet", "run", "--no-build", "--no-launch-profile", "--project",
             str(REPO / "apps/api/src/PersonalFinance.Api/PersonalFinance.Api.csproj")],
            cwd=REPO, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(240):
            require(api_process.poll() is None, "API exited before readiness")
            if request(api, "/api/journey/state", anon, anon)[0] == 401:
                break
            time.sleep(0.25)
        else:
            raise AssertionError("API did not become ready")

        # A creates one row per module through the API.
        status, asset = request(api, "/api/assets", anon, a, "POST", {
            "name": "PF-S08 A asset", "assetClass": "cash", "currency": "IDR"})
        require(status == 200 and asset, f"A asset create failed (HTTP {status})")
        status, liability = request(api, "/api/liabilities", anon, a, "POST", {
            "name": "PF-S08 A loan", "liabilityType": "personal", "principal": 1,
            "startDate": date.today().isoformat(), "assetId": asset["id"]})
        require(status == 200 and liability, f"A liability create failed (HTTP {status})")
        status, setup = request(api, "/api/investments/setups", anon, a, "POST", {
            "name": "PF-S08 A setup", "archetypeId": "balanced"})
        require(status == 200 and setup, f"A setup create failed (HTTP {status})")
        status, scenario = request(api, "/api/macro-scenarios", anon, a, "POST", {
            "name": "PF-S08 A scenario", "driversJson": "{}"})
        require(status == 200 and scenario, f"A scenario create failed (HTTP {status})")

        listings = [("/api/assets", asset["id"]), ("/api/liabilities", liability["id"]),
                    ("/api/investments/setups", setup["id"]), ("/api/macro-scenarios", scenario["id"])]
        for path, row_id in listings:
            require(row_id in ids(api, anon, a, path), f"A cannot see its own row at {path}")
            require(row_id not in ids(api, anon, b, path), f"B can see A's row at {path}")
        print("ok  A sees its rows; B sees none of them (assets, liabilities, setups, scenarios)")

        for method, path in [("PUT", f"/api/assets/{asset['id']}"),
                             ("DELETE", f"/api/assets/{asset['id']}"),
                             ("DELETE", f"/api/liabilities/{liability['id']}"),
                             ("DELETE", f"/api/investments/setups/{setup['id']}"),
                             ("PUT", f"/api/investments/setups/{setup['id']}/holdings"),
                             ("DELETE", f"/api/macro-scenarios/{scenario['id']}")]:
            payload = None
            if path.endswith("/holdings"):
                payload = {"holdings": []}
            elif method == "PUT":
                payload = {"id": asset["id"], "name": "hijacked", "assetClass": "cash",
                           "currency": "IDR", "valuationStrategy": "Manual"}
            status, _ = request(api, path, anon, b, method, payload)
            require(status == 404, f"B {method} {path} returned HTTP {status}, expected 404")
        for path, row_id in listings:
            require(row_id in ids(api, anon, a, path), f"B's attempt changed A's row at {path}")
        print("ok  B cannot update or delete A's rows (404) and A's rows are intact")

        status, _ = request(api, "/api/liabilities", anon, b, "POST", {
            "name": "PF-S08 B forged link", "liabilityType": "personal", "principal": 1,
            "startDate": date.today().isoformat(), "assetId": asset["id"]})
        require(status >= 400, f"B linked a liability to A's asset (HTTP {status})")
        require(not ids(api, anon, b, "/api/liabilities"), "B's forged liability was stored")
        print("ok  B cannot link a liability to A's asset")

        for path in ("/api/journey/state", "/api/networth/current", "/api/desk/state"):
            for token in (a, b):
                status, _ = request(api, path, anon, token)
                require(status == 200, f"GET {path} failed (HTTP {status})")
        status, a_journey = request(api, "/api/journey/recalculate", anon, a, "POST", {})
        require(status == 200, f"A journey recalc failed (HTTP {status})")
        status, rows = request(base, f"/rest/v1/user_journey_state?select=user_id", admin, admin)
        owners = {row["user_id"] for row in rows}
        require(a_id in owners and "00000000-0000-0000-0000-000000000001" not in owners,
                "Journey state was not written for the caller")
        print("ok  Journey, Net Worth and Desk respond per caller; recalc writes the caller's state")

        if args.owner_email:
            password = Path(args.owner_password_file).read_text(encoding="utf-8").strip()
            owner = sign_in(base, anon, args.owner_email, password)
            count = len(ids(api, anon, owner, "/api/assets"))
            require(count == args.owner_assets, f"Owner sees {count} assets, expected {args.owner_assets}")
            require(asset["id"] not in ids(api, anon, owner, "/api/assets"), "Owner sees A's asset")
            print(f"ok  mapped owner sees exactly their {count} assets")
        print("PASS: reopened modules are owner-isolated through the API")
    finally:
        if api_process is not None:
            api_process.terminate()
        for user_id, _ in users:
            for table in OWNED_TABLES:
                request(base, f"/rest/v1/{table}?user_id=eq.{user_id}", admin, admin, "DELETE")
            request(base, f"/auth/v1/admin/users/{user_id}", admin, admin, "DELETE")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("harness")
    parser.add_argument("--owner-email")
    parser.add_argument("--owner-password-file")
    parser.add_argument("--owner-assets", type=int, default=0)
    main(parser.parse_args())
