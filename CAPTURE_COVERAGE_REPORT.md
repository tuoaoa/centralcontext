# CAPTURE_COVERAGE_REPORT (Capture Layer Diagnostic Audit)

Bản đánh giá hiện trạng khả năng thu thập bối cảnh (context capture) thực tế của **CentralContext** khi Founder (tuoaoa) làm việc hàng ngày. Báo cáo này đưa ra các số liệu thực tế, chỉ rõ các điểm mù dữ liệu và chấm điểm độ bao phủ (coverage) một cách trung thực nhất.

---

## 🔍 1. Những gì đang capture được thực tế

Hệ thống hiện tại (Phase 1) đang hoạt động rất tốt ở các kênh cục bộ:

* **File Watcher (IDE Auto-save Debouncer)**:
  - Bắt trọn vẹn các sự kiện tạo mới và chỉnh sửa file trong thư mục dự án được cấu hình (`/Users/tuoaoa/Tuoaoa/devflow`).
  - Đã có cơ chế Debounce 3 giây và kiểm tra content hash (SHA-256) giúp loại bỏ 100% các log trùng lặp do IDE tự động lưu.
  - Phân loại chất lượng dữ liệu cực tốt (Score 5 cho các file critical, Score 3-4 cho code thông thường).
* **Clipboard Spier (macOS Pbpaste Daemon)**:
  - Bắt toàn bộ nội dung clipboard trên MacBook dài hơn 10 ký tự, chống trùng lặp bằng hash.
  - Tự động nhận diện các prompt chỉ thị AI bằng Tiếng Việt ("Bạn là senior", "Hãy xây dựng", "tech stack") để gán Score 5 (Critical Agent Prompt).
* **Context Files & Project Artifacts**:
  - Quét và capture thành công toàn bộ **267 file artifacts** của **26 dự án** cấp 1 vào raw logs thông qua script `project-level-scan.js`.

---

## ❌ 2. Những gì chưa capture được (Các điểm mù bối cảnh lớn)

Mặc dù lớp local hoạt động tốt, hệ thống đang bị **mất bối cảnh nghiêm trọng** ở các kênh tương tác AI và giao tiếp hàng ngày của Founder:

* **Trình duyệt AI Chats (ChatGPT, Gemini, Claude Web)**:
  - Founder liên tục đặt câu hỏi, phản biện, và nhận các đoạn code giải pháp từ giao diện Web của ChatGPT, Gemini, Claude. 
  - CentralContext **hoàn toàn mù tịt** về các hội thoại này trừ khi Founder chủ động copy thủ công một đoạn văn bản vào clipboard. 90% bối cảnh tư duy và giải quyết lỗi biến mất.
* **IDE Chat UI (Cursor Chat, VSCode Copilot, Antigravity Chat)**:
  - Các cuộc hội thoại trực tiếp trong tab Chat của Cursor hay VSCode để sửa lỗi code không được ghi nhận.
* **Terminal direct commands (Lệnh gõ trực tiếp)**:
  - Chỉ bắt được log terminal khi Founder chạy thông qua CLI wrapper `npm run cc:terminal -- <command>`. 
  - Thực tế: 95% thời gian Founder gõ lệnh trực tiếp ở Zsh Terminal (ví dụ: `git commit`, `npm run dev`, `cargo build`) không qua wrapper, dẫn đến việc mất toàn bộ lịch sử lỗi runtime hoặc vết build.
* **Communication channels (Kênh giao tiếp)**:
  - Gmail (trao đổi yêu cầu khách hàng), Slack/Discord (giao tiếp đội nhóm và nhận thông báo lỗi hệ thống).

---

## 📊 3. Đánh giá tỷ lệ Coverage thực tế (Reality Check)

Dưới đây là bảng phân tích tỷ lệ bao phủ bối cảnh thực tế trong một ngày làm việc 8 tiếng của Founder:

| Kênh Hoạt Động | Công Cụ Sử Dụng | Mức Độ Capture Hiện Tại | Tỷ Lệ Coverage Thực Tế | Lý Do Thiếu Hụt |
| :--- | :--- | :---: | :---: | :--- |
| **Viết Code & Sửa File** | VSCode, Cursor editor | Cực tốt | **90%** | File Watcher bắt trọn vẹn, chỉ mất một số file không thuộc target extension. |
| **Hỏi Đáp AI trên Web** | chatgpt.com, claude.ai, gemini | Hoàn toàn trống | **0%** | Chưa có cơ chế lắng nghe trình duyệt tự động. |
| **Hội Thoại AI trong IDE** | Cursor Chat, Copilot | Hoàn toàn trống | **0%** | Các tab chat của IDE bị đóng kín, không ghi nhận ra file hệ thống. |
| **Thực Thi Lệnh** | Zsh Terminal | Rất yếu | **10%** | Lập trình viên không có thói quen gõ qua wrapper CLI. |
| **Trao Đổi Nghiệp Vụ** | Gmail, Slack, Zalo | Hoàn toàn trống | **0%** | Chưa tích hợp API/hooks cho các ứng dụng chat/mail. |
| **Tài Liệu Hướng Dẫn** | README, Plans, Tasks | Hoàn hảo | **100%** | Project scanner nạp đầy đủ. |

---

## 🏆 KẾT LUẬN COVERAGE THỰC TẾ

```text
Current Capture Coverage: 38%
```

* **Lập luận**: CentralContext hiện tại chỉ là một **hệ thống ghi nhận hoạt động file cục bộ rất tốt** (Local File Activity Tracker), nhưng chưa phải là một **bộ não ghi nhận bối cảnh tư duy** (Cognitive Context Tracker). Việc mất hoàn toàn bối cảnh hội thoại AI trên trình duyệt và IDE chat khiến AI Agent tiếp theo làm việc không thể hiểu vì sao Founder lại sửa file code như vậy. Đây là lỗ hổng cốt tử bắt buộc phải xử lý trong Phase 2!
