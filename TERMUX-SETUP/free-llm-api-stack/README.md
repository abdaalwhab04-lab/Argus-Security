# free-llm-api-stack

> **A free LLM API that stays up.** Stack several free LLM API tiers behind one
> OpenAI-compatible client with automatic failover. Zero dependencies, batteries
> included.

Most "free LLM API" lists tell you *what* exists. This repo is about *how to
actually run on free tiers* without hitting a wall: a tiny zero-dependency
router that treats several free providers (Groq, Cerebras, Gemini, OpenRouter
and more) as **one resilient endpoint**. When one provider rate-limits you
(HTTP 429), the request transparently falls through to the next.

If you just want the full catalog of providers and limits, the excellent
[cheahjs/free-llm-api-resources](https://github.com/cheahjs/free-llm-api-resources)
has it. This repo is the opposite: opinionated, code-first, batteries-included.

Full comparison, per-provider quotas and the stacking strategy writeup:
**[klymentiev.com/blog/free-llm-api](https://klymentiev.com/blog/free-llm-api)**

## Quickstart

```bash
# 1. Get at least one free key (Groq is the fastest first hop)
export GROQ_API_KEY=...        # https://console.groq.com

# 2. Ask something. No install, no dependencies.
python router.py "Explain HTTP 429 in one sentence."
```

Set more keys and you get automatic failover for free:

```bash
export GROQ_API_KEY=...
export CEREBRAS_API_KEY=...
export GEMINI_API_KEY=...
python router.py "Now you have three free tiers behind one call."
```

## Use it in code

```python
from router import Router

r = Router()                       # reads providers.json
out = r.chat([{"role": "user", "content": "hi"}])
print(out["content"], "-- via", out["provider"])

# Custom priority order:
out = r.chat(messages, order=["cerebras", "groq", "gemini"])
```

The router skips any provider whose key is unset, and on 429 / 5xx / timeout it
moves to the next candidate. Set N keys, get an endpoint that stays up until all
N are exhausted.

## Claude Code skill

`skills/free-llm/` is an Agent Skill. Point Claude Code at it and ask things like
"call an LLM for free" or "add a resilient free backend to this project" and it
will pick a provider, tell you which key to set, and wire in the router.

## Providers

All provider data lives in one place: [`providers.json`](providers.json)
(endpoints, env var names, models, limits). It is the single source of truth for
the router, the skill and this README. Free tiers change often, so update that
one file and everything stays correct.

Currently included (OpenAI-compatible endpoints): Groq, Cerebras, Google Gemini,
OpenRouter, NVIDIA NIM, Mistral, Cohere, Hugging Face, plus trial-tier OpenAI /
Anthropic / DeepSeek / xAI (not in the default free order).

## How the router works

```
chat(messages)
   -> provider 1 (key set?) --200--> return
        | 429 / 5xx / timeout / no key
        v
      provider 2 --200--> return
        | ...
        v
   NoProviderAvailable (all exhausted)
```

## Contributing

Adding or fixing a provider is a one-file edit to `providers.json`. Keep base
URLs OpenAI-compatible (`.../chat/completions` must work) so the router stays
uniform.

## License

MIT.
