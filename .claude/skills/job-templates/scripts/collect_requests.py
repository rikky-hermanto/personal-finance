"""List the user's own requests from Claude Code and Codex transcripts.

Usage: python -I collect_requests.py [--days 60] [--project personal-finance] > requests.tsv
Output: one TSV row per request: timestamp, tool, project, text (first 300 chars, one line).
Injected context (instruction files, environment blocks, tool results) is skipped.
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import sys

HOME = pathlib.Path.home()
CODEX_REQUEST_MARKER = "## My request for Codex:"
# Codex's approval reviewer writes these as "user" turns; they are not the user's words.
CODEX_INJECTED = ("<", "# AGENTS.md", "# Context from my IDE", "# Files mentioned by the user",
                  "The following is the Codex agent history")


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()[:300]


def claude_text(content) -> str | None:
    if isinstance(content, str):
        parts = [content]
    else:
        parts = [c.get("text", "") for c in content if c.get("type") == "text"]
    text = "\n".join(p for p in parts if p)
    command = re.search(r"<command-name>(/[^<]+)</command-name>", text)
    if command:
        args = re.search(r"<command-args>(.*?)</command-args>", text, re.S)
        return f"{command.group(1)} {args.group(1) if args else ''}".strip()
    # Drop system reminders and other injected tags, keep what the user typed.
    text = re.sub(r"<(system-reminder|ide_[a-z_]+|local-command-[a-z]+)>.*?</\1>", "", text, flags=re.S)
    text = text.strip()
    if not text or text.startswith(("<", "Caveat:", "[Request interrupted", "This session is being continued")):
        return None
    return text


def codex_text(content) -> str | None:
    for c in content:
        text = c.get("text", "")
        if CODEX_REQUEST_MARKER in text:
            return text.split(CODEX_REQUEST_MARKER, 1)[1].strip()
        if text and not text.lstrip().startswith(CODEX_INJECTED):
            return text
    return None


def parse_ts(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--project", default="", help="substring filter on project dir / cwd")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=args.days)
    rows = []

    for f in (HOME / ".claude" / "projects").glob("*/*.jsonl"):
        project = f.parent.name
        if args.project.lower() not in project.lower():
            continue
        for line in f.open(encoding="utf-8", errors="replace"):
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            if d.get("type") != "user" or d.get("isMeta") or "timestamp" not in d:
                continue
            ts = parse_ts(d["timestamp"])
            text = ts >= since and claude_text(d.get("message", {}).get("content", ""))
            if text:
                rows.append((ts, "claude", project, clean(text)))

    for f in (HOME / ".codex" / "sessions").glob("*/*/*/*.jsonl"):
        cwd = ""
        for line in f.open(encoding="utf-8", errors="replace"):
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            p = d.get("payload") or {}
            if d.get("type") == "session_meta":
                # Reviewer ("guardian") and spawned-agent sessions are not the user talking.
                if isinstance(p.get("source"), dict) and "subagent" in p["source"]:
                    break
                cwd = p.get("cwd", "")
            if d.get("type") != "response_item" or p.get("role") != "user" or "timestamp" not in d:
                continue
            if args.project.lower() not in cwd.lower():
                continue
            ts = parse_ts(d["timestamp"])
            text = ts >= since and codex_text(p.get("content", []))
            if text:
                rows.append((ts, "codex", pathlib.Path(cwd).name, clean(text)))

    for ts, tool, project, text in sorted(rows):
        print(f"{ts:%Y-%m-%d %H:%M}\t{tool}\t{project}\t{text}")


if __name__ == "__main__":
    main()
