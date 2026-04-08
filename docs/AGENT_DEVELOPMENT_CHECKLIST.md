# Agent Development Checklist

Follow this for every feature. No exceptions.

---

## Every Feature: DESIGN → BUILD → STABILIZE → SIMPLIFY → COMMIT

### 0. DESIGN (Define What Right Looks Like)

- [ ] **Before building, agree on approach:**
  - Discuss the feature and spec it out (backlog entry or inline discussion)
  - For non-trivial features, write acceptance criteria before touching code
  - Nothing proceeds to BUILD without a shared understanding of what "done" means

- [ ] **Spec is the contract:**
  - Agents build to this. Stabilize verifies against it.
  - If it passes the spec, it's done. If it doesn't, it's not.

### 1. BUILD

- [ ] **Give direction, not instructions:**
  - Good: "Add conversational history to the query endpoint"
  - Bad: "Open src/logic/thoughts.ts and add a history parameter at line 756..."
  - Define *what*, let the agent figure out *how*

- [ ] **Review behavior, not code:**
  - Does it do what you asked? Test it (send a message, check the response)
  - Don't read the implementation unless something feels wrong
  - Automated gates catch type errors — you watch for *wrong behavior*

- [ ] **Iterate until happy:**
  - Keep going until the behavior is what you want before moving to stabilize

### 2. STABILIZE

**When:** The feature works, you've tested it, you're happy. Before moving on.

- [ ] **Write tests** for new functions/endpoints
  - Good tests verify the *behavior* you just tested manually
  - Cover: happy path, error cases, edge cases (empty input, missing fields, invalid values)
  - Bad tests: just assert a function exists or returns 200

- [ ] **Document invariants** in `docs/SERVICE.md`
  - Invariants = "things that must not change without discussion"
  - Example: "Capture always succeeds even if LLM is down"
  - Example: "All endpoints return `{ success, data?, error? }`"
  - These are for future agents — they check their changes against this list

- [ ] **Run `deno task verify`** and fix any issues
  - Type check + lint + tests must all pass
  - If something fails, fix it before committing

- [ ] **Update BACKLOG.md** if working a backlog item — set status to `done`

### 3. SIMPLIFY

**When:** After stabilize passes — tests are green, but the code has rough edges.

The `/simplify` skill launches three review agents (reuse, quality, efficiency) and fixes issues found:

- [ ] **Run `/simplify`**

  It will:
  - Remove dead code, redundant comments, debugging artifacts
  - Consolidate duplicated logic introduced during exploration
  - Improve naming and control flow
  - Flag unnecessary work, N+1 patterns, missed concurrency

- [ ] **Preserve all behavior:**
  - No functional changes — only readability and structure
  - Re-runs `deno task verify` after changes

> **Skip** if the change is already clean (small, single-file edit). Not every feature needs a simplify pass.

### 4. COMMIT

- [ ] **Commit only after stabilize and simplify both pass**
  - Write a clear commit message describing *why*, not just *what*
  - Include `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` for AI-assisted commits

---

## Parallel Work with Worktrees

When working multiple backlog items simultaneously, use git worktrees for isolation.

- Each item gets its own branch and worktree directory
- Work follows the normal BUILD → STABILIZE → SIMPLIFY → COMMIT cycle on the feature branch
- Worktree agents must commit their work; merge back to main via git
- Prefer items in **different parts of the codebase** to minimize merge conflicts
- Keep worktrees **short-lived** — merge quickly

---

## The Magic Phrases

| You say | Agent does |
|---------|-----------|
| "Stabilize this" | Writes tests + documents invariants in SERVICE.md + runs verify |
| "Simplify this" | Cleans up recently modified code for clarity without changing behavior |
| "What should we work on next?" | Scans BACKLOG.md, reports in-progress and unblocked planned items |

---

## What's Protecting You (automatic)

| Gate | When | What it checks |
|------|------|----------------|
| `deno task verify` | During stabilize + simplify | Type check + lint + tests |
| Pre-commit hook | Every `git commit` | `deno task verify` |

---

## Key Files

| File | Purpose | When to touch |
|------|---------|---------------|
| `docs/SERVICE.md` | Health + invariants | During stabilize |
| `docs/BACKLOG.md` | Tracked work items | When starting/completing items |
| `src/tests/standalone_test.ts` | Behavior tests | During stabilize |
| `deno.json` | `verify` task + lint rules | Rarely — agent handles |
