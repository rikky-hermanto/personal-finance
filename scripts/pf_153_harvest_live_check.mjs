// Usage (repo root, stack up): PF_API=http://localhost:7308 node scripts/pf_153_harvest_live_check.mjs
// PF-153 live check (STEP 7, by hand): two throwaway local Auth users against the slot API.
// Keys are read from `supabase status` at run time and never printed.
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const REPO = process.cwd();
const env = Object.fromEntries(
  execSync("npx supabase status -o env", { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const SUPA = env.API_URL, ANON = env.ANON_KEY, SERVICE = env.SERVICE_ROLE_KEY;
const API = process.env.PF_API ?? "http://localhost:7208";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

async function http(base, path, { method = "GET", token, body, key = ANON, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, text };
}

const suffix = randomUUID().slice(0, 8);
const password = "Pf153-" + randomUUID();
async function makeUser(tag) {
  const email = `pf153-${tag}-${suffix}@example.test`;
  const created = await http(SUPA, "/auth/v1/admin/users", {
    method: "POST", key: SERVICE, token: SERVICE, body: { email, password, email_confirm: true },
  });
  if (created.status >= 300) throw new Error(`create user ${tag}: ${created.status} ${created.text.slice(0, 120)}`);
  const login = await http(SUPA, "/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  if (login.status !== 200) throw new Error(`login ${tag}: ${login.status}`);
  return { id: created.json.id, token: login.json.access_token };
}

const lastMonth = new Date(); lastMonth.setUTCDate(1); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
const ym = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, "0")}`;
let accountId = null;
const row = (day, desc, type, flow, amount, category) => ({
  accountId,
  date: `${ym}-${String(day).padStart(2, "0")}`, description: desc, remarks: "", flow, type, category,
  amountIdr: amount, currency: "IDR", accountName: "BCA", categoryRuleDto: null,
});

const rest = (user, path, opts = {}) => http(SUPA, "/rest/v1" + path, { token: user.token, ...opts });
const months = async (user) => (await rest(user, `/harvest_months?select=month,result,accounts_covered,accounts_total,seen_at,income_idr,expense_idr&order=month`)).json ?? [];
const completions = async (user) => (await rest(user, `/quest_completions?select=id,quest_code,seen_at&order=id`)).json ?? [];

let A, B;
try {
  A = await makeUser("a");
  B = await makeUser("b");
  console.log("users created (throwaway)");

  // 0. Two cash-flow accounts; only the first one gets transactions, so the harvest must say "1 of 2".
  const mkAccount = (name) => http(API, "/api/accounts", {
    method: "POST", token: A.token,
    body: { name, accountType: "checking", currency: "IDR", openingBalance: 0, openingDate: `${ym}-01`, includeInCashflow: true },
  });
  const a1 = await mkAccount("PF153 Main");
  const a2 = await mkAccount("PF153 Second");
  check("create two cash-flow accounts", a1.status < 300 && a2.status < 300, `HTTP ${a1.status}/${a2.status}`);
  accountId = a1.json?.id ?? null;

  // 1. Real flow: an upload for last month writes a ledger row (this is where a missing GRANT would hide).
  const submit = await http(API, "/api/transactions/submit", {
    method: "POST", token: A.token,
    body: {
      requestId: randomUUID(),
      transactions: [
        row(2, "PF153 Salary", "Income", "CR", 10000000, "Salary"),
        row(5, "PF153 Groceries", "Expense", "DB", 3000000, "Food"),
      ],
    },
  });
  check("submit inserts rows", submit.status === 200 && submit.json?.insertedCount >= 1, `HTTP ${submit.status} inserted=${submit.json?.insertedCount}`);

  let mA = await months(A);
  console.log("   harvest_months:", JSON.stringify(mA));
  const mRow = mA.find((m) => m.month === `${ym}-01`);
  check("upload wrote a harvest_months row for last month", !!mRow);
  check("income 10,000,000 vs expense 3,000,000 is green", mRow?.result === "green", String(mRow?.result));
  check("a brand-new user's first harvest is unseen", mRow?.seen_at === null);

  // 2. The board returns the harvest with a basis line and the completions as items.
  let board = await http(API, "/api/journey/quests", { token: A.token });
  check("board loads", board.status === 200, `HTTP ${board.status}`);
  const h = board.json?.harvest;
  check("board has a harvest block", !!h);
  console.log("   harvest:", JSON.stringify(h));
  check("harvest names the month", h?.month === ym, String(h?.month));
  check("harvest says Based on 1 of 2 accounts", h?.basis === "Based on 1 of 2 accounts", String(h?.basis));
  check("a partly covered month states its basis in the result line", /in the accounts you uploaded$/.test(h?.resultLine ?? ""), String(h?.resultLine));
  check("board has no `unseen` member any more", board.json && !("unseen" in board.json));
  check("board has a rhythm", typeof board.json?.rhythm?.current === "number");
  const ids = (h?.items ?? []).flatMap((i) => i.completionIds);
  check("harvest lists the new completions", ids.length >= 1, `ids=${ids.join(",")}`);

  // 3. A recalculation must not replay or change what is seen; scores are unaffected by the ledger.
  const state1 = await http(API, "/api/journey/state", { token: A.token });
  await http(API, "/api/journey/recalculate", { method: "POST", token: A.token });
  await http(API, "/api/journey/recalculate", { method: "POST", token: A.token });
  mA = await months(A);
  check("recalculating twice keeps a single ledger row", mA.filter((m) => m.month === `${ym}-01`).length === 1);

  // 4. Isolation: B sees nothing and cannot mark A's rows seen.
  const boardB = await http(API, "/api/journey/quests", { token: B.token });
  check("B's board has no harvest", boardB.status === 200 && boardB.json.harvest === null);
  check("B reading harvest_months directly sees []", JSON.stringify((await rest(B, "/harvest_months?select=month")).json) === "[]");
  const forged = await rest(B, "/harvest_months", { method: "POST", body: { user_id: A.id, month: "2001-01-01", income_idr: 1, expense_idr: 1, result: "red", accounts_covered: 1, accounts_total: 1 } });
  check("B inserting a ledger row for A is rejected", forged.status >= 400, `HTTP ${forged.status}`);
  const bMark = await http(API, "/api/journey/harvest/seen", { method: "POST", token: B.token, body: { ids, month: ym } });
  check("B marking A's ids seen answers 204", bMark.status === 204, `HTTP ${bMark.status}`);
  check("...and A's rows stay unseen", (await months(A)).every((m) => m.seen_at === null) && (await completions(A)).every((c) => c.seen_at === null));
  const del = await rest(A, "/harvest_months?month=gte.2000-01-01", { method: "DELETE" });
  check("the owner cannot delete a ledger row", del.status >= 400 && (await months(A)).length >= 1, `HTTP ${del.status}`);

  // 5. Validation.
  const badMonth = await http(API, "/api/journey/harvest/seen", { method: "POST", token: A.token, body: { ids: [], month: "September" } });
  check("a malformed month -> 400", badMonth.status === 400, `HTTP ${badMonth.status}`);

  // 6. A marks seen -> harvest is null next time, and stays null.
  const seen = await http(API, "/api/journey/harvest/seen", { method: "POST", token: A.token, body: { ids, month: ym } });
  check("mark seen -> 204", seen.status === 204, `HTTP ${seen.status}`);
  board = await http(API, "/api/journey/quests", { token: A.token });
  check("next board has harvest: null", board.json?.harvest === null);
  check("every completion and the month are seen", (await completions(A)).every((c) => c.seen_at) && (await months(A)).every((m) => m.seen_at));

  // 7. A late refresh of the month's figures never re-opens it.
  await http(API, "/api/transactions/submit", {
    method: "POST", token: A.token,
    body: { requestId: randomUUID(), transactions: [row(9, "PF153 Late", "Expense", "DB", 500000, "Food")] },
  });
  mA = await months(A);
  const refreshed = mA.find((m) => m.month === `${ym}-01`);
  check("a late upload refreshes the figures", Number(refreshed?.expense_idr) === 3500000, String(refreshed?.expense_idr));
  check("...but the month stays seen", refreshed?.seen_at !== null);
  board = await http(API, "/api/journey/quests", { token: A.token });
  check("...and no harvest re-opens", board.json?.harvest === null);

  // 8. G1: the ledger never touches scores.
  const state2 = await http(API, "/api/journey/state", { token: A.token });
  const scores = (s) => JSON.stringify((s.json?.indicators ?? []).map((i) => [i.code, i.score]));
  console.log("   scores before:", scores(state1), "\n   scores after: ", scores(state2));
  check("state endpoint still answers", state2.status === 200, `HTTP ${state2.status}`);
} catch (e) {
  console.log("ERROR", e.message);
  results.push({ name: "script completed", ok: false });
} finally {
  // Cleanup: throwaway users are recognised by their reserved e-mail pattern, which also sweeps up leftovers of a failed run.
  {
    const sql = `do $$ declare r record; uids uuid[]; begin select coalesce(array_agg(id), '{}') into uids from auth.users where email like 'pf153-%@example.test'; for r in select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE' where c.table_schema = 'public' and c.column_name = 'user_id' loop execute format('delete from public.%I where user_id = any(%L::uuid[])', r.table_name, uids); end loop; delete from auth.users where id = any(uids); end $$;`;
    try {
      execSync(`docker exec -i supabase_db_personal-finance psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q`, { input: sql, stdio: ["pipe", "ignore", "pipe"] });
      console.log("cleanup: throwaway users and their rows deleted");
    } catch (e) {
      console.log("cleanup FAILED:", String(e.stderr ?? e.message).slice(0, 300));
    }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length ? 1 : 0;
}
