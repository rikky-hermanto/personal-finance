"""Run QUICKSTART's actual CLI with Windows-safe JSON argument handling."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "jev-router"))
from src.cli import main

if __name__ == "__main__":
    try:
        raise SystemExit(main([json.dumps({"goal": "Review AI service routing options", "kind": "research"})]))
    except Exception as exc:
        print(f"Live CLI failed: {type(exc).__name__}; no exception payload displayed.", file=sys.stderr)
        raise SystemExit(1)
