---
name: free-llm
description: Run LLM calls on free provider tiers (Groq, Cerebras, Gemini, OpenRouter, and more) with automatic failover on rate limits. Use when the user wants to call an LLM without paying, pick a free provider for a task, set up a free API key, or add a resilient free backend to a project.
---

# free-llm

Help the user run LLM requests on free provider tiers, with automatic failover
so a rate limit on one provider transparently falls through to the next.

All provider data lives in `providers.json` (single source of truth). Never
hardcode endpoints or model ids in your answers - read them from that file so
advice stays correct as free tiers change.

## When to use

- "Call an LLM for free" / "which free API should I use"
- Setting up a free provider key for a script or agent
- Adding a resilient free backend (failover across several free tiers)

## Steps

1. **Read `providers.json`** to get the current list, endpoints, env var names,
   models, and limits. Trust the file over your own memory.

2. **Pick a provider by task:**
   - Need speed / high throughput -> `groq` or `cerebras`
   - Need a large context window -> `gemini`
   - Want many models behind one key -> `openrouter` (use a `:free` model id)
   - Doing RAG / tool use -> `cohere`
   Prefer providers with `"tier": "free"`. Treat `"tier": "trial"` as paid-soon.

3. **Set the key.** Tell the user the exact env var from the file, e.g.
   `export GROQ_API_KEY=...`, with the signup link from `homepage`.

4. **Run it.** For a one-off, use the bundled router:
   ```bash
   python router.py "your prompt"
   ```
   To use it in code:
   ```python
   from router import Router
   out = Router().chat([{"role": "user", "content": "hi"}])
   print(out["content"], "via", out["provider"])
   ```
   The router skips any provider whose key is unset and falls through on 429/5xx,
   so setting several keys makes calls more resilient, not just cheaper.

5. **Failover order.** Default order is in `providers.json` under `default_order`.
   To change priority, pass `order=[...]` to `Router` or `chat()`.

## Notes

- The router is zero-dependency (Python stdlib only).
- All providers here speak the OpenAI-compatible `/chat/completions` shape.
- Full comparison, per-provider limits and the stacking strategy writeup:
  https://klymentiev.com/blog/free-llm-api
