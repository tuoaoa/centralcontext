# PROJECT_INTELLIGENCE_SaveX.md

## Project Purpose
SaveX là một hệ thống quản lý và tiết kiệm năng lượng thông minh (Smart Energy Management System) dựa trên sự kết hợp giữa IoT (Internet of Things) và AI (Trí tuệ nhân tạo). Dự án hướng đến việc giúp các gia đình và doanh nghiệp giám sát lượng điện tiêu thụ theo thời gian thực và tự động đưa ra các khuyến nghị tiết kiệm tối ưu, giảm đến 30% hóa đơn tiền điện hàng tháng.

## Core Problem
Dự án giải quyết 3 bài toán nhức nhối của các hộ gia đình tiêu thụ điện tại Việt Nam:
1. **Thiếu thông tin realtime và trực quan**: Hầu hết người dùng chỉ nhận được hóa đơn tiền điện vào cuối tháng mà không hề biết thiết bị nào trong nhà ngốn điện nhiều nhất, dẫn đến việc không thể chủ động điều chỉnh hành vi sử dụng.
2. **Bài toán bậc thang điện EVN**: Biểu giá điện sinh hoạt của EVN chia làm 6 bậc thang lũy tiến cực kỳ phức tạp. Nếu không kiểm soát tốt lượng điện tiêu thụ chạm ngưỡng bậc thang cao hơn, hóa đơn tiền điện sẽ tăng vọt một cách khủng khiếp.
3. **Sự bất tiện của các thiết bị IoT hiện tại**: Các thiết bị đo điện thông minh trên thị trường hiện nay chỉ hiển thị số Watt thô sơ mà không thể phân biệt được dòng điện đó thuộc về máy lạnh, tủ lạnh, hay bếp từ nếu không lắp công tơ riêng cho từng ổ cắm. AI Fingerprint của SaveX giải quyết triệt để việc này chỉ với 1-2 công tơ tổng bằng cách phân tích sự biến đổi của sóng điện áp/dòng điện khi bật/tắt thiết bị để nhận dạng vân tay điện năng.

## Current Status
* **Planning / MVP** (Đã hoàn thiện thiết kế Database schema chi tiết, viết xong các API Endpoints lõi, tích hợp cơ chế mock data Tuya IoT thời gian thực 10 giây/lần để phát triển giao diện người dùng Next.js và Admin dashboard).

## Key Features
- **Realtime Monitoring (10s interval)**: Thu thập chỉ số điện năng tiêu thụ tổng và của từng nhánh thiết bị mỗi 10 giây qua Tuya API hoặc mock engine.
- **AI Fingerprint Training (Độ chính xác 99%)**: Hướng dẫn người dùng huấn luyện AI nhận dạng vân tay điện của từng thiết bị trong nhà (ví dụ: bật máy lạnh 30 giây rồi tắt để AI học đặc trưng dòng điện khởi động).
- **EVN Tariff Dynamic Billing Calculator**: Tính toán tiền điện chính xác theo biểu giá 6 bậc lũy tiến hiện hành của EVN cộng thuế VAT 8% thời gian thực.
- **Phone-first Authentication**: Đăng ký và đăng nhập nhanh chóng bằng số điện thoại + mã OTP gửi qua tin nhắn Zalo ZNS.
- **Energy League (Gamification)**: Tổ chức thi đua tiết kiệm điện theo khu vực dân cư, tích điểm Eco Points đổi quà và huy chương để tăng tính lan tỏa (viral growth).
- **Family Sharing**: Dashboard chung cho cả nhà thông qua mã mời gia đình 8 ký tự, phân quyền các thành viên xem chỉ số tiêu thụ.
- **Offline Device Alert**: Tự động cảnh báo qua Zalo ZNS sau 5 phút nếu thiết bị đo điện IoT bị mất kết nối mạng.

