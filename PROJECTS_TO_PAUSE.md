# PROJECTS_TO_PAUSE (Portfolio Rationalisation)

Để bảo đảm tài nguyên thời gian và trí lực của Founder tập trung tuyệt đối vào việc đưa **Top 3 dự án chiến lược** ra thị trường thành công, CTO hệ thống đề xuất tái cơ cấu và đóng băng các dự án sau:

---

## ⏸️ 1. SaveX (Smart Energy Management)
* **Quyết định**: **PAUSE (Tạm dừng phát triển tính năng mới)**

### Lý do chiến lược
1. **Rào cản phần cứng vật lý và R&D quá lớn**: Việc huấn luyện mô hình AI Fingerprint bóc tách nhận dạng từng thiết bị điện trong nhà đạt độ chính xác 99% thực tế đòi hỏi thiết bị đo IoT Tuya phải hoạt động cực kỳ ổn định và nhạy bén. Việc kiểm thử cần thiết bị thật, môi trường lưới điện thật tốn nhiều thời gian và tiền bạc R&D.
2. **Xác thực thị trường chưa rõ ràng**: So với RentalOS 2.0 (chủ xe sẵn sàng trả tiền ngay để chống thất thoát dòng tiền), SaveX nhắm vào phân khúc người tiêu dùng cá nhân (B2C) - đối tượng rất nhạy cảm về giá và khó thu phí thuê bao định kỳ (MRR) trừ khi có chính sách liên kết chia sẻ doanh thu với EVN hoặc bán thiết bị phần cứng.
3. **Giải pháp**: Tạm thời đóng băng dự án ở trạng thái Mock Data hiện tại. Tập trung nguồn lực dồn sang cho RentalOS và CentralContext. Khi hai dự án kia sinh dòng tiền ổn định, ta sẽ tái khởi động SaveX bằng cách mua bản quyền hoặc hợp tác với một hãng phần cứng IoT đo điện sẵn có để bypass khâu tự nghiên cứu AI Fingerprint.

---

## 🔄 2. aimemory (AI Memory OS)
* **Quyết định**: **MERGE & SPLIT (Tách ứng dụng Android - Gộp máy chủ MCP backend)**

### Lý do chiến lược
1. **Sự phức tạp của On-device AI trên Android**: Tối ưu hóa Whisper.cpp và ONNX offline chạy ngầm tiết kiệm pin dưới 5% là một "hố đen tiêu tốn thời gian". Founder có thể mất cả năm trời tinh chỉnh C++ JNI trên Android mà vẫn gặp lỗi crash trên các dòng điện thoại Xiaomi/Oppo cũ.
2. **Giá trị lõi nằm ở Backend MCP Server**: Phần backend Express (`backend/server.js`) chứa cơ chế đồng bộ cơ sở dữ liệu vector SQLite và máy chủ Model Context Protocol (MCP) qua kênh SSE thực sự rất xuất sắc. Các LLM Agent lập trình cực kỳ cần giao thức MCP này để truy cập bộ nhớ tri thức bối cảnh của Founder.
3. **Giải pháp**: 
  - **Tách (Split/Pause)**: Tạm dừng phát triển ứng dụng di động Android `aimemory` ở trạng thái hiện tại.
  - **Gộp (Merge)**: Trích xuất toàn bộ mã nguồn máy chủ MCP SSE (`test_mcp_sse.js` và lõi `/api/metrics/mcp/` trong `server.js`) và gộp trực tiếp vào hệ sinh thái **CentralContext**. Điều này giúp biến CentralContext thành một MCP Server hoàn chỉnh, cho phép các AI Agent như Claude/Antigravity truy vấn bối cảnh của tuoaoa qua giao thức chuẩn hóa từ xa.

---

## 🧹 3. qlythuexe vscode
* **Quyết định**: **ARCHIVE (Xóa bỏ và Dọn dẹp)**

### Lý do chiến lược
1. **Dư thừa workspace**: Thư mục này chỉ là bản sao cấu hình IDE VS Code hoặc bản clone của dự án chính `qlythuexe` được tạo ra trong quá trình thiết lập.
2. **Hậu quả**: Làm loãng kết quả quét bối cảnh của các AI Agent (khiến scan script nhận diện nhầm làm 1 project riêng biệt có 8 artifacts), gây lãng phí dung lượng lưu trữ và nhầm lẫn phiên bản code chân lý.
3. **Giải pháp**: Lưu trữ cấu hình IDE cần thiết trực tiếp vào `.gitignore` của dự án gốc `qlythuexe`, sau đó xóa bỏ (Archive/Delete) hoàn toàn thư mục `qlythuexe vscode` ra khỏi devflow workspace để làm sạch môi trường.
