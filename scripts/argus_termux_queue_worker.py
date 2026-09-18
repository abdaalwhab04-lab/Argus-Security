#!/usr/bin/env python3
"""
Argus Termux Queue Worker
Polls the public GitHub repository for explicitly requested file operations.

Supported operations:
  - status
  - list
  - read
  - write

No shell execution is supported.
The worker only acts on requests committed to the configured branch.
"""

import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = os.environ.get("ARGUS_QUEUE_REPO", "abdaalwhab04-lab/Argus-Security")
BRANCH = os.environ.get("ARGUS_QUEUE_BRANCH", "argus-termux-bridge-v1")
BASE = Path(os.environ.get("ARGUS_QUEUE_BASE", "/root/Argus-Security")).resolve()
POLL_SECONDS = float(os.environ.get("ARGUS_QUEUE_POLL", "3"))
MAX_READ = 1024 * 1024
MAX_WRITE = 2 * 1024 * 1024

QUEUE_URL = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/.argus/termux-queue/requests.jsonl"
STATE_DIR = Path("/root/.argus-bridge")
STATE_FILE = STATE_DIR / "worker-state.json"
AUDIT_FILE = STATE_DIR / "worker-audit.log"


def safe_path(value: str) -> Path:
    if not isinstance(value, str) or not value:
        raise ValueError("invalid path")
    p = (BASE / value.lstrip("/")).resolve()
    try:
        p.relative_to(BASE)
    except ValueError:
        raise ValueError("path outside Argus-Security")
    return p


def load_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"processed": []}


def save_state(state):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
    tmp.replace(STATE_FILE)


def audit(request_id, operation, path="", ok=True, error=""):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        "id": request_id,
        "operation": operation,
        "path": path,
        "ok": ok,
        "error": error,
        "time": int(time.time()),
    }
    with AUDIT_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def fetch_queue():
    req = urllib.request.Request(
        QUEUE_URL,
        headers={"User-Agent": "Argus-Termux-Queue-Worker/1.0", "Cache-Control": "no-cache"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("utf-8")


def handle(item):
    request_id = item.get("id")
    op = item.get("operation")
    path_value = item.get("path", "")

    if not isinstance(request_id, str) or not request_id or len(request_id) > 100:
        raise ValueError("invalid request id")

    if op == "status":
        return {"ok": True, "operation": "status", "workspace": str(BASE)}

    if op == "list":
        items = []
        for p in sorted(BASE.iterdir()):
            items.append({"name": p.name, "type": "directory" if p.is_dir() else "file"})
        return {"ok": True, "operation": "list", "items": items[:500]}

    path = safe_path(path_value)

    if op == "read":
        if not path.is_file():
            raise FileNotFoundError("file not found")
        if path.stat().st_size > MAX_READ:
            raise ValueError("file too large")
        return {
            "ok": True,
            "operation": "read",
            "path": str(path.relative_to(BASE)),
            "content": path.read_text(encoding="utf-8", errors="replace"),
        }

    if op == "write":
        content = item.get("content")
        if not isinstance(content, str):
            raise ValueError("content must be a string")
        data = content.encode("utf-8")
        if len(data) > MAX_WRITE:
            raise ValueError("file exceeds write limit")
        path.parent.mkdir(parents=True, exist_ok=True)
        existed = path.exists()
        path.write_text(content, encoding="utf-8")
        return {
            "ok": True,
            "operation": "updated" if existed else "created",
            "path": str(path.relative_to(BASE)),
            "bytes": len(data),
        }

    raise ValueError("unsupported operation")


def main():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state = load_state()
    processed = set(state.get("processed", []))

    print("Argus Termux Queue Worker")
    print("Repository:", REPO)
    print("Branch:", BRANCH)
    print("Workspace:", BASE)
    print("Polling:", POLL_SECONDS, "seconds")
    print("Shell execution: DISABLED")

    while True:
        try:
            text = fetch_queue()
            for line in text.splitlines():
                if not line.strip():
                    continue
                item = json.loads(line)
                request_id = item.get("id")
                if request_id in processed:
                    continue

                try:
                    result = handle(item)
                    audit(request_id, item.get("operation", ""), item.get("path", ""), True)
                    print(json.dumps({"id": request_id, "result": result}, ensure_ascii=False))
                except Exception as exc:
                    audit(request_id, item.get("operation", ""), item.get("path", ""), False, str(exc))
                    print(json.dumps({"id": request_id, "error": str(exc)}, ensure_ascii=False))

                processed.add(request_id)

            # Keep bounded state.
            state["processed"] = list(processed)[-2000:]
            save_state(state)

        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            print("Queue fetch:", exc)
        except Exception as exc:
            print("Worker:", exc)

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
