"""Plan-style trial: same task, two plan styles, each model, two repeats, hidden test suite."""
import json
import os
import re
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor

ROOT = 'C:/tmp/pf-eval'
EXE = 'C:/Users/rikky/.vscode/extensions/anthropic.claude-code-2.1.318-win32-x64/resources/native-binary/claude.exe'
PY = 'C:/workspaces/personal-finance/services/ai-service/.venv/Scripts/python.exe'
MAIN = 'C:/workspaces/personal-finance'
SHA = open(f'{ROOT}/after.sha').read().strip()
MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']
OUT = f'{ROOT}/results/trial.jsonl'
PLAN = 'plans/backlog/PF-999-balance-reconciler-todo.md'
PROMPT = (f'/execute {PLAN}\n\nEnvironment note: run Python as {PY} -m pytest from services/ai-service inside this folder. '
          'Only change files inside this folder. Do not commit.')


def run(job):
    model, style, rep = job
    tag = f'{model.split("-")[1]}-{style}-{rep}'
    wt = f'{ROOT}/t/{tag}'
    subprocess.run(['git', '-C', MAIN, 'worktree', 'add', '-q', '--detach', wt, SHA], check=True)
    shutil.copy(f'{ROOT}/plan-{style}.md', f'{wt}/{PLAN}')
    cmd = [EXE, '-p', PROMPT, '--model', model, '--output-format', 'json', '--no-session-persistence',
           '--strict-mcp-config', '--mcp-config', f'{ROOT}/nomcp.json', '--settings', '{"disableAllHooks":true}',
           '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Grep,Glob,Edit,Write,Bash,Skill',
           '--disallowedTools', 'WebFetch,WebSearch,Agent,Workflow', '--max-turns', '40']
    d, err = {}, None
    try:
        r = subprocess.run(cmd, cwd=wt, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1200)
        d = json.loads(r.stdout)
        if d.get('is_error'):
            err = str(d.get('result'))[:200]
    except Exception as e:  # noqa: BLE001 - recorded in the result row
        err = repr(e)[:200]
    changed = subprocess.run(['git', '-C', wt, 'status', '--short'], capture_output=True, text=True).stdout.split('\n')
    hidden = f'{wt}/services/ai-service/tests/test_hidden_balance_reconciler.py'
    shutil.copy(f'{ROOT}/test_hidden_balance_reconciler.py', hidden)
    h = subprocess.run([PY, '-m', 'pytest', 'tests/test_hidden_balance_reconciler.py', '-q', '--tb=line', '-p', 'no:cacheprovider'],
                       cwd=f'{wt}/services/ai-service', capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
    os.remove(hidden)
    tail = h.stdout.strip().split('\n')[-1]
    passed = int((re.search(r'(\d+) passed', tail) or [0, 0])[1])
    failed = int((re.search(r'(\d+) failed', tail) or [0, 0])[1])
    names = re.findall(r'test_hidden_balance_reconciler\.py::(\w+)|FAILED .*::(\w+)', h.stdout)
    u = d.get('usage', {})
    row = dict(model=model, style=style, rep=rep, err=err, cost=d.get('total_cost_usd'), turns=d.get('num_turns'), ms=d.get('duration_ms'),
               inp=u.get('input_tokens', 0) + u.get('cache_read_input_tokens', 0) + u.get('cache_creation_input_tokens', 0),
               out=u.get('output_tokens', 0), passed=passed, failed=failed, tail=tail, failed_names=[a or b for a, b in names],
               changed=[c for c in changed if c.strip()], result=(d.get('result') or '')[-500:])
    with open(OUT, 'a', encoding='utf-8') as f:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')
    print(tag, tail, err or '', flush=True)


if __name__ == '__main__':
    if os.path.exists(OUT):
        os.remove(OUT)
    os.makedirs(f'{ROOT}/t', exist_ok=True)
    jobs = [(m, s, r) for r in (1, 2) for m in MODELS for s in ('a', 'b')]
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(run, jobs))
    print('DONE', len(jobs))
