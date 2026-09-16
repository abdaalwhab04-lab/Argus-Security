#!/usr/bin/env python3
"""
free-llm-api-stack router
=========================
One client, many free LLM backends, automatic failover.

Send a chat request. If the first provider is rate-limited (429), down (5xx),
times out, or has no API key set, the router silently falls through to the next
provider in order and returns the first success. This turns several free tiers
into one resilient endpoint - the "stacking" strategy as real code.

Zero dependencies. Standard library only. Any provider that exposes an
OpenAI-compatible /chat/completions endpoint works (see providers.json).

Usage (CLI):
    export GROQ_API_KEY=...        # set one or more provider keys
    python router.py "Explain HTTP 429 in one sentence."

Usage (library):
    from router import Router
    r = Router()
    out = r.chat([{"role": "user", "content": "hi"}])
    print(out["content"], "via", out["provider"])
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

PROVIDERS_FILE = Path(__file__).with_name("providers.json")
TIMEOUT = 60


class NoProviderAvailable(RuntimeError):
    """Raised when every candidate provider was skipped or failed."""


class Router:
    def __init__(self, providers_file=PROVIDERS_FILE, order=None, tier="free",
                 verbose=True):
        data = json.loads(Path(providers_file).read_text())
        self.by_id = {p["id"]: p for p in data["providers"]}
        self.verbose = verbose
        # Resolve the order: explicit arg > file default > every provider of tier.
        if order is None:
            order = data.get("default_order") or list(self.by_id)
        self.order = [pid for pid in order if pid in self.by_id]
        if tier:
            self.order = [pid for pid in self.order
                          if self.by_id[pid].get("tier") == tier]

    def _log(self, msg):
        if self.verbose:
            print(f"[router] {msg}", file=sys.stderr)

    def chat(self, messages, order=None, model=None, temperature=None,
             max_tokens=None, **extra):
        """Return {provider, model, content, raw} from the first provider that
        answers. Raises NoProviderAvailable if all candidates fail."""
        candidates = [pid for pid in (order or self.order) if pid in self.by_id]
        errors = []
        for pid in candidates:
            p = self.by_id[pid]
            key = os.environ.get(p["env"])
            if not key:
                self._log(f"skip {pid}: {p['env']} not set")
                continue
            use_model = model or p["model"]
            payload = {"model": use_model, "messages": messages}
            if temperature is not None:
                payload["temperature"] = temperature
            if max_tokens is not None:
                payload["max_tokens"] = max_tokens
            payload.update(extra)
            try:
                self._log(f"try {pid} ({use_model})")
                raw = self._post(p["base_url"], key, payload)
                content = raw["choices"][0]["message"]["content"]
                self._log(f"ok {pid}")
                return {"provider": pid, "model": use_model,
                        "content": content, "raw": raw}
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", "replace")[:200]
                errors.append(f"{pid}: HTTP {e.code} {body}")
                # 429 rate-limit and 5xx are transient -> fall through.
                # 401/403 mean a bad key -> also just move on.
                self._log(f"fail {pid}: HTTP {e.code} -> next")
            except (urllib.error.URLError, TimeoutError, KeyError, IndexError) as e:
                errors.append(f"{pid}: {type(e).__name__} {e}")
                self._log(f"fail {pid}: {type(e).__name__} -> next")
        raise NoProviderAvailable(
            "all providers exhausted:\n  " + "\n  ".join(errors or ["no keys set"]))

    def _post(self, base_url, key, payload):
        url = base_url.rstrip("/") + "/chat/completions"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode())


def _cli(argv):
    if not argv:
        print("usage: python router.py \"your prompt\"", file=sys.stderr)
        return 2
    prompt = " ".join(argv)
    try:
        out = Router().chat([{"role": "user", "content": prompt}])
    except NoProviderAvailable as e:
        print(e, file=sys.stderr)
        print("\nSet at least one provider key, e.g. export GROQ_API_KEY=...",
              file=sys.stderr)
        return 1
    print(out["content"])
    print(f"\n-- served by {out['provider']} ({out['model']})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli(sys.argv[1:]))
