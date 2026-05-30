# FOUNDER_NEXT_ACTIONS (CTO Directives)

Nếu tôi là **CTO điều hành** của toàn bộ hệ sinh thái `devflow`, dưới đây là danh sách chỉ thị hành động chi tiết tôi yêu cầu Founder (tuoaoa) thực hiện nghiêm ngặt để tối đa hóa xác suất thành công thương mại, tối thiểu hóa công sức dàn trải và bảo đảm an toàn dòng tiền.

---

## 📅 1. Trong 7 ngày tới: "Giải phóng năng suất lập trình & Dọn dẹp Workspace"
* **Mục tiêu**: Kích hoạt CentralContext làm bệ phóng và dọn sạch các folder rác để tập trung trí lực.

### Hành động cụ thể
1. **Dọn dẹp thư mục trùng**: Xóa bỏ hoàn toàn thư mục `qlythuexe vscode` sau khi đã chuyển cấu hình cấu trúc cần thiết vào `.gitignore` của `qlythuexe` chính. Đóng gói nén lưu trữ các file `.zip` cũ (`chothuexemay.zip`, `robotv13.zip`) vào thư mục `backups/` chung để script scan AI không bị loãng.
2. **Kích hoạt CentralContext làm trợ lý lập trình**: Sử dụng CentralContext để đồng bộ hóa và quản lý bối cảnh cho các phiên làm việc Next.js/Supabase tiếp theo. Founder sẽ viết code nhanh hơn 300% nhờ việc AI hiểu rõ cấu trúc schema.
3. **Merge lõi MCP Server**: Trích xuất module giao thức MCP SSE từ backend `aimemory` gộp vào Server `CentralContext` để mở rộng tính năng bộ não Agent.

---

## 📅 2. Trong 30 ngày tới: "Launch RentalOS 2.0 MVP & Lấy 3 khách hàng đầu tiên"
* **Mục tiêu**: Xây dựng phiên bản MVP tối giản nhất của `qlythuexe` để giải quyết trực tiếp bài toán chống thất thoát cho chủ cửa hàng và kiểm thử luồng tiền.

### Hành động cụ thể
1. **Lập trình Module A (Auth & Onboarding)**: Hoàn thành Next.js + Supabase login và tạo hồ sơ cửa hàng.
2. **Hiện thực hóa Module C (POS thuê xe & eKYC OCR)**: Tích hợp API FPT.AI eKYC để nhân viên quét CCCD khách ngay tại quầy, điền thông tin và ký tên xuất hợp đồng PDF.
3. **Kích hoạt Module 12 Zalo Deep Link miễn phí**: Thiết lập nút bấm "📲 Nhắc nợ qua Zalo" để tự động generate ảnh VietQR động và Deep Link mở app Zalo soạn sẵn tin nhắn gửi khách hàng.
4. **Xác thực thị trường (Crucial Validation)**: Đưa bản MVP này cho **2 - 3 cửa hàng cho thuê xe máy** (ở khu vực du lịch hoặc người quen) chạy thử nghiệm thực tế ngay tại quầy của họ. Lắng nghe phản hồi và ghi nhận các lỗi thực tế (hoàn toàn ngưng phát triển các module nâng cao khác để lấy feedback trước).

---

## 📅 3. Trong 90 ngày tới: "Tester Rollout GiveGet & Thương mại hóa RentalOS"
* **Mục tiêu**: Đưa GiveGet lên môi trường staging thật và bắt đầu thu phí bản quyền RentalOS.

### Hành động cụ thể
1. **Triển khai VPS Staging cho GiveGet**: Deploy toàn bộ mã nguồn thiện nguyện lên VPS Eztech, mở cổng domain public, HTTPS và Nginx reverse proxy bảo mật.
2. **Chạy Tester Rollout GiveGet diện hẹp**: Phát hành ứng dụng PWA cho 50 người dùng thiện nguyện đầu tiên (nội bộ và đối tác xã hội) để huấn luyện thực tế mô hình AI Moderation lọc tin rác.
3. **Hoàn thiện Module quyết toán tài chính & pg_cron của RentalOS**: Phát triển luồng hoàn cọc 2 bước phòng ngừa phạt nguội và pg_cron tự động hóa việc quét nhắc nợ.
4. **Mở cổng thanh toán Subscription**: Tích hợp luồng nạp tiền thuê bao tháng (MRR) cho RentalOS 2.0. Đạt cột mốc 5 cửa hàng trả phí đầu tiên để chứng minh mô hình thương mại thành công.
