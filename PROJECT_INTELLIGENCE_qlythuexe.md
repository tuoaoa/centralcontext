# PROJECT_INTELLIGENCE_qlythuexe.md

## Project Purpose
qlythuexe (RentalOS 2.0) là một nền tảng phần mềm dịch vụ (SaaS) toàn diện quản lý hoạt động vận hành và kinh doanh dành riêng cho các cửa hàng và chuỗi cửa hàng cho thuê xe máy, ô tô tự lái tại Việt Nam. Hệ thống hướng đến mục tiêu số hóa toàn diện quy trình thuê xe, tối ưu hóa công suất khai thác đội xe, kiểm soát chặt chẽ dòng tiền và giảm thiểu tối đa chi phí vận hành thông qua các giải pháp thông báo không đồng bộ thông minh.

## Core Problem
Dự án giải quyết 4 bài toán quản trị thực tế cực kỳ phức tạp của ngành cho thuê xe tự lái:
1. **Quản lý bãi xe và công suất thời gian thực (Realtime Fleet Operations)**: Khó khăn trong việc theo dõi tình trạng xe đang cho thuê, xe trống, xe đang bảo trì hoặc xe đang chờ vệ sinh. RentalOS giải quyết bằng "Sơ đồ bãi xe trực quan" (Interactive Bay Dashboard) và trạng thái vệ sinh xe (Housekeeping State).
2. **Quyết toán tài chính phức tạp (Smart Settlement & Multi-party Cashflow)**: Khi khách trả xe, việc tính toán chi phí phát sinh cực kỳ nhức nhối: tiền thuê quá hạn theo giờ, phụ phí hư hỏng xe, hoàn trả tiền đặt cọc làm 2 bước để phòng ngừa phạt nguội (giữ lại một khoản cọc trong 15-30 ngày), chiết khấu hoa hồng cho đối tác giới thiệu hoặc chủ xe ký gửi, và chia thưởng KPI cho nhân viên.
3. **Chi phí thông báo và nhắc nợ quá cao**: Việc gửi tin nhắn SMS nhắc nợ, gửi hợp đồng hay xác nhận thanh toán rất tốn kém (khoảng 500-800đ/tin SMS). RentalOS đưa ra giải pháp đột phá "Zero-Cost Notification First" thông qua 3 tầng thông báo: Tầng 1 sử dụng Zalo Deep Link hoàn toàn MIỄN PHÍ (nhân viên bấm nút sẽ tự động tạo tin nhắn Zalo soạn sẵn nội dung kèm mã VietQR động trên điện thoại để gửi đi), Tầng 2 dùng Zalo OA tự động (trả phí nhẹ khi scale), và Tầng 3 dùng SMS làm fallback.
4. **Nhận diện và phòng ngừa rủi ro khách hàng**: Việc xác minh thông tin khách hàng thuê xe bằng giấy tờ giả hoặc nợ xấu. Hệ thống tích hợp FPT.AI eKYC để quét và trích xuất dữ liệu CCCD (OCR) ngay lập tức tại quầy để phòng chống lừa đảo, mất cắp xe.

## Current Status
* **Planning / Active Development** (Đã chốt xong toàn bộ Database Schema phiên bản v2.6 phê duyệt cuối cùng, thiết kế xong 12 Modules cốt lõi cùng cấu trúc thư mục Next.js/Supabase, đang chuẩn bị bắt tay vào code Module A: SaaS Core & Auth).

## Key Features
- **SaaS Core Multi-store (RBAC & RLS)**: Quản lý chuỗi nhiều cửa hàng với phân quyền nhân viên chặt chẽ dựa trên cơ chế Row Level Security (RLS) của Supabase.
- **Universal Search & Realtime Bay Layout**: Ô tìm kiếm vạn năng truy vấn nhanh hợp đồng, thông tin khách hàng hoặc biển số xe kèm sơ đồ trạng thái bãi xe realtime.
- **POS Thuê Xe & OCR CCCD**: Tích hợp quét CCCD bằng FPT.AI eKYC API, hỗ trợ giỏ hàng thuê nhiều xe cùng lúc, ký tên trực tiếp trên màn hình cảm ứng và xuất hợp đồng định dạng PDF.
- **Smart Settlement (Quyết toán thông minh)**: Công cụ tự động tính toán tiền điện/tiền thuê phát sinh, xử lý cọc 2 bước cực kỳ an toàn.
- **Quản lý Quỹ (Cashbook & Shifts)**: Quản lý dòng tiền mặt và tiền chuyển khoản chặt chẽ, kiểm soát chốt ca trực của nhân viên để tránh thất thoát.
- **Automated Reminder System (Module 12)**: Hệ thống tự động nhắc nợ quá hạn, nhắc phạt nguội và hoàn cọc qua Zalo Deep Link + VietQR động dựa trên Supabase pg_cron chạy ngầm mỗi giờ.
- **Smart Pricing Rules**: Thiết lập bảng giá động theo ngày lễ, cuối tuần hoặc thuê dài ngày (`price_rules`) được quản lý bằng DB-driven thay vì hardcode trong mã nguồn.

