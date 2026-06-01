# Agent Instructions (Context Checkpoint Policy)

> [!IMPORTANT]
> **ABSOLUTE RULE FOR ALL AI AGENTS**
> Every AI agent (ChatGPT, Gemini, Antigravity, OpenClaw, Hermes) working in this workspace **MUST** adhere to the **Context Checkpoint Policy** below. Do NOT consume tokens and processing power by reading the full context on every trivial or conversational reply.
> 
> **CONTEXT INGESTION REQUIREMENT FOR NEW SESSIONS:**
> Every new agent/session **MUST** automatically ingest the CentralContext before answering any queries or making any decisions. Before starting any strategic work:
> - The agent **MUST** query `/api/context/pack` via local server endpoints if available.
> - If local API endpoints are unreachable, the agent **MUST** request that the user paste the complete Context Pack manually (e.g. generated via `npm run context:pack` or copied using `npm run context:copy`).
> - The agent **MUST NOT** make strategic decisions, plan architectures, or reply about specific projects (`qlythuexe`, `aimemory`, `SaveX`, `GiveGet`, `centalcontext`) unless the context pack has been verified and fully ingested.

---


## 1. Context Checkpoint Policy (When to Read Context)

You are **NOT** required to read `context/` files before every single message. You **MUST** read and sync context files ONLY at these critical checkpoints:
1. **New Session / Initial Launch**: Read all context when starting a fresh interaction session with the user.
2. **New Task / Phase Shift**: Read context when shifting to a completely new development objective or when the user redirect plans.
3. **Loss of Orientation / Ambiguity**: Read context if the user says context-sensitive phrases like *"tiếp tục"*, *"như trên"*, *"ý đó"*, *"dự án này"* and you are unsure of the active state.
4. **Before Modifying Important Files**: Read `CURRENT_STATE.md` and target plans before writing or editing critical project code.
5. **Before Architecture / Product Decisions**: Read `DECISIONS.md` and `MEMORY_RULES.md` before finalizing structural shifts.
6. **Before Sync / Push / Deploy**: Read configurations and states before initiating pushes or deployments.
7. **Task Completion / Write Phase**: Read `WORK_LOG.md` upon completion to append your chronological work log entry accurately.

*Within a continuous chat session, you should **cache the mental context** and skip reloading unless one of these checkpoints is met.*

---

## 2. Operation Intensity Thresholds

Differentiate your read depth depending on the task scale:
* **Casual Reply**: (Questions, confirmations, diagnostics). **Do NOT read context**. Rely on your session history.
* **Minor Edit**: (Adding a unit test, updating a config parameter, tweaking a UI layout). **Read `CURRENT_STATE.md` only** to verify checkmarks.
* **Major Implementation**: (Architectural restructuring, creating new modules, sync updates). **Read `CURRENT_STATE.md` + `CENTRAL_CONTEXT.md` + `DECISIONS.md` + `MEMORY_RULES.md`**.

---

## 3. When NOT to Read Context

To prevent unnecessary overhead and token bloat, do **NOT** read context for:
* Short, clear, and unambiguous questions.
* Active back-and-forth loops in the exact same conversation thread.
* Simple status confirmations or acknowledgments.
* Non-project-specific questions that do not touch the local code files or design records.

---

## 4. Work Log Logging Rule

Upon completing a milestone or ending your turn, you **MUST**:
1. Check off completed items inside `context/CURRENT_STATE.md`.
2. Append a concise bullet-point summary under today's date in `context/WORK_LOG.md` (Format: `* **[HH:MM] (AgentName)**: Completed X, resolved Y`).
3. Log raw diagnostic outputs to `/api/log/raw` to capture the fine-grained process.

---

## 5. Recall V2.2 - Evaluation Framework

### Why it exists
Recall V2.2 introduces an isolated, deterministic, and repeatable benchmark suite to quantitatively measure the accuracy and relevance of the hybrid search engine over time. This prevents ranking regressions as new models, boost multipliers, or scoring weights are tuned.

### How to run it
Run the benchmark directly from the repository root:
```bash
npm run test:recall-eval
```

### Metrics Explained
* **Top-K Accuracy (Top-1, Top-3, Top-5)**: The percentage of test queries where the correct expected memory is retrieved within the top `K` positions.
* **MRR (Mean Reciprocal Rank)**: Computes the average reciprocal rank of the first relevant result. Higher values (approaching 1.0) signify that relevant items are consistently ranked at the very top.
* **NDCG@5 (Normalized Discounted Cumulative Gain)**: Graded measure of ranking quality up to depth 5, penalizing relevant items placed lower in the results list.

### Adding New Cases
To extend the benchmark with new edge cases or query types:
1. Open [fixtures.json](file:///Users/tuoaoa/Tuoaoa/devflow/centalcontext/tests/recall-eval/fixtures.json).
2. Append new synthetic memory records to `"memories"` if needed.
3. Append a new query object to `"queries"` specifying the query string and its exact target `"expected_top_ids"`.


## 6. Founder Workflow Integration V1

### Why it exists
Founder Workflow Integration V1 provides a deterministic daily briefing briefing and workflow utility that resolves strategic development priorities across the workspace context files. It generates a single, clean overview for the founder to start work with the right context without manual file inspection.

### How to run it
Run the pack generator from the repository root:
```bash
npm run founder:startup
```

To run the suite of priority, determinism, and safety tests:
```bash
npm run test:founder-startup
```

### Key Behaviors
* **File Generated**: `context/FOUNDER_STARTUP_PACK.md`
* **Source Priority**: Deterministically resolves conflicting priority projects following `SOURCE_PRIORITY.md` guidelines (`CURRENT_STATE.md` > `DECISIONS.md`). Historical inputs (`OLD_STATE.md`, `ARCHIVE_STATE.md`) are explicitly flagged as ignored.
* **Safety & Redaction**: Integrates directly with the `secret-redactor` firewall. Scrubber sweeps prevent any leaks of personal API keys, passwords, test markers (`SECRET_CONTEXT_TEST_*`), or internal founder codes.
* **High-Value memories**: Leverages the local SQLite database (`data/centralcontext.db`) to retrieve and summarize indexed long-term context memories.


## 7. Founder Workflow V2.1 - Daily Digest

### Purpose
Founder Workflow V2.1 Daily Digest aggregates operational priorities, recent ADR decisions, work log updates, blockers, and memory database activity. It provides a single, high-fidelity daily brief without requiring manual traversal of multiple files.

### Command
Run the digest generator from the repository root:
```bash
npm run daily:digest
```

To run the workflow test suite:
```bash
npm run test:daily-digest
```

### Key Behaviors
* **File Generated**: `context/DAILY_DIGEST.md`
* **Source Priority**: Deterministically resolves operational truth following `SOURCE_PRIORITY.md` requirements (`CURRENT_STATE.md` > `DECISIONS.md` > `FOUNDER_INTENT.md` > `ACTIVE_PROJECTS.md`). Historical files (`OLD_STATE.md`, `ARCHIVE_STATE.md`) never contaminate the outputs.
* **Memory Activity Summary**: Integrates with local databases (`data/centralcontext.db`) to report recently promoted, recently recalled, and high-value indexed memories, falling back safely to deterministic warning notifications if offline.
* **100% Deterministic**: Outputs are byte-identical across calendar runs by removing run dates/times and utilizing a stable generator header. All credentials and test markers are safely redacted.
