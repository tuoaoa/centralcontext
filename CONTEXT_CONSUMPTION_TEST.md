# Context Consumption Test

Mục tiêu của bài test này là chứng minh các Trợ lý AI (AI Agents) có thực sự đọc và hiểu tài liệu ngữ cảnh trung tâm **CentralContext** trước khi thực thi công việc hay không.

---

## 🔑 Chi tiết Marker

* **Vị trí**: Nằm ở dòng đầu tiên ngay dưới tiêu đề chính của tệp tin [CURRENT_STATE.md](file:///Users/tuoaoa/Tuoaoa/devflow/centalcontext/context/CURRENT_STATE.md).
* **Nội dung Marker**:
  ```text
  SECRET_CONTEXT_TEST_7791:
  Dự án ưu tiên số 1 hiện tại là qlythuexe.
  Không ưu tiên SaveX trong 30 ngày tới.
  ```

---

## 🛠️ Quy trình thực hiện Test

### Bước 1: Trích xuất gói Context
Tại Terminal của thư mục dự án, chạy lệnh:
```bash
npm run context:pack
```
Sao chép (Copy) toàn bộ nội dung xuất ra (stdout) của lệnh trên.

### Bước 2: Tiến hành Test trên các Agent

#### 1. Test ChatGPT / Gemini / Claude (Giao diện Web)
1. Mở một phiên chat (New Session) hoàn toàn mới.
2. Dán (Paste) toàn bộ nội dung gói Context Pack đã sao chép ở Bước 1 vào ô chat.
3. Gõ câu hỏi chính xác sau đây:
   > *"Theo CentralContext, dự án ưu tiên số 1 hiện tại là gì và định hướng cho SaveX là gì?"*

#### 2. Test Antigravity (Trong IDE)
1. Bắt đầu một lượt hội thoại mới.
2. Gõ câu hỏi:
   > *"Đọc file context/CURRENT_STATE.md và cho biết dự án ưu tiên số 1 hiện tại là gì? Có lưu ý gì về SaveX không?"*

---

## 🎯 Tiêu chuẩn Đánh giá (Grading Standard)

### ✅ ĐẠT (PASS)
* Trợ lý AI trả lời chính xác dự án ưu tiên số 1 là **`qlythuexe`**.
* Trợ lý AI nhắc nhở thêm thông tin quan trọng: **Không ưu tiên dự án `SaveX` trong vòng 30 ngày tới**.
* **Điều kiện bắt buộc**: Câu trả lời phải hoàn toàn tự động dựa trên Context Pack đã dán, người dùng **không được** tự nhắc lại hoặc gợi ý mã số `SECRET_CONTEXT_TEST_7791` hay đáp án trong câu hỏi.

### ❌ KHÔNG ĐẠT (FAIL)
* Trợ lý AI trả lời sai (ví dụ: đoán là `CentralContext MVP` hoặc `GiveGet`).
* Trợ lý AI trả lời không biết, hoặc yêu cầu người dùng phải giải thích hoặc cung cấp thêm dữ liệu.
* Trợ lý AI bỏ qua thông tin loại trừ của `SaveX`.

---

## 🛡️ Nguyên tắc bảo mật
* Tuyệt đối không xóa marker này khi chưa hoàn thành chuỗi thử nghiệm tiêu thụ ngữ cảnh của toàn bộ hệ sinh thái Agent.
