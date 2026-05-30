# TOP_3_PROJECTS_FOR_NEXT_12_MONTHS (Strategic Focus)

Giả định rằng Founder (tuoaoa) có thời gian và nguồn lực hạn chế, việc dàn trải phát triển đồng thời cả 5 dự án lớn là tự sát chiến lược. Dưới đây là bảng xếp hạng **Top 3 dự án nên đầu tư mạnh nhất trong 12 tháng tới** được hoạch định bởi CTO hệ thống để tối đa hóa dòng tiền và năng suất lập trình.

---

## 🏆 Rank #1: centalcontext (CentralContext)
* **Phân loại**: *Xương sống năng suất (Productivity Moat)*

### 1. Why (Tại sao chọn?)
* CentralContext là dự án mang lại **tác động đòn bẩy lớn nhất** cho toàn bộ hệ sinh thái `devflow`. Bằng cách giải quyết bài toán đồng bộ hóa và quản lý bối cảnh cho các AI Agent (Cursor, Antigravity, Claude), CentralContext giải phóng hoàn toàn sức lao động lập trình của Founder.
* Việc hoàn thiện CentralContext giúp Founder tăng hiệu năng phát triển Next.js/Supabase của dự án `qlythuexe` và `GiveGet` lên gấp **3 - 5 lần**, giảm thiểu lỗi logic và ảo giác của AI. Đây là dự án đầu tư 1 được 10.

### 2. Expected Outcome (Kết quả kỳ vọng)
* Founder sở hữu một "Shared Brain" mượt mà chạy ngầm trên máy Mac và VPS.
* Các AI Agent có khả năng tự phục dựng bối cảnh dự án lập tức, tự động ghi nhận quyết định kiến trúc (ADRs), trạng thái công việc (`task.md`) và chắt lọc báo cáo cuối ngày mà không cần Founder tốn công mô tả thủ công.

### 3. Main Risks (Rủi ro chính)
* Xung đột bối cảnh (Context sync conflicts) khi Founder và AI Agent sửa file context đồng thời ở local và VPS.
* Dữ liệu phình to gây loãng bối cảnh nếu bộ lọc Curator chấm điểm chất lượng (Score 1-5) hoạt động không chuẩn xác.

### 4. First 90 Days Plan (Kế hoạch 90 ngày đầu tiên)
* **Ngày 1 - 30**: Tích hợp luồng đồng bộ 2 chiều (Local <-> VPS) tự động qua Cloudflare Tunnel có cơ chế merge conflict tự động. Thử nghiệm áp dụng triệt để CentralContext làm trợ lý đồng lập trình cho dự án `qlythuexe`.
* **Ngày 31 - 60**: Hoàn thiện giao diện Web Dashboard, bổ sung tính năng "Agent Context Pack" một click đóng gói bối cảnh tối ưu gửi cho ChatGPT/Claude.
* **Ngày 61 - 90**: Đóng gói CentralContext thành một công cụ CLI độc lập (đưa lên npm) để chuẩn bị chia sẻ/bán bản quyền cho cộng đồng nhà phát triển AI (monetize ban đầu).

---

## 🥈 Rank #2: qlythuexe (RentalOS 2.0)
* **Phân loại**: *Gà đẻ trứng vàng (Commercial Cash Cow)*

### 1. Why (Tại sao chọn?)
* Đây là dự án có **tính thương mại thực tiễn cao nhất** và dễ dàng thu phí định kỳ hàng tháng (MRR) từ các chủ cửa hàng cho thuê xe máy/ô tô tại Việt Nam.
* Nghiệp vụ đã được làm rõ đến mức hoàn hảo (DB Schema v2.6 frozen, công thức quyết toán cọc 2 bước, nhắc nợ pg_cron). Độ khó kỹ thuật không quá cao (CRUD Next.js + Supabase), giúp rút ngắn thời gian đưa sản phẩm ra thị trường thương mại.

