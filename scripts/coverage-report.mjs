#!/usr/bin/env node
// Unit-test coverage report, tracked over time.
//
//   npm run coverage              run all three suites, record a row, rewrite the report
//   npm run coverage -- --no-run  rebuild from the coverage files already on disk
//
// Writes docs/records/coverage/history.csv (one row per commit; re-running on the same commit
// replaces that commit's row) and docs/records/coverage/README.md (latest numbers, per-layer
// breakdown, trend, biggest gaps). Commit both so the trend survives.
//
// Line coverage counts executable lines (.NET, frontend) or statements (Python) hit by unit tests.
// Playwright e2e is not included: it needs the full stack and measures something different.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// With a lower-case drive letter, Vite resolves a root-absolute import.meta.glob to "c:\c:\..." and
// that Vitest suite fails to load. VS Code often opens folders that way on Windows, so every suite
// runs from the upper-case spelling.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  .replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const outDir = path.join(root, "docs/records/coverage");
const historyPath = path.join(outDir, "history.csv");
const reportPath = path.join(outDir, "README.md");

const paths = {
  dotnetResults: path.join(root, "apps/api/TestResults/coverage"),
  pythonJson: path.join(root, "services/ai-service/coverage.json"),
  frontendJson: path.join(root, "apps/frontend/coverage/coverage-final.json"),
};

// Which module a file counts toward, by substring of its path under src/ (case-sensitive). To add a
// module, add one entry here. The first entry that matches wins, so the order settles files that
// match two: JourneyRecalcOnTransactionHandler is Journey, DeskBrokerAccount is Investment & Desk.
// `order` is only the row order in the report. Files that match nothing count as Platform, and the
// whole AI service is its own row.
const MODULES = [
  { name: "Settings", key: "settings", order: 5,
    dotnet: ["CategoryRule", "Categoriz"],
    frontend: ["categoryRules"] },
  { name: "Journey", key: "journey", order: 2,
    dotnet: ["Journey", "Quest", "Harvest", "Goal", "Bucket", "Foundation"],
    frontend: ["journey", "goals"] },
  { name: "Investment & Desk", key: "investment", order: 4,
    dotnet: ["Investment", "Holding", "Portfolio", "Desk", "MacroScenario", "Archetype"],
    frontend: ["desk", "macroScenario", "investment", "archetypes"] },
  { name: "Cashflow", key: "cashflow", order: 1,
    dotnet: ["Transaction", "Dashboard", "SpendingAnalysis", "Insight", "Cashflow", "Parsers/", "Storage", "JisdorFx", "LlmExtraction", "Pipeline"],
    frontend: ["transaction", "importPreview", "keywordExtractor", "chat"] },
  { name: "Assets", key: "assets", order: 3,
    dotnet: ["Asset", "Liabilit", "Valuation", "Account", "Institution", "NetWorth"],
    frontend: ["accounts", "assets", "netWorth"] },
];
const PLATFORM = { name: "Platform", key: "platform", order: 6 };

const noRun = process.argv.includes("--no-run");
const failures = [];

function run(label, cmd, cwd) {
  console.log(`\n▶ ${label}: ${cmd}`);
  const res = spawnSync(cmd, { cwd, shell: true, stdio: "inherit" });
  if (res.status !== 0) {
    console.warn(`⚠ ${label} exited with ${res.status}. Coverage is still recorded, flagged as failing.`);
    failures.push(label);
  }
}

function pythonExe() {
  const venv = path.join(root, "services/ai-service/.venv");
  const win = path.join(venv, "Scripts/python.exe");
  const nix = path.join(venv, "bin/python");
  if (fs.existsSync(win)) return `"${win}"`;
  if (fs.existsSync(nix)) return `"${nix}"`;
  return "python";
}

