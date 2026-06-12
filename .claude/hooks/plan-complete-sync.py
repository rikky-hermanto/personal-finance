#!/usr/bin/env python3
"""
PostToolUse hook: when a .claude/plans/*.md file reaches completion,
auto-appends the ticket to .claude/plans/BOARD.md Done section.

Completion signals (either is sufficient):
  - Header contains:  > **Status:** Completed
  - All checkboxes checked: no "- [ ]" lines, at least one "- [x]" line

Future: uncomment the GitHub section below to also close the GH issue.
"""

import sys
import json
import re
from datetime import date
from pathlib import Path


def is_plan_complete(content: str) -> bool:
    lines = content.split('\n')
    for line in lines[:10]:
        if re.search(r'Status:\s*Completed', line, re.IGNORECASE):
            return True
    unchecked = [l for l in lines if re.match(r'\s*-\s*\[\s*\]', l)]
    checked   = [l for l in lines if re.match(r'\s*-\s*\[x\]', l, re.IGNORECASE)]
    return bool(checked) and not unchecked


def extract_ticket_id(filename: str) -> str | None:
    m = re.search(r'(PF-S?\d+)', filename, re.IGNORECASE)
    return m.group(1).upper() if m else None


def extract_title(content: str) -> str:
    for line in content.split('\n')[:5]:
        m = re.match(r'^#\s+(.+)', line)
        if m:
            return re.sub(r'^PF-S?\d+\s*[—\-]+\s*', '', m.group(1)).strip()
    return 'Unknown'


def is_already_in_done(board_content: str, ticket_id: str) -> bool:
    done_match = re.search(r'## Done.*?(?=\n## |\Z)', board_content, re.DOTALL)
    return ticket_id in done_match.group(0) if done_match else False


def append_to_done(board_path: Path, ticket_id: str, title: str) -> None:
    content = board_path.read_text(encoding='utf-8')

    # Insert after the last row in the Done table
    new_row = f'| {ticket_id} | _(no issue)_ | {title} |\n'
    updated = re.sub(
        r'(## Done.*?\n(?:\|.*\|\n)+)',
        lambda m: m.group(1) + new_row,
        content,
        flags=re.DOTALL
    )

    # Bump Last synced date
    today = date.today().strftime('%Y-%m-%d')
    updated = re.sub(r'\*\*Last synced:\*\*[^\n]*', f'**Last synced:** {today}', updated)

    board_path.write_text(updated, encoding='utf-8')


def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return

        data = json.loads(raw)
        tool_input = data.get('tool_input', data)
        file_path  = tool_input.get('file_path', '')
        if not file_path:
            return

        fp    = Path(file_path)
        parts = fp.parts

        # Only act on .claude/plans/*.md
        if fp.suffix != '.md':
            return
        if not (any(p == '.claude' for p in parts) and 'plans' in parts):
            return
        if not fp.exists():
            return

        content = fp.read_text(encoding='utf-8')
        if not is_plan_complete(content):
            return

        ticket_id = extract_ticket_id(fp.name)
        if not ticket_id:
            return

        title = extract_title(content)

        # Resolve BOARD.md: script lives at .claude/hooks/ → project root is ../../
        project_root = Path(__file__).parent.parent.parent
        board_path   = project_root / '.claude' / 'plans' / 'BOARD.md'

        if not board_path.exists():
            print(f'✅ {ticket_id} plan complete — BOARD.md not found, update manually.')
            return

        board_content = board_path.read_text(encoding='utf-8')
        if is_already_in_done(board_content, ticket_id):
            return  # already synced, stay silent

        append_to_done(board_path, ticket_id, title)
        print(f'📋 BOARD.md synced — {ticket_id} "{title}" added to Done.')

        # ── Future: GitHub auto-close ─────────────────────────────────────────
        # Uncomment when you're back on GitHub Issues workflow:
        #
        # import subprocess
        # result = subprocess.run(
        #     ['gh', 'issue', 'list', '--repo', 'rikky-hermanto/personal-finance',
        #      '--search', ticket_id, '--json', 'number,title', '--limit', '1'],
        #     capture_output=True, text=True
        # )
        # issues = json.loads(result.stdout or '[]')
        # if issues:
        #     issue_num = issues[0]['number']
        #     subprocess.run(['gh', 'issue', 'close', str(issue_num),
        #                     '--repo', 'rikky-hermanto/personal-finance'])
        #     print(f'🔒 GitHub Issue #{issue_num} closed.')
        # ─────────────────────────────────────────────────────────────────────

    except Exception:
        pass  # never crash the hook


if __name__ == '__main__':
    main()
