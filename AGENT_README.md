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