if (!noRun) {
  fs.rmSync(paths.dotnetResults, { recursive: true, force: true });
  run(
    "dotnet",
    `dotnet test PersonalFinance.slnx --collect:"XPlat Code Coverage" --results-directory "${paths.dotnetResults}"`,
    path.join(root, "apps/api"),
  );
  run(
    "pytest",
    `${pythonExe()} -m pytest -q --cov --cov-report=json:coverage.json --cov-report=`,
    path.join(root, "services/ai-service"),
  );
  run("vitest", "npm run test:coverage", path.join(root, "apps/frontend"));
}

// ---------- helpers ----------
const pct = (covered, total) => (total ? (100 * covered) / total : 0);
const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : "");
const rel = (p) => p.replace(/\\/g, "/");

function newestFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  let best = null;
  for (const entry of fs.readdirSync(dir, { recursive: true })) {
    if (path.basename(entry) !== name) continue;
    const full = path.join(dir, entry);
    const mtime = fs.statSync(full).mtimeMs;
    if (!best || mtime > best.mtime) best = { full, mtime };
  }
  return best?.full ?? null;
}

// ---------- .NET (Cobertura) ----------
function readDotnet() {
  const file = newestFile(paths.dotnetResults, "coverage.cobertura.xml");
  if (!file) throw new Error(`No coverage.cobertura.xml under ${paths.dotnetResults}. Run without --no-run first.`);
  const xml = fs.readFileSync(file, "utf8");
  const attr = (tag, name) => Number(new RegExp(`${name}="([^"]+)"`).exec(tag)?.[1] ?? 0);

  const areas = {};
  const files = {}; // file -> Map(line -> hit)
  let branchCov = 0, branchTot = 0;
  const pkgRe = /<package\b([^>]*)>([\s\S]*?)<\/package>/g;
  for (const [, pkgAttrs, body] of xml.matchAll(pkgRe)) {
    const name = /name="([^"]+)"/.exec(pkgAttrs)[1].replace(/^PersonalFinance\./, "");
    const lines = new Map();
    for (const [, clsAttrs, clsBody] of body.matchAll(/<class\b([^>]*)>([\s\S]*?)<\/class>/g)) {
      const filename = rel(/filename="([^"]+)"/.exec(clsAttrs)[1]);
      // Source-generated code under obj/ (OpenAPI, regex generators) is not ours to test.
      if (/(^|\/)obj\//.test(filename)) continue;
      files[filename] ??= new Map();
      // A class lists its lines twice: per method inside <methods>, then once for the whole class.
      // Read only the class-level block.
      const linesBlock = /<lines>([\s\S]*?)<\/lines>/.exec(clsBody.replace(/<methods>[\s\S]*?<\/methods>/, ""))?.[1] ?? "";
      for (const [lineTag] of linesBlock.matchAll(/<line\b[^>]*\/?>/g)) {
        const key = `${filename}:${attr(lineTag, "number")}`;
        const hit = attr(lineTag, "hits") > 0;
        lines.set(key, (lines.get(key) ?? false) || hit);
        files[filename].set(key, (files[filename].get(key) ?? false) || hit);
        const cc = /condition-coverage="[^(]*\((\d+)\/(\d+)\)"/.exec(lineTag);
        if (cc) { branchCov += Number(cc[1]); branchTot += Number(cc[2]); }
      }
    }
    const covered = [...lines.values()].filter(Boolean).length;
    areas[name] = { covered, total: lines.size };
  }
  const covered = Object.values(areas).reduce((s, a) => s + a.covered, 0);
  const total = Object.values(areas).reduce((s, a) => s + a.total, 0);
  const gaps = Object.entries(files).map(([f, m]) => ({
    file: shortenDotnet(f),
    total: m.size,
    covered: [...m.values()].filter(Boolean).length,
  }));
  return { covered, total, branch: pct(branchCov, branchTot), areas, gaps };
}

// Cobertura filenames are relative to apps/api/src (its <source> element).
function shortenDotnet(f) {
  const i = f.indexOf("apps/api/");
  return i >= 0 ? f.slice(i) : `apps/api/src/${f}`;
}

