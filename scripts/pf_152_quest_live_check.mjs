// Usage (repo root, stack up): PF_API=http://localhost:7208 node scripts/pf_152_quest_live_check.mjs
// PF-152 live check (STEP 14/17/24, by hand): two throwaway local Auth users against the slot API.
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
const password = "Pf152-" + randomUUID();
async function makeUser(tag) {
  const email = `pf152-${tag}-${suffix}@example.test`;
  const created = await http(SUPA, "/auth/v1/admin/users", {
    method: "POST", key: SERVICE, token: SERVICE, body: { email, password, email_confirm: true },
  });
  if (created.status >= 300) throw new Error(`create user ${tag}: ${created.status} ${created.text.slice(0, 120)}`);
  const login = await http(SUPA, "/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  if (login.status !== 200) throw new Error(`login ${tag}: ${login.status}`);
  return { id: created.json.id, token: login.json.access_token };
}

const lastMonth = new Date(); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
const ym = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, "0")}`;
const row = (day, desc, type, flow, amount, category) => ({
  date: `${ym}-${String(day).padStart(2, "0")}`, description: desc, remarks: "", flow, type, category,
  amountIdr: amount, currency: "IDR", accountName: "BCA", categoryRuleDto: null,
});

const rest = (user, path, opts = {}) => http(SUPA, "/rest/v1" + path, { token: user.token, ...opts });
const completions = async (user) => (await rest(user, `/quest_completions?select=quest_code,rung,seen_at,evidence&user_id=eq.${user.id}&order=quest_code,rung`)).json ?? [];

let A, B;
try {
  A = await makeUser("a");
  B = await makeUser("b");
  console.log("users created (throwaway)");

  // 1. Submit a synthetic batch, no recalculate click.
  const submit = await http(API, "/api/transactions/submit", {
    method: "POST", token: A.token,
    body: {
      requestId: randomUUID(),
      transactions: [
        row(2, "PF152 Salary", "Income", "CR", 10000000, "Salary"),
        row(5, "PF152 Groceries", "Expense", "DB", 3000000, "Food"),
        row(9, "PF152 Invest", "Expense", "DB", 1000000, "Investment"),
      ],
    },
  });
  check("submit inserts rows", submit.status === 200 && submit.json?.insertedCount >= 1, `HTTP ${submit.status} inserted=${submit.json?.insertedCount}`);

  let cA = await completions(A);
  const codes = cA.map((c) => `${c.quest_code}#${c.rung}`);
  console.log("   completions after submit:", codes.join(", ") || "(none)");
  check("l1.meet_your_money completed by the upload trigger (no Recalculate)", cA.some((c) => c.quest_code === "l1.meet_your_money"));
  check("evidence is a jsonb object (not a string)", cA.length > 0 && cA.every((c) => typeof c.evidence === "object" && c.evidence !== null));

  // 2. Idempotence.
  const before = cA.length;
  const r1 = await http(API, "/api/journey/recalculate", { method: "POST", token: A.token });
  const r2 = await http(API, "/api/journey/recalculate", { method: "POST", token: A.token });
  cA = await completions(A);
  check("recalculate twice -> HTTP 200 both", r1.status === 200 && r2.status === 200, `${r1.status}/${r2.status}`);
  check("second recalculation inserts nothing (row count unchanged)", cA.length === before, `${before} -> ${cA.length}`);

  // 3. State: stars + raw values.
  const state = await http(API, "/api/journey/state", { token: A.token });
  const live = (state.json?.indicators ?? []).filter((i) => i.status !== "no_data");
  check("GET /state returns stars on indicators", (state.json?.indicators ?? []).every((i) => typeof i.stars === "number"));
  check("live indicators have rawValue from the database", live.length > 0 && live.every((i) => i.rawValue !== null), live.map((i) => `${i.code}=${i.rawValue}/${i.stars}*`).join(" "));

  // 4. Board shape, unseen, no AI.
  let board = await http(API, "/api/journey/quests", { token: A.token });
  check("board loads", board.status === 200, `HTTP ${board.status}`);
  check("board has unseen item(s) for the new completions", (board.json?.unseen?.length ?? 0) >= 1, `unseen=${board.json?.unseen?.length}`);
  const cards = [board.json?.focus, ...(board.json?.offers ?? [])].filter(Boolean);
  check("board never offers more than 3 cards", cards.length <= 3, `cards=${cards.length}`);
  const json = JSON.stringify(board.json);
  check("board carries no points-like member", !/"(points?|gain|xp|reward)[a-z]*"/i.test(json));

  // 5. Focus / snooze / recalc interplay (read user_journey_state through A's token).
  const state1 = async () => (await rest(A, `/user_journey_state?select=focus_quest_code,quest_snoozes&user_id=eq.${A.id}`)).json?.[0] ?? {};
  const offerCodes = cards.map((c) => c.code);
  console.log("   offers:", offerCodes.join(", "));
  if (offerCodes.length >= 2) {
    const [first, second] = offerCodes;
    const f = await http(API, `/api/journey/quests/${first}/focus`, { method: "POST", token: A.token });
    check("set focus", f.status === 200 && f.json?.focus?.code === first, `HTTP ${f.status}`);
    await http(API, "/api/journey/recalculate", { method: "POST", token: A.token });
    let s = await state1();
    check("recalculation keeps the focus", s.focus_quest_code === first, String(s.focus_quest_code));
    const sn = await http(API, `/api/journey/quests/${second}/snooze`, { method: "POST", token: A.token });
    s = await state1();
    check("snoozing another quest keeps the focus", sn.status === 200 && s.focus_quest_code === first);
    check("snooze stored", s.quest_snoozes && s.quest_snoozes[second]);
    const third = offerCodes[2] ?? first;
    await http(API, `/api/journey/quests/${third}/focus`, { method: "POST", token: A.token });
    s = await state1();
    check("setting another focus keeps the snooze", s.quest_snoozes && s.quest_snoozes[second], JSON.stringify(s.quest_snoozes));
    await http(API, "/api/journey/recalculate", { method: "POST", token: A.token });
    s = await state1();
    check("recalculation keeps focus and snooze", s.focus_quest_code === third && s.quest_snoozes && s.quest_snoozes[second]);
  } else {
    check("enough offers to test focus/snooze", false, `offers=${offerCodes.length}`);
  }
  const bad = await http(API, "/api/journey/quests/l1.boss/focus", { method: "POST", token: A.token });
  check("focus on a quest that is never offered (boss) -> 400", bad.status === 400, `HTTP ${bad.status}`);
  const unknown = await http(API, "/api/journey/quests/nope/focus", { method: "POST", token: A.token });
  check("focus on unknown code -> 404", unknown.status === 404, `HTTP ${unknown.status}`);

  // 6. Isolation: user B.
  const boardB = await http(API, "/api/journey/quests", { token: B.token });
  check("B's board has no unseen items", boardB.status === 200 && boardB.json.unseen.length === 0);
  check("B reading quest_completions directly sees []", JSON.stringify((await rest(B, "/quest_completions?select=id")).json) === "[]");
  const forged = await rest(B, "/quest_completions", { method: "POST", body: { user_id: A.id, quest_code: "l1.boss", rung: 0, catalog_version: 1 } });
  check("B inserting a row for A is rejected", forged.status >= 400, `HTTP ${forged.status}`);
  const aIds = (await rest(A, `/quest_completions?select=id&user_id=eq.${A.id}`)).json.map((r) => r.id);
  await http(API, "/api/journey/quests/seen", { method: "POST", token: B.token, body: { ids: aIds } });
  const unseenAfterB = (await completions(A)).filter((c) => c.seen_at === null).length;
  check("B marking A's ids seen leaves A's rows unseen", unseenAfterB === (await completions(A)).length);
  const upd = await rest(B, `/quest_completions?user_id=eq.${A.id}`, { method: "PATCH", body: { seen_at: new Date().toISOString() } });
  check("B patching A's rows directly changes nothing", (await completions(A)).every((c) => c.seen_at === null), `HTTP ${upd.status}`);

  // 7. A marks seen -> empty unseen next time.
  board = await http(API, "/api/journey/quests", { token: A.token });
  const ids = board.json.unseen.flatMap((u) => u.ids);
  const seen = await http(API, "/api/journey/quests/seen", { method: "POST", token: A.token, body: { ids } });
  check("mark seen -> 204", seen.status === 204, `HTTP ${seen.status}`);
  board = await http(API, "/api/journey/quests", { token: A.token });
  check("next board has empty unseen", board.json.unseen.length === 0);
  const empty = await http(API, "/api/journey/quests/seen", { method: "POST", token: A.token, body: { ids: [] } });
  check("empty ids -> 400", empty.status === 400, `HTTP ${empty.status}`);

  // 8. G6: stale savings valuation blocks fence posts and cover stars; fresh one allows them.
  const acct = await http(API, "/api/accounts", {
    method: "POST", token: A.token,
    body: { name: "PF152 Savings", accountType: "savings", currency: "IDR", openingBalance: 0, openingDate: `${ym}-01` },
  });
  check("create savings account", acct.status < 300, `HTTP ${acct.status}`);
  const accountId = acct.json?.id;
  const twoMonthsAgo = new Date(); twoMonthsAgo.setUTCMonth(twoMonthsAgo.getUTCMonth() - 2);
  // 2,000,000 per month of consumption would give cover ~1; choose a large balance so cover > 1.5 either way.
  const val = (when, value) => http(API, "/api/assets/valuations", {
    method: "POST", token: A.token,
    body: { subjectType: "account", subjectId: accountId, valueNative: value, currency: "IDR", valuedAt: when.toISOString() },
  });
  const stale = await val(twoMonthsAgo, 50000000);
  check("record a stale valuation", stale.status < 300, `HTTP ${stale.status}`);
  let cc = await completions(A);
  check("stale valuation: no fence post, no cover star", !cc.some((c) => c.quest_code === "l2.fence_posts" || c.quest_code === "stars.liquid_savings_ratio"),
    cc.filter((c) => c.quest_code.includes("fence") || c.quest_code.includes("liquid")).map((c) => c.quest_code + "#" + c.rung).join(",") || "none");
  const fresh = await val(new Date(), 50000000);
  check("record a fresh valuation", fresh.status < 300, `HTTP ${fresh.status}`);
  cc = await completions(A);
  const fence = cc.filter((c) => c.quest_code === "l2.fence_posts").map((c) => c.rung);
  check("fresh valuation: fence posts and cover stars complete (asset trigger, no Recalculate)",
    fence.length >= 1 && cc.some((c) => c.quest_code === "stars.liquid_savings_ratio"), `fence rungs=${fence.join(",")}`);

  // 9. AI service not needed.
  const aiBase = process.env.PF_AI ?? "http://localhost:8000";
  const aiUp = await fetch(aiBase + "/health").then((r) => r.status).catch(() => 0);
  console.log(`   (AI service on slot: HTTP ${aiUp}; quests and state do not call it)`);
} catch (e) {
  console.log("ERROR", e.message);
  results.push({ name: "script completed", ok: false });
} finally {
  // Cleanup: remove every row of the two throwaway users, then the users.
  // Throwaway users are recognised by their reserved e-mail pattern, which also sweeps up leftovers of a failed run.
  {
    const sql = `do $$ declare r record; uids uuid[]; begin select coalesce(array_agg(id), '{}') into uids from auth.users where email like 'pf152-%@example.test'; for r in select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE' where c.table_schema = 'public' and c.column_name = 'user_id' loop execute format('delete from public.%I where user_id = any(%L::uuid[])', r.table_name, uids); end loop; delete from auth.users where id = any(uids); end $$;`;
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
