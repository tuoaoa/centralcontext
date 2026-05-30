# Architectural Decisions (ADR)

This file tracks architectural and engineering decisions.

## ADR-001: Markdown as Source of Truth with SQLite WAL Cache
* **Date**: 2026-05-30
* **Status**: Accepted
* **Context**: Agents read Markdown natively. We want files to be portable and editable by human devs. Raw logs are high-volume, and SQLite provides faster web rendering.
* **Decision**: All context files are kept as raw Markdown. SQLite is used to cache raw logs and index decisions for fast Web UI. Enable WAL mode on SQLite to prevent write locking.
* **Consequences**: Easy local file edits, lightweight APIs, resilient file syncing, and high performance.

## ADR-002: Secure Token-Based API Authentication (x-api-key)
* **Date**: 2026-05-30
* **Status**: Accepted
* **Context**: AI agents and CLI sync require secure communication between Mac Local and the VPS.
* **Decision**: Implement token authentication via the custom header `x-api-key` using a 48–64 character random string stored locally in `.env`.
* **Consequences**: Easy to integrate, lightweight, highly secure when combined with HTTPS.

## ADR-003: Ecosystem Resource Allocation & Project Prioritization
* **Date**: 2026-05-30
* **Status**: Accepted
* **Context**: Multiple active development threads creating high context-switching overhead. Need clear focus and resource limits.
* **Decision**:
  - Dành ưu tiên số 1 cho dự án `qlythuexe` (RentalOS 2.0).
  - Tạm dừng/đóng băng dự án `SaveX` trong 30 ngày tới.
  - Phân bổ tổng nguồn lực 100 điểm như sau:
    - 50 điểm cho `qlythuexe`
    - 30 điểm cho `CentralContext`
    - 20 điểm cho `GiveGet`
* **Consequences**: Strategic focus, faster MVP deliveries, and zero token bloat on low-priority projects.