// ---------- Python (coverage.py JSON) ----------
function readPython() {
  if (!fs.existsSync(paths.pythonJson)) throw new Error(`Missing ${paths.pythonJson}. Run without --no-run first.`);
  const data = JSON.parse(fs.readFileSync(paths.pythonJson, "utf8"));
  const t = data.totals;
  const areas = {};
  const gaps = [];
  for (const [file, info] of Object.entries(data.files)) {
    const f = rel(file);
    const parts = f.split("/");
    const area = parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    areas[area] ??= { covered: 0, total: 0 };
    areas[area].covered += info.summary.covered_lines;
    areas[area].total += info.summary.num_statements;
    gaps.push({ file: `services/ai-service/${f}`, covered: info.summary.covered_lines, total: info.summary.num_statements });
  }
  return {
    covered: t.covered_lines,
    total: t.num_statements,
    branch: pct(t.covered_branches ?? 0, t.num_branches ?? 0),
    areas,
    gaps,
  };
}

// ---------- Frontend (Istanbul coverage-final.json) ----------
function readFrontend() {
  if (!fs.existsSync(paths.frontendJson)) throw new Error(`Missing ${paths.frontendJson}. Run without --no-run first.`);
  const data = JSON.parse(fs.readFileSync(paths.frontendJson, "utf8"));
  const areas = {};
  const gaps = [];
  let covered = 0, total = 0, bCov = 0, bTot = 0;
  for (const [file, info] of Object.entries(data)) {
    const f = rel(file);
    const i = f.indexOf("/src/");
    const local = i >= 0 ? f.slice(i + 1) : f;
    const parts = local.split("/");
    const area = parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
    // Line coverage: a line is covered if any statement starting on it ran (Istanbul's rule).
    const lines = new Map();
    for (const [id, loc] of Object.entries(info.statementMap)) {
      const ln = loc.start.line;
      lines.set(ln, (lines.get(ln) ?? false) || info.s[id] > 0);
    }
    const c = [...lines.values()].filter(Boolean).length;
    areas[area] ??= { covered: 0, total: 0 };
    areas[area].covered += c;
    areas[area].total += lines.size;
    covered += c;
    total += lines.size;
    for (const hits of Object.values(info.b)) { bTot += hits.length; bCov += hits.filter((h) => h > 0).length; }
    gaps.push({ file: `apps/frontend/${local}`, covered: c, total: lines.size });
  }
  return { covered, total, branch: pct(bCov, bTot), areas, gaps };
}

// ---------- collect ----------
const dotnet = readDotnet();
const python = readPython();
const frontend = readFrontend();

const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim();
const commit = git(["rev-parse", "--short", "HEAD"]);
const dirty = git(["status", "--porcelain", "--", "apps", "services"]) ? "+dirty" : "";
const date = new Date().toISOString().slice(0, 10);

const libArea = frontend.areas["src/lib"] ?? { covered: 0, total: 0 };
const allCovered = dotnet.covered + python.covered + frontend.covered;
const allTotal = dotnet.total + python.total + frontend.total;
const dn = (k) => dotnet.areas[k] ?? { covered: 0, total: 0 };

// ---------- modules ----------
const moduleList = [...MODULES, PLATFORM].sort((a, b) => a.order - b.order);
const empty = () => ({ covered: 0, total: 0 });
const modules = Object.fromEntries(moduleList.map((m) => [m.key, { dotnet: empty(), frontend: empty() }]));
for (const [side, src] of [["dotnet", dotnet], ["frontend", frontend]]) {
  for (const g of src.gaps) {
    const local = g.file.slice(g.file.indexOf("/src/") + "/src/".length);
    const match = MODULES.find((m) => m[side].some((pattern) => local.includes(pattern)));
    const bucket = modules[(match ?? PLATFORM).key][side];
    bucket.covered += g.covered;
    bucket.total += g.total;
  }
}
const both = (m) => ({ covered: m.dotnet.covered + m.frontend.covered, total: m.dotnet.total + m.frontend.total });
const share = (a) => (a.total ? `${fmt(pct(a.covered, a.total))}%` : "—");
const moduleRows = [
  ...moduleList.map(({ name, key }) => {
    const m = modules[key];
    const sum = both(m);
    return `| ${name} | ${share(sum)} | ${sum.covered} / ${sum.total} | ${share(m.dotnet)} (${m.dotnet.covered} / ${m.dotnet.total}) | ${share(m.frontend)} (${m.frontend.covered} / ${m.frontend.total}) |`;
  }),
  `| AI service | ${share(python)} | ${python.covered} / ${python.total} | — | — |`,
];

