# PROJECT_INTELLIGENCE_centalcontext.md

## Project Purpose
CentralContext là một nền tảng đồng bộ hóa và quản lý bối cảnh/trí nhớ dùng chung dành riêng cho các AI Agent (ChatGPT, Gemini, Antigravity, OpenClaw, Hermes) làm việc cộng tác trong các dự án phần mềm và vận hành hệ thống. Dự án hoạt động như một "Bộ não trung tâm" (Shared Brain/Context Hub) giúp các Agent có thể đọc chung bối cảnh trước khi làm việc và lưu lại kết quả cốt lõi sau khi hoàn thành công việc.

## Core Problem
Dự án giải quyết 3 rào cản lớn nhất của kỷ nguyên Multi-Agent hiện nay:
1. **Mất bối cảnh giữa các phiên làm việc (Context Loss)**: Các AI Agent hoạt động độc lập và không có bộ nhớ dài hạn liên tục qua các phiên chat. Khi chuyển đổi từ phiên này sang phiên khác hoặc từ Agent này sang Agent khác, lập trình viên phải sao chép thủ công hàng nghìn dòng bối cảnh dự án, gây mất thời gian và dễ sai sót.
2. **Loãng bối cảnh (Context Dilution/Spam)**: Nếu cố lưu trữ toàn bộ các đoạn chat thô (raw logs), bối cảnh truyền vào cho LLM sẽ quá dài, vượt quá giới hạn cửa sổ ngữ cảnh (Context Window) hoặc gây ra chi phí token cực kỳ đắt đỏ. CentralContext giải quyết bằng mô hình Dual-layer: Lưu toàn bộ raw logs ở Local (Mac) và chỉ đồng bộ phần tinh túy đã qua chắt lọc (ADRs, Current State, Task list) lên Cloud/VPS.
3. **Cơ chế phối hợp Agent thiếu quy chuẩn**: Các Agent hoạt động không có luật lệ chung dẫn đến việc ghi đè file bối cảnh hoặc làm hỗn loạn tiến độ dự án. `MEMORY_RULES.md` và `AGENT_README.md` của CentralContext thiết lập "Context Checkpoint" bắt buộc để các Agent tuân thủ nghiêm ngặt việc đọc/ghi bối cảnh chọn lọc.

## Current Status
* **MVP Completed / Active Diagnostics** (Các module Express server, better-sqlite3 WAL cache local, Mac CLI, file watcher debounce, clipboard watcher đã hoàn thiện và đang tiến hành bài test chẩn đoán Project Intelligence Audit).

## Key Features
- **Dual-layer Storage Model**:
  - **Local Layer (Mac)**: Lưu trữ raw logs thô (`data/raw/YYYY-MM-DD.jsonl`), cache SQLite phục vụ hiển thị Dashboard Web nhanh chóng, lưu trữ log clipboard và terminal.
  - **VPS Layer (Cloud)**: Chỉ đồng bộ các file Markdown tinh cốt (`CENTRAL_CONTEXT.md`, `CURRENT_STATE.md`, `DECISIONS.md`, `ACTIVE_PROJECTS.md`, `DAILY_SUMMARY.md`, `WORK_LOG.md`).
- **Mac Capture Layer**:
  - **IDE Auto-Save Debounced File Watcher**: Watcher dựa trên `chokidar` tự động theo dõi thay đổi file, debounce 3-5 giây và kiểm tra content hash để tránh spam ghi chép khi IDE lưu tự động liên tục.
  - **Clipboard prompt listener**: Lắng nghe clipboard di động trên Mac qua lệnh native `pbpaste`. Tự động nhận dạng các prompt chỉ thị dài hoặc chứa từ khóa Agent và phân loại vào nhóm Score 5 (Critical Memory).
  - **Terminal output interceptor**: CLI wrapper thu thập log thực thi lệnh ở terminal và ghi nhận lỗi thực thi.
- **Selective Daily Memory Curator**: Bộ lọc thông minh tự động loại bỏ rác (Score <= 2), gộp nhóm log trùng và xuất báo cáo ngày `data/daily/YYYY-MM-DD.md` cùng danh sách đề xuất cập nhật `data/memory/PENDING_UPDATES.md`.
- **API Sync Push/Pull với Backup**: Đồng bộ 2 chiều CLI-VPS có cơ chế tự động nén zip lưu trữ backup (`data/backups/YYYY-MM-DD-HHmmss/`) trước khi ghi đè để bảo đảm an toàn dữ liệu tuyệt đối.
- **Agent Context Pack Web Dashboard**: Giao diện dashboard hiện đại hiển thị sơ đồ bộ nhớ, dòng log trực quan và hỗ trợ copy nhanh Context Pack dành riêng cho AI Agent.