## Important Files
1. `README.md`: Hướng dẫn cài đặt và khởi động Next.js development server.
2. `docs/technical-plan-v2.6.md`: Bản thiết kế kỹ thuật chi tiết nhất (Final Freeze) chốt toàn bộ tech stack, database schema 12 nhóm bảng, roadmap 5 Sprint và luồng tiền toàn trình.
3. `docs/database-schema.md`: Đặc tả chi tiết các trường, kiểu dữ liệu và quan hệ của toàn bộ cơ sở dữ liệu.
4. `docs/finance-logic.md`: Đặc tả nghiệp vụ tính toán tiền thuê, phạt quá hạn, khấu hao và quyết toán dòng tiền.
5. `docs/api-integrations.md`: Hướng dẫn tích hợp các API bên thứ ba (Supabase, eKYC FPT, VietQR, Zalo OA).
6. `docs/module-12-reminder.md`: Chi tiết cơ chế nhắc nợ tự động 3 tầng siêu tiết kiệm chi phí.
7. `middleware.ts`: Middleware xử lý phân quyền và kiểm tra session của người dùng trên Next.js.
8. `package.json`: Quản lý danh sách thư viện chốt dùng (Next.js 14, Supabase JS, Zustand, TanStack Query, Recharts).

## Key Decisions
- **Stack chốt cuối cùng**: Next.js 14 App Router (Frontend/Vercel) kết hợp Supabase Cloud (PostgreSQL + RLS + Edge Functions) giúp tối ưu hóa chi phí vận hành ban đầu về mức gần như bằng 0 (Zero-Cost).
- **Zalo Deep Link Flow**: Quyết định thiết kế Deep Link dạng `zalo://app/conversation?phone=[SĐT]&text=[Message]` giúp hệ thống có thể chạy gửi tin nhắn nhắc nợ kèm link thanh toán VietQR động hoàn toàn miễn phí ngay trong giai đoạn phát triển mà không bắt buộc phải đăng ký tài khoản Zalo OA trả phí phức tạp.
- **VietQR Động**: Tạo ảnh QR chuyển khoản động qua API của VietQR.vn nhúng trực tiếp vào tin nhắn gửi cho khách, giúp khách quét mã là điền sẵn số tiền lẻ chính xác và nội dung chuyển khoản hợp đồng, giảm thiểu sai sót đối soát tài chính.

## Current Tasks
- Khởi tạo cấu trúc dự án Next.js 14 App Router, cài đặt và cấu hình Supabase Client SDK.
- Thực hiện migrations cơ sở dữ liệu 12 nhóm bảng lên Supabase Cloud và thiết lập các chính sách bảo mật Row Level Security (RLS).
- Phát triển giao diện đăng nhập và onboarding cửa hàng mới (Module A).

## Open Questions
- Cơ chế đồng bộ trạng thái bãi xe realtime thông qua Supabase Realtime Channels có bị trễ hoặc ngốn quota kết nối đồng thời của gói Free Supabase khi chuỗi cửa hàng mở rộng quá nhanh?
- Làm sao để tự động đối soát giao dịch chuyển khoản VietQR động của khách thuê về tài khoản ngân hàng của chủ cửa hàng một cách tự động hoàn toàn mà không cần mua các gói webhook ngân hàng đắt đỏ? (Có nên dùng giải pháp spier lịch sử giao dịch app ngân hàng?).

## Risk Assessment
* **Technical Risks**: Việc phụ thuộc hoàn toàn vào dịch vụ Cloud của Supabase và Vercel mang lại sự tiện lợi ban đầu nhưng có thể gặp rủi ro "vendor lock-in" và chi phí tăng vọt khi quy mô dữ liệu vượt qua ngưỡng miễn phí.
* **Product Risks**: Quy trình quyết toán cọc 2 bước (giữ lại cọc phạt nguội) có thể khiến một số khách hàng khó tính cảm thấy không thoải mái nếu nhân viên không giải thích rõ ràng chính sách từ đầu.
* **Missing Information**: Chưa có tài liệu chi tiết về đặc tả luồng kết nối phần cứng camera quét biển số xe tại bãi (nếu chuỗi lớn muốn tự động hóa khâu check-in/check-out).

## Confidence Score
* **95%**  
* *Giải thích*: Bản kế hoạch kỹ thuật `technical-plan-v2.6.md` và các tài liệu chuyên đề database, tài chính cực kỳ chi tiết, mạch lạc, phân tích thấu đáo đến từng luồng nghiệp vụ thực tế của cửa hàng cho thấy dự án đã qua giai đoạn chuẩn bị cực kỳ kỹ lưỡng và sẵn sàng thực thi mã hóa.

---

## Project Understanding Score
* Artifact Coverage: 92%
* Decision Coverage: 95%
* Task Coverage: 90%
* Purpose Coverage: 98%
* **Overall Understanding Score: 93.75%**
