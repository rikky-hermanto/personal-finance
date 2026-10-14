"""Disposable local PF-S08 Auth/PostgREST A/B smoke test. No paid services."""

import json
import subprocess
import sys
import uuid
import socket
import time
import os
import tempfile
import base64
import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


# Every owner-keyed table a disposable test user can touch, children before
# parents, so cleanup can delete the user afterwards.
OWNED_TABLES = (
    "transactions", "uploaded_files", "cashflow_import_receipts",
    "valuations", "liabilities", "holdings", "assets",
    "investment_setups", "macro_scenarios",
    "user_journey_state", "journey_indicator_snapshots", "journey_achievements",
    "desk_open_trades", "desk_journal_entries", "desk_recon_issues",
    "desk_mandate_versions", "desk_positions", "desk_broker_accounts",
    "category_rules", "wallet_account_aliases", "bucket_settings",
    "bucket_category_overrides", "accounts", "institutions",
)


def request(base, path, key, token, method="GET", payload=None, extra=None):
    headers = {"apikey": key, "Authorization": f"Bearer {token}"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if extra:
        headers.update(extra)
    data = json.dumps(payload).encode() if payload is not None else None
    req = Request(base + path, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=15) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except HTTPError as error:
        raw = error.read()
        try:
            failure = json.loads(raw)
            return error.code, {"code": failure.get("code", failure.get("Code", "unspecified")),
                                "message": str(failure.get("message", ""))[:200]}
        except (ValueError, AttributeError):
            return error.code, {"code": "unparseable"}
    except URLError:
        return 0, None


def preview_standard_csv(api_base, token):
    fixture = (Path(__file__).resolve().parents[1] /
               "apps/frontend/e2e/fixtures/transaction-template-sample.csv").read_bytes()
    boundary = f"pf-s08-{uuid.uuid4().hex}".encode()
    body = (b"--" + boundary +
            b'\r\nContent-Disposition: form-data; name="file"; filename="standard.csv"\r\n' +
            b"Content-Type: text/csv\r\n\r\n" + fixture + b"\r\n--" + boundary + b"--\r\n")
    upload = Request(api_base + "/api/transactions/upload-preview", data=body,
                     headers={"Authorization": f"Bearer {token}",
                              "Content-Type": "multipart/form-data; boundary=" + boundary.decode()},
                     method="POST")
    try:
        with urlopen(upload, timeout=30) as response:
            return response.status, json.loads(response.read())
    except HTTPError as error:
        return error.code, {"code": "upload_failed"}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def token_claim_summary(token, expected_issuer):
    header, payload, _ = token.split(".")
    def decode(part):
        return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
    header, payload = decode(header), decode(payload)
    return (f"alg={header.get('alg')}, issuer_matches={payload.get('iss') == expected_issuer}, "
            f"aud={payload.get('aud')}, role={payload.get('role')}")


def main(harness):
    config = (harness / "supabase" / "config.toml").read_text(encoding="utf-8")
    require('project_id = "personal-finance-pf-s08-harness"' in config, "Not the disposable harness")
    require("port = 55421" in config, "Unexpected API port")
    result = subprocess.run(
        ["rtk", "proxy", "npx", "supabase", "status", "--workdir", str(harness), "-o", "env"],
        cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, check=True,
    )
    values = {}
    for line in result.stdout.splitlines():
        if "=" in line:
            name, value = line.split("=", 1)
            values[name] = value.strip().strip('"').strip("'")
    base = values["API_URL"].rstrip("/")
    require(base.endswith(":55421"), "Status points outside the disposable harness")
    anon, admin = values["ANON_KEY"], values["SERVICE_ROLE_KEY"]
    users, accounts, browser_credentials = [], [], []
    empty_user_id = None
    storage_object = None
    api_process = None
    startup_log = tempfile.TemporaryFile(mode="w+t", encoding="utf-8")

    def startup_diagnostics():
        startup_log.flush()
        startup_log.seek(0)
        output = startup_log.read()
        tokens = [user[1] for user in users if isinstance(user, tuple)]
        for secret in (anon, admin, values["JWT_SECRET"], *tokens):
            if secret:
                output = output.replace(secret, "[redacted]")
        return "\n".join(output.splitlines()[-30:]) or "no startup output"

    try:
        status, _ = request(base, "/auth/v1/signup", anon, anon, "POST", {
            "email": f"pf-s08-closed-{uuid.uuid4().hex}@example.invalid",
            "password": uuid.uuid4().hex + "Aa1!",
        })
        require(status in (400, 401, 403, 422), "Public signup is open")
        for _ in range(2):
            email = f"pf-s08-{uuid.uuid4().hex}@example.invalid"
            password = uuid.uuid4().hex + "Aa1!"
            browser_credentials.append((email, password))
            status, created = request(base, "/auth/v1/admin/users", admin, admin, "POST",
                                      {"email": email, "password": password, "email_confirm": True})
            require(status in (200, 201) and created and created.get("id"), "Admin provisioning failed")
            users.append(created["id"])
            status, session = request(base, "/auth/v1/token?grant_type=password", anon, anon, "POST",
                                      {"email": email, "password": password})
            require(status == 200 and session and session.get("access_token"),
                    f"User sign-in failed (HTTP {status}, code {session.get('code') if session else 'none'})")
            users[-1] = (created["id"], session["access_token"])

        transaction_ids = []
        for index, (user_id, _) in enumerate(users):
            account_id = str(uuid.uuid4())
            accounts.append(account_id)
            status, _ = request(base, "/rest/v1/accounts", admin, admin, "POST", {
                "id": account_id, "user_id": user_id, "name": f"PF-S08 Test {index}",
                "account_type": "checking", "currency": "IDR", "opening_date": date.today().isoformat(),
            })
            require(status in (200, 201), "Admin account fixture failed")
            status, created_tx = request(base, "/rest/v1/transactions", admin, admin, "POST", {
                "user_id": user_id, "account_id": account_id,
                "date": datetime.now(timezone.utc).isoformat(),
                "description": f"PF-S08 Browser {'A' if index == 0 else 'B'}",
                "remarks": "", "flow": "CR", "type": "Income", "category": "Test",
                "amount_idr": 100 if index == 0 else 50, "currency": "IDR",
            }, {"Prefer": "return=representation"})
            require(status in (200, 201) and created_tx, "Admin transaction fixture failed")
            transaction_ids.append(created_tx[0]["id"])
            status, created_file = request(base, "/rest/v1/uploaded_files", admin, admin, "POST", {
                "user_id": user_id, "file_hash": "pf-s08-http-shared-hash", "file_name": "fixture.csv",
            }, {"Prefer": "return=representation"})
            require(status in (200, 201) and created_file, "Admin file-hash fixture failed")

        owned_institutions, owned_setup_accounts = [], []
        for index, (_, token) in enumerate(users):
            status, institution_id = request(base, "/rest/v1/rpc/create_cashflow_institution",
                                             anon, token, "POST", {
                "p_name": f"PF-S08 Bank {index}", "p_type": "bank",
                "p_country": "ID"})
            require(status == 200 and uuid.UUID(institution_id),
                    f"Checked institution setup failed (HTTP {status})")
            owned_institutions.append(institution_id)
            status, account_id = request(base, "/rest/v1/rpc/create_cashflow_account",
                                         anon, token, "POST", {
                "p_institution_id": institution_id, "p_name": "New pilot account",
                "p_account_type": "checking", "p_currency": "IDR",
                "p_opening_balance": 0, "p_opening_date": date.today().isoformat()})
            require(status == 200 and uuid.UUID(account_id),
                    f"Checked account setup failed (HTTP {status}, code {account_id.get('code') if isinstance(account_id, dict) else 'none'})")
            owned_setup_accounts.append(account_id)
        status, foreign = request(base, "/rest/v1/rpc/create_cashflow_account",
                                  anon, users[0][1], "POST", {
            "p_institution_id": owned_institutions[1], "p_name": "Foreign parent",
            "p_account_type": "checking", "p_currency": "IDR",
            "p_opening_balance": 0, "p_opening_date": date.today().isoformat()})
        require(status in (400, 403) and foreign and foreign.get("code") == "P0001",
                "Cross-owner institution was accepted by account setup")

        for index, (user_id, token) in enumerate(users):
            for table in ("transactions", "accounts", "uploaded_files"):
                status, rows = request(base, f"/rest/v1/{table}?select=user_id", anon, token)
                expected = 2 if table == "accounts" else 1
                require(status == 200 and len(rows) == expected
                        and all(row["user_id"] == user_id for row in rows),
                        f"{table} A/B isolation failed")
            status, rows = request(base, "/rest/v1/v_transactions_with_balance?select=user_id,running_balance", anon, token)
            require(status == 200 and len(rows) == 1 and rows[0]["user_id"] == user_id
                    and int(rows[0]["running_balance"]) == (100 if index == 0 else 50),
                    "Balance view isolation failed")
            status, rows = request(base, "/rest/v1/desk_positions?select=user_id", anon, token)
            require(status == 200 and all(row["user_id"] == user_id for row in rows),
                    "Desk positions leaked another owner's rows")
            status, _ = request(base, "/rest/v1/transactions", anon, token, "POST", {
                "user_id": users[1 - index][0], "date": datetime.now(timezone.utc).isoformat(),
                "description": "forged", "remarks": "", "flow": "CR", "type": "Income",
                "category": "Test", "amount_idr": 1, "currency": "IDR",
            })
            require(status in (401, 403, 404), "Direct forged-owner DML remained available")
            status, graph = request(base, "/graphql/v1", anon, token, "POST", {
                "query": "{ transactionsCollection(first: 10) { edges { node { id user_id } } } }"})
            require(status == 200 and graph and not graph.get("errors") and
                    all(edge["node"]["user_id"] == user_id for edge in
                        graph.get("data", {}).get("transactionsCollection", {}).get("edges", [])) and
                    len(graph["data"]["transactionsCollection"]["edges"]) == 1,
                    f"GraphQL transaction owner isolation failed (HTTP {status}, {graph})")
            status, graph = request(base, "/graphql/v1", anon, token, "POST", {
                "query": "{ valuationsCollection(first: 10) { edges { node { id user_id } } } }"})
            require(status == 200 and graph and not graph.get("errors") and
                    all(edge["node"]["user_id"] == user_id for edge in
                        graph.get("data", {}).get("valuationsCollection", {}).get("edges", [])),
                    "GraphQL valuations leaked another owner's rows")
        storage_object = f"pf-s08/{uuid.uuid4().hex}.txt"
        storage_path = f"/storage/v1/object/bank-statements/{storage_object}"
        upload_request = Request(base + storage_path, data=b"pf-s08-disposable-storage-check",
                                 headers={"apikey": admin, "Authorization": f"Bearer {admin}",
                                          "Content-Type": "text/plain"}, method="POST")
        with urlopen(upload_request, timeout=15) as uploaded:
            require(uploaded.status in (200, 201), "Admin storage fixture upload failed")
        for token in (anon, users[0][1], users[1][1]):
            object_request = Request(base + storage_path, headers={
                "apikey": anon, "Authorization": f"Bearer {token}"})
            try:
                with urlopen(object_request, timeout=15) as exposed:
                    raise AssertionError(f"Private storage object leaked (HTTP {exposed.status})")
            except HTTPError as denied:
                require(denied.code in (400, 401, 403, 404),
                        f"Unexpected private storage response {denied.code}")
            status, listed = request(base, "/storage/v1/object/list/bank-statements",
                                     anon, token, "POST", {"prefix": "pf-s08/", "limit": 100})
            require(status in (401, 403, 404) or (status == 200 and listed == []),
                    "Private storage object leaked through listing")
        with socket.socket() as port_probe:
            port_probe.bind(("127.0.0.1", 0))
            api_port = port_probe.getsockname()[1]
        api_base = f"http://127.0.0.1:{api_port}"
        environment = os.environ.copy()
        environment.update({
            "ASPNETCORE_URLS": api_base,
            "ASPNETCORE_ENVIRONMENT": "Development",
            "Supabase__Url": base,
            "Supabase__AnonKey": anon,
            "Supabase__JwtValidationMode": "Jwks",
            "Supabase__JwtIssuer": base + "/auth/v1",
            "Supabase__JwtAudience": "authenticated",
            "CashflowPilot__Enabled": "true",
            "CashflowPilot__CheckedMutationsEnabled": "true",
            "Cors__AllowedOrigins__0": "http://127.0.0.1:8088",
            "AiService__InternalApiKey": "local-test-internal-key-only",
            "Logging__LogLevel__Microsoft.AspNetCore.Authentication": "Debug",
        })
        project = Path(__file__).resolve().parents[1] / "apps/api/src/PersonalFinance.Api/PersonalFinance.Api.csproj"
        api_process = subprocess.Popen(
            ["dotnet", "run", "--no-build", "--no-launch-profile", "--project", str(project)],
            cwd=Path(__file__).resolve().parents[1], env=environment,
            stdout=startup_log, stderr=subprocess.STDOUT,
        )
        for _ in range(240):
            if api_process.poll() is not None:
                raise AssertionError(f"API process exited before readiness:\n{startup_diagnostics()}")
            # An unlisted /api route answers 404 once the gate is in the pipeline.
            status, _ = request(api_base, "/api/pf-s08-readiness-probe", anon, users[0][1])
            if status == 404:
                break
            time.sleep(0.25)
        else:
            raise AssertionError(f"API did not become ready:\n{startup_diagnostics()}")
        api_institution_ids, api_account_ids = [], []
        preview_shape = None
        preview_a = None
        for user_id, token in users:
            status, preview = preview_standard_csv(api_base, token)
            require(status == 200 and preview and preview.get("transactions"),
                    f"Standard CSV upload preview failed (HTTP {status})")
            shape = (len(preview["transactions"]),
                     sum(bool(row.get("isDuplicate")) for row in preview["transactions"]),
                     preview.get("hash"))
            if preview_shape is None:
                preview_shape = shape
                preview_a = preview
            require(shape == preview_shape,
                    "Identical A/B standard CSV previews had different duplicate results")
            status, page = request(api_base, "/api/transactions?page=1&pageSize=10", anon, token)
            require(status == 200 and isinstance(page, dict) and len(page.get("items", [])) == 1,
                    f"API transaction page A/B check failed (HTTP {status}, response type {type(page).__name__}, code {page.get('code') if isinstance(page, dict) else 'none'}, {token_claim_summary(token, base + '/auth/v1')}):\n{startup_diagnostics()}")
            status, own_detail = request(api_base,
                                         f"/api/transactions/{transaction_ids[0 if user_id == users[0][0] else 1]}",
                                         anon, token)
            require(status == 200 and own_detail and own_detail.get("id") ==
                    transaction_ids[0 if user_id == users[0][0] else 1],
                    "Own transaction detail was unavailable")
            status, _ = request(api_base,
                                f"/api/transactions/{transaction_ids[1 if user_id == users[0][0] else 0]}",
                                anon, token)
            require(status == 404, f"Foreign transaction detail was visible (HTTP {status})")
            status, rows = request(api_base, "/api/accounts", anon, token)
            require(status == 200 and len(rows) == 2, "API account A/B check failed")
            for path in (
                "/api/accounts/balances", "/api/accounts/institutions",
                "/api/transactions/aggregated", "/api/transactions/statement",
                "/api/transactions/account-summaries",
                "/api/spending-analysis/safe-to-spend", "/api/spending-analysis/variance",
                "/api/insights", "/api/insights/daily-pulse",
                "/api/buckets", "/api/buckets/month-close",
                "/api/categoryrules",
            ):
                status, data = request(api_base, path, anon, token)
                require(status == 200 and
                        f"PF-S08 Browser {'B' if user_id == users[0][0] else 'A'}" not in
                        json.dumps(data),
                        f"Pilot Cashflow read failed owner isolation at {path} (HTTP {status})")
            status, _ = request(api_base, "/api/transactions/submit", anon, token, "POST", {})
            require(status == 400, "Checked API submit did not reject a missing request ID")
            status, institution = request(api_base, "/api/accounts/institutions", anon,
                                          token, "POST", {"name": "API pilot bank",
                                                          "type": "bank", "country": "ID"})
            require(status == 200 and institution and institution.get("id"),
                    f"Checked API institution create failed (HTTP {status}, {institution})")
            api_institution_ids.append(institution["id"])
            status, account = request(api_base, "/api/accounts", anon, token, "POST", {
                "institutionId": institution["id"], "name": "API pilot account",
                "accountType": "checking", "currency": "IDR",
                "openingBalance": 0, "openingDate": date.today().isoformat()})
            require(status == 200 and account and account.get("id")
                    and account.get("institutionId") == institution["id"],
                    f"Checked API account create failed (HTTP {status}, {account})")
            api_account_ids.append(account["id"])
            status, updated = request(api_base,
                                      f"/api/accounts/institutions/{institution['id']}",
                                      anon, token, "PUT", {
                "name": "Updated pilot bank", "type": "bank", "country": "ID"})
            require(status == 200 and updated and updated.get("name") == "Updated pilot bank",
                    "Checked API institution update failed")
            status, updated = request(api_base, f"/api/accounts/{account['id']}",
                                      anon, token, "PUT", {
                "name": "Updated pilot account", "accountType": "checking",
                "currency": "IDR", "isActive": True})
            require(status == 200 and updated and updated.get("name") == "Updated pilot account",
                    "Checked API account update failed")
            status, updated = request(api_base, f"/api/accounts/{account['id']}/cashflow",
                                      anon, token, "PATCH", False)
            require(status == 200 and updated and updated.get("includeInCashflow") is False,
                    "Checked API account cashflow flag failed")
            status, updated = request(api_base,
                                      f"/api/accounts/{account['id']}/opening-balance",
                                      anon, token, "PATCH", {
                "openingBalance": 123.45, "openingDate": date.today().isoformat()})
            require(status == 200 and updated and float(updated.get("openingBalance", 0)) == 123.45,
                    "Checked API opening balance update failed")
        with ThreadPoolExecutor(max_workers=4) as pool:
            simultaneous_reads = list(pool.map(
                lambda user: request(api_base, "/api/transactions?page=1&pageSize=10",
                                     anon, user[1]),
                [users[0], users[1], users[1], users[0]]))
        require(all(status == 200 and result.get("total") == 1 and
                    result["items"][0]["description"] ==
                    f"PF-S08 Browser {'A' if index in (0, 3) else 'B'}"
                    for index, (status, result) in enumerate(simultaneous_reads)),
                "Concurrent A/B API reads mixed caller results")
        reviewed = next((row for row in preview_a["transactions"]
                         if not row.get("isDuplicate") and row.get("description") and
                         row.get("type") and row.get("category") and
                         (row.get("amountIdr") or 0) > 0), None)
        require(reviewed is not None, "Standard CSV had no suitable preview parity row")
        parity_request_id = str(uuid.uuid4())
        status, parity = request(api_base, "/api/transactions/submit", anon,
                                 users[0][1], "POST", {
            "requestId": parity_request_id,
            "transactions": [{**reviewed, "categoryRuleDto": None}]})
        require(status == 200 and parity and parity.get("insertedCount") == 1,
                f"Reviewed standard CSV row did not submit (HTTP {status}, {parity})")
        status, preview_after = preview_standard_csv(api_base, users[0][1])
        require(status == 200 and
                sum(bool(row.get("isDuplicate")) for row in preview_after["transactions"]) >
                preview_shape[1],
                "Preview did not recognize a checked submitted CSV row as duplicate")
        inserted_id = parity["insertedIds"][0]
        status, _ = request(base, f"/rest/v1/transactions?id=eq.{inserted_id}",
                            admin, admin, "DELETE")
        require(status in (200, 204), "Preview parity row cleanup failed")
        status, _ = request(base,
                            f"/rest/v1/cashflow_import_receipts?request_id=eq.{parity_request_id}",
                            admin, admin, "DELETE")
        require(status in (200, 204), "Preview parity receipt cleanup failed")
        status, foreign = request(api_base, "/api/accounts", anon, users[0][1], "POST", {
            "institutionId": api_institution_ids[1], "name": "Foreign API parent",
            "accountType": "checking", "currency": "IDR", "openingBalance": 0,
            "openingDate": date.today().isoformat()})
        require(status == 404 and foreign and foreign.get("code") == "institution_unavailable",
                f"Checked API account accepted foreign institution (HTTP {status}, {foreign})")
        status, _ = request(api_base, f"/api/accounts/{api_account_ids[1]}",
                            anon, users[0][1], "PUT", {
            "name": "Foreign update", "accountType": "checking",
            "currency": "IDR", "isActive": True})
        require(status == 404, "Cross-owner API account update was accepted")
        status, _ = request(api_base,
                            f"/api/accounts/{api_account_ids[1]}/opening-balance",
                            anon, users[0][1], "PATCH", {
            "openingBalance": 999, "openingDate": date.today().isoformat()})
        require(status == 404, "Cross-owner API opening balance update was accepted")
        status, _ = request(api_base, f"/api/accounts/{api_account_ids[1]}",
                            anon, users[0][1], "DELETE")
        require(status == 404, "Cross-owner API account delete was accepted")
        status, _ = request(api_base, f"/api/accounts/institutions/{api_institution_ids[1]}",
                            anon, users[0][1], "DELETE")
        require(status == 404, "Cross-owner API institution delete was accepted")
        status, in_use = request(api_base, f"/api/accounts/{accounts[0]}",
                                 anon, users[0][1], "DELETE")
        require(status == 409 and in_use and in_use.get("code") == "account_in_use",
                "Account deletion did not protect an existing transaction")
        status, _ = request(api_base, f"/api/accounts/{api_account_ids[0]}",
                            anon, users[0][1], "DELETE")
        require(status == 200, "Owner A could not delete an empty account")
        status, _ = request(api_base, f"/api/accounts/institutions/{owned_institutions[0]}",
                            anon, users[0][1], "DELETE")
        require(status == 200, "Owner A could not delete an institution")
        status, remaining = request(base,
                                    f"/rest/v1/accounts?id=eq.{owned_setup_accounts[0]}&select=institution_id",
                                    anon, users[0][1])
        require(status == 200 and remaining and remaining[0]["institution_id"] is None,
                "Institution delete did not preserve its account")
        rule_ids = []
        for index, (_, token) in enumerate(users):
            status, created = request(api_base, "/api/categoryrules", anon, token, "POST", {
                "keyword": "PF-S08 private coffee", "type": "Expense",
                "category": f"Coffee {index}", "flow": "DB"})
            require(status == 200 and created and created.get("id") and
                    created.get("flow") == "DB",
                    f"Checked API private rule create failed (HTTP {status}, {created})")
            rule_ids.append(created["id"])
            status, own = request(api_base, "/api/categoryrules", anon, token)
            require(status == 200 and any(r["id"] == created["id"] for r in own) and
                    all(r.get("category") != f"Coffee {1-index}" for r in own),
                    "Category rule read leaked another owner's rule")
        status, duplicate = request(api_base, "/api/categoryrules", anon,
                                    users[0][1], "POST", {
            "keyword": "PF-S08 private coffee", "type": "Expense",
            "category": "Changed", "flow": "DB"})
        require(status == 200 and duplicate.get("id") == rule_ids[0] and
                duplicate.get("category") == "Coffee 0",
                "Idempotent private rule create changed the original rule")
        status, _ = request(api_base, f"/api/categoryrules/{rule_ids[1]}", anon,
                            users[0][1], "PUT", {
            "keyword": "Foreign", "type": "Expense", "category": "Foreign", "flow": "DB"})
        require(status == 404, "Cross-owner category rule update was accepted")
        status, _ = request(api_base, f"/api/categoryrules/{rule_ids[1]}", anon,
                            users[0][1], "DELETE")
        require(status == 404, "Cross-owner category rule delete was accepted")
        status, updated = request(api_base, f"/api/categoryrules/{rule_ids[0]}", anon,
                                  users[0][1], "PUT", {
            "keyword": "PF-S08 private coffee", "type": "Expense",
            "category": "Updated coffee", "flow": "DB"})
        require(status == 200 and updated.get("category") == "Updated coffee",
                f"Owner category rule update failed (HTTP {status}, {updated})")
        status, _ = request(api_base, "/api/categoryrules/reset", anon,
                            users[0][1], "DELETE")
        require(status == 200, "Owner category rule reset failed")
        status, remaining_rules = request(api_base, "/api/categoryrules", anon, users[1][1])
        require(status == 200 and any(r["id"] == rule_ids[1] for r in remaining_rules),
                "Owner A rule reset affected owner B")
        status, _ = request(api_base, f"/api/categoryrules/{rule_ids[1]}", anon,
                            users[1][1], "DELETE")
        require(status == 200, "Owner B category rule delete failed")
        for index, (_, token) in enumerate(users):
            amount = 1200.25 + index
            status, savings = request(api_base,
                f"/api/accounts/{owned_setup_accounts[index]}", anon, token, "PUT", {
                "name": "Pilot savings", "accountType": "savings", "currency": "IDR",
                "isActive": True})
            require(status == 200 and savings.get("accountType") == "savings",
                    f"Could not prepare owner savings account (HTTP {status}, {savings})")
            status, _ = request(base, "/rest/v1/valuations", admin, admin, "POST", {
                "user_id": users[index][0], "subject_type": "account",
                "subject_id": owned_setup_accounts[index], "value_native": 4000 + index,
                "value_idr": 4000 + index, "currency": "IDR",
                "valued_at": datetime.now(timezone.utc).isoformat()})
            require(status in (200, 201), "Could not prepare owner valuation")
            status, buckets = request(api_base, "/api/buckets/future-plan", anon,
                                      token, "POST", {"futureMonthlyAmount": amount})
            if status != 200:
                direct_status, direct_result = request(base,
                    "/rest/v1/rpc/set_cashflow_future_plan", anon, token,
                    "POST", {"p_amount": amount})
                raise AssertionError(
                    f"Checked bucket future plan failed (API {status}, {buckets}; "
                    f"RPC {direct_status}, {direct_result})")
            require(status == 200 and buckets and buckets.get("futurePlanned") == amount
                    and buckets.get("emergencyFund", {}).get("now") == 4000 + index,
                    f"Checked bucket future plan failed (HTTP {status}, {buckets})")
            status, buckets = request(api_base, "/api/buckets/committed-items/demote", anon,
                                      token, "POST", {"itemKey": "pf s08 recurring rent"})
            require(status == 200 and buckets, f"Checked bucket demotion failed (HTTP {status})")
            status, _ = request(api_base, "/api/buckets/committed-items/demote", anon,
                                token, "POST", {"itemKey": "pf s08 recurring rent"})
            require(status == 200, "Idempotent bucket demotion failed")
        status, _ = request(api_base, "/api/buckets/future-plan", anon,
                            users[0][1], "POST", {"futureMonthlyAmount": -1})
        require(status == 400, "Negative future plan was accepted")
        for index, (_, token) in enumerate(users):
            status, settings = request(base, "/rest/v1/bucket_settings?select=user_id,future_monthly_amount",
                                       anon, token)
            require(status == 200 and len(settings) == 1 and
                    settings[0]["user_id"] == users[index][0] and
                    float(settings[0]["future_monthly_amount"]) == 1200.25 + index,
                    "Bucket settings read leaked another owner")
            status, overrides = request(base, "/rest/v1/bucket_category_overrides?select=user_id,item_key",
                                        anon, token)
            require(status == 200 and len(overrides) == 1 and
                    overrides[0]["user_id"] == users[index][0],
                    "Bucket override read leaked another owner")
            status, _ = request(base, "/rest/v1/bucket_settings", anon, token,
                                "POST", {"user_id": users[index][0], "future_monthly_amount": 999})
            require(status in (401, 403), "Direct bucket settings DML was accepted")
            status, rows = request(base, "/rest/v1/valuations?select=user_id", anon, token)
            require(status == 200 and len(rows) == 1 and rows[0]["user_id"] == users[index][0],
                    "Direct valuation read leaked another owner's rows")
        preflight = Request(api_base + "/api/transactions?page=1", method="OPTIONS",
                            headers={"Origin": "http://127.0.0.1:8088",
                                     "Access-Control-Request-Method": "GET",
                                     "Access-Control-Request-Headers": "authorization"})
        with urlopen(preflight, timeout=15) as cors_response:
            require(cors_response.headers.get("Access-Control-Allow-Origin") ==
                    "http://127.0.0.1:8088", "Browser origin was not allowed by API CORS")
        empty_email = f"pf-s08-empty-{uuid.uuid4().hex}@example.invalid"
        empty_password = uuid.uuid4().hex + "Aa1!"
        status, empty_created = request(base, "/auth/v1/admin/users", admin, admin,
                                        "POST", {"email": empty_email,
                                                 "password": empty_password,
                                                 "email_confirm": True})
        require(status in (200, 201) and empty_created and empty_created.get("id"),
                "Empty pilot user provisioning failed")
        empty_user_id = empty_created["id"]
        browser_env = os.environ.copy()
        browser_env.update({
            "VITE_SUPABASE_URL": base,
            "VITE_SUPABASE_ANON_KEY": anon,
            "VITE_API_URL": api_base,
            "PF_S08_TEST_EMAIL_A": browser_credentials[0][0],
            "PF_S08_TEST_PASSWORD_A": browser_credentials[0][1],
            "PF_S08_TEST_EMAIL_B": browser_credentials[1][0],
            "PF_S08_TEST_PASSWORD_B": browser_credentials[1][1],
            "PF_S08_TEST_TOKEN_A": users[0][1],
            "PF_S08_API_URL": api_base,
            "PF_S08_TEST_EMAIL_EMPTY": empty_email,
            "PF_S08_TEST_PASSWORD_EMPTY": empty_password,
        })
        frontend = Path(__file__).resolve().parents[1] / "apps/frontend"
        browser_run = subprocess.run(
            ["rtk", "proxy", "npx", "playwright", "test", "-c",
             "playwright.pf-s08.config.ts", "e2e/auth-cashflow.spec.ts"],
            cwd=frontend, env=browser_env, capture_output=True, text=True, timeout=300)
        if browser_run.returncode:
            output = browser_run.stdout + browser_run.stderr
            for secret in (anon, admin, values["JWT_SECRET"],
                           *(credential for pair in browser_credentials for credential in pair),
                           empty_email, empty_password,
                           *(user[1] for user in users)):
                output = output.replace(secret, "[redacted]")
            raise AssertionError("Browser session smoke failed:\n" +
                                 "\n".join(output.splitlines()[-45:]))
        status, _ = request(base,
            f"/rest/v1/transactions?user_id=eq.{users[0][0]}&description=like.PF-S08%20Realtime*",
            admin, admin, "DELETE")
        require(status in (200, 204), "Browser Realtime fixture cleanup failed")
        status, rows = request(base, "/rest/v1/transactions?select=id", anon, users[0][1])
        require(status == 200 and len(rows) == 1,
                "Browser Realtime fixture cleanup did not restore owner A baseline")
        shared_hash = hashlib.sha256(b"pf-s08-disposable-shared-file").hexdigest()
        for index, (user_id, token) in enumerate(users):
            row = {
                "date": datetime.now(timezone.utc).isoformat(),
                "description": "PF-S08 checked import",
                "remarks": "", "flow": "CR", "type": "Income", "category": "Test",
                "amount_idr": 20, "currency": "IDR", "account_id": accounts[index],
                "account_name": f"PF-S08 Test {index}",
                "category_rule": {"keyword": "PF-S08 Smoke", "type": "Income", "flow": "CR"},
            }
            args = {"p_request_id": str(uuid.uuid4()), "p_rows": [row],
                    "p_file_hash": shared_hash, "p_file_name": "fixture.csv"}
            api_row = {"date": row["date"], "description": row["description"],
                       "remarks": row["remarks"], "flow": row["flow"], "type": row["type"],
                       "category": row["category"], "amountIdr": row["amount_idr"],
                       "currency": row["currency"], "accountId": row["account_id"],
                       "accountName": row["account_name"], "categoryRuleDto": {
                           "keyword": "PF-S08 Smoke", "type": "Income", "flow": "CR"}}
            api_args = {"requestId": args["p_request_id"], "transactions": [api_row],
                        "fileHash": shared_hash, "fileName": "fixture.csv"}
            status, committed = request(api_base, "/api/transactions/submit", anon,
                                        token, "POST", api_args)
            require(status == 200 and committed and committed.get("insertedCount") == 1,
                    f"Checked API import failed (HTTP {status}, code {committed.get('code') if isinstance(committed, dict) else 'none'}, message {committed.get('message') if isinstance(committed, dict) else 'none'}):\n{startup_diagnostics()}")
            status, replay = request(base, "/rest/v1/rpc/submit_cashflow_import", anon,
                                     token, "POST", args)
            require(status == 200 and replay == committed, "Same-request replay changed the result")
            changed = {**api_args, "transactions": [{**api_row, "amountIdr": 21}]}
            status, conflict = request(api_base, "/api/transactions/submit", anon,
                                       token, "POST", changed)
            require(status == 409 and conflict and conflict.get("code") == "idempotency_conflict",
                    f"Changed-payload API replay was not rejected (HTTP {status}, {conflict})")
            status, replay = request(base, "/rest/v1/rpc/submit_cashflow_import", anon,
                                     token, "POST", {**args, "p_request_id": str(uuid.uuid4())})
            require(status == 200 and replay == committed, "Same-file replay changed the result")
            status, foreign = request(base, "/rest/v1/rpc/submit_cashflow_import", anon,
                                      token, "POST", {"p_request_id": str(uuid.uuid4()),
                                      "p_rows": [{**row, "account_id": accounts[1 - index]}]})
            require(status in (400, 403) and foreign and foreign.get("code") == "P0001",
                    "Cross-owner account was accepted by checked import")
            status, rows = request(base, "/rest/v1/transactions?select=id", anon, token)
            require(status == 200 and len(rows) == 2, "Checked import row count incorrect")
        owner_a_token = users[0][1]
        rollback_row = {**api_row, "accountId": accounts[0],
                        "accountName": "PF-S08 Rollback Alias",
                        "description": "PF-S08 rollback candidate",
                        "categoryRuleDto": {"keyword": "PF-S08 Rollback Rule",
                                            "type": "Income", "flow": "CR"}}
        status, failure = request(api_base, "/api/transactions/submit", anon,
                                  owner_a_token, "POST", {
            "requestId": str(uuid.uuid4()),
            "transactions": [rollback_row, {**rollback_row,
                            "description": "PF-S08 foreign parent",
                            "accountId": accounts[1]}]})
        require(status == 404 and failure and failure.get("code") == "account_unavailable",
                "Foreign account did not roll back the preceding row")
        status, rows = request(base, "/rest/v1/transactions?select=description", anon, owner_a_token)
        require(status == 200 and len(rows) == 2, "Failed import left a transaction")
        status, aliases = request(base, "/rest/v1/wallet_account_aliases?select=alias_text", anon, owner_a_token)
        require(status == 200 and all(a["alias_text"] != "PF-S08 Rollback Alias" for a in aliases),
                "Failed import left an alias")
        status, rules = request(base, "/rest/v1/category_rules?select=keyword", anon, owner_a_token)
        require(status == 200 and all(r["keyword"] != "PF-S08 Rollback Rule" for r in rules),
                "Failed import left a category rule")

        boundary_row = {**api_row, "accountId": None, "accountName": "",
                        "categoryRuleDto": None,
                        "date": "2026-10-09T01:02:03.123456+00:00",
                        "description": "PF-S08  Boundary", "amountIdr": 100.005,
                        "statementBalance": 10.00}
        boundary_rows = [boundary_row,
                         {**boundary_row, "description": "pf-s08\u00a0boundary",
                          "amountIdr": 100.004, "statementBalance": 10.009},
                         {**boundary_row, "description": "pf-s08 boundary",
                          "amountIdr": 100.004, "statementBalance": 10.01},
                         {**boundary_row, "statementBalance": None}]
        status, boundary = request(api_base, "/api/transactions/submit", anon,
                                   owner_a_token, "POST", {
            "requestId": str(uuid.uuid4()), "transactions": boundary_rows})
        require(status == 200 and boundary and boundary.get("insertedCount") == 2
                and boundary.get("duplicateCount") == 2,
                f"Canonical duplicate boundary failed (HTTP {status}, {boundary})")
        nontransitive_row = {**boundary_row,
                             "description": "PF-S08 nontransitive balance",
                             "statementBalance": 20}
        status, nontransitive = request(api_base, "/api/transactions/submit", anon,
                                        owner_a_token, "POST", {
            "requestId": str(uuid.uuid4()),
            "transactions": [nontransitive_row,
                             {**nontransitive_row, "statementBalance": 20.009},
                             {**nontransitive_row, "statementBalance": 20.018}]})
        require(status == 200 and nontransitive and
                nontransitive.get("insertedCount") == 2 and
                nontransitive.get("duplicateCount") == 1,
                f"Ordered nontransitive balance matching failed (HTTP {status}, {nontransitive})")
        status, all_duplicate = request(api_base, "/api/transactions/submit", anon,
                                        owner_a_token, "POST", {
            "requestId": str(uuid.uuid4()), "transactions": [nontransitive_row]})
        require(status == 200 and all_duplicate and
                all_duplicate.get("insertedCount") == 0 and
                all_duplicate.get("duplicateCount") == 1,
                "All-duplicate import did not report a committed no-op")
        concurrent_row = {**boundary_row, "description": "PF-S08 same request concurrency",
                          "date": datetime.now(timezone.utc).isoformat()}
        concurrent_args = {"requestId": str(uuid.uuid4()),
                           "transactions": [concurrent_row]}
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: request(api_base, "/api/transactions/submit",
                                                       anon, owner_a_token, "POST", concurrent_args),
                                    range(2)))
        require(all(status == 200 for status, _ in results)
                and results[0][1] == results[1][1]
                and results[0][1]["insertedCount"] == 1,
                "Concurrent same-request replay inserted twice or changed result")
        overlapping_row = {**concurrent_row, "description": "PF-S08 overlap concurrency"}
        overlapping_args = [{"requestId": str(uuid.uuid4()),
                             "transactions": [overlapping_row]} for _ in range(2)]
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda args: request(api_base, "/api/transactions/submit",
                                                          anon, owner_a_token, "POST", args),
                                    overlapping_args))
        require(all(status == 200 for status, _ in results)
                and sum(result["insertedCount"] for _, result in results) == 1
                and sum(result["duplicateCount"] for _, result in results) == 1,
                "Concurrent overlapping imports did not serialize per owner")
        status, deletion = request(api_base, "/api/transactions/reset", anon, users[0][1], "DELETE")
        deleted = deletion.get("deleted") if isinstance(deletion, dict) else None
        require(status == 200 and deleted == 8, "Owner A checked reset failed")
        status, rows = request(base, "/rest/v1/transactions?select=id", anon, users[1][1])
        require(status == 200 and len(rows) == 2, "Owner A reset affected owner B")
        bulk_date = datetime.now(timezone.utc).isoformat()
        for start in (0, 500, 1000):
            bulk = [{"user_id": users[0][0], "account_id": None,
                     "date": bulk_date, "description": f"PF-S08 bulk {i:04d}",
                     "remarks": "", "flow": "CR", "type": "Income",
                     "category": "Test", "amount_idr": 1, "currency": "IDR"}
                    for i in range(start, min(start + 500, 1001))]
            status, _ = request(base, "/rest/v1/transactions", admin, admin, "POST", bulk)
            require(status in (200, 201), "Could not prepare 1001-row local read fixture")
        status, last_page = request(api_base, "/api/transactions?page=6&pageSize=200",
                                    anon, users[0][1])
        require(status == 200 and last_page.get("total") == 1001 and
                len(last_page.get("items", [])) == 1,
                f"1001-row API page/count failed (HTTP {status}, {last_page.get('total') if isinstance(last_page, dict) else 'none'})")
        status, other_page = request(api_base, "/api/transactions?page=1&pageSize=10",
                                     anon, users[1][1])
        require(status == 200 and other_page.get("total") == 2,
                "1001-row test changed owner B count")
        export_request = Request(api_base + "/api/transactions/export", headers={
            "apikey": anon, "Authorization": f"Bearer {users[0][1]}"})
        with urlopen(export_request, timeout=30) as export_response:
            export_lines = export_response.read().decode("utf-8-sig").splitlines()
            require(export_response.status == 200 and len(export_lines) == 1002,
                    f"1001-row CSV export was truncated ({len(export_lines) - 1} rows)")
        print("PASS: A/B Auth-token API, PostgREST, GraphQL and browser/Realtime isolation; Storage denial; third-user setup; concurrent reads, CSV preview/submit parity, checked writes, rules, Buckets, import replay/reset, and 1001-row page/export")
    finally:
        if api_process is not None:
            api_process.terminate()
            try:
                api_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                api_process.kill()
        startup_log.close()
        if storage_object is not None:
            delete_request = Request(base + f"/storage/v1/object/bank-statements/{storage_object}",
                                     headers={"apikey": admin, "Authorization": f"Bearer {admin}"},
                                     method="DELETE")
            try:
                with urlopen(delete_request, timeout=15):
                    pass
            except HTTPError:
                pass
        for user in users:
            user_id = user[0] if isinstance(user, tuple) else user
            for table in OWNED_TABLES:
                request(base, f"/rest/v1/{table}?user_id=eq.{user_id}", admin, admin, "DELETE")
        for user in users:
            user_id = user[0] if isinstance(user, tuple) else user
            request(base, f"/auth/v1/admin/users/{user_id}", admin, admin, "DELETE")
        if empty_user_id is not None:
            for table in OWNED_TABLES:
                request(base, f"/rest/v1/{table}?user_id=eq.{empty_user_id}",
                        admin, admin, "DELETE")
            request(base, f"/auth/v1/admin/users/{empty_user_id}", admin, admin, "DELETE")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/pf_s08_local_http_smoke.py <disposable-harness-path>")
    main(Path(sys.argv[1]).resolve())
