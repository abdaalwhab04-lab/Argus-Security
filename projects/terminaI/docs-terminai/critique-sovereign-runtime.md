# Sovereign Runtime Architecture: Red Team Critique

> **Status**: Adversarial Analysis ("The Devil's Advocate")  
> **Date**: 2026-01-20  
> **Verdict**: Architecture is viable but contains **Critical Risks** in Tier 2
> Security and Dependency Management.

---

## 1. The "Security Theater" of Tier 2 (Managed Host)

The architecture claims Tier 2 (Managed Host Shim) is a safe fallback. **It is
not.**

### The Vulnerability

In Tier 1 (Docker), if the Agent goes rogue or is jailbroken (e.g., prompt
injection from a malicious webpage), `rm -rf /` destroys a disposable container.
In Tier 2, `rm -rf /` destroys the user's machine.

### The Illusion of Protection

The architecture relies on a "Policy Engine" to gate actions.

- **Problem**: The Policy Engine analyzes _intent_ or _static code_.
- **Exploit**: Obfuscated Python code bypasses static analysis easily.
  ```python
  # The Policy Engine sees strictly safe strings...
  import os
  func = "sys" + "tem"
  cmd = "r" + "m -rf /"
  getattr(os, func)(cmd)
  ```
- **Result**: Tier 2 provides **zero process-level isolation**. It is "Security
  Theater" — it looks safe because it uses a `venv`, but a `venv` only protects
  python packages, not the filesystem.

### Counter-Move

We must be honest: **Tier 2 is "Unsafe Mode"**.

- We should strictly label it as such in the UI.
- "You are running in Unsafe Host Mode. The agent has full access to your
  files."
- Do not let the "Managed Runtime" terminology lull users into false confidence.

---

## 2. The Dependency Hell of "Bundled Wheels"

The decision to bundle the `T-APTS` wheel inside the CLI npm package is a
**ticking time bomb**.

### The Recursive Nightmare

The architecture assumes `T-APTS` is a standalone pure-Python wheel.

- **Reality**: As soon as we add _one_ dependency (e.g., `requests`, `pydantic`,
  `numpy` for data capabilities), we must bundle **that dependency's wheel
  too**.
- **Explosion**: `numpy` has different wheels for:
  - Linux (x86_64, aarch64)
  - macOS (Intel, Apple Silicon)
  - Windows (x86, x64)
- **Result**: The `npm` package bloats to 500MB+ of binary wheels, or we fail to
  install on specific architectures. We are effectively re-implementing `conda`
  inside `npm`.

### The Version Lock

- If a security vulnerability is found in `T-APTS`, we must release a new CLI
  version.
- We couple the _deployment mechanism_ (CLI) with the _runtime library_
  (T-APTS).

### Counter-Move

- Keep `T-APTS` strictly **standard-library only**. No `requests`, no
  `pydantic`.
- If we need external deps, we **must** use PyPI (network required), or accept
  the massive bloat of a "Fat CLI".

---

## 3. The "Agent Zero" Anti-Virus Trap

The "Agent Zero" concept (single binary that downloads tools, spawns shells, and
executes scripts) matches the **exact behavioral signature of sophisticated
malware** (e.g., droppers, RATs).

### The Scenario

1. Enterprise user downloads `terminai.exe`.
2. TerminAI tries to "provision itself" by downloading `curl` or spawning
   `powershell`.
3. CrowdStrike / SentinelOne / Windows Defender heuristic engine kills the
   process immediately.
4. User is flagged to IT Security.

### The Impact

By trying to be "self-sufficient" and "sovereign," we become "suspicious."

- **Paradox**: The more "sovereign" (stealthy, self-contained) we try to be, the
  more we look like a virus.
- **Paradox**: "Well-behaved" apps use standard installers (MSI, PKG) and ask
  for permission, which breaks the "drop anywhere" goal.

---

## 4. The Windows Reality Check

The architecture assumes "System Python 3.10+" is available or discoverable.

### The "It Works on My Machine" Fallacy

On a typical corporate Windows laptop:

- Python is installed via Microsoft Store? (Execution aliases are weird).
- Python is blocked by Group Policy?
- Python is version 3.8 (too old for our type hinting)?
- PATH is broken?

### The Support Burden

If we rely on System Python for Tier 2, **50% of our GitHub Issues will be
"Python not found" or "venv creation failed"**.

- We replace "You need Docker" with "You need a correctly configured Python
  environment," which is often _harder_ for laymen to fix than installing Docker
  Desktop.

---

## 5. The "Text-First" Blind Spot (The Sinkhole Revisit)

We bet on PTY (Text) because it's efficient. This ignores **Electron
Blindness**.

### The Problem

- Modern work happens in VS Code, Slack, Discord, and Browser-based tools.
- These apps are built on Electron/Web keys.
- **Accessibility APIs** (our "Tier 1 sensor") are notoriously terrible on
  Electron apps unless strictly configured.
- **PTY** provides zero visibility into these GUIs.

### The Risk

- User: "Go into Slack and summarize the last message."
- TerminAI (Sovereign): "I cannot see Slack. I can only run `curl`."
- User: "But you're an AI agent, Claude Computer Use can do it."
- **Result**: We lose the "Cowork" market because we are functionally blind to
  the apps users actually care about.

---

## Summary of Critical Flaws

| Flaw                          | Severity | Consequence                                                            |
| ----------------------------- | -------- | ---------------------------------------------------------------------- |
| **Tier 2 Lack of Isolation**  | Critical | One jailbreak deletes user data. We are liable.                        |
| **Wheel Bundling Complexity** | High     | CLI package size explodes or we restrict T-APTS capabilities severely. |
| **Agent Zero vs AV**          | High     | Enterprise adoption blocked by instant quarantine.                     |
| **System Python Reliance**    | High     | Support nightmare for Windows users.                                   |
| **Electron Blindness**        | Medium   | Feature gap vs Competitors (Claude Client).                            |

## Recommendations

1.  **Rebrand Tier 2**: Do not call it "Managed Host Shim". Call it
    **"Unrestricted Host Mode"**. Make the user scary-click-through a warning.
2.  **Abandon "Bundled Deps" for Data Science**: Keep `T-APTS` pure-python
    stdlib. If the user wants `pandas`, the agent must `pip install` it from the
    internet (with approval). Don't try to bundle the world.
3.  **Tier 1.5 is Mandatory, not "Future"**: We _need_ a Micro-VM or light
    sandbox (WASM?) for Windows users, because "Unrestricted Host Mode" is too
    dangerous for general public release.
4.  **Signed Binaries**: The "Agent Zero" binary MUST be EV Code Signed to have
    a chance against AV.
