# Red Team Analysis: Docker vs. Micro-VM (BoxLite)

> **Status**: Strategic Critique  
> **Date**: 2026-01-20  
> **Objective**: Determine if relying on Docker is a strategic error and if
> "BoxLite-style" Micro-VMs must be accelerated to Phase 1.5.

---

## 1. The "Docker Is Enough" Fallacy

We currently assume: "Power users have Docker; everyone else uses Host Mode."
**This is a dangerous binary.**

### The Friction Cliff

- **Docker Desktop** is no longer free for many enterprises.
- **Docker Engine** on Linux requires `sudo` or complex rootless setup.
- **OrbStack** (Mac) excellent, but paid/niche.
- **Windows**: Docker Desktop requires WSL2 enablement, BIOS virtualization
  toggle, and admin rights.
- **Result**: Even "Power Users" often don't have a working, running Docker
  daemon _right now_.

### The "Unsafe Gap"

Because Docker is hard, users will default to the path of least resistance:
**Tier 2 (Host Mode)**.

- We admitted in the core critique that **Tier 2 is "Security Theater"**.
- Therefore, by making Tier 1 (Safe) hard to use, **we force users into Tier 2
  (Unsafe)**.
- **Conclusion**: Relying on Docker _guarantees_ that most users run insecurely.

---

## 2. The Micro-VM (BoxLite) Promise

"BoxLite" / Firecracker / Cloud Hypervisor represents a different model: **"Use
the OS's built-in virtualization to spawn a safe sandbox in milliseconds without
an external daemon."**

| Feature        | Docker                  | Micro-VM (BoxLite style) |
| -------------- | ----------------------- | ------------------------ |
| **Dependency** | Docker Daemon (Heavy)   | KVM / Hyper-V (Built-in) |
| **Install**    | Separate MSI/DMG        | Bundled in our Binary    |
| **Startup**    | 1-3 seconds             | < 200 ms                 |
| **Isolation**  | Shared Kernel (weaker)  | Hardware Virt (stronger) |
| **User Exp**   | "Please install Docker" | "Just works"             |

### The "Why Phase 1.5?" Argument

If we ship v1.0 with only Docker vs. Host:

1.  Users install TerminAI.
2.  "I don't have Docker."
3.  "Okay, I'll run in Host Mode."
4.  **Malware/Accident Scenario**: Agent deletes `~/Documents`.
5.  **Brand Damage**: "TerminAI is unsafe."

If we ship v1.5 (Micro-VM) _before_ mass adoption:

1.  Users install TerminAI.
2.  TerminAI spawns a Micro-VM automatically.
3.  **Malware/Accident Scenario**: Agent deletes `~/Documents` inside the VM (or
    CoW layer).
4.  **Result**: "Oops, let me reset the sandbox." User is safe.

**Verdict**: Micro-VM is not a "nice to have" optimization. **It is the only way
to deliver "Safe by Default" to the mass market.** Docker defaults to "Safe only
for Experts."

---

## 3. The Implementation Reality (The Counter-Argument)

Why isn't everyone doing this?

- **Engineering Complexity**: Integrating `firecracker` (Linux),
  `Cloud Hypervisor` (Windows), and `Virtualization.framework` (macOS) is
  **hard**.
- **Goose's Edge**: They are writing in Rust/C++. We are in TypeScript/Node for
  the CLI.
- **Bridge Cost**: Writing a Node.js wrapper around KVM/Hyper-V is non-trivial.

### Strategic Options

**Option A: Bet on Docker (Current)**

- Accept that 80% of users run Unsafe (Host).
- Mitigate with "Scary Warnings" and Policy Engine.
- **Risk**: One major incident kills the company.

**Option B: Accelerate Micro-VM (Phase 1.5)**

- Pause "Feature Work" (GUI, Voice).
- Focus 100% on a generic "Sandbox Binary" (Rust wrapper) that the TS CLI calls.
- **Benefit**: True "Agent Zero" safety.
- **Cost**: Delay v1.0 by ~4-8 weeks.

---

## 4. Recommendation

**BoxLite/Micro-VM MUST be Phase 1.5 (Priority)**.

- We cannot ethically ship "Unsafe Host Mode" as the default for 90% of users
  indefinitely.
- **Docker is a dead end for consumer AI.** No consumer app requires installing
  a server daemon.
- **Action**: Immediately begin research on a cross-platform Micro-VM wrapper
  (likely repurposing an existing Rust crate) to replace the "Managed Host Shim"
  as the intended default.

**The Architecture Shift**:

- **Tier 1 (Default)**: Micro-VM (Bundled, Invisible).
- **Tier 2 (Expert)**: Docker (For custom images/legacy).
- **Tier 3 (Unsafe)**: Host Mode (Strictly for debugging/explicit override).

**We must flip the hierarchy.** Host Mode should be the fallback of last resort,
not the standard alternative.
