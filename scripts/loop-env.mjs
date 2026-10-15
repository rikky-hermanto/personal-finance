#!/usr/bin/env node
// Per-slot environment for the loop (setup-loop). Slot 0 is the owner's main stack and is never touched here.
// Supabase (Postgres, Auth, Storage) is shared by every slot; only the three app processes are duplicated.
//
//   node scripts/loop-env.mjs up <slot> <worktree>    start AI service, API and frontend of that slot on its own ports
//   node scripts/loop-env.mjs down <slot> <worktree>  stop only that slot's app processes (shared services keep running)
//   node scripts/loop-env.mjs deps <worktree>         link the main checkout's frontend node_modules into a worktree
//   node scripts/loop-env.mjs snapshot <file>         dump schema public + supabase_migrations of the shared DB to <file>
//   node scripts/loop-env.mjs restore <file>          restore those schemas from <file> (destructive, one transaction)
//
// Paths resolve from this script's location, so it works from any worktree even when it is not committed there.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(MAIN, '.claude', 'loop.json'), 'utf8'));
const DB_CONTAINER = process.env.LOOP_DB_CONTAINER ?? 'supabase_db_personal-finance'; // supabase CLI: supabase_db_<project_id>
const PYTHON = path.join(MAIN, 'services', 'ai-service', '.venv', 'Scripts', 'python.exe');
const isWin = process.platform === 'win32';

const [, , cmd, a, b] = process.argv;

function fail(msg) {
  console.error(`loop-env: ${msg}`);
  process.exit(1);
}

const slotDir = (slot) => path.join(MAIN, '.loop', 'slots', String(slot));
const pidFile = (slot) => path.join(slotDir(slot), 'pids.json');

function portsOf(slot) {
  if (String(slot) === '0') fail('slot 0 is the main stack; the loop never starts or stops it');
  const ports = cfg.env.slots[String(slot)];
  if (!ports || typeof ports !== 'object') fail(`no port map for slot ${slot} in .claude/loop.json`);
  return ports;
}

function deps(wt) {
  const wtRoot = path.resolve(wt);
  if (wtRoot === MAIN) return;
  const link = path.join(wtRoot, 'apps', 'frontend', 'node_modules');
  const target = path.join(MAIN, 'apps', 'frontend', 'node_modules');
  if (fs.existsSync(link)) return;
  const lock = (root) => { try { return fs.readFileSync(path.join(root, 'apps', 'frontend', 'package-lock.json'), 'utf8'); } catch { return null; } };
  if (lock(wtRoot) !== lock(MAIN)) {
    // The ticket changed dependencies: install them for real instead of borrowing main's.
    const r = spawnSync(isWin ? 'npm.cmd' : 'npm', ['ci'], { cwd: path.dirname(link), stdio: 'inherit', shell: isWin });
    if (r.status !== 0) fail('npm ci failed in the worktree');
    return;
  }
  if (!fs.existsSync(target)) fail(`main checkout has no ${target}; run npm ci in apps/frontend first`);
  fs.symlinkSync(target, link, 'junction');
}

function start(slot, name, exe, args, cwd, env) {
  fs.mkdirSync(slotDir(slot), { recursive: true });
  const log = fs.openSync(path.join(slotDir(slot), `${name}.log`), 'w');
  const child = spawn(exe, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: ['ignore', log, log], windowsHide: true });
  child.unref();
  return child.pid;
}

