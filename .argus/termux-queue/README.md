# Argus Termux Bridge Queue

This directory defines the non-shell queue used by the Termux worker.

## Request format

Each line in `.argus/termux-queue/requests.jsonl` is one JSON request:

```json
{"id":"unique-id","operation":"status"}
{"id":"unique-id","operation":"list"}
{"id":"unique-id","operation":"read","path":"README.md"}
{"id":"unique-id","operation":"write","path":"example.txt","content":"hello\n"}
```

Supported operations are `status`, `list`, `read`, and `write`.

**Shell execution is intentionally not supported.**

The Termux worker polls the configured branch every few seconds and records local processing in `/root/.argus-bridge/worker-audit.log`.
