# PROJECT_DIFFERENTIATION_TEST (Product Strategy Audit)

Bản phân tích chẩn đoán so sánh định vị sản phẩm giữa 3 dự án cốt lõi liên quan đến dữ liệu và trí tuệ nhân tạo cục bộ của Founder: **aimemory (AI Memory OS)**, **CentralContext**, và **Sổ Miệng**. Báo cáo đi sâu phân tích nghiệp vụ sản phẩm, rủi ro đánh đổi và rào cản phòng thủ chung.

---

## 📊 1. Ma trận so sánh định vị sản phẩm (Product Matrix)

| Tiêu Chí Phân Tích | aimemory (AI Memory OS) | CentralContext | Sổ Miệng (somieng) |
| :--- | :--- | :--- | :--- |
| **Phân khúc người dùng** | Cá nhân phổ thông (B2C) | Lập trình viên AI, Agent (B2B) | Hộ kinh doanh cá thể, tạp hóa (B2C/B2B nhỏ) |
| **Trọng tâm sản phẩm** | Ghi nhận ký ức cuộc sống thầm lặng | Quản lý bối cảnh dài hạn Multi-Agent | Ghi chép thu chi bán hàng bằng giọng nói |
| **Đầu vào chính (Input)** | Ghi âm giọng nói VAD, thông báo chat | Sửa đổi file, clipboard, lệnh terminal | Giọng nói giao tiếp bán hàng ("bán 2 coca...") |
| **Đầu ra chính (Output)** | Hỏi đáp ký ức ngôn ngữ tự nhiên | File context pack, ADRs, tasks sạch | Bảng biểu kế toán mẫu S1a-HKD, VietQR |
| **Hạ tầng AI cốt lõi** | Whisper.cpp + ONNX embeddings offline | Rule-based Curator, Markdown Sync | Offline Voice parser trích xuất giao dịch |
| **Rào cản lớn nhất (Moat)** | Bảo mật offline tuyệt đối trên thiết bị | Kiểm soát bối cảnh tránh loãng token | Ghi chép rảnh tay Voice-first & Local-first |

---

## ⚖️ 2. Nghiên cứu nghiệp vụ & Đánh đổi chiến lược

### A. Nếu MERGE (Gộp) cả 3 dự án thành 1 sản phẩm duy nhất: Mất gì?
* **Mất hoàn toàn sự tập trung trải nghiệm người dùng (UX Focus)**: Việc gộp một cuốn sổ kế toán tạp hóa (Sổ Miệng) với một trợ lý lập trình AI (CentralContext) và một ứng dụng lưu trữ nhật ký cá nhân (aimemory) sẽ tạo ra một **"quái vật phần mềm" cực kỳ cồng kềnh, hỗn loạn và vô nghĩa**. Không một chủ tiệm tạp hóa nào muốn cài một ứng dụng có tính năng watcher terminal hay MCP Server, và ngược lại, không kỹ sư AI nào muốn app lập trình của mình có biểu mẫu thuế S1a-HKD.
* **Hao tổn tài nguyên phần cứng**: Ứng dụng di động sẽ cực kỳ nặng, ngốn pin và dung lượng lưu trữ do phải gộp chung các mô hình học máy VAD, Whisper.cpp, ONNX vector search và SQLite encryption DB đồng thời.

### B. Nếu tách riêng (Tách biệt 3 dự án): Được gì?
* **May đo hoàn hảo cho từng thị trường ngách (Niche Moats)**:
  - `Sổ Miệng`: Giữ được sự đơn giản, mộc mạc, một chạm ghi sổ cho tiểu thương.
  - `aimemory`: Tập trung sâu sắc vào bảo mật dữ liệu riêng tư cá nhân tuyệt đối.
  - `CentralContext`: Trở thành xương sống hạ tầng hỗ trợ trực tiếp các AI lập trình tăng tốc phát triển.
* **Tối ưu hóa hiệu năng phần cứng**: Tách riêng giúp ứng dụng chỉ mang theo đúng thư viện/mô hình AI cần thiết, bảo đảm pin dưới 5% cho di động và tốc độ ghi đĩa siêu nhanh cho máy Mac.

---

## 🧠 3. Founder đang giải quyết 1 bài toán hay 3 bài toán khác nhau?

### Kết luận phản biện của CTO:
* Về mặt bề nổi, Founder đang phát triển 3 sản phẩm hoàn toàn khác nhau cho 3 tệp khách hàng xa lạ.
* Nhưng về mặt bản chất cốt lõi sâu xa, **Founder đang giải quyết đúng một bài toán lõi duy nhất**: 

> **"Sự chuyển dịch dữ liệu phi cấu trúc hỗn độn của con người thành tri thức có cấu trúc có giá trị sử dụng cao bằng các mô hình AI cục bộ, bảo mật ngoại tuyến (Structured Memory Layer by Local AI)."**

* **Bằng chứng**:
  - Giao tiếp nói bán hàng hàng ngày (Phi cấu trúc) -> Đưa qua mô hình local parser -> Ghi nhận vào SQLite thành các cột Thu, Chi, Nợ, Nhập (Có cấu trúc mẫu S1a-HKD).
  - Âm thanh hội thoại cuộc sống (Phi cấu trúc) -> Đưa qua VAD + Whisper.cpp -> Chuyển thành văn bản ghi nhớ semantic vector search (Có cấu trúc).
  - clipboard thô và hoạt động gõ code vụn vặt (Phi cấu trúc) -> Đưa qua watcher + clipboard spy + curator scoring -> Chuyển thành tệp tin bối cảnh tinh cốt `CURRENT_STATE.md` và `DECISIONS.md` (Có cấu trúc).

Đây chính là **Core Moat (Rào cản cốt lõi)** của toàn bộ hệ sinh thái `devflow`. Mọi dự án đều kế thừa chung triết lý thiết kế SQLite local, API đồng bộ gọn nhẹ, VietQR động và sự tối giản tối đa chi phí hạ tầng (Zero-Cost).