async function waitFor(url, deadline) {
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function up(slot, wt) {
  const ports = portsOf(slot);
  const wtRoot = path.resolve(wt ?? fail('up needs <worktree>'));
  if (fs.existsSync(pidFile(slot))) down(slot);
  deps(wtRoot);
  if (!fs.existsSync(PYTHON)) fail(`AI service venv not found at ${PYTHON}`);

  const host = (p) => `http://localhost:${p}`;
  const pids = {};
  pids.ai = start(slot, 'ai', PYTHON, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(ports.ai)],
    path.join(wtRoot, 'services', 'ai-service'), {});
  pids.api = start(slot, 'api', 'dotnet', ['run', '--project', path.join(wtRoot, 'apps', 'api', 'src', 'PersonalFinance.Api'), '--no-launch-profile'],
    wtRoot, {
      ASPNETCORE_ENVIRONMENT: 'Development',
      ASPNETCORE_URLS: host(ports.api),
      AiService__BaseUrl: host(ports.ai),
      Cors__AllowedOrigins__0: host(ports.frontend),
    });
  // Variables already in the process environment win over Vite's .env files.
  pids.frontend = start(slot, 'frontend', process.execPath,
    [path.join(wtRoot, 'apps', 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(ports.frontend), '--strictPort'],
    path.join(wtRoot, 'apps', 'frontend'), { VITE_API_URL: host(ports.api), VITE_AI_SERVICE_URL: host(ports.ai) });
  fs.writeFileSync(pidFile(slot), JSON.stringify(pids, null, 2));

  const deadline = Date.now() + 170_000; // loop-run gives env.up 180 s
  const checks = { ai: `${host(ports.ai)}/health`, api: `${host(ports.api)}/health`, frontend: host(ports.frontend) };
  for (const [name, url] of Object.entries(checks)) {
    if (!(await waitFor(url, deadline))) fail(`${name} did not answer at ${url}; see ${path.join(slotDir(slot), `${name}.log`)}`);
  }
  console.log(`slot ${slot} up: frontend ${ports.frontend}, api ${ports.api}, ai ${ports.ai}`);
}

function down(slot) {
  portsOf(slot);
  let pids;
  try { pids = JSON.parse(fs.readFileSync(pidFile(slot), 'utf8')); } catch { console.log(`slot ${slot}: nothing running`); return; }
  for (const [name, pid] of Object.entries(pids)) {
    const r = isWin
      ? spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' })
      : (() => { try { process.kill(-pid, 'SIGTERM'); return { status: 0 }; } catch (e) { return { status: 1, stderr: e.message }; } })();
    if (r.status !== 0) console.error(`loop-env: ${name} (pid ${pid}) was not running or could not be stopped`);
  }
  fs.rmSync(pidFile(slot), { force: true });
  console.log(`slot ${slot} down`);
}

function docker(args, opts = {}) {
  return spawnSync('docker', args, { maxBuffer: 1024 * 1024 * 1024, ...opts });
}

function snapshot(file) {
  if (!file) fail('snapshot needs <file>');
  const r = docker(['exec', DB_CONTAINER, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-n', 'public', '-n', 'supabase_migrations', '-Fc']);
  if (r.status !== 0 || !r.stdout?.length) fail(`pg_dump failed: ${r.stderr?.toString() || 'empty output'}`);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, r.stdout);
  // Read the dump back so a corrupt snapshot is caught now, not at restore time.
  const check = docker(['exec', '-i', DB_CONTAINER, 'pg_restore', '-l'], { input: fs.readFileSync(file) });
  if (check.status !== 0) fail(`snapshot ${file} cannot be read back: ${check.stderr?.toString()}`);
  console.log(`snapshot written: ${file} (${r.stdout.length} bytes)`);
}

function restore(file) {
  if (!file || !fs.existsSync(file)) fail(`restore needs an existing <file> (got ${file})`);
  const r = docker(['exec', '-i', DB_CONTAINER, 'pg_restore', '-U', 'postgres', '-d', 'postgres', '--clean', '--if-exists', '--no-owner', '--single-transaction'],
    { input: fs.readFileSync(file) });
  if (r.status !== 0) fail(`pg_restore failed (nothing was changed, single transaction): ${r.stderr?.toString()}`);
  console.log(`restored from ${file}`);
}

switch (cmd) {
  case 'up': await up(a, b); break;
  case 'down': down(a); break;
  case 'deps': deps(a ?? process.cwd()); break;
  case 'snapshot': snapshot(a); break;
  case 'restore': restore(a); break;
  default:
    console.error('usage: loop-env.mjs up|down <slot> <worktree> | deps <worktree> | snapshot|restore <file>');
    process.exit(2);
}