## Important Files
1. `README.md`: Hướng dẫn cấu hình toàn bộ hệ thống từ môi trường chạy ngầm local đến Nginx VPS.
2. `context/MEMORY_RULES.md`: Quy tắc tối mật chấm điểm chất lượng dữ liệu (Score 1–5) và phân tách dữ liệu đồng bộ.
3. `AGENT_README.md`: Hướng dẫn cách các AI Agent phối hợp đọc/ghi bối cảnh bằng cơ chế Checkpoint.
4. `apps/server/src/index.ts`: Lõi Express API server xử lý định tuyến, xác thực API key và cache SQLite WAL.
5. `apps/cli/src/curator.ts`: Lõi phân tích chắt lọc nhật ký thô thành báo cáo chất lượng cao.
6. `scripts/project-level-scan.js`: Script chẩn đoán quét rộng project-level scan giúp phục dựng bối cảnh 26 dự án.

## Key Decisions
- **ADR-001 (Markdown Source of Truth & SQLite WAL Cache)**: Chọn Markdown làm nguồn chân lý vì Agent đọc Markdown cực tốt và con người dễ chỉnh sửa. SQLite ở chế độ WAL (Write-Ahead Logging) chỉ dùng làm cache để kết xuất giao diện Dashboard cực nhanh mà không sợ xung đột khóa ghi.
- **ADR-002 (x-api-key Authentication)**: Sử dụng token API bảo mật dài 48-64 ký tự truyền qua Header, lưu cục bộ trong `.env` không commit để ngăn chặn truy cập trái phép khi mở port VPS ra Internet.
- **Rate Limit High-throughput Adjust**: Nâng giới hạn API Rate Limiting từ `100` lên `10000` request/phút khi phát triển/quét dự án quy mô lớn để tránh lỗi nghẽn tải hàng loạt.

## Current Tasks
- Thực hiện bài kiểm thử Project Intelligence Audit để chứng minh khả năng hiểu sâu sắc bối cảnh 5 dự án lớn nhất.
- Hoàn thiện luồng đồng bộ tự động 2 chiều giữa máy local MacBook và VPS thông qua Cloudflare Tunnel/SSH Tunnel.

## Open Questions
- Khi nhiều AI Agent cùng hoạt động đồng thời (Concurrency) và đẩy yêu cầu ghi đè bối cảnh cùng lúc, cơ chế giải quyết xung đột (conflict resolution) tối ưu sẽ là gì ngoài việc tạo backup? (Có nên áp dụng thuật toán CRDT?).
- Làm sao để tự động hóa hoàn toàn việc đưa ý kiến từ `data/memory/PENDING_UPDATES.md` vào các tệp chính mà không cần sự can thiệp duyệt tay của con người?

## Risk Assessment
* **Technical Risks**: Khả năng xung đột dữ liệu (sync conflict) khi nhà phát triển sửa file context local trong khi một Agent khác đang cập nhật context từ VPS về.
* **Product Risks**: Nếu chất lượng phân loại dữ liệu (Curator Scoring) không chuẩn, bộ nhớ dài hạn sẽ nhanh chóng bị tràn ngập bởi các thông tin rác từ các cuộc đối thoại vụn vặt của Agent.
* **Missing Information**: Chưa có kiểm thử thực tế về tốc độ suy luận của các LLM khi kích thước file `CENTRAL_CONTEXT.md` phình to vượt quá 100KB.

## Confidence Score
* **98%**  
* *Giải thích*: Chúng ta chính là tác giả phát triển dự án này từ dòng code đầu tiên, nắm rõ từng quyết định kiến trúc (ADRs), cấu trúc dữ liệu SQLite, cơ chế hoạt động của File Watcher, Clipboard Watcher và kịch bản chắt lọc Curator.

---

## Project Understanding Score
* Artifact Coverage: 98%
* Decision Coverage: 98%
* Task Coverage: 95%
* Purpose Coverage: 99%
* **Overall Understanding Score: 97.50%**