const columns = [
  "date", "commit", "overall_line",
  "dotnet_line", "dotnet_branch", "dotnet_covered", "dotnet_total",
  "dotnet_api", "dotnet_application", "dotnet_domain", "dotnet_infrastructure",
  "python_line", "python_branch", "python_covered", "python_total",
  "frontend_line", "frontend_branch", "frontend_covered", "frontend_total", "frontend_lib_line",
  "failing_suites",
  // New columns go last, so rows written before they existed stay readable and read as blank.
  ...moduleList.map((m) => `${m.key}_line`),
];
const row = {
  date,
  commit: commit + dirty,
  overall_line: fmt(pct(allCovered, allTotal)),
  dotnet_line: fmt(pct(dotnet.covered, dotnet.total)),
  dotnet_branch: fmt(dotnet.branch),
  dotnet_covered: dotnet.covered,
  dotnet_total: dotnet.total,
  dotnet_api: fmt(pct(dn("Api").covered, dn("Api").total)),
  dotnet_application: fmt(pct(dn("Application").covered, dn("Application").total)),
  dotnet_domain: fmt(pct(dn("Domain").covered, dn("Domain").total)),
  dotnet_infrastructure: fmt(pct(dn("Infrastructure").covered, dn("Infrastructure").total)),
  python_line: fmt(pct(python.covered, python.total)),
  python_branch: fmt(python.branch),
  python_covered: python.covered,
  python_total: python.total,
  frontend_line: fmt(pct(frontend.covered, frontend.total)),
  frontend_branch: fmt(frontend.branch),
  frontend_covered: frontend.covered,
  frontend_total: frontend.total,
  frontend_lib_line: fmt(pct(libArea.covered, libArea.total)),
  failing_suites: failures.join(" "),
  ...Object.fromEntries(moduleList.map((m) => {
    const sum = both(modules[m.key]);
    return [`${m.key}_line`, fmt(pct(sum.covered, sum.total))];
  })),
};

// ---------- history ----------
fs.mkdirSync(outDir, { recursive: true });
let history = [];
if (fs.existsSync(historyPath)) {
  const [header, ...lines] = fs.readFileSync(historyPath, "utf8").trim().split(/\r?\n/);
  const keys = header.split(",");
  history = lines.filter(Boolean).map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], v])));
}
history = history.filter((h) => h.commit !== row.commit);
history.push(row);
fs.writeFileSync(historyPath, [columns.join(","), ...history.map((h) => columns.map((c) => h[c] ?? "").join(","))].join("\n") + "\n");

// ---------- report ----------
const delta = (key) => {
  const prev = history.length > 1 ? Number(history[history.length - 2][key]) : NaN;
  const d = Number(row[key]) - prev;
  if (!Number.isFinite(d)) return "";
  return d === 0 ? " (±0.0)" : ` (${d > 0 ? "+" : ""}${d.toFixed(1)})`;
};

const areaRows = (label, src) =>
  Object.entries(src.areas)
    .filter(([, a]) => a.total > 0)
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([k, a]) => `| ${label} | \`${k}\` | ${fmt(pct(a.covered, a.total))}% | ${a.covered} / ${a.total} |`);

