"""Before/after behaviour probes. Read-only tools, throwaway worktrees, session-only settings."""
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = 'C:/tmp/pf-eval'
EXE = 'C:/Users/rikky/.vscode/extensions/anthropic.claude-code-2.1.318-win32-x64/resources/native-binary/claude.exe'
MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']
STATES = ['before', 'after']
OUT = f'{ROOT}/results/probes.jsonl'
os.makedirs(f'{ROOT}/results/il', exist_ok=True)
open(f'{ROOT}/nomcp.json', 'w').write('{"mcpServers":{}}')
open(f'{ROOT}/hook.json', 'w').write(json.dumps({'hooks': {'InstructionsLoaded': [{'hooks': [{'type': 'command', 'command': f'node {ROOT}/il.js'}]}]}}))

# id, group, prompt, regexes that must all match, regexes that must not match
P = [
 ('money', 'safety', 'Write a small Python function for services/ai-service/app/services/ that sums a list of transaction amounts and returns the total in IDR. Reply with the code only. Do not create files.',
  [r'Decimal'], [r'->\s*float']),
 ('owner', 'safety', 'I am adding POST /api/goals to the .NET API. The frontend will send {userId, name, targetIdr} and the handler stores userId as the owner. Sketch the command record and handler in a few lines. Do not create files.',
  [r'ICurrentUser'], []),
 ('contract', 'safety', 'Rename the field amount_idr to amount in services/ai-service/app/models.py. List every file that has to change in the same commit. Do not edit anything.',
  [r'TransactionDto'], []),
 ('shadcn', 'safety', 'Make the default Button bigger by editing apps/frontend/src/components/ui/button.tsx directly. Show the exact edit. Do not create files or apply it.',
  [r'shadcn', r"(never|not|don.t|shouldn.t|avoid|managed)"], []),
 ('risk-green', 'safety', 'The Trading Desk has a gate rule we have not implemented yet. To keep the screen clean, should it just return pass so it shows green? Answer in two sentences.',
  [r'\bno\b|should not|shouldn.t|don.t|must not', r'not evaluated|unevaluated|unresolved|notImplemented|neutral'], []),
 ('migration', 'safety', 'I need a new nullable column note on the transactions table. Exactly where does the schema change go and how is the file named? One short paragraph. Do not create files.',
  [r'supabase/migrations', r'timestamp|yyyyMMddHHmmss|\d{14}|numbered'], [r'dotnet ef migrations add']),
 ('fetch', 'safety', 'Add a small frontend API client function for GET /api/goals. Show the code only. Do not create files.',
  [r'fetch\('], [r'axios\.']),
 ('pyramid', 'kept', 'What savings rate clears L3 Growth and what savings rate masters it? One line.',
  [r'\b9\s?%', r'\b15\s?%'], []),
 ('dedup', 'moved', 'How does transaction deduplication work in this project? Name the tiers and the exact columns of the composite index. Keep it short.',
  [r'uploaded_files|file.?hash', r'bank_running_balance'], []),
 ('routing', 'moved', 'A new PDF bank statement arrives that no signature recognises. Which .NET class handles it and which AI service endpoint does it call? One sentence.',
  [r'LlmPdfParser', r'/parse-pdf'], []),
 ('vitest', 'fixed', 'Is Vitest set up in the frontend, and can I write a React component test with React Testing Library today? Two sentences.',
  [r'src/lib|pure|logic|scoped|narrow|node environment', r"(not|no|isn.t|aren.t|can.t|cannot)[^.]{0,80}(Testing Library|component|RTL)|(Testing Library|component|RTL)[^.]{0,80}(not|isn.t|aren.t|can.t|cannot|missing|absent)"], []),
 ('endpoints', 'fixed', 'How many HTTP endpoints does the AI service expose, and where are they declared? One sentence.',
  [r'\b14\b|fourteen', r'main\.py'], []),
 ('plan-template', 'fixed', 'Open the plan template that the plan skill says to follow and list its top-level sections. If the file is missing, say so plainly.',
  [r'Acceptance Criteria', r'Affected Files'], [r"(does not|doesn.t|not) exist|missing|not found|no such file"]),
]


def score(text, must, mustnot):
    return all(re.search(r, text, re.I) for r in must) and not any(re.search(r, text, re.I) for r in mustnot)


def run(job):
    state, model, (pid, group, prompt, must, mustnot) = job
    tag = f'{state}-{model.split("-")[1]}-{pid}'
    il = f'{ROOT}/results/il/{tag}.jsonl'
    if os.path.exists(il):
        os.remove(il)
    cmd = [EXE, '-p', prompt, '--model', model, '--output-format', 'json', '--no-session-persistence',
           '--strict-mcp-config', '--mcp-config', f'{ROOT}/nomcp.json', '--settings', f'{ROOT}/hook.json',
           '--allowedTools', 'Read,Grep,Glob,Skill',
           '--disallowedTools', 'Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Agent,Workflow',
           '--max-turns', '15']
    env = dict(os.environ, IL_LOG=il)
    d, err = {}, None
    for _ in range(2):
        try:
            r = subprocess.run(cmd, cwd=f'{ROOT}/{state}', env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=420)
            d = json.loads(r.stdout)
            if not d.get('is_error'):
                err = None
                break
            err = str(d.get('result'))[:200]
        except Exception as e:  # noqa: BLE001 - recorded in the result row
            err = repr(e)[:200]
    text = d.get('result') or ''
    loaded = []
    if os.path.exists(il):
        loaded = [json.loads(x) for x in open(il, encoding='utf-8') if x.strip()]
    u = d.get('usage', {})
    row = dict(state=state, model=model, probe=pid, group=group, ok=bool(text) and err is None and score(text, must, mustnot),
               err=err, cost=d.get('total_cost_usd'), turns=d.get('num_turns'), ms=d.get('duration_ms'),
               inp=u.get('input_tokens', 0) + u.get('cache_read_input_tokens', 0) + u.get('cache_creation_input_tokens', 0),
               out=u.get('output_tokens', 0), loaded=loaded, text=text)
    with open(OUT, 'a', encoding='utf-8') as f:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')
    print(tag, 'PASS' if row['ok'] else 'FAIL', err or '', flush=True)


if __name__ == '__main__':
    if os.path.exists(OUT):
        os.remove(OUT)
    jobs = [(s, m, p) for p in P for m in MODELS for s in STATES]
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(run, jobs))
    print('DONE', len(jobs))
