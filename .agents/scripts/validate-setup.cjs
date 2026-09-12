// Validate local Codex skill/rule coverage, metadata, references, and helper syntax.
// Run from any directory: node .agents/scripts/validate-setup.cjs
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
let yaml;
for (const name of ['yaml', 'js-yaml']) {
  try { yaml = require(require.resolve(name, { paths: [path.join(root, 'apps/frontend'), root] })); break; }
  catch { /* Try the other existing dependency. */ }
}
if (!yaml) {
  console.error('Validation unavailable: install project frontend dependencies to provide a YAML parser.');
  process.exit(2);
}
const failures = [];
const sourceSkills = fs.readdirSync(path.join(root, '.claude/skills'), { withFileTypes: true })
  .filter(e => e.isDirectory() && fs.existsSync(path.join(root, '.claude/skills', e.name, 'SKILL.md')))
  .map(e => e.name).sort();
const ruleNames = fs.readdirSync(path.join(root, '.claude/rules')).filter(n => n.endsWith('.md')).sort();
for (const name of sourceSkills) {
  const file = path.join(root, '.agents/skills', name, 'SKILL.md');
  if (!fs.existsSync(file)) { failures.push(`Missing skill: ${name}`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) { failures.push(`Missing frontmatter: ${name}`); continue; }
  try {
    const meta = (yaml.parse || yaml.load)(match[1]);
    const allowed = new Set(['name', 'description', 'license', 'metadata', 'allowed-tools']);
    if (Object.keys(meta).some(k => !allowed.has(k))) failures.push(`Unsupported metadata: ${name}`);
    if (meta.name !== name || name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) failures.push(`Invalid name: ${name}`);
    if (typeof meta.description !== 'string' || !meta.description.trim() || meta.description.length > 1024 || /[<>]/.test(meta.description)) failures.push(`Invalid description: ${name}`);
  } catch (error) { failures.push(`YAML ${name}: ${error.message}`); }
  if (!text.includes('WORKFLOWS.md')) failures.push(`Missing shared workflow link: ${name}`);
}
for (const name of ruleNames) {
  if (!fs.existsSync(path.join(root, '.agents/rules', name))) failures.push(`Missing rule: ${name}`);
}
const docs = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.md')) docs.push(file);
  }
}
walk(path.join(root, '.agents/skills'));
walk(path.join(root, '.agents/rules'));
docs.push(path.join(root, '.agents/WORKFLOWS.md'));
// Check concrete Markdown file links; ignore links inside fenced examples/templates.
for (const file of docs) {
  const text = fs.readFileSync(file, 'utf8').replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*(?:\n|$)/gm, '');
  for (const m of text.matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
    let target = m[1].trim().replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(?:https?:|mailto:|app:)/.test(target) || /[{}*]/.test(target)) continue;
    // Historical mentor docs sometimes state root-relative links explicitly.
    const resolved = target.startsWith('docs/') ? path.join(root, target) : path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) failures.push(`Broken link: ${path.relative(root, file)} -> ${target}`);
  }
}
const helper = path.join(root, '.agents/skills/create-diagram/verify-diagram.js');
const syntax = spawnSync(process.execPath, ['--check', helper], { encoding: 'utf8' });
if (syntax.status !== 0) failures.push(`Diagram helper syntax: ${syntax.stderr || syntax.error}`);
console.log(`Coverage: ${sourceSkills.length} source skill names; ${ruleNames.length} source rule files.`);
if (failures.length) {
  failures.forEach(f => console.error(f));
  process.exitCode = 1;
} else console.log('PASS: skill metadata, shared workflow routing, rule coverage, concrete links, and helper syntax.');
