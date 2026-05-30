# Source Priority Guidelines (Quy tắc Ưu tiên Nguồn dữ liệu)

> [!IMPORTANT]
> Current operational truth must be resolved in this order:
> SOURCE_PRIORITY.md > CURRENT_STATE.md > DECISIONS.md > FOUNDER_INTENT.md > ACTIVE_PROJECTS.md > WORK_LOG.md > reports/audits/archive.

## Conflict Resolution Rules (Quy tắc Giải quyết Mâu thuẫn)

1. **Current State Questions (Câu hỏi về Hiện tại)**:
   - For questions containing terms related to current active status (e.g., "hiện tại", "current", "now", "ưu tiên số 1", "active"), the agent **MUST** prioritize reading and extracting the answers from `CURRENT_STATE.md` first.
   - Do NOT use old progress documents, task folders, or historical files to answer current state questions.

2. **Decisions & ADR Questions (Câu hỏi về Quyết định)**:
   - For questions about architectural decisions, policies, resource allocations, or ADR records, the agent **MUST** prioritize reading and extracting the answers from `DECISIONS.md`.

3. **Founder & Internal Codes (Câu hỏi về Mã xác thực Founder)**:
   - For questions about the Founder's code, internal validation codes, or strategic founder intents, the agent **MUST** prioritize reading and extracting the answers from `FOUNDER_INTENT.md`.

4. **History vs Current State (Lịch sử vs Trạng thái Hiện tại)**:
   - `OLD_STATE.md` and `ARCHIVE_STATE.md` are strictly preserved for historical comparison and timeline analysis. They **MUST NOT** be used to determine or report the current operational state.

5. **Reports & Audits (Báo cáo & Kiểm tra)**:
   - General reports, security audits, workspace structure descriptions, or intelligence docs **MUST NOT** override the direct states defined in `CURRENT_STATE.md` or `DECISIONS.md`. In case of contradictions, `CURRENT_STATE.md` and `DECISIONS.md` always take absolute precedence.
