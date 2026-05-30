# Memory Curation Rules

This document defines what information is synthesized into permanent memory vs raw log caches.

## Memory Classification Thresholds

### 1. Critical Memory (Quality 5)
* **Definition**: Plans, tasks, architectural decisions, and agent instructions. 
* **Target Files**: `CENTRAL_CONTEXT.md`, `DECISIONS.md`, `CURRENT_STATE.md`, `MEMORY_RULES.md`.
* **Rules**: Always kept in full, clean formats. Pushed/synced to remote VPS.

### 2. High Value Memory (Quality 4)
* **Definition**: Functional code updates, configurations, git diff summaries, test fails, and Agent work logs.
* **Target Files**: Synthesized inside `DAILY_SUMMARY.md` or parsed into reports.
* **Rules**: Evaluated daily by the Curator for memory updates.

### 3. Raw Cache Only (Quality <= 3)
* **Definition**: Intermediate code snapshots, raw clipboard logs, short successful terminal operations.
* **Target Files**: `data/raw/YYYY-MM-DD.jsonl` and local SQLite database cache.
* **Rules**: **Local-only**. Never synced to VPS to protect secure keys and file snapshots.

---

## Synthesis Rules for AI Agents

1. **CENTRAL_CONTEXT.md Update Criteria**:
   - Only when a global project guideline or absolute development rule changes.
   - Updates must be permanent, not project-specific.

2. **DECISIONS.md Update Criteria**:
   - When introducing new dependencies, database schema migrations, or shifting development directions.
   - Must use the ADR format (Context, Decision, Consequence).

3. **CURRENT_STATE.md Update Criteria**:
   - Update checklist checkboxes when tasks are completed.
   - Define active blockers and immediate goals.
