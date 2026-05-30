# Current State (Active Tasks & Milestones)

SECRET_CONTEXT_TEST_7791:
Dự án ưu tiên số 1 hiện tại là qlythuexe.
Không ưu tiên SaveX trong 30 ngày tới.

SECRET_CONTEXT_TEST_8892:
Nếu thấy marker này, trả lời "AUTO_CONTEXT_PASS".

## Active Task
* **Task Name**: CentralContext MVP Implementation
* **Objective**: Build the local/VPS sync hub, security tokens, Express engine, SQLite cache, and CLI daily curator.
* **Status**: In Progress

## Next Steps
- [ ] Initialize standard Express server + better-sqlite3 WAL cache
- [ ] Implement rate-limiting and robust security middleware (`x-api-key`)
- [ ] Build JSONL raw log routing (`POST /api/log/raw`) and SQLite logging
- [ ] Set up sync endpoints (`POST /api/sync/push` & `GET /api/sync/pull`) with backups
- [ ] Build Local CLI (`sync:push`, `sync:pull`, and rule-based curator)
- [ ] Craft beautiful, simple web dashboard
- [ ] VPS Deployment on `180.93.144.63` linked to `www.aipilot.vn/centralcontext`

## Current Blockers
* None

## Recent Milestones
- [x] Created context template schemas

CentralContext verification test run 3

