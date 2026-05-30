# PROJECT_INTELLIGENCE_GiveGet.md

## Project Purpose
GiveGet là một nền tảng cho – nhận thiện nguyện dựa trên vị trí địa lý (bản đồ) và trí tuệ nhân tạo (AI-driven Map-based Donation and Volunteering Platform). Mục tiêu tối thượng của dự án là kết nối trực tiếp, minh bạch và tức thời giữa người có lòng hảo tâm (Giver) và người có hoàn cảnh khó khăn thực sự (Getter), đồng thời hỗ trợ các tổ chức thiện nguyện quản lý chiến dịch hiệu quả.

## Core Problem
Dự án giải quyết 3 bài toán lớn của ngành thiện nguyện hiện nay:
1. **Thiếu minh bạch và phân phối không đồng đều**: Nguồn lực cứu trợ thường bị tập trung vào một vài cá nhân/tổ chức nổi tiếng hoặc các khu vực dễ tiếp cận, trong khi nhiều người gặp khó khăn thực sự ở vùng sâu vùng xa bị bỏ sót.
2. **Nghẽn kết nối thời gian thực**: Người cho có đồ dư thừa (thức ăn, quần áo, thiết bị học tập cũ) nhưng không biết ai quanh mình đang cần gấp, và ngược lại.
3. **Gian lận và Spam tin**: Nhiều đối tượng lợi dụng lòng tốt để trục lợi bằng cách đăng tin xin giả mạo nhiều lần. AI Moderation của GiveGet sẽ giải quyết triệt để vấn đề này bằng cách phân tích tần suất, hành vi và định danh người dùng.

## Current Status
* **Active Development / Optimization** (Đang ở Phase 1-3 của lộ trình 10 Phase, tập trung tối ưu hóa hiệu năng và sửa các lỗi P0/P1 nghiêm trọng để chuẩn bị Tester Rollout).

## Key Features
- **Map-based Realtime Matching**: Hiển thị danh sách các món đồ cho/nhận trực tiếp trên bản đồ trực quan, tính toán khoảng cách tối ưu để giao nhận.
- **AI Moderation (Duyệt tin tự động)**: Tự động phân tích nội dung bài đăng xin/cho để phát hiện từ ngữ nhạy cảm, spam hoặc lừa đảo trục lợi trước khi hiển thị công khai.
- **Zalo OA & Deep Link Integration**: Đồng bộ hóa thông báo giao nhận, xác thực giao dịch qua nền tảng chat phổ biến nhất tại Việt Nam.
- **Hệ thống Điểm Hảo tâm (Eco/Trust Points)**: Tích điểm cho các hành động đẹp, xếp hạng uy tín của người dùng để giảm thiểu tình trạng nhận đồ rồi đem bán lại.
- **Admin Console Role Enforcement**: Phân quyền chi tiết cho ban quản trị duyệt các trường hợp cứu trợ khẩn cấp hoặc xác minh hoàn cảnh khó khăn đặc biệt.

## Important Files
1. `GiveGet-MASTER-v2025-12.md`: Bản thiết kế tổng thể của dự án tính đến cuối năm 2025.
2. `docs/7 phase chuan giveget cho cursor co template.md`: Kế hoạch chia 7 phase chuẩn hóa hỗ trợ AI Code.
3. `docs/spec master 50 muc cho cursor.md`: Tài liệu kỹ thuật chi tiết nhất chứa 50 hạng mục yêu cầu.
4. `docs/02-map-system.md`: Thiết kế hệ thống định vị bản đồ và tính khoảng cách.
5. `docs/05-ai-moderation.md`: Chi tiết cơ chế AI lọc tin và tính điểm uy tín.
6. `docs/MOBILE_PARITY_MASTER_PLAN.md`: Kế hoạch đồng bộ tính năng giữa bản Web PWA và Mobile App.
7. `docs/BAO-CAO-HE-THONG-DIEM-GIVEGET.md`: Phân tích cơ chế tích điểm và thuật toán chống lạm dụng.
8. `docs/ADMIN_CONSOLE_ROLE_ENFORCEMENT.md`: Quy trình phân quyền chặt chẽ cho admin điều hành.
9. `docs/AUDIT_VPS_MOBILE_PWA.md`: Báo cáo tối ưu hóa hạ tầng và trải nghiệm PWA trên di động.
10. `package.json` (Backend/Frontend): Quản lý dependencies thực tế của dự án.

## Key Decisions
- **Backend**: Express + TS + Prisma + PostgreSQL + PostGIS (Hỗ trợ truy vấn địa lý cực nhanh).
- **Frontend**: Next.js (App Router) + Tailwind CSS tối ưu hóa SEO và PWA di động.
- **Auth**: Sử dụng Zalo/Phone-first OTP để phù hợp với đại chúng người dùng Việt Nam.
- **AI Engine**: Tích hợp các API chấm điểm nội dung tự động để giảm tải nhân sự duyệt tin thủ công.

## Current Tasks
- Khắc phục triệt để các lỗi P0 (Nghẽn luồng đăng ký, lỗi PostGIS query khoảng cách).
- Cấu hình VPS Production và freeze code (`CONFIG_FREEZE.md`) chuẩn bị cho đợt kiểm thử thực tế rộng rãi.
- Tối ưu hóa UI/UX bản di động PWA.

## Open Questions
- Làm thế nào để giải quyết bài toán giao hàng (Logistics) cho người nghèo mà không đẩy chi phí vận hành lên quá cao? (Có nên liên kết với các đơn vị vận chuyển xã hội?).
- Mức độ chính xác của AI Moderation khi xử lý tiếng lóng hoặc chữ viết tắt của người dùng có hoàn cảnh khó khăn thực tế.

## Risk Assessment
* **Technical Risks**: Việc truy vấn địa lý (PostGIS) thời gian thực với lượng người dùng lớn có thể gây quá tải database nếu không có cơ chế cache và phân cụm (clustering) tốt trên bản đồ.
* **Product Risks**: Rủi ro "thương mại hóa" đồ thiện nguyện (người nhận xong đem bán lại). Nếu hệ thống tính điểm uy tín (Trust Points) hoạt động không hiệu quả, cộng đồng sẽ mất lòng tin vào nền tảng.
* **Missing Information**: Chưa có tài liệu chi tiết về chi phí duy trì API bản đồ (Google Maps hoặc Mapbox) khi scale lớn.

## Confidence Score
* **95%**  
* *Giải thích*: Hệ thống tài liệu cực kỳ đồ sộ, chi tiết đến từng hàm, luồng dữ liệu, và báo cáo sửa lỗi thực tế (P0/P1 reports) giúp hiểu rất sâu sắc về cấu trúc và lộ trình của dự án.

---

## Project Understanding Score
* Artifact Coverage: 95%
* Decision Coverage: 90%
* Task Coverage: 92%
* Purpose Coverage: 98%
* **Overall Understanding Score: 93.75%**
