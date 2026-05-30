# PROJECT_KILL_LIST (Portfolio Rationalization)

* **Người ban hành**: Acting CEO + CTO
* **Mục tiêu**: Loại bỏ triệt để các dự án gây phân mảnh tài nguyên, tiêu tốn thời gian vô ích và không đem lại dòng tiền trực tiếp.

---

## ⏸️ 1. FREEZE: SaveX (Smart Energy Management System)
* **Quyết định**: **Đóng băng vô thời hạn (Freeze immediately)**

### Lý do đóng băng
1. **Bẫy R&D phần cứng**: Để thuật toán AI Fingerprint đạt độ chính xác 99% thực tế, hệ thống bắt buộc phải đo đạc dòng điện khởi động từ các công tơ IoT Tuya trong môi trường điện lưới thực tế. Việc debug phần cứng và xử lý nhiễu điện áp là một "hố đen" nuốt chửng hàng trăm giờ làm việc của Founder mà tỷ lệ thành công cực kỳ mong manh.
2. **Chi phí lưu trữ cơ sở dữ liệu khổng lồ**: Ghi nhận chỉ số điện 10 giây/lần cho mỗi hộ gia đình sẽ làm phình to database PostgreSQL Supabase cực nhanh. Với ngân sách 0 USD, Founder sẽ nhanh chóng vượt quá hạn ngạch (quota) miễn phí và bị khóa database lập tức.
3. **Cơ chế kiếm tiền mơ hồ**: Phân khúc khách hàng cá nhân (B2C) cực kỳ khó thu phí bản quyền tháng.

### Opportunity Cost (Nếu không đóng băng thì mất gì?)
* Nếu không đóng băng SaveX ngay lập tức, Founder sẽ lãng phí ít nhất **40% năng lượng mỗi tuần** để đi mua sắm thiết bị IoT, đo đạc dòng điện, sửa lỗi mất kết nối Tuya Cloud và loay hoay cấu hình cache Redis tránh tràn Supabase. 
* Hệ quả: Dự án thương mại RentalOS 2.0 sẽ bị trì hoãn thêm 3-4 tháng, hệ sinh thái cạn kiệt tài chính và chết trước khi kịp ra mắt bất kỳ sản phẩm nào.

---

## 🔄 MERGE & FREEZE Android: aimemory (AI Memory OS)
* **Quyết định**: **Đóng băng hoàn toàn ứng dụng Android di động - Gộp (Merge) lõi MCP Server vào CentralContext**

### Lý do xử lý
1. **Địa ngục gỡ lỗi Android (Android Debugging Hell)**: Việc duy trì service chạy ngầm thu âm liên tục không bị hệ điều hành Android kill (Background Battery Optimization) trên hàng chục hãng điện thoại khác nhau (Oppo, Xiaomi, Samsung) là điều không tưởng với 1 lập trình viên đơn độc. Founder sẽ kiệt sức vì debug C++ JNI, driver micro và tối ưu hóa whisper.cpp chạy offline.
2. **Rủi ro pháp lý ghi âm cực cao**: Chưa có giải pháp pháp lý cho việc tự động ghi âm hội thoại trực tiếp của người khác mà không có sự đồng ý.
3. **Phần xuất sắc nhất là MCP Server Backend**: File Express `backend/server.js` (59KB) và script `test_mcp_sse.js` chứa giải pháp Model Context Protocol (MCP) qua kênh SSE cực kỳ đỉnh cao. Kênh này cho phép các AI Agent kết nối trực tiếp truy xuất bộ nhớ bối cảnh.

### Giải pháp thực thi
* **Đóng băng ứng dụng Android**: Ngừng hoàn toàn mọi hoạt động code Kotlin, Gradle và R&D whisper.cpp offline trên điện thoại.
* **Merge vào CentralContext**: Trích xuất toàn bộ module MCP Server SSE (`test_mcp_sse.js` và API message/SSE) gộp thẳng vào server **CentralContext**. Điều này biến CentralContext thành một MCP Server hoàn thiện, giúp các Agent như Claude/Antigravity có thể truy vấn bối cảnh công việc của Founder từ xa.

### Opportunity Cost (Nếu không xử lý thì mất gì?)
* Nếu tiếp tục R&D Android aimemory, Founder sẽ mất **50% quỹ thời gian** cho các tác vụ C++ JNI/Kotlin phức tạp mà không mang lại bất kỳ doanh thu nào (vì đây là app offline cá nhân). CentralContext sẽ thiếu đi mảnh ghép MCP Server chiến lược để Agent hóa.

---

## 🧹 ARCHIVE: qlythuexe vscode
* **Quyết định**: **Xóa bỏ và lưu trữ (Archive & Delete folder)**

### Lý do xử lý
* Đây chỉ là một thư mục clone hoặc chứa cấu hình IDE trùng lặp của dự án `qlythuexe` chính. Nó gây loãng kết quả quét bối cảnh của AI lập trình (khiến AI hiểu sai là có 2 dự án quản lý thuê xe riêng biệt).

### Opportunity Cost (Nếu không xử lý thì mất gì?)
* Gây nhiễu loạn luồng bối cảnh (context pollution), làm AI Agent lập trình bị ảo giác, ghi đè nhầm file code giữa hai thư mục và tốn dung lượng ổ cứng MacBook.
