---
description: local review of upstream sync merge plan
---

# B-Sync-Review: Local Agent Upstream Review

You are the **Local Agent** — the final authority on upstream sync execution.

**Philosophy:** Quality >> Speed >> Cost

---

## Prerequisites

Before starting:

- [ ] Drafter plan exists: `docs-terminai/upstream-merges/WeekOf*_drafter.md`
- [ ] Red-Team review complete (Section 4 filled in)
- [ ] Red-Team verdict is PASS or PASS WITH AMENDMENTS
- [ ] PR is open and all CI checks passing

---

## Review Process

### Step 1: Read the Full Plan

```bash
# Find the latest merge plan
ls -la docs-terminai/upstream-merges/

# Read it completely
cat docs-terminai/upstream-merges/WeekOf*_drafter.md
```

Do NOT skim. Read every section.

---

### Step 2: Validate Classifications

For each 🟢 LEVERAGE commit:

```bash
# Verify the drafter's claim that there's no overlap
grep -r "relevant_term" packages/core/src/
```

For each 🔴 CANON commit:

- Does the architecture make sense for our codebase?
- Is the "our approach" section realistic?

For each 🟡 QUARANTINE item:

- Make a decision: LEVERAGE, CANON, or SKIP
- Document your rationale in the plan

---

### Step 3: Validate Architecture Specs

For each architecture section:

1. **Check system context diagram matches reality**

   ```bash
   # Verify mentioned files exist
   ls packages/core/src/path/mentioned/in/diagram/
   ```

2. **Check interfaces match existing patterns**

   ```bash
   # Look at similar interfaces in our code
   grep -A 10 "export interface" packages/core/src/similar/file.ts
   ```

3. **Check security considerations are complete**
   - Is Approval Ladder integration correct?
   - Any trust boundary violations?

---

### Step 4: Validate Task List

For each task:

1. **Verify prerequisites are ordered correctly**
   - No task should depend on a later task

2. **Verify code snippets compile**

   ```bash
   # Quick syntax check
   echo 'import TypeScript check' | npx tsc --noEmit --allowJs
   ```

3. **Verify file paths exist or are marked [NEW]**

   ```bash
   ls packages/core/src/path/to/file.ts
   ```

4. **Verify "definition of done" is testable**
   - Can you actually run the verification command?

---

### Step 5: Complete Section 5 (Local Review)

Edit the merge plan file and fill in Section 5:

```markdown
## Section 5: Local Agent Review

### Pre-Execution Verification

- [x] Both drafter and red-team sections complete
- [x] Red-team verdict is PASS
- [x] No unresolved QUARANTINE items

### Architecture review

- [x] System diagrams accurate
- [x] Interfaces match patterns
- [x] Security complete

### Task list review

- [x] Tasks appropriately scoped
- [x] Prerequisites ordered
- [x] Code snippets correct

### Execution Readiness

- [x] All QUARANTINE resolved
- [x] Preflight expected to pass

### Final Decision

- [x] **EXECUTE** — Proceed with plan

Signed: {YOUR_NAME} Date: {TODAY}
```

---

### Step 6: Execute (If Approved)

// turbo-all

```bash
# Create execution branch
git checkout -b upstream-sync/execute

# Cherry-pick LEVERAGE commits
git cherry-pick -x {hash1} {hash2} ...

# For CANON commits, follow the task list exactly
# (Manual implementation following the plan)

# Run preflight
npm run preflight

# If all passes, commit and push
git add -A
git commit -m "upstream-sync: Week of MMMdd"
git push origin upstream-sync/execute
```

---

### Step 7: Update Absorption Log

```bash
# Add entry to absorption log
cat >> .upstream/absorption-log.md << 'EOF'

### Week of {DATE}

| Date | Upstream Range | PR | Classification | Status |
|------|----------------|-----|----------------|--------|
| {DATE} | {START}..{END} | #{PR} | 🟢{N} 🔴{N} 🟡{N} ⚪{N} | ✅ |

**Summary:** {Brief description}
EOF
```

---

### Step 8: Merge PR

```bash
# Merge the execution branch
gh pr create --base main --head upstream-sync/execute \
  --title "[Upstream Sync] Week of MMMdd - Executed" \
  --body "Merge plan executed successfully. See plan file for details."

# Wait for CI
gh run watch

# Merge when green
gh pr merge --squash
```

---

## Decision Authority

**You may EXECUTE if:**

- Red-team verdict is PASS or PASS WITH AMENDMENTS
- All QUARANTINE items have decisions
- You're confident preflight will pass

**You should RETURN TO DRAFTER if:**

- Architecture specs are incomplete or incorrect
- Task list has errors
- Red-team missed significant issues

**You should ESCALATE TO HUMAN if:**

- QUARANTINE items are genuinely uncertain
- Security implications are beyond your authority
- Scope is larger than expected

---

## Quality Reminders

- Take as long as needed
- Verify every claim before accepting it
- If something feels wrong, investigate
- Document your reasoning in the plan file