### 2. Expected Outcome (Kết quả kỳ vọng)
* Bản MVP SaaS hoàn chỉnh cho phép onboarding chuỗi cửa hàng, quản lý bãi xe realtime, POS thuê xe quét CCCD bằng OCR FPT.AI, quyết toán tự động và tự động nhắc nợ VietQR qua Zalo Deep Link miễn phí.
* Đạt những khách hàng trả phí đầu tiên để tự nuôi sống hệ sinh thái.

### 3. Main Risks (Rủi ro chính)
* Rủi ro đối soát tài chính khi khách quét mã VietQR động thanh toán (cần giải pháp đọc lịch sử giao dịch ngân hàng tự động).
* Rủi ro rò rỉ thông tin cá nhân khách thuê (ảnh CCCD quét OCR) nếu chính sách Supabase RLS/DB Security cấu hình không chặt chẽ.

### 4. First 90 Days Plan (Kế hoạch 90 ngày đầu tiên)
* **Ngày 1 - 30**: Init project Next.js 14, cấu hình Supabase Cloud, migrate 12 nhóm bảng database schema v2.6, phát triển Module A (Auth & Onboarding cửa hàng).
* **Ngày 31 - 60**: Phát triển Module B (Sơ đồ bãi xe realtime) và Module C (POS thuê xe + OCR CCCD FPT.AI + xuất hợp đồng PDF).
* **Ngày 61 - 90**: Hiện thực hóa Module 12 (Automated Reminder nhắc nợ qua Zalo Deep Link miễn phí + VietQR động) và tiến hành chạy thử nghiệm thực tế tại 2-3 cửa hàng thuê xe máy của người quen để lấy phản hồi thực tế.

---

## 🥉 Rank #3: GiveGet
* **Phân loại**: *Đầu tàu thương hiệu (Brand Leader & Social Moat)*

### 1. Why (Tại sao chọn?)
* GiveGet là dự án đã **hoàn thiện phần lớn lõi kỹ thuật** (Phase 0-3 hoàn tất, P0/P1 fixes đã xử lý). Việc bỏ mặc dự án ở giai đoạn này là sự lãng phí tài nguyên cực kỳ lớn.
* Dự án mang lại giá trị nhân văn và uy tín thương hiệu khổng lồ cho Founder trong giới công nghệ và cộng đồng xã hội, tạo hiệu ứng lan tỏa thương hiệu cá nhân để kéo khách hàng B2B về cho SaaS RentalOS 2.0.

### 2. Expected Outcome (Kết quả kỳ vọng)
* Ra mắt bản thử nghiệm cộng đồng (Beta Rollout) trên môi trường VPS thực tế, kết nối thành công 100 Givers và Getters đầu tiên hoạt động mượt mà trên bản đồ thiện nguyện.

### 3. Main Risks (Rủi ro chính)
* Người dùng lạm dụng hệ thống để lừa đảo xin đồ thiện nguyện đem bán lại gây mất uy tín nền tảng.
* Chi phí duy trì API bản đồ địa lý (Google Maps) tăng cao khi lượng người dùng truy vấn bản đồ thời gian thực phình to.

### 4. First 90 Days Plan (Kế hoạch 90 ngày đầu tiên)
* **Ngày 1 - 30**: Triển khai mã nguồn đã freeze lên VPS Eztech (`BOOTSTRAP_VPS_EZTECH.md`), cấu hình domain, HTTPS và Nginx reverse proxy bảo mật.
* **Ngày 31 - 60**: Khởi động chương trình Tester Rollout diện hẹp (`TESTER_ROLLOUT.md`) với 50 người dùng thử nghiệm nội bộ để tinh chỉnh thuật toán AI Moderation lọc tin rác.
* **Ngày 61 - 90**: Ra mắt phiên bản Web PWA di động chính thức, liên kết truyền thông qua các group thiện nguyện xã hội lớn tại Việt Nam để lấy người dùng tự nhiên.
