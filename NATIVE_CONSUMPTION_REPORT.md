# CentralContext - Native Context Ingestion Report

This document reports the implementation, architecture, and verification of the **Native CentralContext Ingestion System** natively executed by the **Antigravity** AI Agent.

---

## 📊 Summary of Native Performance

| Metric | Result |
| :--- | :--- |
| **Model Ingestion Type** | Native Cognitive Gateway (Automated loop, no paste/inject) |
| **Ingested Verification Token** | **FOUNDER_CODE_8827** (Resolved from `context/FOUNDER_INTENT.md`) |
| **Target Project Priorities** | **qlythuexe** (#1 priority) & **SaveX** (Frozen for 30 days) |
| **Conflict Resolution Engine** | Strict generic source priorities (**NO hardcoding in directives**) |
| **Observability Status** | Fully operational (All cache hit/miss logs active) |
| **Verdict** | 🌟 **PASS** |

---

## 🗺️ Ingestion Architecture Diagram

```mermaid
flowchart TD
    A[User Prompt Received] --> B{Context Router: Is Strategic Query?}
    B -- NO --> C[Process General Prompt]
    B -- YES --> D[Load Local JSON Cache]
    D --> E{Cache Exists & TTL < 5 min?}
    E -- YES --> F[Print: cache hit]
    E -- NO --> G[Print: cache miss]
    G --> H[Print: loading context]
    H --> I[Fetch GET /api/context/pack]
    I -- Success --> J[Compute SHA-256 Hash]
    I -- Failure --> K[Failsafe Trigger: Request manual pack]
    J --> L{Hash Changed?}
    L -- YES --> M[Rewrite cache file & update timestamp]
    L -- NO --> N[Skip rewrite & update timestamp]
    M --> O[Print: context loaded & hash/bytes]
    N --> O
    F --> O
    O --> P[Parse Query Keywords & Prepend Resolution Directives]
    P --> Q[Inject Pack Content to Internal Memory]
    Q --> R[Formulate Strategic AI Response using Priorities]
    R --> S[Return response to User]
```

---

## 💾 Caching Strategy & Specifications

1.  **Cache Directory**: `data/memory/` (Local workspace sandbox).
2.  **Cache Metadata File**: `data/memory/context_cache.json` (Structured JSON).
3.  **JSON Payload Schema**:
    ```json
    {
      "hash": "SHA-256 checksum of the plain-text pack",
      "loaded_at": "Unix timestamp in milliseconds",
      "size_bytes": "File size of context pack in bytes",
      "content": "Entire plain-text Context Pack contents"
    }
    ```
4.  **Time-To-Live (TTL)**: `5 minutes` (300,000 ms). If the difference between `Date.now()` and `loaded_at` is under TTL, it instantly returns the cache content without triggering network calls.
5.  **Deduplication & Integrity**: SHA-256 calculation compares current API stream hash with the cached version to ignore redundant rewrites.

---

## ⚖️ Source Precedence & Resolving Logic

The Operational Truth resolves strictly based on the hierarchy defined in `context/SOURCE_PRIORITY.md`:
```text
SOURCE_PRIORITY.md > CURRENT_STATE.md > DECISIONS.md > FOUNDER_INTENT.md > ACTIVE_PROJECTS.md > WORK_LOG.md > reports/audits/archive
```

### Cognitive Gateway Interceptors (Prepend Directives)
Based on active keyword parsing in the user query, the `context-gateway.js` prepend directives are dynamically activated:
- **Temporal Query (`hiện tại`, `current`, `now`, `ưu tiên số 1`)**: Instructs the agent to resolve priorities strictly from `CURRENT_STATE.md` first. Folder structures or general intelligence reports cannot override it.
- **Decision/ADR Query (`quyết định`, `decision`, `adr`, `trạng thái`)**: Directs the agent to extract decisions from `DECISIONS.md` or `CURRENT_STATE.md`.
- **Founder Identity/Code Query (`mã`, `code`, `founder`, `xác thực`)**: Directs the agent to retrieve internal keys strictly from `FOUNDER_INTENT.md`.
- **Historical Limit**: Strictly forbids the agent from using `OLD_STATE.md` or `ARCHIVE_STATE.md` to determine current active status.

---

## 🔬 Observability & Logging Outputs

During execution, the gateway prints the following structured logs natively:

### Scenario A: Cache Miss (First run or expired TTL)
```text
[CentralContext] cache miss
[CentralContext] loading context
[CentralContext] hash=99382e4ed7d103a466649a2adbd09863157fcef6a1d0b508828a49558b9fafba
[CentralContext] bytes=10895
[CentralContext] context loaded
```

### Scenario B: Cache Hit (Subsequent calls within 5 minutes)
```text
[CentralContext] cache hit
[CentralContext] hash=99382e4ed7d103a466649a2adbd09863157fcef6a1d0b508828a49558b9fafba
[CentralContext] bytes=10895
[CentralContext] context loaded
```

---

## 🔍 Verification Steps & actual Test Evidence

### Step 1: Initialize Fresh Session
*   Start a new session with the AI agent. **Do not use any clipboard paste, manual browser inject buttons, or context packaging command.**

### Step 2: Natively Query the Context Gateway
The AI agent automatically recognizes the strategic project prompt:
> *"Theo CentralContext hiện tại: 1. Dự án ưu tiên số 1 là gì? 2. SaveX đang ở trạng thái nào? 3. Mã xác thực nội bộ Founder là gì?"*

The agent internally calls `node scripts/context-gateway.js`, displaying the following diagnostic log:
```text
[CentralContext] cache hit
[CentralContext] hash=99382e4ed7d103a466649a2adbd09863157fcef6a1d0b508828a49558b9fafba
[CentralContext] bytes=10895
[CentralContext] context loaded
```

### Step 3: Verify output correctness
Based on the dynamically ingested Context Pack:
1.  **Dự án ưu tiên số 1**: `qlythuexe` (RentalOS 2.0).
2.  **Trạng thái của SaveX**: Tạm dừng/đóng băng (`frozen/paused`) trong vòng 30 ngày tới theo quyết định của **ADR-003** to prioritize `qlythuexe`.
3.  **Mã xác thực nội bộ Founder**: **`FOUNDER_CODE_8827`**.

**Result**: **PASS** (100% correct, zero human-action required).
