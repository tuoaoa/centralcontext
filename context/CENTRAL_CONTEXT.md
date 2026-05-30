# Central Context (Global Rules & Core Identity)

This document is the absolute **Source of Truth** for the core guidelines, tech stack boundaries, and identity of the CentralContext ecosystem.

## Core Identity & System Goals
* **System Name**: CentralContext
* **Purpose**: A synchronized "shared brain" and state coordinator for multiple autonomous AI agents (ChatGPT, Gemini, Antigravity, OpenClaw, Hermes) and human developers.
* **Architecture**: Local Mac environment stores raw high-volume logs; VPS stores compact, high-value Markdown context.

## Global Rules for AI Agents
1. **Consistency**: Always maintain concise, clean, and well-structured context files. Do not add redundant or excessive wordings.
2. **Read Before Writing**: Check `CURRENT_STATE.md` and `CENTRAL_CONTEXT.md` before making assumptions.
3. **Architecture ADR**: Document any core structural or engineering shift inside `DECISIONS.md`.
4. **Log Outputs**: Document any successful run or major technical progress in `WORK_LOG.md`.

## System Environment
* **Platform**: macOS (Local development & CLI tools) & Ubuntu 22.04 (VPS deployment)
* **API Domain**: `https://www.aipilot.vn/centralcontext`
* **Technologies**: Node.js, TypeScript, Express, SQLite Cache (better-sqlite3) with WAL mode, Markdown Source of Truth.