## Important Files
1. `README.md`: Hướng dẫn cài đặt, tech stack, API Endpoints và mô tả các tính năng nổi bật của dự án.
2. `DEPLOYMENT.md`: Quy trình triển khai hệ thống lên môi trường staging/production.
3. `docs/MASTER_BLUEPRINT.md`: Kiến trúc tổng thể của toàn bộ hệ thống SaveX.
4. `docs/VIETNAM_STRATEGY.md`: Tài liệu chiến lược tiếp cận thị trường và giải pháp tối ưu cho người dùng Việt Nam.
5. `docs/EVN_BILLING_FORMULA.md`: Công thức chi tiết tính toán tiền điện 6 bậc của EVN.
6. `docs/USER_ENGAGEMENT_FEATURES.md`: Thiết kế các tính năng gamification (Eco Points, Energy League) giúp thu hút người dùng.
7. `docs/STRATEGIC_ENHANCEMENTS.md`: Tài liệu thiết kế hệ thống bảo mật và tạo rào cản phòng thủ cạnh tranh (moat).

## Key Decisions
- **Frontend/Backend**: Cấu trúc Monorepo chia làm `apps/web` (Next.js cho user), `apps/admin` (Next.js cho quản trị viên), và `apps/api` (Express cho API Backend) kết hợp Prisma ORM và Supabase PostgreSQL.
- **IoT Integration**: Chọn giải pháp đám mây Tuya Cloud API để kết nối trực tiếp với hàng triệu thiết bị phần cứng đo điện tương thích trên thị trường mà không cần tự sản xuất thiết bị.
- **AI Engine**: Tích hợp Google Gemini 1.5 Pro để làm trợ lý ảo phân tích biểu đồ điện năng tiêu thụ, đề xuất mẹo tiết kiệm cá nhân hóa cho từng nhà.

## Current Tasks
- Hoàn thiện giao diện đồ thị Recharts hiển thị tiêu thụ điện năng realtime.
- Tích hợp Zalo OA và luồng Firebase Phone Auth cho OTP.
- Cấu hình Redis để cache dữ liệu realtime 10 giây tránh quá tải PostgreSQL Supabase.

## Open Questions
- Khi chạy thực tế trên diện rộng với hàng triệu thiết bị gửi dữ liệu 10 giây/lần, chi phí ghi nhận database Supabase PostgreSQL và chi phí hạ tầng WebSocket/Socket.IO sẽ được tối ưu hóa như thế nào? (Có cần chuyển sang TimescaleDB hoặc InfluxDB?).
- Giải quyết thế nào khi hai thiết bị có công suất khởi động và vân tay dòng điện gần như giống hệt nhau (ví dụ: hai chiếc quạt cùng hãng sản xuất)?

## Risk Assessment
* **Technical Risks**: Việc ghi nhận dữ liệu dày đặc (10 giây/lần cho mỗi nhà) sẽ làm phình to database cực kỳ nhanh chóng. Bắt buộc phải có cơ chế nén/tổng hợp dữ liệu theo giờ/ngày (downsampling) như thiết kế trong Schema (`energy_readings_1min`, `energy_readings_10min`, `energy_readings_daily`).
* **Product Risks**: Nếu AI Fingerprint nhận dạng sai thiết bị liên tục, người dùng sẽ cảm thấy phiền toái và mất niềm tin vào tính thông minh của app.
* **Missing Information**: Chưa có báo cáo kiểm thử thực tế độ nhạy của thiết bị IoT Tuya khi điện áp lưới Việt Nam không ổn định.

## Confidence Score
* **90%**  
* *Giải thích*: Mặc dù dự án đang ở giai đoạn đầu của MVP, nhưng hệ thống tài liệu thiết kế nghiệp vụ (EVN billing formula, master blueprint, Vietnam strategy) cực kỳ bài bản, mạch lạc và hướng dẫn chạy Mock Data thời gian thực rất dễ xác minh.

---

## Project Understanding Score
* Artifact Coverage: 85%
* Decision Coverage: 88%
* Task Coverage: 86%
* Purpose Coverage: 95%
* **Overall Understanding Score: 88.50%**