const gapRows = (src, n = 5) =>
  src.gaps
    .map((g) => ({ ...g, missed: g.total - g.covered }))
    .filter((g) => g.missed > 0)
    .sort((a, b) => b.missed - a.missed)
    .slice(0, n)
    .map((g) => `| \`${g.file}\` | ${g.missed} | ${fmt(pct(g.covered, g.total))}% |`);

const trend = [...history].reverse().map((h) =>
  `| ${h.date} | \`${h.commit}\` | **${h.overall_line}%** | ${h.dotnet_line}% | ${h.python_line}% | ${h.frontend_line}% | ${h.frontend_lib_line}% | ${h.failing_suites || "—"} |`);

const report = `# Unit-test coverage

> Generated by \`npm run coverage\` (scripts/coverage-report.mjs). Do not edit by hand; the numbers come from [history.csv](history.csv).
> Last run: ${date} on \`${row.commit}\`.${failures.length ? ` **Failing suites in this run: ${failures.join(", ")}.**` : ""}

Line coverage is the share of executable lines (statements, for Python) that at least one unit test runs. Playwright e2e is not counted. The frontend figure covers all of \`src/\`, so pages and components with no unit tests count as 0%. Component tests are not set up yet (PF-038).

## Latest

| Codebase | Line | Branch | Lines covered |
|---|---|---|---|
| **All three** | **${row.overall_line}%**${delta("overall_line")} | | ${allCovered} / ${allTotal} |
| .NET API (xUnit) | ${row.dotnet_line}%${delta("dotnet_line")} | ${row.dotnet_branch}% | ${dotnet.covered} / ${dotnet.total} |
| Python AI service (pytest) | ${row.python_line}%${delta("python_line")} | ${row.python_branch}% | ${python.covered} / ${python.total} |
| Frontend (Vitest) | ${row.frontend_line}%${delta("frontend_line")} | ${row.frontend_branch}% | ${frontend.covered} / ${frontend.total} |
| Frontend, \`src/lib\` only | ${row.frontend_lib_line}%${delta("frontend_lib_line")} | | ${libArea.covered} / ${libArea.total} |

## By module

Line is the .NET and frontend lines of a module added together; the two columns on the right show each part. Frontend files include pages and components, which have no unit tests (PF-038). The rows add up to the "All three" total. The \`MODULES\` list in scripts/coverage-report.mjs decides which file counts where; per-module history is in the \`*_line\` columns of [history.csv](history.csv), and the AI service's is \`python_line\`.

| Module | Line | Lines covered | .NET | Frontend |
|---|---|---|---|---|
${moduleRows.join("\n")}

## By layer

| Codebase | Area | Line | Lines covered |
|---|---|---|---|
${[...areaRows(".NET", dotnet), ...areaRows("Python", python), ...areaRows("Frontend", frontend)].join("\n")}

## Trend

| Date | Commit | All | .NET | Python | Frontend | Frontend \`src/lib\` | Failing suites |
|---|---|---|---|---|---|---|---|
${trend.join("\n")}

## Biggest gaps

The files with the most lines no unit test runs, per codebase.

### .NET

| File | Uncovered lines | Line |
|---|---|---|
${gapRows(dotnet).join("\n")}

### Python

| File | Uncovered statements | Line |
|---|---|---|
${gapRows(python).join("\n")}

### Frontend, \`src/lib\`

| File | Uncovered lines | Line |
|---|---|---|
${gapRows({ gaps: frontend.gaps.filter((g) => g.file.includes("/src/lib/")) }).join("\n")}
`;
fs.writeFileSync(reportPath, report);

console.log(`\n✔ Coverage ${row.overall_line}% overall (.NET ${row.dotnet_line}%, Python ${row.python_line}%, frontend ${row.frontend_line}%, src/lib ${row.frontend_lib_line}%).`);
console.log(`  Report: ${rel(path.relative(root, reportPath))}  History: ${rel(path.relative(root, historyPath))}`);
if (failures.length) process.exitCode = 1;
